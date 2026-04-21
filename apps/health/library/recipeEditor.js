import { DrawUI } from '../../../shared/drawUI/index.js';
import * as repos from '../store/repos.js';
import { STRINGS } from '../strings.js';
import { recipeTotals } from '../nutrition/calc.js';

const kcalFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const gFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

/**
 * @param {{ recipe?:any, foodItems:Array, categories:Array, onSaved?:Function }} opts
 */
export function openRecipeEditor({ recipe, foodItems, categories, onSaved }) {
    const editing = !!recipe;
    const foodItemsById = Object.fromEntries(foodItems.map((f) => [f.id, f]));
    const state = {
        id: recipe?.id,
        name: recipe?.name || '',
        categoryId: recipe?.categoryId || '',
        servings: recipe?.servings || 1,
        description: recipe?.description || '',
        instructions: recipe?.instructions || '',
        tags: (recipe?.tags || []).join(', '),
        ingredients: (recipe?.ingredients || []).map((i) => ({ ...i })),
        source: recipe?.source || null,
        cuisine: recipe?.cuisine || null,
        difficulty: recipe?.difficulty || null,
        prepTimeMin: recipe?.prepTimeMin ?? null,
        cookTimeMin: recipe?.cookTimeMin ?? null,
        totalYieldG: recipe?.totalYieldG ?? null,
        imageBlobKey: recipe?.imageBlobKey || null,
    };

    const form = document.createElement('form');
    form.className = 'health-editor-form';
    form.innerHTML = `
        ${renderSourceHeader(state.source)}
        <label>${STRINGS.name} <input name="name" required></label>
        <div class="health-editor-grid2">
            <label>${STRINGS.category}
                <select name="categoryId">
                    <option value="">—</option>
                    ${categories.filter((c) => c.kind === 'meal').map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
                </select>
            </label>
            <label>${STRINGS.servings} <input name="servings" type="number" min="1" step="1"></label>
        </div>
        <label>${STRINGS.description} <textarea name="description" rows="2"></textarea></label>
        <label>${STRINGS.instructions} <textarea name="instructions" rows="4"></textarea></label>
        <label>Tags (comma-separated) <input name="tags"></label>

        <fieldset style="border:1px solid var(--health-border); border-radius:6px; padding:0.5rem;">
            <legend style="padding:0 0.35rem; font-size:0.8rem; color:var(--health-text-dim);">${STRINGS.ingredients}</legend>
            <div class="health-ingredients-table" data-ingredients></div>
            <button type="button" data-act="add-ingredient" style="margin-top:0.4rem;">${STRINGS.addIngredient}</button>
        </fieldset>

        <div class="health-summary" data-totals></div>

        <div class="health-editor-actions">
            ${editing ? `<button type="button" data-act="delete" style="margin-right:auto; color:#e06666;">${STRINGS.delete}</button>` : ''}
            <button type="button" data-act="cancel">${STRINGS.cancel}</button>
            <button type="submit" class="primary">${STRINGS.save}</button>
        </div>
    `;
    form.name.value = state.name;
    form.categoryId.value = state.categoryId;
    form.servings.value = state.servings;
    form.description.value = state.description;
    form.instructions.value = state.instructions;
    form.tags.value = state.tags;

    const ingredientsHost = form.querySelector('[data-ingredients]');
    const totalsEl = form.querySelector('[data-totals]');

    function renderIngredients() {
        ingredientsHost.innerHTML = '';
        state.ingredients.forEach((ing, idx) => {
            const row = document.createElement('div');
            row.className = 'health-ingredient-row';
            row.innerHTML = `
                <select data-k="foodItemId">
                    <option value="">— Select food —</option>
                    ${foodItems.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}
                </select>
                <input type="number" step="0.1" min="0" data-k="amountG" placeholder="grams">
                <label title="Optional" style="flex-direction:row; align-items:center; gap:0.15rem; font-size:0.75rem;">
                    <input type="checkbox" data-k="optional"> opt
                </label>
                <button type="button" data-act="del" aria-label="Remove ingredient">✕</button>
            `;
            row.querySelector('[data-k="foodItemId"]').value = ing.foodItemId || '';
            row.querySelector('[data-k="amountG"]').value = ing.amountG || '';
            row.querySelector('[data-k="optional"]').checked = !!ing.optional;

            row.addEventListener('input', (e) => {
                const k = e.target.dataset.k;
                if (!k) return;
                if (k === 'optional') ing.optional = e.target.checked;
                else if (k === 'amountG') ing.amountG = Number(e.target.value) || 0;
                else ing[k] = e.target.value;
                updateTotals();
            });
            row.querySelector('[data-act="del"]').addEventListener('click', () => {
                state.ingredients.splice(idx, 1);
                renderIngredients();
                updateTotals();
            });
            ingredientsHost.appendChild(row);
        });
    }

    function updateTotals() {
        const servings = Math.max(1, Number(form.servings.value) || 1);
        const { total, perServing, weightG } = recipeTotals({ ingredients: state.ingredients, servings }, foodItemsById);
        totalsEl.innerHTML = `
            <div class="health-summary-kv"><span class="health-summary-k">${STRINGS.total} kcal</span><span class="health-summary-v">${kcalFmt.format(total.kcal)}</span></div>
            <div class="health-summary-kv"><span class="health-summary-k">${STRINGS.perServing}</span><span class="health-summary-v">${kcalFmt.format(perServing.kcal)} kcal</span></div>
            <div class="health-summary-kv"><span class="health-summary-k">P / C / F</span><span class="health-summary-v">${gFmt.format(perServing.protein_g)} / ${gFmt.format(perServing.carbs_g)} / ${gFmt.format(perServing.fat_g)}</span></div>
            <div class="health-summary-kv"><span class="health-summary-k">Weight</span><span class="health-summary-v">${gFmt.format(weightG)} g</span></div>
        `;
    }

    form.querySelector('[data-act="add-ingredient"]').addEventListener('click', () => {
        state.ingredients.push({ foodItemId: '', amountG: 0, optional: false, note: null, group: null });
        renderIngredients();
    });
    form.servings.addEventListener('input', updateTotals);

    renderIngredients();
    updateTotals();

    const panel = DrawUI.floatingPanel({ title: editing ? 'Edit recipe' : 'New recipe', closable: true });
    panel.content.appendChild(form);
    panel.show(document.body);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saved = await repos.recipes.put({
            id: state.id,
            name: form.name.value.trim(),
            categoryId: form.categoryId.value || null,
            servings: Math.max(1, Number(form.servings.value) || 1),
            description: form.description.value,
            instructions: form.instructions.value,
            tags: form.tags.value.split(',').map((s) => s.trim()).filter(Boolean),
            ingredients: state.ingredients.filter((i) => i.foodItemId && i.amountG > 0),
            // Preserve provenance (image URL, source link, provider) across edits.
            source: state.source || undefined,
            cuisine: state.cuisine,
            difficulty: state.difficulty,
            prepTimeMin: state.prepTimeMin,
            cookTimeMin: state.cookTimeMin,
            totalYieldG: state.totalYieldG,
            imageBlobKey: state.imageBlobKey,
        });
        panel.close();
        onSaved?.(saved);
    });
    form.querySelector('[data-act="cancel"]').addEventListener('click', () => panel.close());
    const delBtn = form.querySelector('[data-act="delete"]');
    if (delBtn) {
        delBtn.addEventListener('click', async () => {
            if (!confirm(STRINGS.confirmDelete(state.name))) return;
            await repos.recipes.remove(state.id);
            panel.close();
            onSaved?.(null);
        });
    }
}

function renderSourceHeader(source) {
    if (!source || (!source.imageUrl && !source.url && !source.externalId && !source.provider)) return '';
    const img = source.imageUrl
        ? `<a class="health-source-thumb" href="${escapeAttr(source.imageUrl)}" target="_blank" rel="noopener"><img src="${escapeAttr(source.imageUrl)}" alt="" loading="lazy"></a>`
        : '<div class="health-source-thumb health-source-thumb--empty">🍽</div>';
    const rows = [];
    if (source.provider) rows.push(['Source', escapeHtml(String(source.provider))]);
    if (source.externalId) rows.push(['ID', escapeHtml(String(source.externalId))]);
    if (source.url) rows.push(['Link', `<a href="${escapeAttr(source.url)}" target="_blank" rel="noopener">Open</a>`]);
    const body = rows.map(([k, v]) => `<div class="health-source-row"><span class="health-source-k">${k}</span><span class="health-source-v">${v}</span></div>`).join('');
    return `<div class="health-source-card">${img}<div class="health-source-meta">${body}</div></div>`;
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
