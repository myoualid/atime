/**
 * Shared create-or-update for portable JSON (foods, menus, meal plans).
 * Match by id first, then by name. Incoming records update existing ones.
 */

import { foodItems, recipes, categories } from './repos.js';

export const APP_TAGS = new Set(['corevital-health', 'corevital-food']);

export const KINDS = {
    FOODS: 'foods',
    MENUS: 'menus',
    MEAL_PLAN: 'meal-plan',
    FULL: 'full',
};

export function nameKey(item) {
    return String(item?.nameLower || item?.name || '').trim().toLowerCase();
}

export function catKey(cat) {
    const kind = cat?.kind === 'food' ? 'food' : 'meal';
    return `${kind}:${nameKey(cat)}`;
}

export function indexById(list) {
    return new Map((list || []).filter((x) => x?.id).map((x) => [x.id, x]));
}

export function indexByName(list) {
    const map = new Map();
    for (const item of list || []) {
        const key = nameKey(item);
        if (key && !map.has(key)) map.set(key, item);
    }
    return map;
}

export function indexCatsByKey(list) {
    const map = new Map();
    for (const cat of list || []) {
        const key = catKey(cat);
        if (key.endsWith(':') || map.has(key)) continue;
        map.set(key, cat);
    }
    return map;
}

function lookupGet(lookup, id) {
    if (!lookup || id == null) return null;
    return lookup.get ? lookup.get(id) : lookup[id];
}

function pick(ids, lookup) {
    const out = [];
    for (const id of ids) {
        const item = lookupGet(lookup, id);
        if (item) out.push(item);
    }
    return out;
}

/**
 * Expand food/recipe ids to a self-contained bundle (ingredient foods + categories).
 */
export function collectBundle(
    { foodIds = [], recipeIds = [], categoryIds = [] } = {},
    foodsById,
    recipesById,
    catsById,
) {
    const foodSet = new Set(foodIds);
    const recipeSet = new Set(recipeIds);
    const catSet = new Set(categoryIds);

    for (const id of recipeSet) {
        const recipe = lookupGet(recipesById, id);
        if (!recipe) continue;
        if (recipe.categoryId) catSet.add(recipe.categoryId);
        for (const ing of recipe.ingredients || []) {
            if (ing?.foodItemId) foodSet.add(ing.foodItemId);
        }
    }
    for (const id of foodSet) {
        const food = lookupGet(foodsById, id);
        if (food?.categoryId) catSet.add(food.categoryId);
    }

    return {
        foodItems: pick(foodSet, foodsById),
        recipes: pick(recipeSet, recipesById),
        categories: pick(catSet, catsById),
    };
}

export function remapCatId(importedId, catIdMap, localById) {
    if (!importedId) return null;
    if (catIdMap.has(importedId)) return catIdMap.get(importedId);
    if (localById.has(importedId)) return importedId;
    return null;
}

export function remapFoodId(importedId, foodIdMap, localById) {
    if (!importedId) return null;
    if (foodIdMap.has(importedId)) return foodIdMap.get(importedId);
    if (localById.has(importedId)) return importedId;
    return null;
}

export function remapRecipeId(importedId, recipeIdMap, localById) {
    if (!importedId) return null;
    if (recipeIdMap.has(importedId)) return recipeIdMap.get(importedId);
    if (localById.has(importedId)) return importedId;
    return null;
}

export function detectPayloadKind(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.kind === 'meal-plan') return KINDS.MEAL_PLAN;
    if (payload.kind === 'menus' || payload.kind === 'menu') return KINDS.MENUS;
    if (payload.kind === 'foods' || payload.kind === 'library') return KINDS.FOODS;
    if (APP_TAGS.has(payload.app)) return KINDS.FULL;
    return null;
}

export function wrongKindError(actual, expected) {
    if (expected === KINDS.FOODS && actual === KINDS.MENUS) {
        return new Error('This file is a menu export. Use Import menu in the menus list.');
    }
    if (expected === KINDS.FOODS && actual === KINDS.MEAL_PLAN) {
        return new Error('This file is a meal plan. Use Load plan in the planner.');
    }
    if (expected === KINDS.MENUS && actual === KINDS.FOODS) {
        return new Error('This file is a foods export. Use Import foods.');
    }
    if (expected === KINDS.MENUS && actual === KINDS.MEAL_PLAN) {
        return new Error('This file is a meal plan. Use Load plan in the planner.');
    }
    if (expected === KINDS.MEAL_PLAN && actual === KINDS.FOODS) {
        return new Error('This file is a foods export. Use Import foods in the library.');
    }
    if (expected === KINDS.MEAL_PLAN && actual === KINDS.MENUS) {
        return new Error('This file is a menu export. Use Import menu in the library.');
    }
    return new Error('Not a CoreVital JSON file');
}

function remember(map, importedId, localId) {
    if (importedId) map.set(importedId, localId);
}

