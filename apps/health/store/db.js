/**
 * IndexedDB bootstrap for the health module.
 * DB: `corevital-health`, version 4.
 */

export const DB_NAME = 'corevital-health';
export const LEGACY_DB_NAME = 'corevital-food';
export const DB_VERSION = 4;

export const STORES = {
    foodItems: 'foodItems',
    recipes: 'recipes',
    categories: 'categories',
    planEntries: 'planEntries',
    preferences: 'preferences',
    blobs: 'blobs',
    shoppingChecks: 'shoppingChecks',
    meta: 'meta',
    weightEntries: 'weightEntries',
    goalPeriods: 'goalPeriods',
    sportDefinitions: 'sportDefinitions',
    sportEntries: 'sportEntries',
};

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

const REQUIRED_STORES = Object.values(STORES);

function runMigrations(db, oldVersion) {
    if (oldVersion < 1) {
        const foods = db.createObjectStore(STORES.foodItems, { keyPath: 'id' });
        foods.createIndex('by_name', 'nameLower');
        foods.createIndex('by_category', 'categoryId');
        foods.createIndex('by_tag', 'tags', { multiEntry: true });

        const recipes = db.createObjectStore(STORES.recipes, { keyPath: 'id' });
        recipes.createIndex('by_name', 'nameLower');
        recipes.createIndex('by_category', 'categoryId');
        recipes.createIndex('by_tag', 'tags', { multiEntry: true });

        const categories = db.createObjectStore(STORES.categories, { keyPath: 'id' });
        categories.createIndex('by_kind', 'kind');

        const plan = db.createObjectStore(STORES.planEntries, { keyPath: 'id' });
        plan.createIndex('by_date', 'date');
        plan.createIndex('by_date_meal', ['date', 'mealCategoryId']);

        db.createObjectStore(STORES.preferences, { keyPath: 'id' });
        db.createObjectStore(STORES.blobs, { keyPath: 'key' });
        db.createObjectStore(STORES.shoppingChecks, { keyPath: 'key' });
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
    }
    if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORES.weightEntries)) {
            const wt = db.createObjectStore(STORES.weightEntries, { keyPath: 'id' });
            wt.createIndex('by_date', 'date');
        }
    }
    if (oldVersion < 3) {
        if (!db.objectStoreNames.contains(STORES.goalPeriods)) {
            const gp = db.createObjectStore(STORES.goalPeriods, { keyPath: 'id' });
            gp.createIndex('by_start', 'startDate');
            gp.createIndex('by_end', 'endDate');
        }
    }
    if (oldVersion < 4) {
        if (!db.objectStoreNames.contains(STORES.sportDefinitions)) {
            const sd = db.createObjectStore(STORES.sportDefinitions, { keyPath: 'id' });
            sd.createIndex('by_name', 'nameLower');
        }
        if (!db.objectStoreNames.contains(STORES.sportEntries)) {
            const se = db.createObjectStore(STORES.sportEntries, { keyPath: 'id' });
            se.createIndex('by_date', 'date');
        }
    }
}

/**
 * Ensure any required stores that don't exist yet get created, even if the DB
 * is already at current DB_VERSION (can happen when an earlier code state
 * bumped the version without adding the new store).
 */
function ensureStoresPresent(db) {
    const missing = REQUIRED_STORES.filter((s) => !db.objectStoreNames.contains(s));
    if (!missing.length) return;
    for (const s of missing) {
        if (s === STORES.weightEntries) {
            const wt = db.createObjectStore(s, { keyPath: 'id' });
            wt.createIndex('by_date', 'date');
        } else if (s === STORES.goalPeriods) {
            const gp = db.createObjectStore(s, { keyPath: 'id' });
            gp.createIndex('by_start', 'startDate');
            gp.createIndex('by_end', 'endDate');
        } else if (s === STORES.sportDefinitions) {
            const sd = db.createObjectStore(s, { keyPath: 'id' });
            sd.createIndex('by_name', 'nameLower');
        } else if (s === STORES.sportEntries) {
            const se = db.createObjectStore(s, { keyPath: 'id' });
            se.createIndex('by_date', 'date');
        } else {
            // Generic fallback — creates a keyPath 'id' store without indices.
            db.createObjectStore(s, { keyPath: 'id' });
        }
    }
}

function openAtVersion(version) {
    return new Promise((resolve, reject) => {
        const req = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
        req.onupgradeneeded = (event) => {
            const db = req.result;
            const tx = req.transaction;
            runMigrations(db, event.oldVersion);
            ensureStoresPresent(db);
            tx?.addEventListener('error', () => reject(tx.error));
        };
        req.onsuccess = () => {
            const db = req.result;
            db.onversionchange = () => {
                try { db.close(); } catch { /* ignore */ }
                dbPromise = null;
            };
            resolve(db);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error(
            'IndexedDB open blocked: another tab has the Meal Planner open at an older version. Close all other CoreVital Health tabs and reload.',
        ));
    });
}

