/**
 * TheMealDB API client.
 * Docs: https://www.themealdb.com/api.php
 * Free test key '1' supports basic search/lookup.
 *
 * Endpoints used:
 *   search.php?s=<name>     – list by name
 *   lookup.php?i=<id>       – full meal detail (with ingredients)
 *   random.php              – random meal
 *   filter.php?c=<category> – list by category
 *   categories.php          – list of all categories
 */

import { CACHE_TTL_15_MIN_MS, fetchJsonWithCache } from '../../../shared/tools/httpCache.js';

const BASE = 'https://www.themealdb.com/api/json/v1/1';

async function fetchJson(url, { timeoutMs = 8000, useCache = true } = {}) {
    return fetchJsonWithCache(url, {
        namespace: 'themealdb',
        ttlMs: CACHE_TTL_15_MIN_MS,
        timeoutMs,
        useCache,
    });
}

/**
 * Search meals by free text.
 * @returns {Promise<Array<MealSummary>>}
 */
export async function searchMeals(query) {
    if (!query || !query.trim()) return [];
    const url = `${BASE}/search.php?s=${encodeURIComponent(query)}`;
    const data = await fetchJson(url);
    return (data.meals || []).map(normalizeMeal);
}

/** Fetch full meal detail by TheMealDB id. */
export async function getMealById(id) {
    const url = `${BASE}/lookup.php?i=${encodeURIComponent(id)}`;
    const data = await fetchJson(url);
    const raw = (data.meals || [])[0];
    return raw ? normalizeMeal(raw) : null;
}

export async function getRandomMeal() {
    const data = await fetchJson(`${BASE}/random.php`, { timeoutMs: 8000, useCache: false });
    const raw = (data.meals || [])[0];
    return raw ? normalizeMeal(raw) : null;
}

/**
 * List all meal categories (e.g. Beef, Chicken, Breakfast, Dessert…).
 * @returns {Promise<Array<{ id:string, name:string, thumb:string, description:string }>>}
 */
export async function listCategories() {
    const data = await fetchJson(`${BASE}/categories.php`);
    return (data.categories || []).map((c) => ({
        id: String(c.idCategory),
        name: c.strCategory || '',
        thumb: c.strCategoryThumb || '',
        description: c.strCategoryDescription || '',
    }));
}

/**
 * Filter meals by category name. Returns lightweight summaries only —
 * call getMealById(id) to hydrate full ingredients/instructions.
 * @returns {Promise<Array<{ id:string, name:string, imageUrl:string }>>}
 */
export async function filterByCategory(category) {
    const url = `${BASE}/filter.php?c=${encodeURIComponent(category)}`;
    const data = await fetchJson(url);
    return (data.meals || []).map((m) => ({
        id: String(m.idMeal),
        name: (m.strMeal || '').trim(),
        imageUrl: m.strMealThumb || '',
    }));
}

/**
 * @typedef {Object} Ingredient
 * @property {string} name
 * @property {string} measure  Original text measure, e.g. "2 tbsp", "200g"
 * @property {number} amountG  Best-effort grams conversion (may be 0 if unknown)
 *
 * @typedef {Object} MealSummary
 * @property {string} id
 * @property {string} name
 * @property {string} [category]
 * @property {string} [area]
 * @property {string} [instructions]
 * @property {string} [imageUrl]
 * @property {string} [youtubeUrl]
 * @property {string} [sourceUrl]
 * @property {string[]} tags
 * @property {Ingredient[]} ingredients
 */

function normalizeMeal(m) {
    const ingredients = [];
    for (let i = 1; i <= 20; i++) {
        const name = (m[`strIngredient${i}`] || '').trim();
        const measure = (m[`strMeasure${i}`] || '').trim();
        if (!name) continue;
        ingredients.push({ name, measure, amountG: parseMeasureToGrams(measure) });
    }
    return {
        id: String(m.idMeal),
        name: (m.strMeal || '').trim(),
        category: m.strCategory || '',
        area: m.strArea || '',
        instructions: m.strInstructions || '',
        imageUrl: m.strMealThumb || '',
        youtubeUrl: m.strYoutube || '',
        sourceUrl: m.strSource || '',
        tags: (m.strTags || '').split(',').map((t) => t.trim()).filter(Boolean),
        ingredients,
    };
}

/**
 * Best-effort conversion of a free-form measure string to grams.
 * Returns 0 when the unit can't be recognized (caller should prompt user).
 */
export function parseMeasureToGrams(measure) {
    if (!measure) return 0;
    const s = measure.toLowerCase().trim();
    // Fraction + number handling: "1 1/2", "1/2", "0.5"
    const numMatch = s.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/);
    if (!numMatch) return 0;
    let qty = 0;
    const raw = numMatch[1];
    if (raw.includes(' ')) {
        const [whole, frac] = raw.split(' ');
        const [a, b] = frac.split('/').map(Number);
        qty = Number(whole) + a / b;
    } else if (raw.includes('/')) {
        const [a, b] = raw.split('/').map(Number);
        qty = a / b;
    } else {
        qty = Number(raw);
    }
    const rest = s.slice(numMatch[0].length).trim();
    // units
    if (/^(g|gram|grams)\b/.test(rest)) return qty;
    if (/^(kg|kilogram|kilograms)\b/.test(rest)) return qty * 1000;
    if (/^(mg|milligram|milligrams)\b/.test(rest)) return qty / 1000;
    if (/^(oz|ounce|ounces)\b/.test(rest)) return qty * 28.3495;
    if (/^(lb|pound|pounds)\b/.test(rest)) return qty * 453.592;
    if (/^(ml|milliliter|milliliters)\b/.test(rest)) return qty; // ≈1 g/ml fallback
    if (/^(l|liter|liters|litre|litres)\b/.test(rest)) return qty * 1000;
    if (/^(cup|cups)\b/.test(rest)) return qty * 240;
    if (/^(tbsp|tbs|tablespoon|tablespoons)\b/.test(rest)) return qty * 15;
    if (/^(tsp|teaspoon|teaspoons)\b/.test(rest)) return qty * 5;
    if (/^(pinch|dash)/.test(rest)) return qty * 0.5;
    // No recognized unit → treat as piece; return 0 so user can specify.
    return 0;
}
