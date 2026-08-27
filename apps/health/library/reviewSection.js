import * as repos from '../store/repos.js';
import { downloadJson, pickJsonFile } from '../store/io.js';
import {
    exportFoods, importFoods, foodsExportFilename,
    exportMenus, importMenus, menusExportFilename,
} from '../store/libraryIo.js';
import { DrawUI } from '../../../shared/drawUI/index.js';
import { openFoodEditor } from './foodEditor.js';
import { openRecipeEditor } from './recipeEditor.js';
import { openOnlineSearch } from './onlineSearch.js';
import { createLibraryPanel } from './libraryPanel.js';
import { createMenuCanvas } from './menuCanvas.js';
import { seedTemplates } from '../seed/templateSeeder.js';
import { STRINGS } from '../strings.js';

function safeText(value, fallback = '—') {
    const v = String(value ?? '').trim();
    return v || fallback;
}

function liveMenuCounts(menu, foods, recipes) {
    const foodIds = new Set((foods || []).map((f) => f.id));
    const recipeIds = new Set((recipes || []).map((r) => r.id));
    return {
        foods: (menu.foodItemIds || []).filter((id) => foodIds.has(id)).length,
        recipes: (menu.recipeIds || []).filter((id) => recipeIds.has(id)).length,
    };
}

function makeStat(label, value) {
    const el = document.createElement('div');
    el.className = 'health-library-review-stat';
    el.innerHTML = `<span class="health-library-review-stat-label">${label}</span><strong class="health-library-review-stat-value">${value}</strong>`;
    return el;
}

