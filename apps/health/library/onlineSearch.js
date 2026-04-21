import { DrawUI } from '../../../shared/drawUI/index.js';
import * as off from '../api/openFoodFacts.js';
import * as mdb from '../api/themealdb.js';
import { offToFoodItem } from '../api/openFoodFacts.js';
import { importMealAsRecipe as sharedImportMeal } from '../api/importMeal.js';
import * as repos from '../store/repos.js';
import { STRINGS } from '../strings.js';

/**
 * Open a floating panel that lets the user search TheMealDB (recipes) and
 * Open Food Facts (foods), preview results, and import them into the library.
 *
 * @param {{ categories: Array, foodItems: Array }} ctx
 */
export function openOnlineSearch({ categories, foodItems }) {
    const host = document.createElement('div');
    host.className = 'health-online-search';
    host.innerHTML = `
        <div class="fos-tabs">
            <button type="button" data-tab="food" class="active">🥕 Foods · Open Food Facts</button>
            <button type="button" data-tab="meal">🍽 Meals · TheMealDB</button>
        </div>
        <div class="fos-search">
            <input type="search" placeholder="Search…" data-q />
            <input type="text" placeholder="or scan barcode (EAN)" data-barcode />
            <button type="button" data-act="go" class="primary">Search</button>
        </div>
        <div class="fos-status" data-status></div>
        <div class="fos-results" data-results></div>
    `;

    const $ = (sel) => host.querySelector(sel);
    const tabsEl = host.querySelectorAll('.fos-tabs button');
    const qEl = $('[data-q]');
    const barcodeEl = $('[data-barcode]');
    const goBtn = $('[data-act="go"]');
    const statusEl = $('[data-status]');
    const resultsEl = $('[data-results]');

    let activeTab = 'food';
    tabsEl.forEach((b) => {
        b.addEventListener('click', () => {
            tabsEl.forEach((x) => x.classList.remove('active'));
            b.classList.add('active');
            activeTab = b.dataset.tab;
            barcodeEl.style.display = activeTab === 'food' ? '' : 'none';
            resultsEl.innerHTML = '';
            statusEl.textContent = '';
        });
    });

    async function runSearch() {
        resultsEl.innerHTML = '';
        statusEl.textContent = 'Searching…';
        try {
            if (activeTab === 'food') {
                const barcode = barcodeEl.value.trim();
                let items = [];
                if (barcode) {
                    const p = await off.getProductByBarcode(barcode);
                    items = p ? [p] : [];
                } else {
                    items = await off.searchProducts(qEl.value, { pageSize: 24 });
                }
                statusEl.textContent = `${items.length} result(s)`;
                items.forEach((p) => resultsEl.appendChild(renderFoodResult(p)));
            } else {
                const items = await mdb.searchMeals(qEl.value);
                statusEl.textContent = `${items.length} result(s)`;
                items.forEach((m) => resultsEl.appendChild(renderMealResult(m)));
            }
        } catch (err) {
            console.error('[online search]', err);
            statusEl.textContent = `Error: ${err.message}`;
            DrawUI.toast(`Search failed: ${err.message}`, 'error').showIn(document.body);
        }
    }

    goBtn.addEventListener('click', runSearch);
    qEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
    barcodeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });

    // ---------- Result renderers ----------

    function renderFoodResult(p) {
        const row = document.createElement('div');
        row.className = 'fos-row';
        const n = p.nutritionPer100g;
        const d = p.details || {};
        const badges = [];
        if (d.nutriScore) badges.push(`<span class="health-off-badge health-off-nutriscore health-off-nutriscore--${d.nutriScore.grade}" title="Nutri-Score">${d.nutriScore.grade.toUpperCase()}</span>`);
        if (d.novaGroup) badges.push(`<span class="health-off-badge health-off-nova health-off-nova--${d.novaGroup}" title="NOVA group">NOVA ${d.novaGroup}</span>`);
        if (d.ecoScore) badges.push(`<span class="health-off-badge health-off-ecoscore health-off-ecoscore--${d.ecoScore.grade}" title="Eco-Score">ECO ${d.ecoScore.grade.toUpperCase()}</span>`);
        if ((d.additives || []).length) badges.push(`<span class="health-off-chip health-off-chip--warn" title="Additives">+${d.additives.length} additive${d.additives.length === 1 ? '' : 's'}</span>`);
        row.innerHTML = `
            <div class="fos-thumb">${p.imageUrl ? `<img src="${escapeAttr(p.imageUrl)}" alt="" loading="lazy">` : '🥕'}</div>
            <div class="fos-info">
                <div class="fos-title"></div>
                <div class="fos-meta"></div>
                <div class="fos-badges">${badges.join('')}</div>
                <div class="fos-nut">
                    <span>${n.kcal.toFixed(0)} kcal</span>
                    <span>P ${n.protein_g.toFixed(1)}</span>
                    <span>C ${n.carbs_g.toFixed(1)}</span>
                    <span>F ${n.fat_g.toFixed(1)}</span>
                    <span class="fos-dim">per 100 g</span>
                </div>
            </div>
            <div class="fos-cat">
                <select data-cat></select>
                <button type="button" class="primary" data-act="import">Import</button>
            </div>
        `;
        row.querySelector('.fos-title').textContent = p.name;
        row.querySelector('.fos-meta').textContent = [p.brand, p.code].filter(Boolean).join(' · ');
        const catSel = row.querySelector('[data-cat]');
        fillCategories(catSel, 'food');
        row.querySelector('[data-act="import"]').addEventListener('click', async () => {
            try {
                const catId = catSel.value || null;
                const item = offToFoodItem(p, catId);
                await repos.foodItems.put(item);
                DrawUI.toast(`Added "${item.name}" to library`, 'success').showIn(document.body);
            } catch (err) {
                DrawUI.toast(`Import failed: ${err.message}`, 'error').showIn(document.body);
            }
        });
        return row;
    }

    function renderMealResult(m) {
        const row = document.createElement('div');
        row.className = 'fos-row';
        row.innerHTML = `
            <div class="fos-thumb">${m.imageUrl ? `<img src="${escapeAttr(m.imageUrl)}" alt="" loading="lazy">` : '🍽'}</div>
            <div class="fos-info">
                <div class="fos-title"></div>
                <div class="fos-meta"></div>
                <div class="fos-ing" data-ing></div>
            </div>
            <div class="fos-cat">
                <select data-cat></select>
                <label class="fos-dim" style="display:flex;align-items:center;gap:0.25rem;font-size:0.75rem;"><input type="checkbox" data-auto checked> auto-create missing foods</label>
                <button type="button" class="primary" data-act="import">Import recipe</button>
            </div>
        `;
        row.querySelector('.fos-title').textContent = m.name;
        row.querySelector('.fos-meta').textContent = [m.category, m.area, ...(m.tags || [])].filter(Boolean).join(' · ');
        const ingEl = row.querySelector('[data-ing]');
        ingEl.textContent = m.ingredients.map((i) => `${i.measure} ${i.name}`).join(', ');
        const catSel = row.querySelector('[data-cat]');
        fillCategories(catSel, 'meal');
        row.querySelector('[data-act="import"]').addEventListener('click', async () => {
            try {
                const catId = catSel.value || null;
                const autoCreate = row.querySelector('[data-auto]').checked;
                await importMealAsRecipe(m, catId, autoCreate);
                DrawUI.toast(`Added recipe "${m.name}"`, 'success').showIn(document.body);
            } catch (err) {
                console.error('[meal import]', err);
                DrawUI.toast(`Import failed: ${err.message}`, 'error').showIn(document.body);
            }
        });
        return row;
    }

    function fillCategories(sel, kind) {
        sel.innerHTML = '';
        const blank = document.createElement('option');
        blank.value = ''; blank.textContent = '— Category —';
        sel.appendChild(blank);
        for (const c of categories.filter((c) => c.kind === kind)) {
            const o = document.createElement('option');
            o.value = c.id;
            o.textContent = `${c.icon || ''} ${c.name}`.trim();
            sel.appendChild(o);
        }
    }

    async function importMealAsRecipe(meal, categoryId, autoCreate) {
        const allFoods = await repos.foodItems.list();
        const foodCategories = categories.filter((c) => c.kind === 'food');
        const result = await sharedImportMeal({
            meal,
            categoryId,
            foodCategories,
            existingFoods: allFoods,
            autoCreate,
            onProgress: (name, i, total) => {
                statusEl.textContent = `Resolving "${name}" (${i}/${total})…`;
            },
        });
        statusEl.textContent = `Imported ${result.resolved} ingredient(s)`;
        return result.recipe;
    }

    function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

    const panel = DrawUI.floatingPanel({ title: 'Search online', closable: true });
    panel.content.appendChild(host);
    panel.show(document.body);
    if (panel.dom) {
        panel.dom.style.width = '720px';
        panel.dom.style.height = '560px';
    }
    qEl.focus();
    return panel;
}
