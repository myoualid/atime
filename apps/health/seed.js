/**
 * Default categories seeded on first run.
 */
export const MEAL_CATEGORIES = [
    { name: 'Breakfast', kind: 'meal', color: '#f2a65a', icon: '🍳', sortOrder: 0 },
    { name: 'Lunch',     kind: 'meal', color: '#8bc34a', icon: '🥗', sortOrder: 1 },
    { name: 'Dinner',    kind: 'meal', color: '#5a8bf2', icon: '🍝', sortOrder: 2 },
    { name: 'Snack',     kind: 'meal', color: '#d4af37', icon: '🥜', sortOrder: 3 },
    { name: 'Dessert',   kind: 'meal', color: '#e77ea0', icon: '🍰', sortOrder: 4 },
    { name: 'Drink',     kind: 'meal', color: '#6fc3df', icon: '🥤', sortOrder: 5 },
];

export const FOOD_CATEGORIES = [
    { name: 'Protein',   kind: 'food', color: '#d46a6a', icon: '🍗', sortOrder: 0 },
    { name: 'Vegetable', kind: 'food', color: '#6aa84f', icon: '🥦', sortOrder: 1 },
    { name: 'Fruit',     kind: 'food', color: '#e06666', icon: '🍎', sortOrder: 2 },
    { name: 'Grain',     kind: 'food', color: '#d4a85a', icon: '🌾', sortOrder: 3 },
    { name: 'Dairy',     kind: 'food', color: '#d9d4c5', icon: '🧀', sortOrder: 4 },
    { name: 'Fat',       kind: 'food', color: '#f2cc7c', icon: '🫒', sortOrder: 5 },
    { name: 'Spice',     kind: 'food', color: '#a06a4a', icon: '🌶', sortOrder: 6 },
    { name: 'Beverage',  kind: 'food', color: '#6fc3df', icon: '🍵', sortOrder: 7 },
];

export const ALL_SEED_CATEGORIES = [...MEAL_CATEGORIES, ...FOOD_CATEGORIES];
