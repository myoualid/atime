/**
 * Source catalog seeder.
 *
 * Imports bundled recipe templates (see ./templates.js) into the user's
 * library when they click "Fetch from sources". Existing recipes (by name
 * or source id) and foods (by name / alias / normalized name) are skipped
 * so a re-run never duplicates items or re-fetches foods already pulled.
 */

import * as repos from '../store/repos.js';
import { healthSignals } from '../signals.js';
import { importMealAsRecipe } from '../api/importMeal.js';
import bundled from './templates.js';

const META_FLAG = 'templatesSeededV1';

function recipeKeys(recipe) {
    const keys = [];
    const name = (recipe.nameLower || recipe.name || '').toLowerCase();
    if (name) keys.push(`name:${name}`);
    const ext = recipe.source?.externalId || recipe.id;
    if (ext) keys.push(`id:${String(ext).toLowerCase()}`);
    return keys;
}

/**
 * @param {{ force?: boolean, skipNetwork?: boolean, onProgress?: (info:{mealType:string, index:number, total:number, done:number, name:string, skipped?:boolean}) => void }} [opts]
 * @returns {Promise<{ seeded:number, skipped:number, createdFoodItems:number, alreadyDone:boolean }>}
 */
export async function seedTemplates(opts = {}) {
    const { force = false, skipNetwork = true, onProgress = null } = opts;

    if (!force) {
        const flag = await repos.meta.get(META_FLAG);
        if (flag === true) {
            return { seeded: 0, skipped: 0, createdFoodItems: 0, alreadyDone: true };
        }
    }

    const payload = bundled || {};
    const templatesByType = payload.templates || {};
    const mealTypes = Object.keys(templatesByType);
    if (mealTypes.length === 0) {
        console.warn('[templateSeeder] bundle is empty');
        return { seeded: 0, skipped: 0, createdFoodItems: 0, alreadyDone: false };
    }

    const allCategories = await repos.categories.list();
    const mealCats = allCategories.filter((c) => c.kind === 'meal');
    const foodCats = allCategories.filter((c) => c.kind === 'food');
    const mealCatByName = new Map(mealCats.map((c) => [c.name, c]));

    const runningFoods = await repos.foodItems.list();
    const existingRecipeKeys = new Set();
    for (const recipe of await repos.recipes.list()) {
        for (const key of recipeKeys(recipe)) existingRecipeKeys.add(key);
    }

    const queued = [];
    for (const mealType of mealTypes) {
        const cat = mealCatByName.get(mealType);
        const meals = templatesByType[mealType] || [];
        if (!cat) {
            console.warn(`[templateSeeder] no meal category for "${mealType}" — skipping ${meals.length} recipes`);
            continue;
        }
        for (const meal of meals) queued.push({ mealType, meal, categoryId: cat.id });
    }

    const total = queued.length;
    let seeded = 0;
    let skipped = 0;
    const createdIds = new Set();

    for (let i = 0; i < queued.length; i++) {
        const { mealType, meal, categoryId } = queued[i];
        const nameKey = (meal.name || '').toLowerCase();
        const idKey = meal.id ? `id:${String(meal.id).toLowerCase()}` : '';
        const already = (nameKey && existingRecipeKeys.has(`name:${nameKey}`))
            || (idKey && existingRecipeKeys.has(idKey));
        onProgress?.({
            mealType,
            index: i + 1,
            total,
            done: i + 1,
            name: meal.name,
            skipped: already || !nameKey,
        });
        if (!nameKey || already) { skipped++; continue; }
        try {
            const result = await importMealAsRecipe({
                meal,
                categoryId,
                foodCategories: foodCats,
                existingFoods: runningFoods,
                autoCreate: true,
                skipNetwork,
                source: {
                    kind: 'template',
                    provider: meal.id && String(meal.id).startsWith('cv-') ? 'corevital' : 'themealdb',
                    externalId: meal.id || null,
                    url: meal.sourceUrl || meal.youtubeUrl || null,
                    imageUrl: meal.imageUrl || null,
                },
            });
            seeded++;
            existingRecipeKeys.add(`name:${nameKey}`);
            if (idKey) existingRecipeKeys.add(idKey);
            for (const fid of result.createdFoodIds) {
                if (!createdIds.has(fid)) {
                    createdIds.add(fid);
                    const fi = await repos.foodItems.get(fid);
                    if (fi) runningFoods.push(fi);
                }
            }
        } catch (err) {
            console.warn(`[templateSeeder] "${meal.name}" failed: ${err.message}`);
            skipped++;
        }
    }

    await repos.meta.put(META_FLAG, true);
    healthSignals.onLibraryChanged.dispatch({ kind: 'templates-seeded' });
    healthSignals.onImportCompleted.dispatch({ seeded, skipped, createdFoodItems: createdIds.size });

    console.log(`[templateSeeder] seeded=${seeded} skipped=${skipped} createdFoods=${createdIds.size}`);
    return { seeded, skipped, createdFoodItems: createdIds.size, alreadyDone: false };
}