export function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = (async () => {
        // Open without a version first to discover the existing version. This
        // avoids VersionError when an earlier code path (self-repair) bumped
        // the DB above our current DB_VERSION constant.
        let db = await openAtVersion();
        const existingVersion = db.version;
        const needsUpgrade = existingVersion < DB_VERSION
            || REQUIRED_STORES.some((s) => !db.objectStoreNames.contains(s));
        if (!needsUpgrade) return db;

        // Target = at least DB_VERSION, but never below the existing version;
        // if stores are missing at the existing version, bump by one to force
        // an upgrade transaction.
        const missingAtExisting = REQUIRED_STORES.some((s) => !db.objectStoreNames.contains(s));
        const target = Math.max(DB_VERSION, existingVersion + (missingAtExisting && existingVersion >= DB_VERSION ? 1 : 0));
        if (missingAtExisting) {
            console.warn('[health-db] missing stores at v' + existingVersion + ' — upgrading to v' + target);
        }
        try { db.close(); } catch { /* ignore */ }
        db = await openAtVersion(target);
        return db;
    })().then(async (db) => {
        await maybeMigrateFromLegacyFoodDB(db);
        return db;
    }).catch((err) => {
        dbPromise = null;
        throw err;
    });
    return dbPromise;
}

/**
 * One-shot migration: if the legacy `corevital-food` IndexedDB exists and
 * contains data, and the new `corevital-health` DB has not yet received a
 * legacy migration, copy every record across store-by-store. Runs exactly
 * once — subsequent opens read the `legacyFoodMigrated` meta flag and skip.
 *
 * The legacy DB is left intact so the user can verify before manually
 * clearing it via DevTools.
 */
async function maybeMigrateFromLegacyFoodDB(healthDb) {
    // Check flag first.
    const alreadyDone = await new Promise((resolve) => {
        try {
            const tx = healthDb.transaction([STORES.meta], 'readonly');
            const req = tx.objectStore(STORES.meta).get('legacyFoodMigrated');
            req.onsuccess = () => resolve(!!req.result?.value);
            req.onerror = () => resolve(false);
        } catch { resolve(false); }
    });
    if (alreadyDone) return;

    // Probe whether the legacy DB exists without creating it. `databases()` is
    // widely available in modern browsers; fall back to opening and checking
    // if versionchange upgrade was needed.
    let legacyExists = false;
    if (typeof indexedDB.databases === 'function') {
        try {
            const all = await indexedDB.databases();
            legacyExists = all.some((d) => d.name === LEGACY_DB_NAME);
        } catch { /* ignore */ }
    }
    // If we can't enumerate, attempt the open and detect a freshly-created empty DB.
    const legacyDb = await new Promise((resolve) => {
        let created = false;
        const req = indexedDB.open(LEGACY_DB_NAME);
        req.onupgradeneeded = () => { created = true; };
        req.onsuccess = () => {
            if (created && !legacyExists) {
                // We accidentally created it. Close + delete to leave no trace.
                try { req.result.close(); } catch { /* ignore */ }
                try { indexedDB.deleteDatabase(LEGACY_DB_NAME); } catch { /* ignore */ }
                resolve(null);
                return;
            }
            resolve(req.result);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
    });
    if (!legacyDb) {
        // No legacy data — mark done so we don't probe again.
        await writeMetaFlag(healthDb, 'legacyFoodMigrated', { at: new Date().toISOString(), copied: 0 });
        return;
    }

    // Map legacy store -> health store. Only copy stores that exist in both.
    const storeNames = [
        STORES.foodItems, STORES.recipes, STORES.categories, STORES.planEntries,
        STORES.preferences, STORES.blobs, STORES.shoppingChecks, STORES.meta,
        STORES.weightEntries, STORES.goalPeriods,
    ].filter((s) => legacyDb.objectStoreNames.contains(s) && healthDb.objectStoreNames.contains(s));

    let totalCopied = 0;
    for (const name of storeNames) {
        const rows = await new Promise((resolve) => {
            try {
                const tx = legacyDb.transaction([name], 'readonly');
                const req = tx.objectStore(name).getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            } catch { resolve([]); }
        });
        if (!rows.length) continue;
        await new Promise((resolve, reject) => {
            const tx = healthDb.transaction([name], 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('legacy migration aborted'));
            const store = tx.objectStore(name);
            for (const row of rows) {
                try { store.put(row); totalCopied++; } catch { /* skip bad rows */ }
            }
        }).catch((err) => {
            console.warn('[health-db] legacy copy failed for store ' + name, err);
        });
    }
    try { legacyDb.close(); } catch { /* ignore */ }
    await writeMetaFlag(healthDb, 'legacyFoodMigrated', {
        at: new Date().toISOString(),
        copied: totalCopied,
        stores: storeNames,
    });
    console.info(`[health-db] migrated ${totalCopied} records from ${LEGACY_DB_NAME} into ${DB_NAME}. Legacy DB left intact.`);
}

function writeMetaFlag(db, key, value) {
    return new Promise((resolve) => {
        try {
            const tx = db.transaction([STORES.meta], 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.objectStore(STORES.meta).put({ key, value });
        } catch { resolve(); }
    });
}

/** Promise wrapper for a single IDBRequest. */
export function reqAsPromise(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Run `fn(tx)` in a txn; resolves when the txn completes. */
export async function withTx(storeNames, mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('tx aborted'));
        Promise.resolve(fn(tx)).then((r) => { result = r; }).catch((err) => {
            try { tx.abort(); } catch { /* ignore */ }
            reject(err);
        });
    });
}

export function uuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    // Fallback RFC4122-ish v4
    const b = new Uint8Array(16);
    (globalThis.crypto || { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 256) | 0; } }).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function nowIso() {
    return new Date().toISOString();
}
