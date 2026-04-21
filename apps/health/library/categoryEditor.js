import { DrawUI } from '../../../shared/drawUI/index.js';
import * as repos from '../store/repos.js';
import { STRINGS } from '../strings.js';

function cloneMeal(cat) {
    return {
        id: cat.id || null,
        name: cat.name || '',
        icon: cat.icon || '🍽',
        color: cat.color || '#d4af37',
        sortOrder: Number(cat.sortOrder) || 0,
    };
}

function toCleanRows(rows) {
    return rows
        .map((row, idx) => ({
            id: row.id || undefined,
            name: String(row.name || '').trim(),
            icon: String(row.icon || '🍽').trim() || '🍽',
            color: String(row.color || '#d4af37').trim() || '#d4af37',
            sortOrder: idx,
        }))
        .filter((row) => row.name.length > 0);
}

export function openMealTemplateEditor({ mealCategories, onSaved } = {}) {
    const rows = (mealCategories || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map(cloneMeal);

    const form = document.createElement('form');
    form.className = 'health-editor-form';
    form.innerHTML = `
        <p class="health-template-note">Edit day meal slots. Every row appears each day as a single drop area where you can add multiple foods or recipes.</p>
        <div class="health-template-list" data-rows></div>
        <button type="button" data-act="add-meal">+ Add meal slot</button>
        <div class="health-editor-actions">
            <button type="button" data-act="cancel">${STRINGS.cancel}</button>
            <button type="submit" class="primary">${STRINGS.save}</button>
        </div>
    `;

    const rowsEl = form.querySelector('[data-rows]');

    function renderRows() {
        rowsEl.innerHTML = '';
        rows.forEach((row, index) => {
            const item = document.createElement('div');
            item.className = 'health-template-row';
            item.innerHTML = `
                <input data-k="name" type="text" placeholder="Meal name" value="${escapeAttr(row.name)}" required>
                <input data-k="icon" type="text" maxlength="3" value="${escapeAttr(row.icon)}" title="Icon / emoji">
                <input data-k="color" type="color" value="${escapeAttr(row.color)}" title="Color">
                <button type="button" data-act="up" aria-label="Move up">↑</button>
                <button type="button" data-act="down" aria-label="Move down">↓</button>
                <button type="button" data-act="remove" aria-label="Remove">✕</button>
            `;
            item.querySelector('[data-k="name"]').addEventListener('input', (e) => { row.name = e.target.value; });
            item.querySelector('[data-k="icon"]').addEventListener('input', (e) => { row.icon = e.target.value; });
            item.querySelector('[data-k="color"]').addEventListener('input', (e) => { row.color = e.target.value; });
            item.querySelector('[data-act="up"]').addEventListener('click', () => {
                if (index <= 0) return;
                const cur = rows[index];
                rows[index] = rows[index - 1];
                rows[index - 1] = cur;
                renderRows();
            });
            item.querySelector('[data-act="down"]').addEventListener('click', () => {
                if (index >= rows.length - 1) return;
                const cur = rows[index];
                rows[index] = rows[index + 1];
                rows[index + 1] = cur;
                renderRows();
            });
            item.querySelector('[data-act="remove"]').addEventListener('click', () => {
                rows.splice(index, 1);
                renderRows();
            });
            rowsEl.appendChild(item);
        });
    }

    form.querySelector('[data-act="add-meal"]').addEventListener('click', () => {
        rows.push({ id: null, name: '', icon: '🍽', color: '#d4af37', sortOrder: rows.length });
        renderRows();
    });

    const panel = DrawUI.floatingPanel({ title: STRINGS.mealTemplate, closable: true });
    panel.content.appendChild(form);
    panel.show(document.body);

    form.querySelector('[data-act="cancel"]').addEventListener('click', () => panel.close());

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nextRows = toCleanRows(rows);
        if (nextRows.length === 0) {
            DrawUI.toast('Add at least one meal slot.', 'warning').showIn(document.body);
            return;
        }

        const existingMeals = await repos.categories.listByKind('meal');
        const nextIds = new Set(nextRows.map((r) => r.id).filter(Boolean));
        const removed = existingMeals.filter((cat) => !nextIds.has(cat.id));

        if (removed.length > 0) {
            const allEntries = await repos.plan.listByRange('0000-01-01', '9999-12-31');
            const allRecipes = await repos.recipes.list();
            const removedIds = new Set(removed.map((c) => c.id));
            const affectedEntries = allEntries.filter((entry) => removedIds.has(entry.mealCategoryId));
            const affectedRecipes = allRecipes.filter((recipe) => removedIds.has(recipe.categoryId));
            const msg = [
                `Remove ${removed.length} meal slot(s)?`,
                `${affectedEntries.length} planned item(s) will be deleted.`,
                `${affectedRecipes.length} recipe category assignment(s) will be cleared.`,
            ].join('\n');
            if (!confirm(msg)) return;

            for (const recipe of affectedRecipes) {
                await repos.recipes.put({ ...recipe, categoryId: null });
            }
            for (const entry of affectedEntries) {
                await repos.plan.remove(entry.id);
            }
            for (const cat of removed) {
                await repos.categories.remove(cat.id);
            }
        }

        for (let i = 0; i < nextRows.length; i++) {
            const row = nextRows[i];
            await repos.categories.put({
                id: row.id,
                name: row.name,
                kind: 'meal',
                icon: row.icon,
                color: row.color,
                sortOrder: i,
            });
        }

        panel.close();
        onSaved?.();
    });

    renderRows();
}

function escapeAttr(value) {
    return String(value || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
