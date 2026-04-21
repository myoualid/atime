import { openDB, withTx, reqAsPromise, uuid, nowIso, STORES } from './db.js';
import { healthSignals } from '../signals.js';
import { zeroNutrition } from '../nutrition/calc.js';

function baseFields(partial = {}) {
    const now = nowIso();
    return {
        id: partial.id || uuid(),
        createdAt: partial.createdAt || now,
        updatedAt: now,
        version: (partial.version ?? 0) + 1,
        tags: partial.tags || [],
    };
}

function getAll(storeName) {
    return withTx([storeName], 'readonly', (tx) => reqAsPromise(tx.objectStore(storeName).getAll()));
}

function getById(storeName, id) {
    return withTx([storeName], 'readonly', (tx) => reqAsPromise(tx.objectStore(storeName).get(id)));
}

function putItem(storeName, item) {
    return withTx([storeName], 'readwrite', (tx) => reqAsPromise(tx.objectStore(storeName).put(item)));
}

function deleteItem(storeName, id) {
    return withTx([storeName], 'readwrite', (tx) => reqAsPromise(tx.objectStore(storeName).delete(id)));
}

// ------------------------ FoodItems ------------------------

export const foodItems = {
    async list() {
        return (await getAll(STORES.foodItems)).sort((a, b) => a.name.localeCompare(b.name));
    },
    get(id) { return getById(STORES.foodItems, id); },
    async put(item) {
        const base = baseFields(item);
        const full = {
            ...base,
            name: item.name?.trim() || 'Untitled',
            nameLower: (item.name || '').toLowerCase(),
            aliases: item.aliases || [],
            categoryId: item.categoryId || null,
            unit: 'g',
            densityGPerMl: item.densityGPerMl ?? null,
            nutritionPerGram: item.nutritionPerGram || zeroNutrition(),
            defaultServingG: Number(item.defaultServingG) || 100,
            notes: item.notes || '',
            imageBlobKey: item.imageBlobKey || null,
            source: item.source || { kind: 'manual' },
            details: item.details || null,
        };
        await putItem(STORES.foodItems, full);
        healthSignals.onLibraryChanged.dispatch({ kind: 'food', id: full.id });
        return full;
    },
    async remove(id) {
        await deleteItem(STORES.foodItems, id);
        healthSignals.onLibraryChanged.dispatch({ kind: 'food', id, removed: true });
    },
};

// ------------------------ Recipes --------------------------

export const recipes = {
    async list() {
        return (await getAll(STORES.recipes)).sort((a, b) => a.name.localeCompare(b.name));
    },
    get(id) { return getById(STORES.recipes, id); },
    async put(recipe) {
        const base = baseFields(recipe);
        const full = {
            ...base,
            name: recipe.name?.trim() || 'Untitled recipe',
            nameLower: (recipe.name || '').toLowerCase(),
            categoryId: recipe.categoryId || null,
            description: recipe.description || '',
            instructions: recipe.instructions || '',
            prepTimeMin: recipe.prepTimeMin ?? null,
            cookTimeMin: recipe.cookTimeMin ?? null,
            servings: Math.max(1, Number(recipe.servings) || 1),
            totalYieldG: recipe.totalYieldG ?? null,
            ingredients: (recipe.ingredients || []).map((ing) => ({
                foodItemId: ing.foodItemId,
                amountG: Number(ing.amountG) || 0,
                note: ing.note || null,
                optional: !!ing.optional,
                group: ing.group || null,
            })),
            imageBlobKey: recipe.imageBlobKey || null,
            cuisine: recipe.cuisine || null,
            difficulty: recipe.difficulty || null,
            source: recipe.source || { kind: 'manual' },
            _computed: null,
        };
        await putItem(STORES.recipes, full);
        healthSignals.onLibraryChanged.dispatch({ kind: 'recipe', id: full.id });
        return full;
    },
    async remove(id) {
        await deleteItem(STORES.recipes, id);
        healthSignals.onLibraryChanged.dispatch({ kind: 'recipe', id, removed: true });
    },
};

// ------------------------ Categories -----------------------

