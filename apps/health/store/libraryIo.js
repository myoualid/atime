/**
 * Portable foods JSON and menus JSON.
 *
 * Foods: the whole food/recipe library (not menus, not meal plans).
 * Menus: named library subsets plus the foods/recipes they contain.
 * Load creates missing items and updates existing ones (id, then name).
 */

import { foodItems, recipes, categories, menus } from './repos.js';
import { CURRENT_SCHEMA_VERSION } from './io.js';
import { healthSignals } from '../signals.js';
import {
    KINDS,
    collectBundle,
    detectPayloadKind,
    indexById,
    indexByName,
    nameKey,
    remapFoodId,
    remapRecipeId,
    upsertLibrary,
    wrongKindError,
} from './libraryMerge.js';

function isoDay() {
    return new Date().toISOString().slice(0, 10);
}

function slug(name) {
    return String(name || 'menu').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'menu';
}

function arrayOf(value) {
    return Array.isArray(value) ? value : [];
}

function menuRefIds(menuList) {
    const foodIds = [];
    const recipeIds = [];
    for (const menu of menuList || []) {
        foodIds.push(...(menu.foodItemIds || []));
        recipeIds.push(...(menu.recipeIds || []));
    }
    return { foodIds, recipeIds };
}

function wrapPayload(kind, extra) {
    return {
        app: 'corevital-health',
        kind,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        ...extra,
    };
}

export async function exportFoods() {
    const [foods, recs, cats] = await Promise.all([
        foodItems.list(),
        recipes.list(),
        categories.list(),
    ]);
    return wrapPayload(KINDS.FOODS, {
        foodItems: foods,
        recipes: recs,
        categories: cats,
    });
}

export function foodsExportFilename() {
    return `corevital-foods-${isoDay()}.json`;
}

export function validateFoods(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Not a JSON object');
    const kind = detectPayloadKind(payload);
    if (kind === KINDS.FOODS || kind === KINDS.FULL) {
        if (payload.foodItems !== undefined && !Array.isArray(payload.foodItems)) {
            throw new Error('foodItems must be an array');
        }
        if (payload.recipes !== undefined && !Array.isArray(payload.recipes)) {
            throw new Error('recipes must be an array');
        }
        return true;
    }
    throw wrongKindError(kind, KINDS.FOODS);
}

export async function importFoods(payload) {
    validateFoods(payload);
    const stats = (await upsertLibrary({
        categories: arrayOf(payload.categories),
        foodItems: arrayOf(payload.foodItems),
        recipes: arrayOf(payload.recipes),
    })).stats;
    healthSignals.onImportCompleted.dispatch({ kind: KINDS.FOODS, stats });
    return stats;
}

export async function exportMenus(menuList) {
    const list = arrayOf(menuList);
    if (list.length === 0) throw new Error('No menus to export');
    const [foods, recs, cats] = await Promise.all([
        foodItems.list(),
        recipes.list(),
        categories.list(),
    ]);
    const bundle = collectBundle(
        menuRefIds(list),
        indexById(foods),
        indexById(recs),
        indexById(cats),
    );
    return wrapPayload(KINDS.MENUS, {
        menus: list,
        foodItems: bundle.foodItems,
        recipes: bundle.recipes,
        categories: bundle.categories,
    });
}

export function menusExportFilename(menuList) {
    const list = arrayOf(menuList);
    if (list.length === 1) return `corevital-menu-${slug(list[0].name)}-${isoDay()}.json`;
    return `corevital-menus-${isoDay()}.json`;
}

export function validateMenus(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Not a JSON object');
    const kind = detectPayloadKind(payload);
    if (kind === KINDS.MENUS) {
        const list = payload.menus || (payload.menu ? [payload.menu] : []);
        if (!Array.isArray(list) || list.length === 0) throw new Error('No menus in this file');
        return true;
    }
    if (kind === KINDS.FULL) {
        if (!Array.isArray(payload.menus) || payload.menus.length === 0) {
            throw new Error('No menus in this file');
        }
        return true;
    }
    throw wrongKindError(kind, KINDS.MENUS);
}

function menusFromPayload(payload) {
    if (Array.isArray(payload.menus) && payload.menus.length) return payload.menus;
    if (payload.menu) return [payload.menu];
    return [];
}

export async function importMenus(payload) {
    validateMenus(payload);
    const incomingMenus = menusFromPayload(payload);
    const foods = arrayOf(payload.foodItems);
    const recs = arrayOf(payload.recipes);
    const cats = arrayOf(payload.categories);
    const kind = detectPayloadKind(payload);
    const bundle = kind === KINDS.FULL
        ? collectBundle(menuRefIds(incomingMenus), indexById(foods), indexById(recs), indexById(cats))
        : { foodItems: foods, recipes: recs, categories: cats };

    const merged = await upsertLibrary(bundle);

    const localMenus = await menus.list();
    const localById = indexById(localMenus);
    const localByName = indexByName(localMenus);
    const stats = {
        ...merged.stats,
        createdMenus: 0,
        updatedMenus: 0,
        menuIds: [],
    };

    for (const incoming of incomingMenus) {
        if (!incoming) continue;
        const foodItemIds = (incoming.foodItemIds || [])
            .map((id) => remapFoodId(id, merged.foodIdMap, merged.localFoodsById))
            .filter(Boolean);
        const recipeIds = (incoming.recipeIds || [])
            .map((id) => remapRecipeId(id, merged.recipeIdMap, merged.localRecipesById))
            .filter(Boolean);
        const existing = localById.get(incoming.id) || localByName.get(nameKey(incoming));
        const next = {
            ...existing,
            ...incoming,
            foodItemIds,
            recipeIds,
        };
        let saved;
        if (existing) {
            saved = await menus.put({
                ...next,
                id: existing.id,
                createdAt: existing.createdAt,
                version: existing.version,
            });
            stats.updatedMenus++;
        } else {
            saved = await menus.put({
                ...next,
                id: incoming.id && !localById.has(incoming.id) ? incoming.id : undefined,
                createdAt: undefined,
                version: 0,
            });
            stats.createdMenus++;
        }
        localById.set(saved.id, saved);
        localByName.set(nameKey(saved), saved);
        stats.menuIds.push(saved.id);
    }

    healthSignals.onImportCompleted.dispatch({ kind: KINDS.MENUS, stats });
    return stats;
}
