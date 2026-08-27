import { libraryChip } from '../planner/planChip.js';
import { openFoodEditor } from './foodEditor.js';
import { openRecipeEditor } from './recipeEditor.js';
import { STRINGS } from '../strings.js';

/**
 * Build the left-hand library browser used by the meal planner and the
 * Library workspace. Setup actions live in the Library section; this panel
 * is for searching, editing, and dragging items.
 * @param {{ getState: () => { foodItems:Array, recipes:Array, categories:Array, menus?:Array, selectedMenuId?:string|null }, onMenuChange?: (menuId:string) => void, showMenuPicker?: boolean }} opts
 */
export function createLibraryPanel({ getState, onMenuChange, showMenuPicker = true } = {}) {
    const root = document.createElement('div');
    root.className = 'health-library';

    const collapsedCats = new Set();
    // Track which category IDs we have already seen so we can default new ones
    // to collapsed on first render without forcing them closed again if the
    // user later expands them.
    const seenCats = new Set();

    root.innerHTML = `
        <div class="health-library-header">
            ${showMenuPicker ? `
            <label class="health-library-menu-picker">
                <span>Menu</span>
                <select data-menu aria-label="Choose a menu or full library">
                    <option value="">${STRINGS.fullLibrary}</option>
                </select>
            </label>` : ''}
            <input type="search" placeholder="${STRINGS.search}" class="health-library-search" style="background:rgba(0,0,0,0.3); border:1px solid var(--health-border); color:var(--health-text); border-radius:4px; padding:0.35rem 0.5rem; font:inherit;">
        </div>
        <div class="health-library-scroll" data-body></div>
        <div class="health-library-footer">
            <span data-count></span>
        </div>
    `;

    const searchInput = root.querySelector('.health-library-search');
    const menuSelect = root.querySelector('[data-menu]');
    const body = root.querySelector('[data-body]');
    const countEl = root.querySelector('[data-count]');

    let query = '';
    let debounceTimer = null;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const v = e.target.value;
        debounceTimer = setTimeout(() => { query = v; render(); }, 120);
    });

    menuSelect?.addEventListener('change', () => {
        onMenuChange?.(menuSelect.value || '');
    });

    function filterByQuery(items, q) {
        if (!q) return items;
        const needle = q.toLowerCase();
        return items.filter((it) => (it.name || '').toLowerCase().includes(needle) || (it.tags || []).some((t) => String(t).toLowerCase().includes(needle)));
    }

    function filterByMenu(items, ids) {
        if (!ids) return items;
        const set = new Set(ids);
        return items.filter((it) => set.has(it.id));
    }

    function syncMenuSelect(menus, selectedMenuId) {
        const current = selectedMenuId || '';
        const options = [
            `<option value="">${STRINGS.fullLibrary}</option>`,
            ...(menus || []).map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`),
        ];
        menuSelect.innerHTML = options.join('');
        menuSelect.value = (menus || []).some((m) => m.id === current) ? current : '';
    }

    function render() {
        const { foodItems, recipes, categories, menus, selectedMenuId } = getState();
        body.innerHTML = '';
        if (showMenuPicker) syncMenuSelect(menus, selectedMenuId);

        const menu = showMenuPicker
            ? ((menus || []).find((m) => m.id === selectedMenuId) || null)
            : null;
        const scopedFoods = menu ? filterByMenu(foodItems, menu.foodItemIds) : foodItems;
        const scopedRecipes = menu ? filterByMenu(recipes, menu.recipeIds) : recipes;

        const filteredFoods = filterByQuery(scopedFoods, query);
        const filteredRecipes = filterByQuery(scopedRecipes, query);
        const foodItemsById = Object.fromEntries(foodItems.map((f) => [f.id, f]));
        const hideEmptyCats = Boolean(query || menu);

        if (menu) {
            countEl.textContent = `${filteredFoods.length} foods · ${filteredRecipes.length} recipes · ${menu.name}`;
        } else {
            countEl.textContent = `${foodItems.length} foods · ${recipes.length} recipes`;
        }

        if (scopedFoods.length === 0 && scopedRecipes.length === 0) {
            const empty = document.createElement('div');
            empty.style.padding = '1rem';
            empty.style.color = 'var(--health-text-dim)';
            empty.style.fontSize = '0.85rem';
            empty.style.textAlign = 'center';
            empty.textContent = menu
                ? 'This menu is empty. Add foods and recipes to it in the Library.'
                : STRINGS.emptyLibrary;
            body.appendChild(empty);
            return;
        }

        const mealCats = categories.filter((c) => c.kind === 'meal');
        const foodCats = categories.filter((c) => c.kind === 'food');

        const recipesSection = renderGroup('Recipes', '📖', filteredRecipes, mealCats, 'recipe', foodItemsById, hideEmptyCats);
        if (recipesSection) body.appendChild(recipesSection);

        const foodsSection = renderGroup('Foods', '🥕', filteredFoods, foodCats, 'food', foodItemsById, hideEmptyCats);
        if (foodsSection) body.appendChild(foodsSection);
    }

    function renderGroup(title, icon, items, categoriesForGroup, kind, foodItemsById, hideEmptyCats) {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '0.75rem';
        const heading = document.createElement('div');
        heading.style.fontSize = '0.75rem';
        heading.style.color = 'var(--health-text-dim)';
        heading.style.textTransform = 'uppercase';
        heading.style.letterSpacing = '0.08em';
        heading.style.padding = '0.25rem 0.25rem';
        heading.textContent = `${icon} ${title}`;
        wrapper.appendChild(heading);

        const uncategorized = items.filter((it) => !it.categoryId);
        const byCat = new Map();
        for (const cat of categoriesForGroup) byCat.set(cat.id, []);
        for (const it of items) {
            if (it.categoryId && byCat.has(it.categoryId)) byCat.get(it.categoryId).push(it);
        }

        for (const cat of categoriesForGroup) {
            const catItems = byCat.get(cat.id) || [];
            if (hideEmptyCats && catItems.length === 0) continue;
            wrapper.appendChild(renderCategoryBlock(cat, catItems, kind, foodItemsById));
        }
        if (uncategorized.length > 0) {
            wrapper.appendChild(renderCategoryBlock({ id: `_uncat_${kind}`, name: 'Uncategorized', color: null, icon: '◦' }, uncategorized, kind, foodItemsById));
        }
        return wrapper;
    }

    function renderCategoryBlock(cat, items, kind, foodItemsById) {
        // Default new categories to collapsed on first sighting.
        if (!seenCats.has(cat.id)) {
            seenCats.add(cat.id);
            collapsedCats.add(cat.id);
        }
        const block = document.createElement('div');
        block.className = 'health-cat';
        if (collapsedCats.has(cat.id)) block.classList.add('collapsed');

        const header = document.createElement('div');
        header.className = 'health-cat-header';
        header.innerHTML = `
            <span class="health-cat-swatch" style="background:${cat.color || 'var(--health-accent)'}"></span>
            <span class="health-cat-name"></span>
            <span class="health-cat-count"></span>
            <span class="health-cat-chevron">▾</span>
        `;
        header.querySelector('.health-cat-name').textContent = `${cat.icon || ''} ${cat.name}`.trim();
        header.querySelector('.health-cat-count').textContent = String(items.length);
        header.addEventListener('click', () => {
            if (collapsedCats.has(cat.id)) collapsedCats.delete(cat.id);
            else collapsedCats.add(cat.id);
            block.classList.toggle('collapsed');
        });
        block.appendChild(header);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'health-cat-body';
        const { categories: cats, foodItems } = getState();
        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.style.fontSize = '0.72rem';
            empty.style.color = 'var(--health-text-dim)';
            empty.textContent = STRINGS.noItems;
            bodyEl.appendChild(empty);
        }
        for (const item of items) {
            const chip = libraryChip({
                kind,
                item,
                foodItemsById,
                onClick: (it) => {
                    if (kind === 'food') openFoodEditor({ item: it, categories: cats });
                    else openRecipeEditor({ recipe: it, categories: cats, foodItems });
                },
            });
            bodyEl.appendChild(chip);
        }
        block.appendChild(bodyEl);
        return block;
    }

    return {
        root,
        render,
        focusSearch() {
            searchInput.focus();
            searchInput.select();
        },
    };
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[ch]));
}
