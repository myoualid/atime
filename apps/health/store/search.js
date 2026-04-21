/**
 * In-memory search index for library items. Rebuilt on library changes.
 */

/** @type {Array<{ id:string, kind:'food'|'recipe', name:string, tokens:string[], ref:any }>} */
let index = [];

function tokenize(s) {
    return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function rebuildIndex({ foodItems, recipes }) {
    index = [];
    for (const f of foodItems || []) {
        index.push({
            id: f.id,
            kind: 'food',
            name: f.name || '',
            tokens: [...tokenize(f.name), ...(f.aliases || []).flatMap(tokenize), ...(f.tags || []).flatMap(tokenize)],
            ref: f,
        });
    }
    for (const r of recipes || []) {
        index.push({
            id: r.id,
            kind: 'recipe',
            name: r.name || '',
            tokens: [...tokenize(r.name), ...(r.tags || []).flatMap(tokenize)],
            ref: r,
        });
    }
}

export function search(query, { limit = 50 } = {}) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return index.slice(0, limit);
    const qTokens = tokenize(q);
    const scored = [];
    for (const entry of index) {
        let score = 0;
        for (const qt of qTokens) {
            if (entry.name.toLowerCase().startsWith(qt)) score += 4;
            else if (entry.tokens.some((t) => t.startsWith(qt))) score += 2;
            else if (entry.tokens.some((t) => t.includes(qt))) score += 1;
        }
        if (score > 0) scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
    return scored.slice(0, limit).map((s) => s.entry);
}
