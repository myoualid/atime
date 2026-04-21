import { foodItems, recipes, categories, plan, prefs, sportDefinitions, sportPlan, replaceAll, mergeAll } from './repos.js';
import { healthSignals } from '../signals.js';
import { STRINGS } from '../strings.js';

export const CURRENT_SCHEMA_VERSION = 2;

export async function exportJson() {
    const [cats, foods, recs, planEntries, preferences, sportDefs, sportEntries] = await Promise.all([
        categories.list(),
        foodItems.list(),
        recipes.list(),
        plan.listByRange('0000-01-01', '9999-12-31'),
        prefs.get(),
        sportDefinitions.list(),
        sportPlan.listByRange('0000-01-01', '9999-12-31'),
    ]);
    return {
        app: 'corevital-health',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        preferences,
        categories: cats,
        foodItems: foods,
        recipes: recs,
        planEntries,
        sportDefinitions: sportDefs,
        sportEntries,
    };
}

export function downloadJson(payload) {
    const iso = new Date().toISOString().slice(0, 10);
    const filename = STRINGS.exportFilename(iso);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
}

export function validatePayload(payload) {
    const errors = [];
    if (!payload || typeof payload !== 'object') {
        errors.push({ path: '/', msg: 'Not an object' });
        return { ok: false, errors };
    }
    if (payload.app !== 'corevital-health' && payload.app !== 'corevital-food') {
        errors.push({ path: '/app', msg: 'Unknown app tag' });
    }
    if (!Number.isInteger(payload.schemaVersion)) errors.push({ path: '/schemaVersion', msg: 'Missing schemaVersion' });
    if (payload.schemaVersion > CURRENT_SCHEMA_VERSION) errors.push({ path: '/schemaVersion', msg: `Schema too new (${payload.schemaVersion} > ${CURRENT_SCHEMA_VERSION})` });
    for (const key of ['categories', 'foodItems', 'recipes', 'planEntries', 'sportDefinitions', 'sportEntries']) {
        if (payload[key] !== undefined && !Array.isArray(payload[key])) {
            errors.push({ path: `/${key}`, msg: 'Must be an array' });
        }
    }
    return { ok: errors.length === 0, errors };
}

export function migrate(payload) {
    // Back-compat: v1 exports from the legacy 'corevital-food' app lacked
    // sportDefinitions / sportEntries. Default to empty arrays.
    const out = { ...payload };
    if (!Array.isArray(out.sportDefinitions)) out.sportDefinitions = [];
    if (!Array.isArray(out.sportEntries)) out.sportEntries = [];
    return out;
}

/**
 * @param {object} payload
 * @param {'replace'|'merge-imported'|'merge-local'} strategy
 */
export async function importPayload(payload, strategy) {
    const v = validatePayload(payload);
    if (!v.ok) throw new Error(`Invalid JSON: ${v.errors.map((e) => `${e.path}: ${e.msg}`).join(', ')}`);
    const migrated = migrate(payload);
    const stats = {
        categories: migrated.categories?.length || 0,
        foodItems: migrated.foodItems?.length || 0,
        recipes: migrated.recipes?.length || 0,
        planEntries: migrated.planEntries?.length || 0,
        sportDefinitions: migrated.sportDefinitions?.length || 0,
        sportEntries: migrated.sportEntries?.length || 0,
    };
    if (strategy === 'replace') {
        await replaceAll(migrated);
    } else {
        await mergeAll(migrated, strategy === 'merge-imported');
    }
    healthSignals.onImportCompleted.dispatch({ stats, strategy });
    return stats;
}

export function pickJsonFile() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) { resolve(null); return; }
            const reader = new FileReader();
            reader.onload = () => {
                try { resolve(JSON.parse(String(reader.result))); }
                catch (err) { reject(err); }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        };
        input.click();
    });
}
