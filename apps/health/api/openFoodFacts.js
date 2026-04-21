/**
 * Open Food Facts API client.
 * Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
 *
 * We use the v2 search + product endpoints.
 * Free, no API key. A UA string is recommended.
 */

import { CACHE_TTL_15_MIN_MS, fetchJsonWithCache } from '../../../shared/tools/httpCache.js';

const BASES = [
    'https://ssl-api.openfoodfacts.org',
    'https://world.openfoodfacts.org',
];

const FIELDS = [
    // Identity
    'code', 'product_name', 'generic_name', 'brands', 'quantity',
    'categories_tags', 'categories',
    'image_small_url', 'image_thumb_url', 'image_front_url', 'image_ingredients_url', 'image_nutrition_url',
    // Serving & nutrition
    'serving_size', 'serving_quantity', 'nutriments', 'nutrition_data_per',
    // Health scores
    'nutriscore_grade', 'nutriscore_score', 'nutriscore_data',
    'nutrient_levels', 'nutrient_levels_tags',
    'nova_group', 'nova_groups_tags',
    // Ingredients & processing
    'ingredients_text', 'ingredients_text_en', 'ingredients_n',
    'additives_tags', 'additives_original_tags', 'additives_n',
    'ingredients_analysis_tags',
    'allergens_tags', 'traces_tags',
    'labels_tags',
    // Environment
    'ecoscore_grade', 'ecoscore_score', 'ecoscore_data',
    'packaging', 'packaging_tags', 'packagings',
    'origins', 'origins_tags',
    'countries_tags',
    // Misc
    'states_tags',
].join(',');

/** Safe JSON fetch with timeout. No custom headers (avoids CORS preflight). */
async function fetchJson(url, { timeoutMs = 8000 } = {}) {
    return fetchJsonWithCache(url, {
        namespace: 'openfoodfacts',
        ttlMs: CACHE_TTL_15_MIN_MS,
        timeoutMs,
    });
}

/**
 * Search products by free text.
 * Uses /search.json which has consistent CORS support from browsers.
 * @param {string} query
 * @param {{ pageSize?: number, page?: number }} [opts]
 * @returns {Promise<Array<OffProduct>>}
 */
/** Try a set of URLs in order until one succeeds. */
async function fetchJsonAny(paths, opts) {
    let lastErr = null;
    for (const base of BASES) {
        for (const path of paths) {
            try { return await fetchJson(base + path, opts); }
            catch (e) { lastErr = e; }
        }
    }
    throw lastErr || new Error('All endpoints failed');
}

export async function searchProducts(query, { pageSize = 20, page = 1 } = {}) {
    if (!query || !query.trim()) return [];
    const q = encodeURIComponent(query);
    const paths = [
        `/cgi/search.pl?search_simple=1&action=process&search_terms=${q}&page_size=${pageSize}&page=${page}&json=1`,
        `/cgi/search.pl?search_simple=1&action=process&search_terms=${q}&page_size=${pageSize}&page=${page}&json=true`,
    ];
    const data = await fetchJsonAny(paths);
    return (data.products || []).map(normalizeProduct).filter(Boolean);
}

/** Look up a single product by barcode. */
export async function getProductByBarcode(barcode) {
    const code = String(barcode || '').trim();
    if (!code) return null;
    const paths = [
        `/api/v0/product/${encodeURIComponent(code)}.json`,
        `/api/v2/product/${encodeURIComponent(code)}.json`,
    ];
    const data = await fetchJsonAny(paths);
    if (data.status !== 1 || !data.product) return null;
    return normalizeProduct(data.product);
}

/**
 * @typedef {Object} OffProduct
 * @property {string} code
 * @property {string} name
 * @property {string} [brand]
 * @property {string} [imageUrl]
 * @property {number} [servingG]
 * @property {{kcal:number, protein_g:number, carbs_g:number, fat_g:number, fiber_g:number, sugar_g:number, sodium_mg:number, saturatedFat_g:number}} nutritionPer100g
 * @property {string[]} [categoryTags]
 */

function pickNum(obj, ...keys) {
    for (const k of keys) {
        const v = obj?.[k];
        if (typeof v === 'number' && isFinite(v)) return v;
        if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
    }
    return 0;
}

function normalizeProduct(p) {
    if (!p) return null;
    const n = p.nutriments || {};
    // Open Food Facts stores per-100g in *_100g fields.
    // sodium is usually in grams (sodium_100g) — convert to mg.
    const sodium_g = pickNum(n, 'sodium_100g');
    const salt_g = pickNum(n, 'salt_100g');
    const sodium_mg = sodium_g > 0 ? sodium_g * 1000 : (salt_g > 0 ? (salt_g / 2.5) * 1000 : 0);

    const kcal = pickNum(n, 'energy-kcal_100g') || (pickNum(n, 'energy_100g') / 4.184);

    const nutritionPer100g = {
        kcal: round2(kcal),
        protein_g: round2(pickNum(n, 'proteins_100g')),
        carbs_g: round2(pickNum(n, 'carbohydrates_100g')),
        fat_g: round2(pickNum(n, 'fat_100g')),
        fiber_g: round2(pickNum(n, 'fiber_100g')),
        sugar_g: round2(pickNum(n, 'sugars_100g')),
        sodium_mg: round2(sodium_mg),
        saturatedFat_g: round2(pickNum(n, 'saturated-fat_100g')),
    };

    const name = (p.product_name || p.generic_name || '').trim();
    if (!name) return null;

    return {
        code: String(p.code || ''),
        name,
        brand: (p.brands || '').split(',')[0]?.trim() || undefined,
        imageUrl: p.image_small_url || p.image_thumb_url || undefined,
        servingG: pickNum(p, 'serving_quantity') || undefined,
        nutritionPer100g,
        categoryTags: Array.isArray(p.categories_tags) ? p.categories_tags : [],
        details: buildDetails(p, n),
    };
}

