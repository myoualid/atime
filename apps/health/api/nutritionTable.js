/**
 * Small curated nutrition table for common raw ingredients.
 * Values are per 100 g edible portion, based on widely-published USDA figures.
 * This is intentionally small; it covers the most common ~80 ingredients used
 * by TheMealDB recipes so auto-imports have realistic calories.
 *
 * Keys are lowercased and matched with word-boundary awareness by normalizeName().
 * Structure: { kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, saturatedFat_g, category }
 */

const T = (kcal, protein_g, carbs_g, fat_g, extras = {}) => ({
    kcal, protein_g, carbs_g, fat_g,
    fiber_g: extras.fiber_g ?? 0,
    sugar_g: extras.sugar_g ?? 0,
    sodium_mg: extras.sodium_mg ?? 0,
    saturatedFat_g: extras.saturatedFat_g ?? 0,
    category: extras.category || null,
});

export const NUTRITION_TABLE = {
    // --- Protein ---
    'chicken': T(165, 31, 0, 3.6, { saturatedFat_g: 1.0, sodium_mg: 74, category: 'Protein' }),
    'chicken breast': T(165, 31, 0, 3.6, { saturatedFat_g: 1.0, sodium_mg: 74, category: 'Protein' }),
    'chicken thigh': T(209, 26, 0, 10.9, { saturatedFat_g: 3.1, sodium_mg: 86, category: 'Protein' }),
    'chicken stock': T(15, 2.1, 0.8, 0.5, { sodium_mg: 340, category: 'Spice' }),
    'beef': T(250, 26, 0, 15, { saturatedFat_g: 6, sodium_mg: 72, category: 'Protein' }),
    'beef stock': T(17, 2.5, 1.6, 0.3, { sodium_mg: 475, category: 'Spice' }),
    'minced beef': T(250, 26, 0, 15, { saturatedFat_g: 6, sodium_mg: 72, category: 'Protein' }),
    'ground beef': T(250, 26, 0, 15, { saturatedFat_g: 6, sodium_mg: 72, category: 'Protein' }),
    'lean minced beef': T(210, 27, 0, 10, { saturatedFat_g: 4, sodium_mg: 70, category: 'Protein' }),
    'steak': T(271, 25, 0, 19, { saturatedFat_g: 7.5, sodium_mg: 55, category: 'Protein' }),
    'pork': T(242, 27, 0, 14, { saturatedFat_g: 5.2, sodium_mg: 62, category: 'Protein' }),
    'bacon': T(541, 37, 1.4, 42, { saturatedFat_g: 14, sodium_mg: 1717, category: 'Protein' }),
    'ham': T(145, 21, 1.5, 5.5, { saturatedFat_g: 1.9, sodium_mg: 1200, category: 'Protein' }),
    'sausage': T(301, 13, 2, 27, { saturatedFat_g: 10, sodium_mg: 650, category: 'Protein' }),
    'chorizo': T(455, 24, 1.9, 38, { saturatedFat_g: 14, sodium_mg: 1235, category: 'Protein' }),
    'lamb': T(294, 25, 0, 21, { saturatedFat_g: 9, sodium_mg: 72, category: 'Protein' }),
    'turkey': T(189, 29, 0, 7.4, { saturatedFat_g: 2.1, sodium_mg: 70, category: 'Protein' }),
    'duck': T(337, 19, 0, 28, { saturatedFat_g: 9.5, sodium_mg: 59, category: 'Protein' }),
    'salmon': T(208, 20, 0, 13, { saturatedFat_g: 3.1, sodium_mg: 59, category: 'Protein' }),
    'tuna': T(130, 28, 0, 1, { saturatedFat_g: 0.3, sodium_mg: 45, category: 'Protein' }),
    'cod': T(82, 18, 0, 0.7, { sodium_mg: 54, category: 'Protein' }),
    'shrimp': T(99, 24, 0.2, 0.3, { saturatedFat_g: 0.1, sodium_mg: 111, category: 'Protein' }),
    'prawn': T(99, 24, 0.2, 0.3, { saturatedFat_g: 0.1, sodium_mg: 111, category: 'Protein' }),
    'egg': T(155, 13, 1.1, 11, { saturatedFat_g: 3.3, sodium_mg: 124, category: 'Protein' }),
    'eggs': T(155, 13, 1.1, 11, { saturatedFat_g: 3.3, sodium_mg: 124, category: 'Protein' }),
    'tofu': T(76, 8, 1.9, 4.8, { fiber_g: 0.3, sodium_mg: 7, category: 'Protein' }),
    'lentils': T(116, 9, 20, 0.4, { fiber_g: 7.9, sodium_mg: 2, category: 'Protein' }),
    'chickpeas': T(164, 8.9, 27, 2.6, { fiber_g: 7.6, sodium_mg: 7, category: 'Protein' }),
    'black beans': T(132, 8.9, 24, 0.5, { fiber_g: 8.7, sodium_mg: 1, category: 'Protein' }),
    'kidney beans': T(127, 8.7, 23, 0.5, { fiber_g: 6.4, sodium_mg: 1, category: 'Protein' }),

    // --- Dairy ---
    'milk': T(42, 3.4, 5, 1, { sugar_g: 5, saturatedFat_g: 0.6, sodium_mg: 44, category: 'Dairy' }),
    'whole milk': T(61, 3.2, 4.8, 3.3, { sugar_g: 5, saturatedFat_g: 1.9, sodium_mg: 40, category: 'Dairy' }),
    'cream': T(340, 2.1, 2.8, 36, { saturatedFat_g: 23, sodium_mg: 27, category: 'Dairy' }),
    'double cream': T(467, 1.7, 2.7, 50, { saturatedFat_g: 31, sodium_mg: 22, category: 'Dairy' }),
    'butter': T(717, 0.9, 0.1, 81, { saturatedFat_g: 51, sodium_mg: 643, category: 'Fat' }),
    'cheese': T(402, 25, 1.3, 33, { saturatedFat_g: 21, sodium_mg: 621, category: 'Dairy' }),
    'cheddar': T(402, 25, 1.3, 33, { saturatedFat_g: 21, sodium_mg: 621, category: 'Dairy' }),
    'mozzarella': T(280, 28, 3.1, 17, { saturatedFat_g: 10, sodium_mg: 627, category: 'Dairy' }),
    'parmesan': T(431, 38, 4.1, 29, { saturatedFat_g: 19, sodium_mg: 1804, category: 'Dairy' }),
    'feta': T(264, 14, 4.1, 21, { saturatedFat_g: 15, sodium_mg: 917, category: 'Dairy' }),
    'ricotta': T(174, 11, 3, 13, { saturatedFat_g: 8.3, sodium_mg: 84, category: 'Dairy' }),
    'yogurt': T(59, 10, 3.6, 0.4, { sugar_g: 3.6, sodium_mg: 36, category: 'Dairy' }),
    'yoghurt': T(59, 10, 3.6, 0.4, { sugar_g: 3.6, sodium_mg: 36, category: 'Dairy' }),

    // --- Fat / oils ---
    'olive oil': T(884, 0, 0, 100, { saturatedFat_g: 14, category: 'Fat' }),
    'oil': T(884, 0, 0, 100, { saturatedFat_g: 14, category: 'Fat' }),
    'vegetable oil': T(884, 0, 0, 100, { saturatedFat_g: 15, category: 'Fat' }),
    'sunflower oil': T(884, 0, 0, 100, { saturatedFat_g: 10, category: 'Fat' }),
    'coconut oil': T(892, 0, 0, 100, { saturatedFat_g: 87, category: 'Fat' }),
    'sesame oil': T(884, 0, 0, 100, { saturatedFat_g: 14, category: 'Fat' }),
    'margarine': T(717, 0.2, 0.7, 81, { saturatedFat_g: 16, sodium_mg: 751, category: 'Fat' }),
    'mayonnaise': T(680, 1, 0.6, 75, { saturatedFat_g: 11, sodium_mg: 635, category: 'Fat' }),

    // --- Grain & starches ---
    'rice': T(130, 2.7, 28, 0.3, { fiber_g: 0.4, sodium_mg: 1, category: 'Grain' }),
    'cooked rice': T(130, 2.7, 28, 0.3, { fiber_g: 0.4, sodium_mg: 1, category: 'Grain' }),
    'brown rice': T(123, 2.7, 26, 1, { fiber_g: 1.6, sodium_mg: 3, category: 'Grain' }),
    'pasta': T(157, 5.8, 31, 0.9, { fiber_g: 1.8, sodium_mg: 1, category: 'Grain' }),
    'spaghetti': T(157, 5.8, 31, 0.9, { fiber_g: 1.8, sodium_mg: 1, category: 'Grain' }),
    'noodle': T(138, 4.5, 25, 2.1, { fiber_g: 1.2, sodium_mg: 5, category: 'Grain' }),
    'noodles': T(138, 4.5, 25, 2.1, { fiber_g: 1.2, sodium_mg: 5, category: 'Grain' }),
    'bread': T(265, 9, 49, 3.2, { fiber_g: 2.7, sodium_mg: 491, category: 'Grain' }),
    'flour': T(364, 10, 76, 1, { fiber_g: 2.7, sodium_mg: 2, category: 'Grain' }),
    'oats': T(389, 17, 66, 7, { fiber_g: 11, sodium_mg: 2, category: 'Grain' }),
    'potato': T(77, 2, 17, 0.1, { fiber_g: 2.2, sodium_mg: 6, category: 'Grain' }),
    'potatoes': T(77, 2, 17, 0.1, { fiber_g: 2.2, sodium_mg: 6, category: 'Grain' }),
    'sweet potato': T(86, 1.6, 20, 0.1, { fiber_g: 3, sodium_mg: 55, category: 'Grain' }),
    'couscous': T(112, 3.8, 23, 0.2, { fiber_g: 1.4, sodium_mg: 5, category: 'Grain' }),
    'quinoa': T(120, 4.4, 21, 1.9, { fiber_g: 2.8, sodium_mg: 7, category: 'Grain' }),
    'breadcrumbs': T(395, 13, 72, 5.3, { fiber_g: 4.5, sodium_mg: 732, category: 'Grain' }),
    'cornstarch': T(381, 0.3, 91, 0.1, { category: 'Grain' }),
    'cornflour': T(381, 0.3, 91, 0.1, { category: 'Grain' }),

    // --- Fruit ---
    'apple': T(52, 0.3, 14, 0.2, { fiber_g: 2.4, sugar_g: 10, category: 'Fruit' }),
    'banana': T(89, 1.1, 23, 0.3, { fiber_g: 2.6, sugar_g: 12, category: 'Fruit' }),
    'orange': T(47, 0.9, 12, 0.1, { fiber_g: 2.4, sugar_g: 9, category: 'Fruit' }),
    'lemon': T(29, 1.1, 9, 0.3, { fiber_g: 2.8, sugar_g: 2.5, category: 'Fruit' }),
    'lime': T(30, 0.7, 11, 0.2, { fiber_g: 2.8, sugar_g: 1.7, category: 'Fruit' }),
    'strawberries': T(32, 0.7, 7.7, 0.3, { fiber_g: 2, sugar_g: 4.9, category: 'Fruit' }),
    'blueberries': T(57, 0.7, 14, 0.3, { fiber_g: 2.4, sugar_g: 10, category: 'Fruit' }),
    'raspberries': T(52, 1.2, 12, 0.7, { fiber_g: 6.5, sugar_g: 4.4, category: 'Fruit' }),
    'grapes': T(69, 0.7, 18, 0.2, { fiber_g: 0.9, sugar_g: 16, category: 'Fruit' }),
    'raisins': T(299, 3.1, 79, 0.5, { fiber_g: 3.7, sugar_g: 59, category: 'Fruit' }),
    'mango': T(60, 0.8, 15, 0.4, { fiber_g: 1.6, sugar_g: 14, category: 'Fruit' }),
    'pineapple': T(50, 0.5, 13, 0.1, { fiber_g: 1.4, sugar_g: 10, category: 'Fruit' }),
    'coconut': T(354, 3.3, 15, 33, { fiber_g: 9, sugar_g: 6.2, saturatedFat_g: 30, category: 'Fruit' }),
    'avocado': T(160, 2, 9, 15, { fiber_g: 7, sugar_g: 0.7, saturatedFat_g: 2.1, category: 'Fruit' }),
    'pear': T(57, 0.4, 15, 0.1, { fiber_g: 3.1, sugar_g: 10, category: 'Fruit' }),

    // --- Vegetable ---
    'tomato': T(18, 0.9, 3.9, 0.2, { fiber_g: 1.2, sugar_g: 2.6, sodium_mg: 5, category: 'Vegetable' }),
    'tomatoes': T(18, 0.9, 3.9, 0.2, { fiber_g: 1.2, sugar_g: 2.6, sodium_mg: 5, category: 'Vegetable' }),
    'tomato puree': T(38, 1.7, 8.3, 0.2, { fiber_g: 1.9, sugar_g: 5.5, sodium_mg: 11, category: 'Vegetable' }),
    'tomato paste': T(82, 4.3, 19, 0.5, { fiber_g: 4.1, sugar_g: 12, sodium_mg: 59, category: 'Vegetable' }),
    'onion': T(40, 1.1, 9.3, 0.1, { fiber_g: 1.7, sugar_g: 4.2, sodium_mg: 4, category: 'Vegetable' }),
    'onions': T(40, 1.1, 9.3, 0.1, { fiber_g: 1.7, sugar_g: 4.2, sodium_mg: 4, category: 'Vegetable' }),
    'shallot': T(72, 2.5, 17, 0.1, { fiber_g: 3.2, category: 'Vegetable' }),
    'spring onion': T(32, 1.8, 7.3, 0.2, { fiber_g: 2.6, sodium_mg: 16, category: 'Vegetable' }),
    'garlic': T(149, 6.4, 33, 0.5, { fiber_g: 2.1, sodium_mg: 17, category: 'Vegetable' }),
    'leek': T(61, 1.5, 14, 0.3, { fiber_g: 1.8, sodium_mg: 20, category: 'Vegetable' }),
    'carrot': T(41, 0.9, 10, 0.2, { fiber_g: 2.8, sugar_g: 4.7, sodium_mg: 69, category: 'Vegetable' }),
    'carrots': T(41, 0.9, 10, 0.2, { fiber_g: 2.8, sugar_g: 4.7, sodium_mg: 69, category: 'Vegetable' }),
    'celery': T(16, 0.7, 3, 0.2, { fiber_g: 1.6, sodium_mg: 80, category: 'Vegetable' }),
    'cucumber': T(16, 0.7, 3.6, 0.1, { fiber_g: 0.5, sodium_mg: 2, category: 'Vegetable' }),
    'zucchini': T(17, 1.2, 3.1, 0.3, { fiber_g: 1, sodium_mg: 8, category: 'Vegetable' }),
    'eggplant': T(25, 1, 5.9, 0.2, { fiber_g: 3, sodium_mg: 2, category: 'Vegetable' }),
    'bell pepper': T(31, 1, 6, 0.3, { fiber_g: 2.1, sugar_g: 4.2, sodium_mg: 4, category: 'Vegetable' }),
    'pepper': T(31, 1, 6, 0.3, { fiber_g: 2.1, sugar_g: 4.2, sodium_mg: 4, category: 'Vegetable' }),
    'red pepper': T(31, 1, 6, 0.3, { fiber_g: 2.1, sugar_g: 4.2, sodium_mg: 4, category: 'Vegetable' }),
    'green pepper': T(20, 0.9, 4.6, 0.2, { fiber_g: 1.7, sodium_mg: 3, category: 'Vegetable' }),
    'chili': T(40, 1.9, 8.8, 0.4, { fiber_g: 1.5, category: 'Vegetable' }),
    'chilli': T(40, 1.9, 8.8, 0.4, { fiber_g: 1.5, category: 'Vegetable' }),
    'jalapeno': T(29, 0.9, 6.5, 0.4, { fiber_g: 2.8, category: 'Vegetable' }),
    'lettuce': T(15, 1.4, 2.9, 0.2, { fiber_g: 1.3, sodium_mg: 28, category: 'Vegetable' }),
    'spinach': T(23, 2.9, 3.6, 0.4, { fiber_g: 2.2, sodium_mg: 79, category: 'Vegetable' }),
    'kale': T(49, 4.3, 8.8, 0.9, { fiber_g: 3.6, sodium_mg: 38, category: 'Vegetable' }),
    'cabbage': T(25, 1.3, 5.8, 0.1, { fiber_g: 2.5, sugar_g: 3.2, sodium_mg: 18, category: 'Vegetable' }),
    'broccoli': T(34, 2.8, 6.6, 0.4, { fiber_g: 2.6, sodium_mg: 33, category: 'Vegetable' }),
    'cauliflower': T(25, 1.9, 5, 0.3, { fiber_g: 2, sodium_mg: 30, category: 'Vegetable' }),
    'mushroom': T(22, 3.1, 3.3, 0.3, { fiber_g: 1, sodium_mg: 5, category: 'Vegetable' }),
    'mushrooms': T(22, 3.1, 3.3, 0.3, { fiber_g: 1, sodium_mg: 5, category: 'Vegetable' }),
    'corn': T(86, 3.3, 19, 1.4, { fiber_g: 2.7, sugar_g: 6.3, sodium_mg: 15, category: 'Vegetable' }),
    'peas': T(81, 5.4, 14, 0.4, { fiber_g: 5.7, sugar_g: 5.7, sodium_mg: 5, category: 'Vegetable' }),
    'olives': T(115, 0.8, 6.3, 11, { fiber_g: 3.2, saturatedFat_g: 1.4, sodium_mg: 1556, category: 'Vegetable' }),

    // --- Spice & condiments ---
    'salt': T(0, 0, 0, 0, { sodium_mg: 38758, category: 'Spice' }),
    'black pepper': T(251, 10, 64, 3.3, { fiber_g: 25, category: 'Spice' }),
    'paprika': T(282, 14, 54, 13, { fiber_g: 35, category: 'Spice' }),
    'cumin': T(375, 18, 44, 22, { fiber_g: 11, category: 'Spice' }),
    'coriander': T(23, 2.1, 3.7, 0.5, { fiber_g: 2.8, category: 'Spice' }),
    'cinnamon': T(247, 4, 81, 1.2, { fiber_g: 53, category: 'Spice' }),
    'oregano': T(265, 9, 69, 4.3, { fiber_g: 43, category: 'Spice' }),
    'dried oregano': T(265, 9, 69, 4.3, { fiber_g: 43, category: 'Spice' }),
    'basil': T(23, 3.2, 2.7, 0.6, { fiber_g: 1.6, category: 'Spice' }),
    'parsley': T(36, 3, 6.3, 0.8, { fiber_g: 3.3, category: 'Spice' }),
    'thyme': T(276, 9, 64, 7, { fiber_g: 37, category: 'Spice' }),
    'rosemary': T(331, 4.9, 64, 15, { fiber_g: 43, category: 'Spice' }),
    'sugar': T(387, 0, 100, 0, { sugar_g: 100, category: 'Spice' }),
    'brown sugar': T(380, 0, 98, 0, { sugar_g: 97, sodium_mg: 28, category: 'Spice' }),
    'honey': T(304, 0.3, 82, 0, { sugar_g: 82, sodium_mg: 4, category: 'Spice' }),
    'maple syrup': T(260, 0, 67, 0.1, { sugar_g: 60, sodium_mg: 12, category: 'Spice' }),
    'vinegar': T(18, 0, 0.9, 0, { sodium_mg: 2, category: 'Spice' }),
    'soy sauce': T(53, 8, 4.9, 0.6, { sodium_mg: 5493, category: 'Spice' }),
    'worcestershire sauce': T(78, 0, 19, 0, { sugar_g: 10, sodium_mg: 980, category: 'Spice' }),
    'ketchup': T(112, 1.7, 26, 0.4, { sugar_g: 22, sodium_mg: 907, category: 'Spice' }),
    'mustard': T(66, 4.4, 5.3, 3.4, { sodium_mg: 1135, category: 'Spice' }),

    // --- Beverage ---
    'water': T(0, 0, 0, 0, { category: 'Beverage' }),
    'red wine': T(85, 0.1, 2.6, 0, { sodium_mg: 4, category: 'Beverage' }),
    'white wine': T(82, 0.1, 2.6, 0, { sodium_mg: 5, category: 'Beverage' }),
    'beer': T(43, 0.5, 3.6, 0, { sodium_mg: 4, category: 'Beverage' }),
    'coffee': T(2, 0.3, 0, 0, { category: 'Beverage' }),
    'tea': T(1, 0, 0.3, 0, { category: 'Beverage' }),
    'orange juice': T(45, 0.7, 10, 0.2, { sugar_g: 8.4, category: 'Beverage' }),
    'apple juice': T(46, 0.1, 11, 0.1, { sugar_g: 10, category: 'Beverage' }),
};

/** Normalize an ingredient name for lookup in the table. */
export function normalizeName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/[^a-z\s]/g, ' ')
        .replace(/\b(fresh|dried|chopped|sliced|diced|minced|grated|ground|boneless|skinless|whole|large|small|medium|raw|cooked)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Look up an ingredient by name, with fuzzy fallback.
 * Tries longer, more specific keys before shorter ones so "beef stock"
 * wins over "beef", "sweet potato" wins over "potato", etc.
 * Returns { entry, key } or null.
 */
export function lookup(name) {
    const norm = normalizeName(name);
    if (!norm) return null;
    // Exact match is always best.
    if (NUTRITION_TABLE[norm]) return { entry: NUTRITION_TABLE[norm], key: norm };
    // Sort keys by length desc so multi-word specific entries win.
    const keys = Object.keys(NUTRITION_TABLE).sort((a, b) => b.length - a.length);
    // Whole-word match.
    for (const key of keys) {
        const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (re.test(norm)) return { entry: NUTRITION_TABLE[key], key };
    }
    // Substring fallback.
    for (const key of keys) {
        if (norm.includes(key)) return { entry: NUTRITION_TABLE[key], key };
    }
    return null;
}