export const categories = {
    async list() {
        return (await getAll(STORES.categories)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
    },
    async listByKind(kind) {
        return (await this.list()).filter((c) => c.kind === kind);
    },
    async put(cat) {
        const base = baseFields(cat);
        const full = {
            ...base,
            name: cat.name?.trim() || 'Untitled',
            kind: cat.kind === 'food' ? 'food' : 'meal',
            color: cat.color || null,
            icon: cat.icon || null,
            sortOrder: Number(cat.sortOrder) || 0,
        };
        await putItem(STORES.categories, full);
        healthSignals.onCategoriesChanged.dispatch({ id: full.id });
        return full;
    },
    async remove(id) {
        await deleteItem(STORES.categories, id);
        healthSignals.onCategoriesChanged.dispatch({ id, removed: true });
    },
    async bulkSeedIfEmpty(seedList) {
        const existing = await this.list();
        if (existing.length) return existing;
        const out = [];
        for (const s of seedList) {
            out.push(await this.put(s));
        }
        return out;
    },
};

// ------------------------ Plan entries ---------------------

export const plan = {
    normalizeCourse(value) {
        return value === 'dessert' || value === 'drink' ? value : 'main';
    },
    async listByRange(fromIso, toIso) {
        return withTx([STORES.planEntries], 'readonly', async (tx) => {
            const store = tx.objectStore(STORES.planEntries);
            const idx = store.index('by_date');
            const range = IDBKeyRange.bound(fromIso, toIso);
            const req = idx.getAll(range);
            const all = await reqAsPromise(req);
            const order = { main: 0, dessert: 1, drink: 2 };
            return all.sort((a, b) => (
                a.date.localeCompare(b.date)
                || a.mealCategoryId.localeCompare(b.mealCategoryId)
                || (order[this.normalizeCourse(a.course)] - order[this.normalizeCourse(b.course)])
                || (a.slotOrder - b.slotOrder)
            ));
        });
    },
    async getDay(dateIso) {
        return this.listByRange(dateIso, dateIso);
    },
    async put(entry) {
        const base = baseFields(entry);
        const full = {
            ...base,
            date: entry.date,
            mealCategoryId: entry.mealCategoryId,
            course: this.normalizeCourse(entry.course),
            slotOrder: Number(entry.slotOrder) || 0,
            target: entry.target,
            notes: entry.notes || null,
        };
        await putItem(STORES.planEntries, full);
        healthSignals.onPlanChanged.dispatch({ date: full.date });
        return full;
    },
    async remove(id) {
        const existing = await getById(STORES.planEntries, id);
        await deleteItem(STORES.planEntries, id);
        healthSignals.onPlanChanged.dispatch({ date: existing?.date });
    },
    async move({ id, date, mealCategoryId, course, slotOrder }) {
        const existing = await getById(STORES.planEntries, id);
        if (!existing) return null;
        const old = existing.date;
        const next = {
            ...existing,
            date,
            mealCategoryId,
            course: this.normalizeCourse(course ?? existing.course),
            slotOrder: Number(slotOrder) || 0,
            updatedAt: nowIso(),
            version: (existing.version || 0) + 1,
        };
        await putItem(STORES.planEntries, next);
        healthSignals.onPlanChanged.dispatch({ date, oldDate: old });
        return next;
    },
    async clearByDate(dateIso, opts = {}) {
        const mealCategoryId = opts.mealCategoryId || null;
        const course = opts.course ? this.normalizeCourse(opts.course) : null;
        let removed = 0;
        await withTx([STORES.planEntries], 'readwrite', async (tx) => {
            const store = tx.objectStore(STORES.planEntries);
            const idx = store.index('by_date');
            const allForDay = await reqAsPromise(idx.getAll(IDBKeyRange.only(dateIso)));
            const toRemove = allForDay.filter((entry) => {
                if (mealCategoryId && entry.mealCategoryId !== mealCategoryId) return false;
                if (course && this.normalizeCourse(entry.course) !== course) return false;
                return true;
            });
            removed = toRemove.length;
            for (const entry of toRemove) {
                await reqAsPromise(store.delete(entry.id));
            }
        });
        if (removed > 0) {
            healthSignals.onPlanChanged.dispatch({ date: dateIso, cleared: true, removed });
        }
        return removed;
    },
};

// ------------------------ Preferences ----------------------

const DEFAULT_PREFS = {
    id: 'singleton',
    defaultView: 'week',
    weekStartsOn: 1,
    unitsDisplay: 'metric',
    calorieTarget: null,
    macroTargets: null,
    proteinTarget_g: null,
    carbsTarget_g: null,
    fatTarget_g: null,
    fiberTarget_g: null,
    sugarTargetMax_g: null,
    sodiumTargetMax_mg: null,
    saturatedFatTargetMax_g: null,
    weightTargetKg: null,
    weightUnit: 'kg',
    theme: 'dark',
    showNutritionInPlanner: true,
};

export const prefs = {
    async get() {
        const got = await getById(STORES.preferences, 'singleton');
        return { ...DEFAULT_PREFS, ...(got || {}) };
    },
    async put(patch) {
        const cur = await this.get();
        const merged = { ...cur, ...patch, id: 'singleton' };
        await putItem(STORES.preferences, merged);
        healthSignals.onPrefsChanged.dispatch(merged);
        return merged;
    },
};

// ------------------------ Blobs ----------------------------

export const blobs = {
    async put(blob, mime) {
        const key = uuid();
        await putItem(STORES.blobs, { key, blob, mime: mime || blob?.type || 'application/octet-stream', createdAt: nowIso() });
        return key;
    },
    get(key) { return getById(STORES.blobs, key); },
    remove(key) { return deleteItem(STORES.blobs, key); },
};

// ------------------------ Shopping checks ------------------

export const shoppingChecks = {
    async getByRange(fromIso, toIso) {
        const all = await getAll(STORES.shoppingChecks);
        return all.filter((c) => c.from === fromIso && c.to === toIso);
    },
    async setCheck({ from, to, foodItemId }, checked) {
        const key = `${from}|${to}|${foodItemId}`;
        if (!checked) {
            await deleteItem(STORES.shoppingChecks, key);
            return;
        }
        await putItem(STORES.shoppingChecks, { key, from, to, foodItemId, checked: true, updatedAt: nowIso() });
    },
};

// ------------------------ Weight entries -------------------

export const weight = {
    async list() {
        const all = await getAll(STORES.weightEntries);
        return all.sort((a, b) => a.date.localeCompare(b.date));
    },
    async listByRange(fromIso, toIso) {
        return withTx([STORES.weightEntries], 'readonly', async (tx) => {
            const idx = tx.objectStore(STORES.weightEntries).index('by_date');
            const range = IDBKeyRange.bound(fromIso, toIso);
            const all = await reqAsPromise(idx.getAll(range));
            return all.sort((a, b) => a.date.localeCompare(b.date));
        });
    },
    async put(entry) {
        const base = baseFields(entry);
        const full = {
            ...base,
            date: entry.date,
            weightKg: Number(entry.weightKg) || 0,
            bodyFatPct: entry.bodyFatPct == null ? null : Number(entry.bodyFatPct),
            notes: entry.notes || '',
        };
        await putItem(STORES.weightEntries, full);
        healthSignals.onWeightChanged.dispatch({ id: full.id, date: full.date });
        return full;
    },
    async remove(id) {
        await deleteItem(STORES.weightEntries, id);
        healthSignals.onWeightChanged.dispatch({ id, removed: true });
    },
};

// ------------------------ Goal periods ---------------------

const GOAL_TARGET_FIELDS = [
    'calorieTarget',
    'proteinTarget_g',
    'carbsTarget_g',
    'fatTarget_g',
    'fiberTarget_g',
    'sugarTargetMax_g',
    'sodiumTargetMax_mg',
    'saturatedFatTargetMax_g',
    'weightTargetKg',
];

function emptyTargets() {
    const o = {};
    for (const f of GOAL_TARGET_FIELDS) o[f] = null;
    return o;
}

export const goalPeriods = {
    FIELDS: GOAL_TARGET_FIELDS,
    emptyTargets,

    async list() {
        const all = await getAll(STORES.goalPeriods);
        return all.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    },

    get(id) { return getById(STORES.goalPeriods, id); },

    async put(period) {
        const base = baseFields(period);
        const clean = {};
        for (const f of GOAL_TARGET_FIELDS) {
            const v = period[f];
            clean[f] = (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
        }
        const full = {
            ...base,
            label: (period.label || '').trim(),
            startDate: period.startDate || null,
            endDate: period.endDate || null, // null = open-ended
            ...clean,
        };
        await putItem(STORES.goalPeriods, full);
        healthSignals.onGoalsChanged.dispatch({ id: full.id });
        return full;
    },

    async remove(id) {
        await deleteItem(STORES.goalPeriods, id);
        healthSignals.onGoalsChanged.dispatch({ id, removed: true });
    },

    /**
     * Seed a single "Baseline" open-ended period from legacy prefs targets,
     * if no goal periods exist yet and any legacy target is set. Idempotent
     * via a meta flag.
     */
    async seedFromLegacyPrefsOnce() {
        const done = await meta.get('goalPeriods:legacySeeded');
        if (done) return null;
        await meta.put('goalPeriods:legacySeeded', true);
        const existing = await this.list();
        if (existing.length) return null;
        const p = await prefs.get();
        const hasAny = GOAL_TARGET_FIELDS.some((f) => p[f] != null);
        if (!hasAny) return null;
        const patch = { label: 'Baseline (imported)', startDate: '2000-01-01', endDate: null };
        for (const f of GOAL_TARGET_FIELDS) patch[f] = p[f] ?? null;
        return this.put(patch);
    },
};

// ------------------------ Meta -----------------------------

export const meta = {
    async get(key) {
        const v = await getById(STORES.meta, key);
        return v?.value;
    },
    async put(key, value) {
        await putItem(STORES.meta, { key, value });
    },
};

// ------------------------ Sport definitions ----------------

export const sportDefinitions = {
    async list() {
        return (await getAll(STORES.sportDefinitions)).sort((a, b) => a.name.localeCompare(b.name));
    },
    get(id) { return getById(STORES.sportDefinitions, id); },
    async put(item) {
        const base = baseFields(item);
        const full = {
            ...base,
            name: item.name?.trim() || 'Untitled sport',
            nameLower: (item.name || '').toLowerCase(),
            icon: item.icon || '🏃',
            defaultDurationMin: Math.max(1, Number(item.defaultDurationMin) || 30),
            notes: item.notes || '',
        };
        await putItem(STORES.sportDefinitions, full);
        healthSignals.onSportsLibraryChanged.dispatch({ id: full.id });
        return full;
    },
    async remove(id) {
        await deleteItem(STORES.sportDefinitions, id);
        healthSignals.onSportsLibraryChanged.dispatch({ id, removed: true });
    },
    async bulkSeedIfEmpty(seedList) {
        const existing = await this.list();
        if (existing.length) return existing;
        const out = [];
        for (const s of seedList) out.push(await this.put(s));
        return out;
    },
};

// ------------------------ Sport plan entries ---------------

export const sportPlan = {
    async listByRange(fromIso, toIso) {
        return withTx([STORES.sportEntries], 'readonly', async (tx) => {
            const idx = tx.objectStore(STORES.sportEntries).index('by_date');
            const range = IDBKeyRange.bound(fromIso, toIso);
            const all = await reqAsPromise(idx.getAll(range));
            return all.sort((a, b) => (
                a.date.localeCompare(b.date)
                || (a.slotOrder - b.slotOrder)
            ));
        });
    },
    async getDay(dateIso) {
        return this.listByRange(dateIso, dateIso);
    },
    async put(entry) {
        const base = baseFields(entry);
        const full = {
            ...base,
            date: entry.date,
            sportDefinitionId: entry.sportDefinitionId,
            durationMin: Math.max(0, Number(entry.durationMin) || 0),
            slotOrder: Number(entry.slotOrder) || 0,
            notes: entry.notes || null,
        };
        await putItem(STORES.sportEntries, full);
        healthSignals.onSportsPlanChanged.dispatch({ date: full.date });
        return full;
    },
    async remove(id) {
        const existing = await getById(STORES.sportEntries, id);
        await deleteItem(STORES.sportEntries, id);
        healthSignals.onSportsPlanChanged.dispatch({ date: existing?.date });
    },
    async move({ id, date, slotOrder }) {
        const existing = await getById(STORES.sportEntries, id);
        if (!existing) return null;
        const old = existing.date;
        const next = {
            ...existing,
            date,
            slotOrder: Number(slotOrder) || 0,
            updatedAt: nowIso(),
            version: (existing.version || 0) + 1,
        };
        await putItem(STORES.sportEntries, next);
        healthSignals.onSportsPlanChanged.dispatch({ date, oldDate: old });
        return next;
    },
};

// ------------------------ Bulk I/O (import) ----------------

export async function replaceAll({ preferences, categories: cats, foodItems: foods, recipes: recs, planEntries, sportDefinitions: sportDefs, sportEntries }) {
    await openDB();
    await withTx([
        STORES.foodItems, STORES.recipes, STORES.categories, STORES.planEntries, STORES.preferences,
        STORES.sportDefinitions, STORES.sportEntries,
    ], 'readwrite', async (tx) => {
        const stores = {
            [STORES.foodItems]: tx.objectStore(STORES.foodItems),
            [STORES.recipes]: tx.objectStore(STORES.recipes),
            [STORES.categories]: tx.objectStore(STORES.categories),
            [STORES.planEntries]: tx.objectStore(STORES.planEntries),
            [STORES.preferences]: tx.objectStore(STORES.preferences),
            [STORES.sportDefinitions]: tx.objectStore(STORES.sportDefinitions),
            [STORES.sportEntries]: tx.objectStore(STORES.sportEntries),
        };
        for (const s of Object.values(stores)) await reqAsPromise(s.clear());
        for (const x of cats || []) await reqAsPromise(stores[STORES.categories].put(x));
        for (const x of foods || []) await reqAsPromise(stores[STORES.foodItems].put(x));
        for (const x of recs || []) await reqAsPromise(stores[STORES.recipes].put(x));
        for (const x of planEntries || []) await reqAsPromise(stores[STORES.planEntries].put(x));
        for (const x of sportDefs || []) await reqAsPromise(stores[STORES.sportDefinitions].put(x));
        for (const x of sportEntries || []) await reqAsPromise(stores[STORES.sportEntries].put(x));
        if (preferences) await reqAsPromise(stores[STORES.preferences].put({ ...preferences, id: 'singleton' }));
    });
    healthSignals.onCategoriesChanged.dispatch({});
    healthSignals.onLibraryChanged.dispatch({});
    healthSignals.onPlanChanged.dispatch({});
    healthSignals.onPrefsChanged.dispatch({});
    healthSignals.onSportsLibraryChanged.dispatch({});
    healthSignals.onSportsPlanChanged.dispatch({});
}

export async function mergeAll(payload, preferImported) {
    const {
        categories: cats = [], foodItems: foods = [], recipes: recs = [], planEntries = [],
        sportDefinitions: sportDefs = [], sportEntries = [], preferences: prefsIn,
    } = payload;
    await withTx([
        STORES.foodItems, STORES.recipes, STORES.categories, STORES.planEntries, STORES.preferences,
        STORES.sportDefinitions, STORES.sportEntries,
    ], 'readwrite', async (tx) => {
        const put = async (store, x) => {
            const existing = await reqAsPromise(store.get(x.id));
            if (!existing || preferImported) await reqAsPromise(store.put(x));
        };
        for (const x of cats) await put(tx.objectStore(STORES.categories), x);
        for (const x of foods) await put(tx.objectStore(STORES.foodItems), x);
        for (const x of recs) await put(tx.objectStore(STORES.recipes), x);
        for (const x of planEntries) await put(tx.objectStore(STORES.planEntries), x);
        for (const x of sportDefs) await put(tx.objectStore(STORES.sportDefinitions), x);
        for (const x of sportEntries) await put(tx.objectStore(STORES.sportEntries), x);
        if (prefsIn && preferImported) {
            await reqAsPromise(tx.objectStore(STORES.preferences).put({ ...prefsIn, id: 'singleton' }));
        }
    });
    healthSignals.onCategoriesChanged.dispatch({});
    healthSignals.onLibraryChanged.dispatch({});
    healthSignals.onPlanChanged.dispatch({});
    healthSignals.onPrefsChanged.dispatch({});
    healthSignals.onSportsLibraryChanged.dispatch({});
    healthSignals.onSportsPlanChanged.dispatch({});
}
