/**
 * Shared "TheMealDB meal → our Recipe" import helper.
 * Used by both the online search panel and the template seeder.
 *
 * Auto-creates missing FoodItems via resolveIngredient (network) or
 * resolveIngredientLocal (offline table only, no OFF calls).
 */

import * as repos from '../store/repos.js';
import { resolveIngredient, resolveIngredientLocal } from './classifyIngredient.js';

/**
 * @param {Object} opts
 * @param {Object} opts.meal           Normalized meal from themealdb.normalizeMeal (or compatible shape)
 * @param {string|null} opts.categoryId  Meal (recipe) categoryId in our library
 * @param {Array} opts.foodCategories   Food-kind categories from our library
 * @param {Array} opts.existingFoods    Current foodItems (used for dedupe-by-name)
 * @param {boolean} [opts.autoCreate]   Auto-create missing ingredients (default true)
 * @param {boolean} [opts.skipNetwork]  Use local-only ingredient resolver (default false)
 * @param {Object|null} [opts.source]   Override source metadata on the recipe
 * @param {(name:string, i:number, total:number) => void} [opts.onProgress]
 * @returns {Promise<{ recipe: Object, resolved: number, skipped: number, createdFoodIds: string[] }>}
 */
export async function importMealAsRecipe({
    meal,
    categoryId,
    foodCategories,
    existingFoods,
    autoCreate = true,
    skipNetwork = false,
    source = null,
    onProgress = null,
}) {
    if (!meal || !Array.isArray(meal.ingredients)) {
        throw new Error('importMealAsRecipe: invalid meal payload');
    }

    const byName = new Map(
        (existingFoods || []).map((f) => [f.nameLower || (f.name || '').toLowerCase(), f]),
    );
    const ingredients = [];
    const createdFoodIds = [];
    let resolved = 0;
    let skipped = 0;

    for (let i = 0; i < meal.ingredients.length; i++) {
        const ing = meal.ingredients[i];
        const key = (ing.name || '').toLowerCase();
        if (!key) { skipped++; continue; }

        let fi = byName.get(key);
        if (!fi && autoCreate) {
            onProgress?.(ing.name, i + 1, meal.ingredients.length);
            const payload = skipNetwork
                ? resolveIngredientLocal(ing.name, foodCategories)
                : await resolveIngredient(ing.name, foodCategories);
            payload.defaultServingG = ing.amountG || payload.defaultServingG;
            fi = await repos.foodItems.put(payload);
            byName.set(key, fi);
            createdFoodIds.push(fi.id);
        }
        if (!fi) { skipped++; continue; }

        ingredients.push({
            foodItemId: fi.id,
            amountG: Number(ing.amountG) || 0,
            note: ing.measure || ing.note || null,
        });
        resolved++;
    }

    if (ingredients.length === 0) {
        throw new Error('No importable ingredients (try enabling auto-create).');
    }

    const recipePayload = {
        name: meal.name,
        categoryId,
        servings: Number(meal.servings) || 1,
        description: meal.description
            || [meal.area, meal.category].filter(Boolean).join(' · '),
        instructions: meal.instructions || '',
        ingredients,
        cuisine: meal.area || null,
        tags: Array.isArray(meal.tags) ? meal.tags : [],
        source: source || {
            kind: 'api',
            provider: 'themealdb',
            externalId: meal.id || null,
            url: meal.sourceUrl || meal.youtubeUrl || null,
            imageUrl: meal.imageUrl || null,
        },
    };

    const recipe = await repos.recipes.put(recipePayload);
    return { recipe, resolved, skipped, createdFoodIds };
}
