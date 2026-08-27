import { makeDropTarget } from '../planner/dragdrop.js?v=20260421';
import { libraryChip } from '../planner/planChip.js';
import { openFoodEditor } from './foodEditor.js';
import { openRecipeEditor } from './recipeEditor.js';
import * as repos from '../store/repos.js';
import { DrawUI } from '../../../shared/drawUI/index.js';
import { STRINGS } from '../strings.js';

function uniqueIds(ids) {
    const seen = new Set();
    const out = [];
    for (const raw of ids || []) {
        const id = String(raw || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

/**
 * Main-canvas editor for one menu: name, drop target, and chips that can be
 * removed the same way plan items leave a meal slot.
 */
export function createMenuCanvas() {
    const root = document.createElement('div');
    root.className = 'health-menu-canvas';
    root.setAttribute('aria-label', 'Menu contents');

    const empty = document.createElement('div');
    empty.className = 'health-library-review-empty';
    empty.textContent = 'Select a menu on the left, or create one, then drag foods and recipes into it.';

    const editor = document.createElement('div');
    editor.className = 'health-menu-canvas-editor';
    editor.hidden = true;
    editor.innerHTML = `
        <div class="health-menu-canvas-head">
            <input type="text" data-name maxlength="80" placeholder="Menu name" aria-label="Menu name">
            <span class="health-menu-canvas-count" data-count></span>
            <button type="button" data-act="delete" style="margin-left:auto; color:#e06666;">${STRINGS.delete}</button>
        </div>
        <p class="health-template-note">Drag foods and recipes from the library browser. Drag a chip out, or use ✕, to remove it.</p>
        <div class="health-slot health-menu-drop" data-drop></div>
    `;

    root.append(empty, editor);

    const nameInput = editor.querySelector('[data-name]');
    const countEl = editor.querySelector('[data-count]');
    const drop = editor.querySelector('[data-drop]');
    const deleteBtn = editor.querySelector('[data-act="delete"]');

    let ctx = {
        menu: null,
        foodItems: [],
        recipes: [],
        categories: [],
    };
    let nameTimer = null;

    makeDropTarget(drop, async (payload) => {
        const menu = ctx.menu;
        if (!menu) return;
        if (payload.kind === 'library-food' && payload.foodItemId) {
            await addItem('food', payload.foodItemId);
        } else if (payload.kind === 'library-recipe' && payload.recipeId) {
            await addItem('recipe', payload.recipeId);
        }
    });

    async function addItem(kind, id) {
        const menu = await repos.menus.get(ctx.menu?.id);
        if (!menu) return;
        const key = kind === 'food' ? 'foodItemIds' : 'recipeIds';
        const ids = uniqueIds(menu[key]);
        if (ids.includes(id)) return;
        await repos.menus.put({ ...menu, [key]: [...ids, id] });
    }

    async function removeItem(kind, id) {
        const menu = await repos.menus.get(ctx.menu?.id);
        if (!menu) return;
        const key = kind === 'food' ? 'foodItemIds' : 'recipeIds';
        await repos.menus.put({
            ...menu,
            [key]: uniqueIds(menu[key]).filter((x) => x !== id),
        });
    }

    async function persistName() {
        const menu = ctx.menu;
        if (!menu) return;
        const name = nameInput.value.trim() || 'Untitled menu';
        if (name === menu.name) return;
        await repos.menus.put({ ...menu, name });
    }

    nameInput.addEventListener('input', () => {
        clearTimeout(nameTimer);
        nameTimer = setTimeout(() => {
            persistName().catch((err) => console.error('[health-menu] rename failed', err));
        }, 400);
    });
    nameInput.addEventListener('blur', () => {
        clearTimeout(nameTimer);
        persistName().catch((err) => console.error('[health-menu] rename failed', err));
    });

    deleteBtn.addEventListener('click', async () => {
        const menu = ctx.menu;
        if (!menu) return;
        if (!confirm(STRINGS.confirmDelete(menu.name))) return;
        try {
            await repos.menus.remove(menu.id);
        } catch (err) {
            console.error('[health-menu]', err);
            DrawUI.toast(`Delete failed: ${err.message}`, 'error').showIn(document.body);
        }
    });

    function renderGroup(title, icon, kind, items, foodItemsById) {
        if (items.length === 0) return null;
        const wrap = document.createElement('div');
        wrap.className = 'health-menu-drop-group';
        const heading = document.createElement('div');
        heading.className = 'health-menu-drop-heading';
        heading.textContent = `${icon} ${title}`;
        wrap.appendChild(heading);
        for (const item of items) {
            const row = document.createElement('div');
            row.className = 'health-menu-item';
            const chip = libraryChip({
                kind,
                item,
                foodItemsById,
                onClick: (it) => {
                    if (kind === 'food') openFoodEditor({ item: it, categories: ctx.categories });
                    else openRecipeEditor({ recipe: it, categories: ctx.categories, foodItems: ctx.foodItems });
                },
            });
            makeDraggableMenuItem(chip, kind, item, () => removeItem(kind, item.id));
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'health-menu-item-remove';
            remove.setAttribute('aria-label', `Remove ${item.name} from menu`);
            remove.textContent = '✕';
            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                removeItem(kind, item.id).catch((err) => console.error('[health-menu] remove failed', err));
            });
            row.append(chip, remove);
            wrap.appendChild(row);
        }
        return wrap;
    }

    function render({ menu, foodItems, recipes, categories }) {
        ctx = {
            menu: menu || null,
            foodItems: foodItems || [],
            recipes: recipes || [],
            categories: categories || [],
        };

        if (!menu) {
            editor.hidden = true;
            empty.hidden = false;
            drop.innerHTML = '';
            return;
        }

        empty.hidden = true;
        editor.hidden = false;
        if (document.activeElement !== nameInput) nameInput.value = menu.name || '';

        const foodById = Object.fromEntries((foodItems || []).map((f) => [f.id, f]));
        const recipeById = Object.fromEntries((recipes || []).map((r) => [r.id, r]));
        const menuFoods = uniqueIds(menu.foodItemIds).map((id) => foodById[id]).filter(Boolean);
        const menuRecipes = uniqueIds(menu.recipeIds).map((id) => recipeById[id]).filter(Boolean);

        countEl.textContent = `${menuFoods.length} foods · ${menuRecipes.length} recipes`;

        drop.innerHTML = '';
        const hasItems = menuFoods.length > 0 || menuRecipes.length > 0;
        drop.classList.toggle('health-slot--empty', !hasItems);
        if (!hasItems) {
            const hint = document.createElement('div');
            hint.className = 'health-slot-empty-text';
            hint.textContent = STRINGS.dropHere;
            drop.appendChild(hint);
        } else {
            const recs = renderGroup('Recipes', '📖', 'recipe', menuRecipes, foodById);
            const foods = renderGroup('Foods', '🥕', 'food', menuFoods, foodById);
            if (recs) drop.appendChild(recs);
            if (foods) drop.appendChild(foods);
        }
    }

    return {
        root,
        render,
        focusName() {
            if (editor.hidden) return;
            nameInput.focus();
            nameInput.select();
        },
    };
}

function makeDraggableMenuItem(chip, kind, item, onRemove) {
    chip.addEventListener('dragend', (event) => {
        const dropEffect = event.dataTransfer?.dropEffect || 'none';
        if (dropEffect !== 'none') return;
        const x = event.clientX;
        const y = event.clientY;
        const endTarget = Number.isFinite(x) && Number.isFinite(y)
            ? document.elementFromPoint(x, y)
            : null;
        if (endTarget?.closest?.('.health-menu-drop')) return;
        onRemove();
    });
}
