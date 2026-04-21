import * as repos from '../store/repos.js';
import { openFoodEditor } from './foodEditor.js';
import { openRecipeEditor } from './recipeEditor.js';

function safeText(value, fallback = '—') {
    const v = String(value ?? '').trim();
    return v || fallback;
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
    root.setAttribute('aria-label', 'Library review workspace');

    const header = document.createElement('header');
    header.className = 'health-library-review-header';
    header.innerHTML = [
        '<h2 class="health-library-review-title">Library Review</h2>',
        '<p class="health-library-review-subtitle">Browse your foods and recipes in compact list mode or detailed cards.</p>',
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

    root.append(header, controls, stats, content);

    const state = {
        view: 'list',
        query: '',
        kind: 'all',
        items: [],
    };

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

    function render() {
        const filtered = getFilteredItems();
        renderStats(filtered);

        content.classList.toggle('is-list', state.view === 'list');
        content.classList.toggle('is-cards', state.view === 'cards');
        content.innerHTML = '';

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'health-library-review-empty';
            empty.textContent = 'No library items match your current filters.';
            content.appendChild(empty);
            return;
        }

        content.appendChild(state.view === 'list' ? renderList(filtered) : renderCards(filtered));
    }

    async function refresh() {
        const [foods, recipes, categories] = await Promise.all([
            repos.foodItems.list(),
            repos.recipes.list(),
            repos.categories.list(),
        ]);
        state.items = toReviewItems({ foods, recipes, categories });
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
        render();
    });

    kindTabs.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.kind = btn.dataset.kind;
            kindTabs.querySelectorAll('button').forEach((b) => {
                const on = b === btn;
                b.setAttribute('aria-selected', String(on));
            });
            render();
        });
    });

    viewToggle.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.view = btn.dataset.view;
            viewToggle.querySelectorAll('button').forEach((b) => {
                const on = b === btn;
                b.setAttribute('aria-pressed', String(on));
            });
            render();
        });
    });

    return {
        root,
        refresh,
        focusSearch() {
            search.focus();
            search.select();
        },
    };
}
