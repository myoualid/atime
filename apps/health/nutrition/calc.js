/**
 * Pure nutrition math. No DOM. No IDB.
 */

/** @returns {import('../types.js').Nutrition} */
export function zeroNutrition() {
    return {
        kcal: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        sodium_mg: 0,
        saturatedFat_g: 0,
        micros: {},
    };
}

const NUM_KEYS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'saturatedFat_g'];

export function sumNutrition(a, b) {
    const out = zeroNutrition();
    for (const k of NUM_KEYS) {
        out[k] = (a?.[k] ?? 0) + (b?.[k] ?? 0);
    }
    const micros = { ...(a?.micros || {}) };
    for (const [k, v] of Object.entries(b?.micros || {})) {
        if (micros[k] && micros[k].unit === v.unit) {
            micros[k] = { amount: (micros[k].amount || 0) + (v.amount || 0), unit: v.unit };
        } else if (!micros[k]) {
            micros[k] = { amount: v.amount, unit: v.unit };
        }
    }
    out.micros = micros;
    return out;
}

export function scaleNutrition(n, factor) {
    if (!n) return zeroNutrition();
    const out = zeroNutrition();
    for (const k of NUM_KEYS) out[k] = (n[k] ?? 0) * factor;
    const micros = {};
    for (const [k, v] of Object.entries(n.micros || {})) {
        micros[k] = { amount: (v.amount || 0) * factor, unit: v.unit };
    }
    out.micros = micros;
    return out;
}

/**
 * Aggregate a recipe's nutrition from its ingredients.
 * @param {{ ingredients:Array<{foodItemId:string,amountG:number,optional?:boolean}>, servings:number }} recipe
 * @param {Record<string, { nutritionPerGram: any }>} foodItemsById
 */
export function recipeTotals(recipe, foodItemsById) {
    let total = zeroNutrition();
    let weightG = 0;
    for (const ing of recipe.ingredients || []) {
        if (ing.optional) continue;
        const food = foodItemsById[ing.foodItemId];
        if (!food) continue;
        total = sumNutrition(total, scaleNutrition(food.nutritionPerGram, ing.amountG || 0));
        weightG += ing.amountG || 0;
    }
    const servings = Math.max(1, recipe.servings || 1);
    return {
        total,
        perServing: scaleNutrition(total, 1 / servings),
        weightG,
    };
}

/**
 * Compute nutrition delivered by a single plan entry.
 */
export function planEntryTotals(entry, recipesById, foodItemsById) {
    if (!entry) return zeroNutrition();
    if (entry.target?.kind === 'food') {
        const food = foodItemsById[entry.target.foodItemId];
        if (!food) return zeroNutrition();
        return scaleNutrition(food.nutritionPerGram, entry.target.amountG || 0);
    }
    if (entry.target?.kind === 'recipe') {
        const recipe = recipesById[entry.target.recipeId];
        if (!recipe) return zeroNutrition();
        const { perServing } = recipeTotals(recipe, foodItemsById);
        return scaleNutrition(perServing, entry.target.servings || 0);
    }
    return zeroNutrition();
}

export function planDayTotals(entries, recipesById, foodItemsById) {
    let total = zeroNutrition();
    for (const e of entries || []) {
        total = sumNutrition(total, planEntryTotals(e, recipesById, foodItemsById));
    }
    return total;
}

/**
 * Aggregate a list of plan entries into a shopping list keyed by foodItemId.
 * Recipes are expanded into their ingredients scaled by servings.
 * @returns {Array<{ foodItemId:string, totalAmountG:number, sources:Array }>}
 */
export function shoppingRollup(entries, recipesById) {
    /** @type {Map<string, { foodItemId:string, totalAmountG:number, sources:any[] }>} */
    const acc = new Map();
    const add = (foodItemId, amountG, source) => {
        if (!foodItemId || !Number.isFinite(amountG) || amountG <= 0) return;
        const cur = acc.get(foodItemId) || { foodItemId, totalAmountG: 0, sources: [] };
        cur.totalAmountG += amountG;
        cur.sources.push(source);
        acc.set(foodItemId, cur);
    };
    for (const e of entries || []) {
        if (e.target?.kind === 'food') {
            add(e.target.foodItemId, e.target.amountG || 0, { planEntryId: e.id, amountG: e.target.amountG || 0 });
        } else if (e.target?.kind === 'recipe') {
            const recipe = recipesById[e.target.recipeId];
            if (!recipe) continue;
            const factor = (e.target.servings || 0) / Math.max(1, recipe.servings || 1);
            for (const ing of recipe.ingredients || []) {
                if (ing.optional) continue;
                add(ing.foodItemId, (ing.amountG || 0) * factor, { planEntryId: e.id, recipeId: recipe.id, amountG: (ing.amountG || 0) * factor });
            }
        }
    }
    return [...acc.values()].sort((a, b) => b.totalAmountG - a.totalAmountG);
}