/** Strip leading "en:" / "fr:" language prefix from OFF tag strings. */
function stripTagPrefix(t) {
    return String(t || '').replace(/^[a-z]{2,3}:/, '').replace(/-/g, ' ');
}

function tagsToList(tags) {
    if (!Array.isArray(tags)) return [];
    return tags.map((t) => stripTagPrefix(t)).filter(Boolean);
}

/** Build the rich detail block we persist alongside the food item. */
function buildDetails(p, n) {
    const analysis = tagsToList(p.ingredients_analysis_tags);
    const pick = (re) => {
        const hit = analysis.find((t) => re.test(t));
        return hit || null;
    };

    const details = {
        // --- Health scores ---
        nutriScore: p.nutriscore_grade
            ? { grade: String(p.nutriscore_grade).toLowerCase(), score: pickNum(p, 'nutriscore_score') || null }
            : null,
        novaGroup: Number(p.nova_group) || null,
        nutrientLevels: p.nutrient_levels && typeof p.nutrient_levels === 'object' ? { ...p.nutrient_levels } : null,

        // --- Extended per-100g nutrients kept verbatim (grams/other units as OFF returns) ---
        nutrientsPer100g: extractExtendedNutrients(n),

        // --- Ingredients & processing ---
        ingredientsText: (p.ingredients_text || p.ingredients_text_en || '').trim() || null,
        ingredientsCount: Number(p.ingredients_n) || null,
        additives: tagsToList(p.additives_tags),
        additivesCount: Number(p.additives_n) || null,
        allergens: tagsToList(p.allergens_tags),
        traces: tagsToList(p.traces_tags),
        labels: tagsToList(p.labels_tags),
        ingredientsAnalysis: {
            vegan: pick(/vegan/i),
            vegetarian: pick(/vegetarian/i),
            palmOil: pick(/palm-oil/i),
        },

        // --- Environment ---
        ecoScore: p.ecoscore_grade
            ? { grade: String(p.ecoscore_grade).toLowerCase(), score: pickNum(p, 'ecoscore_score') || null }
            : null,
        packaging: tagsToList(p.packaging_tags),
        origins: (p.origins || '').trim() || null,
        originTags: tagsToList(p.origins_tags),
        countries: tagsToList(p.countries_tags),

        // --- Category breadcrumb (human readable) ---
        categories: (p.categories || '').trim() || null,

        // --- Additional images ---
        images: {
            front: p.image_front_url || null,
            ingredients: p.image_ingredients_url || null,
            nutrition: p.image_nutrition_url || null,
        },

        // Capture moment
        fetchedAt: new Date().toISOString(),
    };

    return details;
}

/** Extract extended nutrient values (g unless *_mg/*_µg). */
function extractExtendedNutrients(n) {
    // Per-100g keys in OFF. Units are grams by default; some are already mg/µg.
    const keys = [
        'energy-kcal', 'energy-kj',
        'fat', 'saturated-fat', 'monounsaturated-fat', 'polyunsaturated-fat',
        'trans-fat', 'cholesterol',
        'carbohydrates', 'sugars', 'added-sugars', 'starch', 'polyols',
        'fiber', 'proteins',
        'salt', 'sodium',
        'alcohol', 'caffeine',
        'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'copper',
        'vitamin-a', 'vitamin-c', 'vitamin-d', 'vitamin-e', 'vitamin-k',
        'vitamin-b1', 'vitamin-b2', 'vitamin-b6', 'vitamin-b9', 'vitamin-b12', 'vitamin-pp',
        'fruits-vegetables-nuts-estimate-from-ingredients',
    ];
    const out = {};
    for (const k of keys) {
        const v = pickNum(n, `${k}_100g`);
        if (v > 0) {
            const unit = n[`${k}_unit`] || defaultUnitFor(k);
            out[k] = { value: round2(v), unit };
        }
    }
    return out;
}

function defaultUnitFor(k) {
    if (k === 'energy-kj') return 'kJ';
    if (k === 'energy-kcal') return 'kcal';
    if (/^fruits-vegetables/.test(k)) return '%';
    if (/^vitamin-/.test(k)) return 'mg';
    return 'g';
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/**
 * Convert an OffProduct to a local FoodItem payload.
 * @param {OffProduct} p
 * @param {string|null} categoryId
 */
export function offToFoodItem(p, categoryId = null) {
    const per100 = p.nutritionPer100g;
    const per1 = {
        kcal: per100.kcal / 100,
        protein_g: per100.protein_g / 100,
        carbs_g: per100.carbs_g / 100,
        fat_g: per100.fat_g / 100,
        fiber_g: per100.fiber_g / 100,
        sugar_g: per100.sugar_g / 100,
        sodium_mg: per100.sodium_mg / 100,
        saturatedFat_g: per100.saturatedFat_g / 100,
        micros: {},
    };
    const name = p.brand ? `${p.name} (${p.brand})` : p.name;
    return {
        name,
        categoryId,
        defaultServingG: p.servingG || 100,
        nutritionPerGram: per1,
        source: {
            kind: 'api',
            provider: 'openfoodfacts',
            externalId: p.code || null,
            ean: p.code || null,
            url: p.code ? `https://world.openfoodfacts.org/product/${encodeURIComponent(p.code)}` : null,
            imageUrl: p.imageUrl || null,
        },
        details: p.details || null,
        tags: p.categoryTags?.slice(0, 5) || [],
    };
}