/**
 * Create missing / update existing categories, foods, and recipes.
 * @returns {Promise<{ catIdMap:Map, foodIdMap:Map, recipeIdMap:Map, localFoodsById:Map, localRecipesById:Map, stats:object }>}
 */
export async function upsertLibrary({
    categories: incomingCats = [],
    foodItems: incomingFoods = [],
    recipes: incomingRecipes = [],
} = {}) {
    const [localCats, localFoods, localRecipes] = await Promise.all([
        categories.list(),
        foodItems.list(),
        recipes.list(),
    ]);

    const localCatsById = indexById(localCats);
    const localCatsByKey = indexCatsByKey(localCats);
    const localFoodsById = indexById(localFoods);
    const localFoodsByName = indexByName(localFoods);
    const localRecipesById = indexById(localRecipes);
    const localRecipesByName = indexByName(localRecipes);

    const stats = {
        createdCategories: 0,
        updatedCategories: 0,
        createdFoods: 0,
        updatedFoods: 0,
        createdRecipes: 0,
        updatedRecipes: 0,
    };

    const catIdMap = new Map();
    for (const incoming of incomingCats) {
        if (!incoming) continue;
        const existing = localCatsById.get(incoming.id) || localCatsByKey.get(catKey(incoming));
        if (existing) {
            const saved = await categories.put({
                ...existing,
                ...incoming,
                id: existing.id,
                createdAt: existing.createdAt,
                version: existing.version,
            });
            remember(catIdMap, incoming.id, saved.id);
            localCatsById.set(saved.id, saved);
            localCatsByKey.set(catKey(saved), saved);
            stats.updatedCategories++;
        } else {
            const saved = await categories.put({
                ...incoming,
                id: incoming.id && !localCatsById.has(incoming.id) ? incoming.id : undefined,
            });
            remember(catIdMap, incoming.id, saved.id);
            localCatsById.set(saved.id, saved);
            localCatsByKey.set(catKey(saved), saved);
            stats.createdCategories++;
        }
    }

    const foodIdMap = new Map();
    for (const incoming of incomingFoods) {
        if (!incoming) continue;
        const existing = localFoodsById.get(incoming.id) || localFoodsByName.get(nameKey(incoming));
        const next = {
            ...existing,
            ...incoming,
            categoryId: remapCatId(incoming.categoryId, catIdMap, localCatsById)
                ?? existing?.categoryId
                ?? null,
            imageBlobKey: incoming.imageBlobKey || existing?.imageBlobKey || null,
        };
        if (existing) {
            const saved = await foodItems.put({
                ...next,
                id: existing.id,
                createdAt: existing.createdAt,
                version: existing.version,
            });
            remember(foodIdMap, incoming.id, saved.id);
            localFoodsById.set(saved.id, saved);
            localFoodsByName.set(nameKey(saved), saved);
            stats.updatedFoods++;
        } else {
            const saved = await foodItems.put({
                ...next,
                id: incoming.id && !localFoodsById.has(incoming.id) ? incoming.id : undefined,
                createdAt: undefined,
                version: 0,
            });
            remember(foodIdMap, incoming.id, saved.id);
            localFoodsById.set(saved.id, saved);
            localFoodsByName.set(nameKey(saved), saved);
            stats.createdFoods++;
        }
    }

    const recipeIdMap = new Map();
    for (const incoming of incomingRecipes) {
        if (!incoming) continue;
        const existing = localRecipesById.get(incoming.id) || localRecipesByName.get(nameKey(incoming));
        const ingredients = (incoming.ingredients || []).map((ing) => {
            const foodItemId = remapFoodId(ing.foodItemId, foodIdMap, localFoodsById);
            if (!foodItemId) return null;
            return { ...ing, foodItemId };
        }).filter(Boolean);
        const next = {
            ...existing,
            ...incoming,
            categoryId: remapCatId(incoming.categoryId, catIdMap, localCatsById)
                ?? existing?.categoryId
                ?? null,
            ingredients,
            imageBlobKey: incoming.imageBlobKey || existing?.imageBlobKey || null,
        };
        if (existing) {
            const saved = await recipes.put({
                ...next,
                id: existing.id,
                createdAt: existing.createdAt,
                version: existing.version,
            });
            remember(recipeIdMap, incoming.id, saved.id);
            localRecipesById.set(saved.id, saved);
            localRecipesByName.set(nameKey(saved), saved);
            stats.updatedRecipes++;
        } else {
            const saved = await recipes.put({
                ...next,
                id: incoming.id && !localRecipesById.has(incoming.id) ? incoming.id : undefined,
                createdAt: undefined,
                version: 0,
            });
            remember(recipeIdMap, incoming.id, saved.id);
            localRecipesById.set(saved.id, saved);
            localRecipesByName.set(nameKey(saved), saved);
            stats.createdRecipes++;
        }
    }

    return {
        catIdMap,
        foodIdMap,
        recipeIdMap,
        localCatsById,
        localFoodsById,
        localRecipesById,
        stats,
    };
}
