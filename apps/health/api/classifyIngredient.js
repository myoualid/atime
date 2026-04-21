/**
 * Classify a raw ingredient name (from TheMealDB) into one of our seeded
 * food categories and best-effort pull per-100g nutrition from Open Food Facts.
 */

import * as off from './openFoodFacts.js';
import { lookup as tableLookup } from './nutritionTable.js';

/** Keyword → category name map. Lowercased, evaluated in order. */
const KEYWORDS = [
    // Protein
    ['Protein', [
        'chicken', 'beef', 'steak', 'pork', 'lamb', 'mutton', 'turkey', 'duck', 'veal',
        'bacon', 'ham', 'sausage', 'salami', 'pepperoni', 'chorizo', 'prosciutto',
        'fish', 'salmon', 'tuna', 'cod', 'haddock', 'trout', 'sardine', 'mackerel', 'anchov',
        'shrimp', 'prawn', 'crab', 'lobster', 'squid', 'octopus', 'mussel', 'clam', 'oyster', 'scallop',
        'egg', 'tofu', 'tempeh', 'seitan',
        'bean', 'lentil', 'chickpea', 'pea ', 'peas', 'soy',
    ]],
    // Dairy
    ['Dairy', [
        'milk', 'cream', 'yogurt', 'yoghurt', 'cheese', 'cheddar', 'mozzarella', 'parmesan',
        'feta', 'ricotta', 'butter', 'ghee', 'curd', 'kefir', 'buttermilk',
    ]],
    // Fat / oil
    ['Fat', [
        'oil', 'olive oil', 'vegetable oil', 'sunflower oil', 'sesame oil', 'coconut oil',
        'lard', 'shortening', 'margarine', 'mayonnaise', 'mayo',
    ]],
    // Grain & starches
    ['Grain', [
        'rice', 'pasta', 'spaghetti', 'noodle', 'macaroni', 'penne', 'lasagna', 'lasagne',
        'bread', 'toast', 'bun', 'roll', 'bagel', 'tortilla', 'wrap', 'pita',
        'flour', 'cornstarch', 'cornflour', 'semolina', 'couscous', 'bulgur', 'quinoa',
        'oat', 'oats', 'oatmeal', 'muesli', 'granola', 'cereal', 'cornmeal', 'polenta',
        'potato', 'sweet potato', 'yam', 'cassava', 'plantain',
        'cracker', 'breadcrumb',
    ]],
    // Fruit
    ['Fruit', [
        'apple', 'banana', 'orange', 'lemon', 'lime', 'grapefruit', 'mandarin', 'clementine',
        'berry', 'berries', 'strawberr', 'raspberr', 'blueberr', 'blackberr', 'cranberr',
        'grape', 'raisin', 'sultana', 'date', 'prune', 'fig', 'apricot', 'peach', 'nectarine',
        'pear', 'plum', 'cherry', 'mango', 'papaya', 'pineapple', 'kiwi', 'melon', 'watermelon',
        'coconut', 'pomegranate', 'avocado', 'guava', 'passion fruit', 'lychee', 'rhubarb',
    ]],
    // Vegetable
    ['Vegetable', [
        'tomato', 'onion', 'shallot', 'scallion', 'spring onion', 'leek', 'garlic',
        'carrot', 'celery', 'cucumber', 'zucchini', 'courgette', 'eggplant', 'aubergine',
        'pepper', 'bell pepper', 'chili', 'chilli', 'jalapeño', 'jalapeno',
        'lettuce', 'spinach', 'kale', 'rocket', 'arugula', 'cabbage', 'broccoli', 'cauliflower',
        'brussels sprout', 'asparagus', 'artichoke', 'mushroom', 'corn', 'maize', 'squash',
        'pumpkin', 'beet', 'beetroot', 'radish', 'turnip', 'parsnip', 'fennel', 'okra',
        'olive', 'caper', 'pickle', 'sauerkraut', 'kimchi',
    ]],
    // Spice & herbs & condiments
    ['Spice', [
        'salt', 'pepper', 'paprika', 'cumin', 'coriander', 'cinnamon', 'clove', 'cardamom',
        'turmeric', 'saffron', 'nutmeg', 'vanilla', 'bay leaf', 'oregano', 'thyme', 'rosemary',
        'sage', 'parsley', 'basil', 'mint', 'dill', 'chive', 'tarragon',
        'sugar', 'honey', 'syrup', 'molasses', 'vinegar', 'mustard',
        'soy sauce', 'worcestershire', 'ketchup', 'tabasco', 'sriracha',
        'baking powder', 'baking soda', 'yeast', 'stock', 'bouillon', 'broth',
    ]],
    // Beverage
    ['Beverage', [
        'water', 'juice', 'wine', 'beer', 'rum', 'vodka', 'whisky', 'whiskey', 'brandy',
        'tequila', 'gin', 'liqueur', 'champagne', 'cider', 'tea', 'coffee',
    ]],
];

/** Return the categoryId for an ingredient name, or null if not matched. */
export function classifyByKeyword(name, foodCategories) {
    const s = (name || '').toLowerCase();
    if (!s) return null;
    for (const [catName, words] of KEYWORDS) {
        for (const w of words) {
            if (s.includes(w)) {
                const cat = foodCategories.find((c) => c.name === catName);
                if (cat) return cat.id;
            }
        }
    }
    return null;
}

