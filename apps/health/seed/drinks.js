/**
 * Hand-written drink templates — TheMealDB has no drink recipes.
 * Shape mirrors themealdb.js `normalizeMeal()`: { id, name, category, area,
 * instructions, imageUrl, youtubeUrl, sourceUrl, tags, ingredients[] }.
 *
 * Ingredient.amountG is best-effort grams; `measure` is human-readable.
 * Servings default to 1 unless specified.
 *
 * 15 non-alcoholic drinks, intentionally simple so nutrition is meaningful.
 */

const mk = (id, name, instructions, ingredients, extras = {}) => ({
    id: `cv-drink-${id}`,
    name,
    category: 'Drink',
    area: extras.area || '',
    instructions,
    imageUrl: extras.imageUrl || '',
    youtubeUrl: '',
    sourceUrl: '',
    tags: extras.tags || ['Drink'],
    servings: extras.servings || 1,
    ingredients: ingredients.map(([iname, measure, amountG]) => ({ name: iname, measure, amountG })),
});

export const DRINK_TEMPLATES = [
    mk(1, 'Classic Lemonade',
        'Juice the lemons. In a pitcher, combine lemon juice with sugar and stir until dissolved. Add cold water and ice. Taste and adjust.',
        [
            ['lemon juice', '1 cup', 240],
            ['sugar', '1/2 cup', 100],
            ['water', '4 cups', 960],
        ],
        { servings: 4 }),
    mk(2, 'Banana Oat Smoothie',
        'Blend everything until smooth, about 45 seconds. Pour into a tall glass.',
        [
            ['banana', '1 medium', 120],
            ['milk', '1 cup', 240],
            ['oats', '1/4 cup', 20],
            ['honey', '1 tsp', 5],
        ]),
    mk(3, 'Strawberry Yogurt Smoothie',
        'Combine strawberries, yogurt, milk, and honey in a blender. Blend until smooth.',
        [
            ['strawberries', '1 cup', 150],
            ['yogurt', '1/2 cup', 120],
            ['milk', '1/2 cup', 120],
            ['honey', '1 tsp', 5],
        ]),
    mk(4, 'Green Detox Smoothie',
        'Blend spinach, apple, cucumber and water until very smooth. Strain if desired.',
        [
            ['spinach', '2 cups', 60],
            ['apple', '1 medium', 180],
            ['cucumber', '1/2 medium', 100],
            ['lemon juice', '1 tbsp', 15],
            ['water', '1 cup', 240],
        ]),
    mk(5, 'Mango Lassi',
        'Blend ripe mango, yogurt, milk, sugar and a pinch of cardamom until creamy. Serve chilled.',
        [
            ['mango', '1 cup', 165],
            ['yogurt', '1 cup', 240],
            ['milk', '1/2 cup', 120],
            ['sugar', '2 tsp', 8],
            ['cardamom', '1 pinch', 0.5],
        ]),
    mk(6, 'Fresh Orange Juice',
        'Juice the oranges using a hand press. Strain pulp to taste. Serve immediately.',
        [
            ['orange', '4 medium', 520],
        ],
        { servings: 2 }),
    mk(7, 'Iced Black Tea',
        'Steep tea in hot water 4 minutes. Remove bags, stir in sugar, cool, and pour over ice with a lemon slice.',
        [
            ['tea', '2 tea bags', 4],
            ['water', '3 cups', 720],
            ['sugar', '1 tbsp', 12],
            ['lemon', '2 slices', 20],
        ],
        { servings: 2 }),
    mk(8, 'Masala Chai',
        'Simmer water with crushed spices 3 minutes. Add tea, milk and sugar; simmer 3 more minutes. Strain and serve hot.',
        [
            ['water', '1 cup', 240],
            ['milk', '1 cup', 240],
            ['tea', '2 tsp', 4],
            ['cinnamon', '1 pinch', 0.5],
            ['cardamom', '3 pods', 1],
            ['ginger', '1 tsp grated', 5],
            ['sugar', '2 tsp', 8],
        ],
        { area: 'Indian', servings: 2 }),
    mk(9, 'Iced Coffee',
        'Pour strong cooled coffee over ice. Add milk and sweetener. Stir gently.',
        [
            ['coffee', '1 cup brewed', 240],
            ['milk', '1/4 cup', 60],
            ['sugar', '1 tsp', 4],
        ]),
    mk(10, 'Hot Chocolate',
        'Warm milk in a saucepan over medium heat. Whisk in cocoa and sugar until smooth and steaming. Do not boil.',
        [
            ['milk', '1 cup', 240],
            ['cocoa', '1 tbsp', 6],
            ['sugar', '1 tbsp', 12],
            ['vanilla', '1/4 tsp', 1],
        ]),
    mk(11, 'Cucumber Mint Cooler',
        'Muddle mint with sugar. Add cucumber slices, lime juice and sparkling water over ice. Stir.',
        [
            ['cucumber', '1/2 medium', 100],
            ['mint', '8 leaves', 2],
            ['lime juice', '1 tbsp', 15],
            ['sugar', '1 tsp', 4],
            ['water', '1 cup sparkling', 240],
        ]),
    mk(12, 'Watermelon Juice',
        'Blend watermelon chunks with lime juice until smooth. Strain through a fine sieve. Serve over ice with mint.',
        [
            ['watermelon', '3 cups cubed', 450],
            ['lime juice', '1 tbsp', 15],
            ['mint', '4 leaves', 1],
        ],
        { servings: 2 }),
    mk(13, 'Peanut Butter Chocolate Shake',
        'Blend milk, banana, cocoa, peanut butter and a handful of ice until thick.',
        [
            ['milk', '1 cup', 240],
            ['banana', '1 medium', 120],
            ['peanut butter', '2 tbsp', 32],
            ['cocoa', '1 tbsp', 6],
            ['honey', '1 tsp', 5],
        ]),
    mk(14, 'Ginger Lemon Honey Tea',
        'Simmer ginger in water 5 minutes. Remove from heat, add lemon juice and honey. Strain and serve warm.',
        [
            ['ginger', '1 tbsp grated', 15],
            ['water', '2 cups', 480],
            ['lemon juice', '2 tbsp', 30],
            ['honey', '1 tbsp', 21],
        ],
        { tags: ['Drink', 'Warm'], servings: 2 }),
    mk(15, 'Tropical Pineapple Smoothie',
        'Blend pineapple, banana, coconut milk, and a splash of lime juice until smooth and frothy.',
        [
            ['pineapple', '1 cup chunks', 165],
            ['banana', '1 medium', 120],
            ['coconut milk', '1/2 cup', 120],
            ['lime juice', '1 tbsp', 15],
        ]),
];
