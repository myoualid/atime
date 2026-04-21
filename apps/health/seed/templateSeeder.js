/**
 * Runtime template seeder.
 *
 * Imports bundled recipe templates (see ./templates.js) into the user's
 * library on first activation. Gated by the meta flag `templatesSeededV1`
 * so user deletions persist across reloads. A manual "Restore templates"
 * action may pass `{ force: true }` to re-seed.
 *
 * Ingredient FoodItems are auto-created via the offline local nutrition
 * table (no network calls) — see resolveIngredientLocal.
 */

import * as repos from '../store/repos.js';
import { healthSignals } from '../signals.js';
import { importMealAsRecipe } from '../api/importMeal.js';
import bundled from './templates.js';

const META_FLAG = 'templatesSeededV1';

/**
 * @param {{ force?: boolean, onProgress?: (info:{mealType:string, index:number, total:number, name:string}) => void }} [opts]
 * @returns {Promise<{ seeded:number, skipped:number, createdFoodItems:number, alreadyDone:boolean }>}
 */
export async function seedTemplates(opts = {}) {
    const { force = false, onProgress = null } = opts;

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

    // Pre-load existing foods & recipes once; importMealAsRecipe updates its
    // own in-memory byName map, but it does not see items created across calls
    // unless we re-read. Instead, we maintain a running list of created foods
    // and pass it forward.
    const runningFoods = await repos.foodItems.list();
    const existingRecipeNames = new Set(
        (await repos.recipes.list()).map((r) => (r.nameLower || r.name || '').toLowerCase()),
    );

    let seeded = 0;
    let skipped = 0;
    const createdIds = new Set();

    for (const mealType of mealTypes) {
        const meals = templatesByType[mealType] || [];
        const cat = mealCatByName.get(mealType);
        if (!cat) {
            console.warn(`[templateSeeder] no meal category for "${mealType}" — skipping ${meals.length} recipes`);
            skipped += meals.length;
            continue;
        }
        for (let i = 0; i < meals.length; i++) {
            const meal = meals[i];
            const nameKey = (meal.name || '').toLowerCase();
            if (!nameKey || existingRecipeNames.has(nameKey)) { skipped++; continue; }
            onProgress?.({ mealType, index: i + 1, total: meals.length, name: meal.name });
            try {
                const result = await importMealAsRecipe({
                    meal,
                    categoryId: cat.id,
                    foodCategories: foodCats,
                    existingFoods: runningFoods,
                    autoCreate: true,
                    skipNetwork: true,
                    source: {
                        kind: 'template',
                        provider: meal.id && String(meal.id).startsWith('cv-') ? 'corevital' : 'themealdb',
                        externalId: meal.id || null,
                        url: meal.sourceUrl || meal.youtubeUrl || null,
                        imageUrl: meal.imageUrl || null,
                    },
                });
                seeded++;
                existingRecipeNames.add(nameKey);
                for (const fid of result.createdFoodIds) {
                    if (!createdIds.has(fid)) {
                        createdIds.add(fid);
                        // Append to runningFoods so subsequent imports dedupe correctly.
                        // Cheap refetch of just this item keeps the object shape correct.
                        const fi = await repos.foodItems.get(fid);
                        if (fi) runningFoods.push(fi);
                    }
                }
            } catch (err) {
                console.warn(`[templateSeeder] "${meal.name}" failed: ${err.message}`);
                skipped++;
            }
        }
    }

    await repos.meta.put(META_FLAG, true);
    healthSignals.onLibraryChanged.dispatch({ kind: 'templates-seeded' });
    healthSignals.onImportCompleted.dispatch({ seeded, skipped, createdFoodItems: createdIds.size });

    console.log(`[templateSeeder] seeded=${seeded} skipped=${skipped} createdFoods=${createdIds.size}`);
    return { seeded, skipped, createdFoodItems: createdIds.size, alreadyDone: false };
}
