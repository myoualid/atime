/**
 * Portable meal-plan JSON: plan entries plus the foods, recipes, and
 * categories they need. Load creates missing library items and updates
 * existing ones (matched by id, then by name).
 */

import { foodItems, recipes, categories, plan } from './repos.js';
import { CURRENT_SCHEMA_VERSION } from './io.js';
import { healthSignals } from '../signals.js';
import { daysBetweenIso, addDaysIso } from '../dates.js';
import {
    APP_TAGS,
    KINDS,
    collectBundle,
    detectPayloadKind,
    indexById,
    remapCatId,
    remapFoodId,
    remapRecipeId,
    upsertLibrary,
    wrongKindError,
} from './libraryMerge.js';

const KIND = KINDS.MEAL_PLAN;

function datesOf(entries) {
    return (entries || []).map((e) => e?.date).filter(Boolean).sort();
}

function planRefIds(entries) {
    const foodIds = [];
    const recipeIds = [];
    const categoryIds = [];
    for (const entry of entries || []) {
        if (entry?.mealCategoryId) categoryIds.push(entry.mealCategoryId);
        const target = entry?.target;
        if (target?.kind === 'food' && target.foodItemId) foodIds.push(target.foodItemId);
        if (target?.kind === 'recipe' && target.recipeId) recipeIds.push(target.recipeId);
    }
    return { foodIds, recipeIds, categoryIds };
}

function preparePayload(payload) {
    const entries = Array.isArray(payload.planEntries) ? payload.planEntries : [];
    const foods = Array.isArray(payload.foodItems) ? payload.foodItems : [];
    const recs = Array.isArray(payload.recipes) ? payload.recipes : [];
    const cats = Array.isArray(payload.categories) ? payload.categories : [];
    const dated = datesOf(entries);
    const from = payload.from || dated[0] || null;
    const to = payload.to || dated[dated.length - 1] || null;

    if (payload.kind === KIND) {
        return {
            from,
            to,
            planEntries: entries,
            foodItems: foods,
            recipes: recs,
            categories: cats,
        };
    }

    const bundle = collectBundle(
        planRefIds(entries),
        indexById(foods),
        indexById(recs),
        indexById(cats),
    );
    return {
        from,
        to,
        planEntries: entries,
        ...bundle,
    };
}

export function validateMealPlan(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Not a JSON object');
    }
    const kind = detectPayloadKind(payload);
    if (kind === KIND) {
        if (payload.planEntries !== undefined && !Array.isArray(payload.planEntries)) {
            throw new Error('planEntries must be an array');
        }
        return true;
    }
    if ((kind === KINDS.FULL || APP_TAGS.has(payload.app)) && Array.isArray(payload.planEntries)) {
        return true;
    }
    throw wrongKindError(kind, KIND);
}

export function inspectMealPlan(payload) {
    validateMealPlan(payload);
    const prepared = preparePayload(payload);
    return {
        from: prepared.from,
        to: prepared.to,
        entryCount: prepared.planEntries.length,
        foodCount: prepared.foodItems.length,
        recipeCount: prepared.recipes.length,
    };
}

export async function exportMealPlan(fromIso, toIso) {
    const [entries, foods, recs, cats] = await Promise.all([
        plan.listByRange(fromIso, toIso),
        foodItems.list(),
        recipes.list(),
        categories.list(),
    ]);
    const bundle = collectBundle(
        planRefIds(entries),
        indexById(foods),
        indexById(recs),
        indexById(cats),
    );
    return {
        app: 'corevital-health',
        kind: KIND,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        from: fromIso,
        to: toIso,
        planEntries: entries,
        foodItems: bundle.foodItems,
        recipes: bundle.recipes,
        categories: bundle.categories,
    };
}

/**
 * @param {object} payload
 * @param {{ dateMode?: 'original'|'shift', targetFromIso?: string }} [opts]
 */
export async function importMealPlan(payload, opts = {}) {
    validateMealPlan(payload);
    const prepared = preparePayload(payload);
    const dateMode = opts.dateMode === 'shift' ? 'shift' : 'original';

    const merged = await upsertLibrary({
        categories: prepared.categories,
        foodItems: prepared.foodItems,
        recipes: prepared.recipes,
    });
    const stats = {
        ...merged.stats,
        planned: 0,
        skipped: 0,
        datesCleared: 0,
    };

    const dated = datesOf(prepared.planEntries);
    const srcFrom = prepared.from || dated[0] || null;
    const srcTo = prepared.to || dated[dated.length - 1] || null;
    const delta = (dateMode === 'shift' && srcFrom && opts.targetFromIso)
        ? daysBetweenIso(srcFrom, opts.targetFromIso)
        : 0;

    if (srcFrom && srcTo && prepared.planEntries.length) {
        const destFrom = addDaysIso(srcFrom, delta);
        const destTo = addDaysIso(srcTo, delta);
        stats.datesCleared = await plan.clearByRange(destFrom, destTo);
    }

    const { catIdMap, foodIdMap, recipeIdMap, localCatsById, localFoodsById, localRecipesById } = merged;

    for (const entry of prepared.planEntries) {
        if (!entry?.date || !entry.target) {
            stats.skipped++;
            continue;
        }
        const mealCategoryId = remapCatId(entry.mealCategoryId, catIdMap, localCatsById);
        if (!mealCategoryId) {
            stats.skipped++;
            continue;
        }
        let target = null;
        if (entry.target.kind === 'food') {
            const foodItemId = remapFoodId(entry.target.foodItemId, foodIdMap, localFoodsById);
            if (!foodItemId) { stats.skipped++; continue; }
            target = { kind: 'food', foodItemId, amountG: Number(entry.target.amountG) || 0 };
        } else if (entry.target.kind === 'recipe') {
            const recipeId = remapRecipeId(entry.target.recipeId, recipeIdMap, localRecipesById);
            if (!recipeId) { stats.skipped++; continue; }
            target = { kind: 'recipe', recipeId, servings: Number(entry.target.servings) || 1 };
        } else {
            stats.skipped++;
            continue;
        }
        await plan.put({
            date: addDaysIso(entry.date, delta),
            mealCategoryId,
            course: entry.course,
            slotOrder: entry.slotOrder,
            target,
            notes: entry.notes || null,
        });
        stats.planned++;
    }

    healthSignals.onImportCompleted.dispatch({ kind: KIND, stats });
    return stats;
}
