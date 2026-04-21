/**
 * Author-time script: fetches recipe templates from TheMealDB and writes
 * food/seed/templates.js (ES module default-exporting the bundle).
 *
 * Usage:
 *   node food/seed/buildTemplates.mjs
 *
 * Requires Node 18+ (global fetch). Outputs are committed to the repo so
 * the app can seed offline on first run.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DRINK_TEMPLATES } from './drinks.js';

const BASE = 'https://www.themealdb.com/api/json/v1/1';
const TARGET_PER_TYPE = 15;
const LOOKUP_CONCURRENCY = 4;
const MAX_RETRIES = 3;

/**
 * Meal-type → list of TheMealDB categories to pull from, in priority order.
 * We over-fetch and dedupe+trim to TARGET_PER_TYPE.
 */
const MEAL_TYPE_CATEGORIES = {
    Breakfast: ['Breakfast'],
    Lunch:     ['Vegetarian', 'Vegan', 'Miscellaneous', 'Pasta'],
    Dinner:    ['Beef', 'Chicken', 'Pasta', 'Seafood', 'Lamb', 'Pork'],
    Snack:     ['Starter', 'Side'],
    Dessert:   ['Dessert'],
};

async function fetchJson(url, { retries = MAX_RETRIES } = {}) {
    let lastErr = null;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'CoreVital-template-builder/1' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            lastErr = err;
            const wait = 300 * (attempt + 1);
            await new Promise((r) => setTimeout(r, wait));
        }
    }
    throw lastErr;
}

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
        servings: 1,
        ingredients,
    };
}

function parseMeasureToGrams(measure) {
    if (!measure) return 0;
    const s = measure.toLowerCase().trim();
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
    if (/^(g|gram|grams)\b/.test(rest)) return qty;
    if (/^(kg|kilogram|kilograms)\b/.test(rest)) return qty * 1000;
    if (/^(mg|milligram|milligrams)\b/.test(rest)) return qty / 1000;
    if (/^(oz|ounce|ounces)\b/.test(rest)) return qty * 28.3495;
    if (/^(lb|pound|pounds)\b/.test(rest)) return qty * 453.592;
    if (/^(ml|milliliter|milliliters)\b/.test(rest)) return qty;
    if (/^(l|liter|liters|litre|litres)\b/.test(rest)) return qty * 1000;
    if (/^(cup|cups)\b/.test(rest)) return qty * 240;
    if (/^(tbsp|tbs|tablespoon|tablespoons)\b/.test(rest)) return qty * 15;
    if (/^(tsp|teaspoon|teaspoons)\b/.test(rest)) return qty * 5;
    if (/^(pinch|dash)/.test(rest)) return qty * 0.5;
    return 0;
}

async function mapPool(items, concurrency, fn) {
    const out = new Array(items.length);
    let next = 0;
    async function worker() {
        while (true) {
            const i = next++;
            if (i >= items.length) return;
            try { out[i] = await fn(items[i], i); }
            catch (err) { out[i] = null; console.warn(`  !! failed[${i}]: ${err.message}`); }
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
    await Promise.all(workers);
    return out;
}

async function listByCategory(cat) {
    const data = await fetchJson(`${BASE}/filter.php?c=${encodeURIComponent(cat)}`);
    return (data.meals || []).map((m) => ({ id: String(m.idMeal), name: m.strMeal }));
}

async function lookupById(id) {
    const data = await fetchJson(`${BASE}/lookup.php?i=${encodeURIComponent(id)}`);
    const raw = (data.meals || [])[0];
    return raw ? normalizeMeal(raw) : null;
}

async function buildMealType(mealType, categoryList) {
    console.log(`\n[${mealType}] categories: ${categoryList.join(', ')}`);
    const seenIds = new Set();
    const candidateIds = [];
    for (const cat of categoryList) {
        const list = await listByCategory(cat);
        for (const { id } of list) {
            if (!seenIds.has(id)) {
                seenIds.add(id);
                candidateIds.push(id);
            }
        }
        console.log(`  ${cat}: +${list.length} (pool ${candidateIds.length})`);
        if (candidateIds.length >= TARGET_PER_TYPE * 2) break;
    }

    const ids = candidateIds.slice(0, TARGET_PER_TYPE * 2);
    console.log(`  looking up ${ids.length} meals (concurrency ${LOOKUP_CONCURRENCY})…`);
    const meals = await mapPool(ids, LOOKUP_CONCURRENCY, lookupById);
    const good = meals
        .filter((m) => m && m.name && m.ingredients.length > 0)
        .slice(0, TARGET_PER_TYPE);
    console.log(`  kept ${good.length}/${TARGET_PER_TYPE}`);
    return good;
}

async function main() {
    const byType = {};
    for (const [mealType, cats] of Object.entries(MEAL_TYPE_CATEGORIES)) {
        byType[mealType] = await buildMealType(mealType, cats);
    }
    byType.Drink = DRINK_TEMPLATES;
    console.log(`[Drink] hand-written: ${byType.Drink.length}`);

    const bundle = {
        version: 1,
        generatedAt: new Date().toISOString(),
        templates: byType,
    };

    const here = dirname(fileURLToPath(import.meta.url));
    const outJs = join(here, 'templates.js');
    const outJson = join(here, 'templates.json');

    const jsBody =
        '/* eslint-disable */\n' +
        '// Auto-generated by buildTemplates.mjs — do not edit by hand.\n' +
        `// Generated: ${bundle.generatedAt}\n` +
        `export default ${JSON.stringify(bundle, null, 2)};\n`;
    await writeFile(outJs, jsBody, 'utf8');
    await writeFile(outJson, JSON.stringify(bundle, null, 2), 'utf8');

    const counts = Object.entries(byType)
        .map(([k, v]) => `${k}:${v.length}`)
        .join(', ');
    console.log(`\n✓ wrote ${outJs}`);
    console.log(`✓ wrote ${outJson}`);
    console.log(`  totals → ${counts}`);
}

main().catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
});
