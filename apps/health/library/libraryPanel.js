import { libraryChip } from '../planner/planChip.js';
import { openFoodEditor } from './foodEditor.js';
import { openRecipeEditor } from './recipeEditor.js';
import { openOnlineSearch } from './onlineSearch.js';
import * as repos from '../store/repos.js';
import * as io from '../store/io.js';
import { seedTemplates } from '../seed/templateSeeder.js';
import { DrawUI } from '../../../shared/drawUI/index.js';
import { STRINGS } from '../strings.js';

/**
 * Build the left-hand library panel.
 * @param {{ getState: () => { foodItems:Array, recipes:Array, categories:Array } }} opts
 */
export function createLibraryPanel({ getState }) {
    const root = document.createElement('div');
    root.className = 'health-library';

    const collapsedCats = new Set();
    // Track which category IDs we have already seen so we can default new ones
    // to collapsed on first render without forcing them closed again if the
    // user later expands them.
    const seenCats = new Set();

    root.innerHTML = `
        <div class="health-library-header">
            <input type="search" placeholder="${STRINGS.search}" class="health-library-search" style="background:rgba(0,0,0,0.3); border:1px solid var(--health-border); color:var(--health-text); border-radius:4px; padding:0.35rem 0.5rem; font:inherit;">
            <div class="health-library-actions">
                <button type="button" data-act="add-food" class="primary">${STRINGS.addFood}</button>
                <button type="button" data-act="add-recipe" class="primary">${STRINGS.addRecipe}</button>
                <button type="button" data-act="online" title="Search TheMealDB and Open Food Facts">🌐 Online</button>
                <button type="button" data-act="restore-templates" title="Re-seed bundled recipe templates">✨ Templates</button>
                <button type="button" data-act="import">${STRINGS.import}</button>
                <button type="button" data-act="export">${STRINGS.export}</button>
            </div>
        </div>
        <div class="health-library-scroll" data-body></div>
        <div class="health-library-footer">
            <span data-count></span>
        </div>
    `;

    const searchInput = root.querySelector('.health-library-search');
    const body = root.querySelector('[data-body]');
    const countEl = root.querySelector('[data-count]');

    let query = '';
    let debounceTimer = null;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const v = e.target.value;
        debounceTimer = setTimeout(() => { query = v; render(); }, 120);
    });

    root.querySelector('[data-act="add-food"]').addEventListener('click', () => {
        const { categories } = getState();
        openFoodEditor({ categories });
    });
    root.querySelector('[data-act="add-recipe"]').addEventListener('click', () => {
        const { categories, foodItems } = getState();
        if (foodItems.length === 0) {
            DrawUI.toast('Add some foods first so recipes have ingredients.', 'warning').showIn(document.body);
            return;
        }
        openRecipeEditor({ categories, foodItems });
    });
    root.querySelector('[data-act="online"]').addEventListener('click', () => {
        const { categories, foodItems } = getState();
        openOnlineSearch({ categories, foodItems });
    });
    root.querySelector('[data-act="restore-templates"]').addEventListener('click', async () => {
        if (!confirm('Re-seed bundled recipe templates? Existing templates with the same name will be skipped.')) return;
        try {
            const result = await seedTemplates({ force: true });
            DrawUI.toast(
                result.seeded > 0
                    ? `Added ${result.seeded} template recipe(s)`
                    : 'No new templates to add',
                'success',
            ).showIn(document.body);
        } catch (err) {
            console.error('[food templates]', err);
            DrawUI.toast(`Templates failed: ${err.message}`, 'error').showIn(document.body);
        }
    });
    root.querySelector('[data-act="import"]').addEventListener('click', async () => {
        try {
            const payload = await io.pickJsonFile();
            if (!payload) return;
            const strategy = prompt('Import strategy: type "replace", "merge-imported", or "merge-local".', 'merge-imported');
            if (!strategy) return;
            const allowed = ['replace', 'merge-imported', 'merge-local'];
            if (!allowed.includes(strategy)) {
                DrawUI.toast('Invalid import strategy', 'error').showIn(document.body);
                return;
            }
            const stats = await io.importPayload(payload, strategy);
            const total = (stats.categories + stats.foodItems + stats.recipes + stats.planEntries);
            DrawUI.toast(STRINGS.importSuccess(total), 'success').showIn(document.body);
        } catch (err) {
            console.error('[food import]', err);
            DrawUI.toast(`Import failed: ${err.message}`, 'error').showIn(document.body);
        }
    });
    root.querySelector('[data-act="export"]').addEventListener('click', async () => {
        try {
            const payload = await io.exportJson();
            io.downloadJson(payload);
            DrawUI.toast(STRINGS.exportSuccess, 'success').showIn(document.body);
        } catch (err) {
            console.error('[food export]', err);
            DrawUI.toast(`Export failed: ${err.message}`, 'error').showIn(document.body);
        }
    });

    function filterByQuery(items, q) {
        if (!q) return items;
        const needle = q.toLowerCase();
        return items.filter((it) => (it.name || '').toLowerCase().includes(needle) || (it.tags || []).some((t) => String(t).toLowerCase().includes(needle)));
    }

    function render() {
        const { foodItems, recipes, categories } = getState();
        body.innerHTML = '';

        const filteredFoods = filterByQuery(foodItems, query);
        const filteredRecipes = filterByQuery(recipes, query);
        const foodItemsById = Object.fromEntries(foodItems.map((f) => [f.id, f]));

        countEl.textContent = `${foodItems.length} foods · ${recipes.length} recipes`;

        if (foodItems.length === 0 && recipes.length === 0) {
            const empty = document.createElement('div');
            empty.style.padding = '1rem';
            empty.style.color = 'var(--health-text-dim)';
            empty.style.fontSize = '0.85rem';
            empty.style.textAlign = 'center';
            empty.textContent = STRINGS.emptyLibrary;
            body.appendChild(empty);
            return;
        }

        // Meal Recipes group (recipes)
        const mealCats = categories.filter((c) => c.kind === 'meal');
        const foodCats = categories.filter((c) => c.kind === 'food');

        const recipesSection = renderGroup('Recipes', '📖', filteredRecipes, mealCats, 'recipe', foodItemsById);
        if (recipesSection) body.appendChild(recipesSection);

        const foodsSection = renderGroup('Foods', '🥕', filteredFoods, foodCats, 'food', foodItemsById);
        if (foodsSection) body.appendChild(foodsSection);
    }

    function renderGroup(title, icon, items, categoriesForGroup, kind, foodItemsById) {
        if (items.length === 0 && !query) {
            // Still show category shells so user knows structure exists.
        }
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
            if (query && catItems.length === 0) continue;
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

    return { root, render };
}