export function createLibraryReviewSection() {
    const root = document.createElement('section');
    root.className = 'health-library-review';
    root.setAttribute('aria-label', 'Food library');

    const sidebarRoot = document.createElement('div');
    sidebarRoot.className = 'health-library-nav';
    sidebarRoot.setAttribute('aria-label', 'Menus and library browser');

    const menuListWrap = document.createElement('div');
    menuListWrap.className = 'health-menu-list';
    menuListWrap.innerHTML = `
        <div class="health-menu-list-head">
            <span>Menus</span>
            <button type="button" data-act="add-menu" class="primary">${STRINGS.addMenu}</button>
        </div>
        <div class="health-menu-list-io">
            <button type="button" data-act="import-menu">${STRINGS.importMenu}</button>
            <button type="button" data-act="export-menu">${STRINGS.exportMenu}</button>
        </div>
        <div class="health-menu-list-body" data-menus></div>
    `;
    const menuListBody = menuListWrap.querySelector('[data-menus]');

    const header = document.createElement('header');
    header.className = 'health-library-review-header';
    header.innerHTML = [
        '<h2 class="health-library-review-title">Food library</h2>',
        '<p class="health-library-review-subtitle">Add foods and recipes here. Create a menu, then drag items from the browser into the canvas — the same way you plan meals.</p>',
    ].join('');

    const actions = document.createElement('div');
    actions.className = 'health-library-review-actions';
    actions.innerHTML = [
        `<button type="button" data-act="add-food" class="primary">${STRINGS.addFood}</button>`,
        `<button type="button" data-act="add-recipe" class="primary">${STRINGS.addRecipe}</button>`,
        `<button type="button" data-act="online" title="Search TheMealDB and Open Food Facts">🌐 ${STRINGS.online}</button>`,
        `<button type="button" data-act="fetch-sources" title="Import bundled recipes from TheMealDB and CoreVital">${STRINGS.fetchFromSources}</button>`,
        `<button type="button" data-act="import-foods">${STRINGS.importFoods}</button>`,
        `<button type="button" data-act="export-foods">${STRINGS.exportFoods}</button>`,
    ].join('');

    const controls = document.createElement('div');
    controls.className = 'health-library-review-controls';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'health-library-review-search';
    search.placeholder = 'Search foods, recipes, tags, categories...';
    search.setAttribute('aria-label', 'Search library items');

    const kindTabs = document.createElement('div');
    kindTabs.className = 'health-library-review-kind-tabs';
    kindTabs.setAttribute('role', 'tablist');
    kindTabs.setAttribute('aria-label', 'Review type');
    kindTabs.innerHTML = [
        '<button type="button" role="tab" data-kind="all" aria-selected="true">All</button>',
        '<button type="button" role="tab" data-kind="food" aria-selected="false">Foods</button>',
        '<button type="button" role="tab" data-kind="recipe" aria-selected="false">Recipes</button>',
    ].join('');

    const viewToggle = document.createElement('div');
    viewToggle.className = 'health-library-review-view-toggle';
    viewToggle.innerHTML = [
        '<button type="button" data-view="list" aria-pressed="true">List</button>',
        '<button type="button" data-view="cards" aria-pressed="false">Cards</button>',
    ].join('');

    controls.append(search, kindTabs, viewToggle);

    const stats = document.createElement('div');
    stats.className = 'health-library-review-stats';

    const content = document.createElement('div');
    content.className = 'health-library-review-content is-list';

    const canvas = createMenuCanvas();

    root.append(header, actions, controls, stats, content, canvas.root);
    canvas.root.hidden = true;

    const state = {
        view: 'list',
        query: '',
        kind: 'all',
        items: [],
        foods: [],
        recipes: [],
        categories: [],
        menus: [],
        activeMenuId: null,
    };

    const browser = createLibraryPanel({
        showMenuPicker: false,
        getState: () => ({
            foodItems: state.foods,
            recipes: state.recipes,
            categories: state.categories,
        }),
    });

    sidebarRoot.append(menuListWrap, browser.root);
    renderMenuList();

    function toReviewItems({ foods, recipes, categories }) {
        const categoriesById = Object.fromEntries((categories || []).map((c) => [c.id, c]));

        const foodItems = (foods || []).map((f) => {
            const category = categoriesById[f.categoryId];
            const imageUrl = f?.source?.imageUrl || f?.imageUrl || '';
            const kcalPer100 = Number(f?.nutritionPerGram?.kcal || 0) * 100;
            return {
                kind: 'food',
                id: f.id,
                name: safeText(f.name, 'Untitled food'),
                category: safeText(category?.name, 'Uncategorized'),
                tags: Array.isArray(f.tags) ? f.tags : [],
                imageUrl,
                subtitle: `${Math.round(kcalPer100)} kcal / 100g`,
                details: [
                    `Serving ${Number(f.defaultServingG || 0) || 100}g`,
                    f?.brand ? `Brand ${f.brand}` : '',
                    f?.source?.provider ? `Source ${f.source.provider}` : '',
                ].filter(Boolean),
            };
        });

        const recipeItems = (recipes || []).map((r) => {
            const category = categoriesById[r.categoryId];
            const imageUrl = r?.source?.imageUrl || r?.imageUrl || '';
            return {
                kind: 'recipe',
                id: r.id,
                name: safeText(r.name, 'Untitled recipe'),
                category: safeText(category?.name, 'Uncategorized'),
                tags: Array.isArray(r.tags) ? r.tags : [],
                imageUrl,
                subtitle: `${Number(r.servings || 1)} serving${Number(r.servings || 1) === 1 ? '' : 's'}`,
                details: [
                    `${(r.ingredients || []).length} ingredients`,
                    r.prepTimeMin ? `Prep ${r.prepTimeMin}m` : '',
                    r.cookTimeMin ? `Cook ${r.cookTimeMin}m` : '',
                    r?.source?.provider ? `Source ${r.source.provider}` : '',
                ].filter(Boolean),
            };
        });

        return [...foodItems, ...recipeItems].sort((a, b) => a.name.localeCompare(b.name));
    }

    function getFilteredItems() {
        const q = state.query.trim().toLowerCase();
        return state.items.filter((item) => {
            if (state.kind !== 'all' && item.kind !== state.kind) return false;
            if (!q) return true;
            const haystack = [
                item.name,
                item.category,
                item.subtitle,
                ...(item.tags || []),
                ...(item.details || []),
            ].join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }

    function renderStats(filtered) {
        const foods = filtered.filter((i) => i.kind === 'food').length;
        const recipes = filtered.filter((i) => i.kind === 'recipe').length;
        stats.innerHTML = '';
        stats.append(
            makeStat('Visible', filtered.length),
            makeStat('Foods', foods),
            makeStat('Recipes', recipes),
        );
    }

    function renderList(items) {
        const table = document.createElement('div');
        table.className = 'health-library-review-list';

        const head = document.createElement('div');
        head.className = 'health-library-review-list-row is-head';
        head.innerHTML = [
            '<span>Type</span>',
            '<span>Name</span>',
            '<span>Category</span>',
            '<span>Summary</span>',
            '<span>Tags</span>',
        ].join('');
        table.appendChild(head);

        for (const item of items) {
            const row = document.createElement('div');
            row.className = 'health-library-review-list-row';
            row.setAttribute('role', 'button');
            row.tabIndex = 0;
            row.innerHTML = [
                `<span class="kind-chip kind-${item.kind}">${item.kind}</span>`,
                `<span class="health-library-review-name">${item.name}</span>`,
                `<span>${item.category}</span>`,
                `<span>${item.subtitle}</span>`,
                `<span>${item.tags.length ? item.tags.join(', ') : '—'}</span>`,
            ].join('');
            row.addEventListener('click', () => {
                openEditorForItem(item).catch((error) => {
                    console.error('[health-library-review] open from list failed', error);
                });
            });
            row.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openEditorForItem(item).catch((error) => {
                        console.error('[health-library-review] open from list failed', error);
                    });
                }
            });
            table.appendChild(row);
        }

        return table;
    }

    function renderCards(items) {
        const grid = document.createElement('div');
        grid.className = 'health-library-review-cards';

        for (const item of items) {
            const card = document.createElement('article');
            card.className = 'health-library-review-card';
            card.setAttribute('role', 'button');
            card.tabIndex = 0;
            const thumb = item.imageUrl
                ? `<img src="${item.imageUrl}" alt="" loading="lazy">`
                : `<div class="health-library-review-card-placeholder">${item.kind === 'food' ? '🥕' : '🍽'}</div>`;

            card.innerHTML = [
                `<div class="health-library-review-card-thumb">${thumb}</div>`,
                '<div class="health-library-review-card-body">',
                `  <div class="health-library-review-card-top"><span class="kind-chip kind-${item.kind}">${item.kind}</span><span>${item.category}</span></div>`,
                `  <h3>${item.name}</h3>`,
                `  <p>${item.subtitle}</p>`,
                `  <p>${item.details.join(' • ') || '—'}</p>`,
                `  <p>${item.tags.length ? item.tags.join(', ') : 'No tags'}</p>`,
                '</div>',
            ].join('');
            card.addEventListener('click', () => {
                openEditorForItem(item).catch((error) => {
                    console.error('[health-library-review] open from cards failed', error);
                });
            });
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openEditorForItem(item).catch((error) => {
                        console.error('[health-library-review] open from cards failed', error);
                    });
                }
            });
            grid.appendChild(card);
        }

        return grid;
    }

    function renderMenuList() {
        menuListBody.innerHTML = '';

        const browse = document.createElement('button');
        browse.type = 'button';
        browse.className = 'health-menu-list-item';
        if (!state.activeMenuId) browse.classList.add('is-active');
        browse.innerHTML = `<span class="health-menu-list-name">${STRINGS.fullLibrary}</span><span class="health-menu-list-meta">Browse</span>`;
        browse.addEventListener('click', () => selectMenu(null));
        menuListBody.appendChild(browse);

        if (state.menus.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'health-menu-list-empty';
            hint.textContent = 'No menus yet.';
            menuListBody.appendChild(hint);
            return;
        }

        for (const menu of state.menus) {
            const counts = liveMenuCounts(menu, state.foods, state.recipes);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'health-menu-list-item';
            if (menu.id === state.activeMenuId) btn.classList.add('is-active');
            btn.innerHTML = `
                <span class="health-menu-list-name"></span>
                <span class="health-menu-list-meta">${counts.foods} foods · ${counts.recipes} recipes</span>
            `;
            btn.querySelector('.health-menu-list-name').textContent = menu.name || 'Untitled menu';
            btn.addEventListener('click', () => selectMenu(menu.id));
            menuListBody.appendChild(btn);
        }
    }

    function renderReview() {
        const filtered = getFilteredItems();
        renderStats(filtered);
        content.classList.toggle('is-list', state.view === 'list');
        content.classList.toggle('is-cards', state.view === 'cards');
        content.innerHTML = '';
        if (filtered.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'health-library-review-empty';
            emptyEl.textContent = 'No library items match your current filters.';
            content.appendChild(emptyEl);
            return;
        }
        content.appendChild(state.view === 'list' ? renderList(filtered) : renderCards(filtered));
    }

    function render() {
        const activeMenu = state.menus.find((m) => m.id === state.activeMenuId) || null;
        const editingMenu = Boolean(activeMenu);

        root.classList.toggle('is-editing-menu', editingMenu);
        controls.hidden = editingMenu;
        stats.hidden = editingMenu;
        content.hidden = editingMenu;
        canvas.root.hidden = !editingMenu;

        renderMenuList();
        browser.render();
        canvas.render({
            menu: activeMenu,
            foodItems: state.foods,
            recipes: state.recipes,
            categories: state.categories,
        });
        if (!editingMenu) renderReview();
    }

    async function selectMenu(menuId) {
        state.activeMenuId = menuId || null;
        await repos.prefs.put({ libraryMenuId: state.activeMenuId });
        render();
    }

    async function refresh() {
        const [foods, recipes, categories, menus, prefs] = await Promise.all([
            repos.foodItems.list(),
            repos.recipes.list(),
            repos.categories.list(),
            repos.menus.list(),
            repos.prefs.get(),
        ]);
        state.foods = foods;
        state.recipes = recipes;
        state.categories = categories;
        state.menus = menus;
        state.items = toReviewItems({ foods, recipes, categories });
        if (state.activeMenuId == null && prefs.libraryMenuId) {
            state.activeMenuId = prefs.libraryMenuId;
        }
        if (state.activeMenuId && !menus.some((m) => m.id === state.activeMenuId)) {
            state.activeMenuId = null;
        }
        render();
    }

    async function openEditorForItem(item) {
        const [categories, foodItems] = await Promise.all([
            repos.categories.list(),
            repos.foodItems.list(),
        ]);

        if (item.kind === 'food') {
            const fullItem = await repos.foodItems.get(item.id);
            if (!fullItem) return;
            openFoodEditor({ item: fullItem, categories });
            return;
        }

        const fullRecipe = await repos.recipes.get(item.id);
        if (!fullRecipe) return;
        openRecipeEditor({ recipe: fullRecipe, categories, foodItems });
    }

    search.addEventListener('input', () => {
        state.query = search.value;
        renderReview();
    });

    kindTabs.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.kind = btn.dataset.kind;
            kindTabs.querySelectorAll('button').forEach((b) => {
                b.setAttribute('aria-selected', String(b === btn));
            });
            renderReview();
        });
    });

    viewToggle.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.view = btn.dataset.view;
            viewToggle.querySelectorAll('button').forEach((b) => {
                b.setAttribute('aria-pressed', String(b === btn));
            });
            renderReview();
        });
    });

    menuListWrap.querySelector('[data-act="add-menu"]').addEventListener('click', async () => {
        try {
            const saved = await repos.menus.put({
                name: 'New menu',
                foodItemIds: [],
                recipeIds: [],
            });
            state.activeMenuId = saved.id;
            await repos.prefs.put({ libraryMenuId: saved.id });
            await refresh();
            canvas.focusName();
        } catch (err) {
            console.error('[health-menu]', err);
            DrawUI.toast(`Could not create menu: ${err.message}`, 'error').showIn(document.body);
        }
    });

    actions.querySelector('[data-act="add-food"]').addEventListener('click', async () => {
        const categories = await repos.categories.list();
        openFoodEditor({ categories });
    });
    actions.querySelector('[data-act="add-recipe"]').addEventListener('click', async () => {
        const [categories, foodItems] = await Promise.all([
            repos.categories.list(),
            repos.foodItems.list(),
        ]);
        if (foodItems.length === 0) {
            DrawUI.toast('Add some foods first so recipes have ingredients.', 'warning').showIn(document.body);
            return;
        }
        openRecipeEditor({ categories, foodItems });
    });
    actions.querySelector('[data-act="online"]').addEventListener('click', async () => {
        const [categories, foodItems] = await Promise.all([
            repos.categories.list(),
            repos.foodItems.list(),
        ]);
        openOnlineSearch({ categories, foodItems });
    });
    actions.querySelector('[data-act="fetch-sources"]').addEventListener('click', async () => {
        const btn = actions.querySelector('[data-act="fetch-sources"]');
        btn.disabled = true;
        try {
            const result = await runFetchFromSources();
            if (!result) return;
            DrawUI.toast(STRINGS.fetchFromSourcesSuccess(result), 'success').showIn(document.body);
            await refresh();
        } catch (err) {
            console.error('[food sources]', err);
            DrawUI.toast(`Fetch from sources failed: ${err.message}`, 'error').showIn(document.body);
        } finally {
            btn.disabled = false;
        }
    });
    actions.querySelector('[data-act="import-foods"]').addEventListener('click', async () => {
        try {
            const payload = await pickJsonFile();
            if (!payload) return;
            const stats = await importFoods(payload);
            DrawUI.toast(STRINGS.importFoodsSuccess(stats), 'success').showIn(document.body);
        } catch (err) {
            console.error('[food import]', err);
            DrawUI.toast(`Import foods failed: ${err.message}`, 'error').showIn(document.body);
        }
    });
    actions.querySelector('[data-act="export-foods"]').addEventListener('click', async () => {
        try {
            const payload = await exportFoods();
            if (!payload.foodItems.length && !payload.recipes.length) {
                DrawUI.toast(STRINGS.exportFoodsEmpty, 'warning').showIn(document.body);
                return;
            }
            downloadJson(payload, foodsExportFilename());
            DrawUI.toast(STRINGS.exportFoodsSuccess(payload.foodItems.length, payload.recipes.length), 'success').showIn(document.body);
        } catch (err) {
            console.error('[food export]', err);
            DrawUI.toast(`Export foods failed: ${err.message}`, 'error').showIn(document.body);
        }
    });

    menuListWrap.querySelector('[data-act="import-menu"]').addEventListener('click', async () => {
        try {
            const payload = await pickJsonFile();
            if (!payload) return;
            const stats = await importMenus(payload);
            if (stats.menuIds[0]) {
                state.activeMenuId = stats.menuIds[0];
                await repos.prefs.put({ libraryMenuId: state.activeMenuId });
            }
            await refresh();
            DrawUI.toast(STRINGS.importMenusSuccess(stats), 'success').showIn(document.body);
        } catch (err) {
            console.error('[menu import]', err);
            DrawUI.toast(`Import menu failed: ${err.message}`, 'error').showIn(document.body);
        }
    });
    menuListWrap.querySelector('[data-act="export-menu"]').addEventListener('click', async () => {
        try {
            const selected = state.menus.find((m) => m.id === state.activeMenuId) || null;
            const toExport = selected ? [selected] : state.menus;
            if (!toExport.length) {
                DrawUI.toast(STRINGS.exportMenusEmpty, 'warning').showIn(document.body);
                return;
            }
            const payload = await exportMenus(toExport);
            downloadJson(payload, menusExportFilename(toExport));
            DrawUI.toast(STRINGS.exportMenusSuccess(toExport.length, toExport[0]?.name), 'success').showIn(document.body);
        } catch (err) {
            console.error('[menu export]', err);
            DrawUI.toast(`Export menu failed: ${err.message}`, 'error').showIn(document.body);
        }
    });

    function runFetchFromSources() {
        return new Promise((resolve, reject) => {
            const panel = DrawUI.floatingPanel({ title: STRINGS.fetchFromSources, closable: true });
            const origClose = panel.close.bind(panel);
            let settled = false;
            let running = false;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                origClose();
                resolve(value);
            };

            panel.close = () => {
                origClose();
                if (!settled && !running) {
                    settled = true;
                    resolve(null);
                }
            };

            const host = document.createElement('div');
            host.className = 'health-plan-load';
            host.innerHTML = `
                <p class="health-template-note" data-note></p>
                <p class="health-template-note" data-status></p>
                <div class="health-plan-load-actions">
                    <button type="button" class="primary" data-act="scratch"></button>
                    <button type="button" data-act="add"></button>
                    <button type="button" data-act="cancel"></button>
                </div>
            `;
            host.querySelector('[data-note]').textContent = STRINGS.fetchFromSourcesNote;
            const statusEl = host.querySelector('[data-status]');
            statusEl.hidden = true;
            const scratchBtn = host.querySelector('[data-act="scratch"]');
            const addBtn = host.querySelector('[data-act="add"]');
            const cancelBtn = host.querySelector('[data-act="cancel"]');
            scratchBtn.textContent = STRINGS.fetchFromScratch;
            addBtn.textContent = STRINGS.addToExisting;
            cancelBtn.textContent = STRINGS.cancel;
            scratchBtn.title = STRINGS.fetchFromScratchHint;
            addBtn.title = STRINGS.addToExistingHint;

            async function start() {
                if (running) return;
                running = true;
                scratchBtn.disabled = true;
                addBtn.disabled = true;
                cancelBtn.hidden = true;
                statusEl.hidden = false;
                statusEl.textContent = 'Starting…';
                try {
                    const result = await seedTemplates({
                        force: true,
                        skipNetwork: true,
                        onProgress: (info) => {
                            statusEl.textContent = STRINGS.fetchFromSourcesProgress(info);
                        },
                    });
                    finish(result);
                } catch (err) {
                    settled = true;
                    origClose();
                    reject(err);
                }
            }

            scratchBtn.addEventListener('click', () => { start(); });
            addBtn.addEventListener('click', () => { start(); });
            cancelBtn.addEventListener('click', () => finish(null));

            panel.content.appendChild(host);
            panel.show(document.body);
        });
    }

    return {
        root,
        sidebarRoot,
        refresh,
        focusSearch() {
            browser.focusSearch();
        },
    };
}