/** Classify using OFF categories_tags (en:cheeses, en:meats, etc). */
export function classifyByOffTags(tags, foodCategories) {
    if (!Array.isArray(tags) || tags.length === 0) return null;
    const joined = tags.join(' ').toLowerCase();
    const map = [
        ['Dairy', ['dair', 'cheese', 'milk', 'yogurt', 'yoghurt', 'cream', 'butter']],
        ['Protein', ['meat', 'poultry', 'fish', 'seafood', 'egg', 'legume', 'tofu', 'bean']],
        ['Fruit', ['fruit', 'berry']],
        ['Vegetable', ['vegetable', 'mushroom']],
        ['Grain', ['cereal', 'pasta', 'rice', 'bread', 'flour', 'potato']],
        ['Fat', ['oil', 'fat']],
        ['Beverage', ['beverage', 'drink', 'juice', 'water']],
        ['Spice', ['spice', 'herb', 'condiment', 'sauce', 'sugar', 'sweetener']],
    ];
    for (const [catName, keys] of map) {
        if (keys.some((k) => joined.includes(k))) {
            const cat = foodCategories.find((c) => c.name === catName);
            if (cat) return cat.id;
        }
    }
    return null;
}

const zeroNut = () => ({
    kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    fiber_g: 0, sugar_g: 0, sodium_mg: 0, saturatedFat_g: 0, micros: {},
});

const perGramFromPer100 = (p100) => ({
    kcal: p100.kcal / 100,
    protein_g: p100.protein_g / 100,
    carbs_g: p100.carbs_g / 100,
    fat_g: p100.fat_g / 100,
    fiber_g: p100.fiber_g / 100,
    sugar_g: p100.sugar_g / 100,
    sodium_mg: p100.sodium_mg / 100,
    saturatedFat_g: p100.saturatedFat_g / 100,
    micros: {},
});

/**
 * Synchronous, offline-only ingredient resolver.
 * Uses the local curated nutrition table; falls back to zero nutrition when
 * the ingredient is unknown. Good for bulk/template seeding where ~700
 * OFF network hits would be prohibitive.
 */
export function resolveIngredientLocal(name, foodCategories) {
    const hit = tableLookup(name);
    if (hit) {
        const e = hit.entry;
        const p100 = {
            kcal: e.kcal, protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g,
            fiber_g: e.fiber_g, sugar_g: e.sugar_g, sodium_mg: e.sodium_mg, saturatedFat_g: e.saturatedFat_g,
        };
        const catByName = e.category ? foodCategories.find((c) => c.name === e.category) : null;
        const categoryId = catByName?.id || classifyByKeyword(name, foodCategories) || null;
        return {
            name,
            categoryId,
            defaultServingG: 100,
            nutritionPerGram: perGramFromPer100(p100),
            source: { provider: 'local-nutrition-table', externalId: hit.key },
            tags: ['auto-created'],
        };
    }
    return {
        name,
        categoryId: classifyByKeyword(name, foodCategories) || null,
        defaultServingG: 100,
        nutritionPerGram: zeroNut(),
        source: { provider: 'unknown', externalId: name },
        tags: ['auto-created'],
    };
}

/**
 * Resolve one ingredient: find nutrition via OFF + classify category.
 * Returns a FoodItem-shaped payload ready for repos.foodItems.put().
 */
export async function resolveIngredient(name, foodCategories) {
    // 1) Local curated table covers most common raw ingredients with reliable nutrition.
    const hit = tableLookup(name);
    if (hit) {
        const e = hit.entry;
        const p100 = {
            kcal: e.kcal, protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g,
            fiber_g: e.fiber_g, sugar_g: e.sugar_g, sodium_mg: e.sodium_mg, saturatedFat_g: e.saturatedFat_g,
        };
        const catByName = e.category ? foodCategories.find((c) => c.name === e.category) : null;
        const categoryId = catByName?.id || classifyByKeyword(name, foodCategories) || null;
        return {
            name,
            categoryId,
            defaultServingG: 100,
            nutritionPerGram: perGramFromPer100(p100),
            source: { provider: 'local-nutrition-table', externalId: hit.key },
            tags: ['auto-created'],
        };
    }

    // 2) Fall back to Open Food Facts for unknown ingredients (best-effort).
    let nutritionPerGram = zeroNut();
    let off_code = null;
    try {
        const products = await off.searchProducts(name, { pageSize: 5 });
        // Pick first product with non-zero kcal; fall back to first.
        const good = products.find((p) => p.nutritionPer100g.kcal > 0) || products[0];
        if (good) {
            nutritionPerGram = perGramFromPer100(good.nutritionPer100g);
            off_code = good.code || null;
        }
    } catch {
        // Network/CORS: zeros.
    }
    // Prefer keyword classification over OFF product tags — OFF returns product
    // categories (e.g. "caramelized-onion pasta"), not ingredient taxonomy.
    const categoryId = classifyByKeyword(name, foodCategories) || null;
    return {
        name,
        categoryId,
        defaultServingG: 100,
        nutritionPerGram,
        source: { provider: 'themealdb-ingredient', externalId: off_code ? `off:${off_code}` : name },
        tags: ['auto-created'],
    };
}
