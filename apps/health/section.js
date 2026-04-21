import { DrawUI } from '../../shared/drawUI/index.js';
import { createLibraryPanel } from './library/libraryPanel.js';
import { openFoodEditor } from './library/foodEditor.js';
import { openRecipeEditor } from './library/recipeEditor.js';
import { openMealTemplateEditor } from './library/categoryEditor.js';
import { createDayView } from './views/dayView.js';
import { createWeekView } from './views/weekView.js';
import { createMonthView } from './views/monthView.js';
import { openShoppingList } from './shopping/shoppingList.js';
import * as repos from './store/repos.js';
import { healthSignals } from './signals.js';
import { ALL_SEED_CATEGORIES } from './seed.js';
import { seedTemplates } from './seed/templateSeeder.js';
import { rebuildIndex } from './store/search.js';
import {
    toIsoDate, fromIsoDate, startOfDay, startOfWeek, startOfMonth, endOfMonth,
    addDays, addMonths, formatLongDate, formatWeekRange, formatMonthYear,
} from './dates.js';
import { STRINGS } from './strings.js';

/**
 * Top-level factory for the food section.
 * @param {{ core:any, services:any }} ctx
 * @returns {{ root:any, notifyVisible:Function, refresh:Function }}
 */
export function createFoodSection(ctx) {
    const root = DrawUI.div().setClass('health-section');

    // ---------- State ----------
    const state = {
        foodItems: [],
        recipes: [],
        categories: [],
        prefs: null,
        currentDate: startOfDay(getNowFromCore() || new Date()),
        view: 'week', // overridden by prefs on first load
        entries: [],  // plan entries for the visible range
        recipesById: {},
        foodItemsById: {},
        mealCategories: [],
    };

    function getNowFromCore() {
        try {
            const n = ctx.core?.api?.now?.();
            return n instanceof Date ? n : (n ? new Date(n) : null);
        } catch { return null; }
    }

    function openPlannedEntryDetails(entry, dateHint) {
        if (dateHint) state.currentDate = startOfDay(dateHint);
        if (!entry?.target) return;

        if (entry.target.kind === 'recipe') {
            const recipe = state.recipesById[entry.target.recipeId];
            if (!recipe) {
                DrawUI.toast('Recipe not found in library', 'warning').showIn(document.body);
                return;
            }
            openRecipeEditor({ recipe, categories: state.categories, foodItems: state.foodItems });
            return;
        }

        if (entry.target.kind === 'food') {
            const item = state.foodItemsById[entry.target.foodItemId];
            if (!item) {
                DrawUI.toast('Food item not found in library', 'warning').showIn(document.body);
                return;
            }
            openFoodEditor({ item, categories: state.categories });
        }
    }

    // ---------- Layout ----------
    const heading = document.createElement('h2');
    heading.className = 'health-h';
    heading.textContent = STRINGS.sectionTitle;
    root.dom.appendChild(heading);

    const shell = document.createElement('div');
    shell.className = 'health-shell';
    root.dom.appendChild(shell);

    const library = createLibraryPanel({
        getState: () => ({
            foodItems: state.foodItems,
            recipes: state.recipes,
            categories: state.categories,
        }),
    });
    shell.appendChild(library.root);

    const planner = document.createElement('div');
    planner.className = 'health-planner';
    shell.appendChild(planner);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'health-toolbar';
    toolbar.innerHTML = `
        <div class="health-toolbar-group">
            <button type="button" data-act="prev" aria-label="Previous">◂</button>
            <button type="button" data-act="today">${STRINGS.today}</button>
            <button type="button" data-act="next" aria-label="Next">▸</button>
            <span class="health-toolbar-label" data-label></span>
        </div>
        <div class="health-toolbar-group">
            <button type="button" data-view="day">${STRINGS.day}</button>
            <button type="button" data-view="week">${STRINGS.week}</button>
            <button type="button" data-view="month">${STRINGS.month}</button>
        </div>
        <div class="health-toolbar-group">
            <button type="button" data-act="meal-template">${STRINGS.mealTemplate}</button>
            <button type="button" data-act="shopping">${STRINGS.shoppingList}</button>
        </div>
    `;
    planner.appendChild(toolbar);

    // Views
    const viewHost = document.createElement('div');
    viewHost.className = 'health-view';
    planner.appendChild(viewHost);

    const dayView = createDayView({
        onEntryClick: (entry) => openPlannedEntryDetails(entry),
        onClearDay: async (date) => {
            await repos.plan.clearByDate(toIsoDate(startOfDay(date)));
        },
    });
    const weekView = createWeekView({
        onEntryClick: (entry) => openPlannedEntryDetails(entry),
    });
    const monthView = createMonthView({
        onDayClick: (d) => { state.currentDate = startOfDay(d); state.view = 'day'; persistPrefs(); refresh(); },
        onEntryClick: ({ date, entry }) => openPlannedEntryDetails(entry, date),
    });

    // Toolbar wiring
    toolbar.querySelector('[data-act="prev"]').addEventListener('click', () => { shiftCurrent(-1); refresh(); });
    toolbar.querySelector('[data-act="next"]').addEventListener('click', () => { shiftCurrent(1); refresh(); });
    toolbar.querySelector('[data-act="today"]').addEventListener('click', () => { state.currentDate = startOfDay(getNowFromCore() || new Date()); refresh(); });
    toolbar.querySelectorAll('[data-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.view = btn.dataset.view;
            persistPrefs();
            refresh();
        });
    });
    toolbar.querySelector('[data-act="shopping"]').addEventListener('click', () => {
        const { from, to } = getVisibleRange();
        openShoppingList({
            fromDate: from,
            toDate: to,
            foodItemsById: state.foodItemsById,
            recipesById: state.recipesById,
        });
    });
    toolbar.querySelector('[data-act="meal-template"]').addEventListener('click', () => {
        openMealTemplateEditor({
            mealCategories: state.mealCategories,
            onSaved: () => refresh(),
        });
    });

    function shiftCurrent(direction) {
        if (state.view === 'day') state.currentDate = addDays(state.currentDate, direction);
        else if (state.view === 'week') state.currentDate = addDays(state.currentDate, 7 * direction);
        else state.currentDate = addMonths(state.currentDate, direction);
    }

    function getVisibleRange() {
        const weekStartsOn = state.prefs?.weekStartsOn ?? 1;
        if (state.view === 'day') {
            return { from: state.currentDate, to: state.currentDate };
        }
        if (state.view === 'week') {
            const from = startOfWeek(state.currentDate, weekStartsOn);
            return { from, to: addDays(from, 6) };
        }
        // month
        const monthStart = startOfMonth(state.currentDate);
        const gridStart = startOfWeek(monthStart, weekStartsOn);
        const gridEnd = addDays(gridStart, 41);
        return { from: gridStart, to: gridEnd };
    }

    function labelForView() {
        const weekStartsOn = state.prefs?.weekStartsOn ?? 1;
        if (state.view === 'day') return formatLongDate(state.currentDate);
        if (state.view === 'week') {
            const from = startOfWeek(state.currentDate, weekStartsOn);
            return formatWeekRange(from, addDays(from, 6));
        }
        return formatMonthYear(state.currentDate);
    }

    // ---------- Data ----------
    async function loadLibrary() {
        const [cats, foods, recs] = await Promise.all([
            repos.categories.list(),
            repos.foodItems.list(),
            repos.recipes.list(),
        ]);
        state.categories = cats;
        state.foodItems = foods;
        state.recipes = recs;
        state.mealCategories = cats.filter((c) => c.kind === 'meal');
        state.recipesById = Object.fromEntries(recs.map((r) => [r.id, r]));
        state.foodItemsById = Object.fromEntries(foods.map((f) => [f.id, f]));
        rebuildIndex({ foodItems: foods, recipes: recs });
    }

    async function loadPrefs() {
        state.prefs = await repos.prefs.get();
        if (state.prefs.defaultView && ['day', 'week', 'month'].includes(state.prefs.defaultView)) {
            state.view = state.prefs.defaultView;
        }
    }

    async function persistPrefs() {
        await repos.prefs.put({ defaultView: state.view });
    }

    async function loadPlanForVisible() {
        const { from, to } = getVisibleRange();
        const entries = await repos.plan.listByRange(toIsoDate(from), toIsoDate(to));
        state.entries = entries;
    }

    function entriesByDate() {
        const by = {};
        for (const e of state.entries) {
            (by[e.date] = by[e.date] || []).push(e);
        }
        for (const list of Object.values(by)) {
            list.sort((a, b) => a.slotOrder - b.slotOrder);
        }
        return by;
    }

    // ---------- Render ----------
    function renderToolbarState() {
        toolbar.querySelector('[data-label]').textContent = labelForView();
        toolbar.querySelectorAll('[data-view]').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.view === state.view);
        });
    }

    function renderCurrentView() {
        viewHost.innerHTML = '';
        const common = {
            currentDate: state.currentDate,
            mealCategories: state.mealCategories,
            entriesByDate: entriesByDate(),
            recipesById: state.recipesById,
            foodItemsById: state.foodItemsById,
            weekStartsOn: state.prefs?.weekStartsOn ?? 1,
            today: startOfDay(getNowFromCore() || new Date()),
        };
        if (state.view === 'day') {
            dayView.render(common);
            viewHost.appendChild(dayView.root);
        } else if (state.view === 'week') {
            weekView.render(common);
            viewHost.appendChild(weekView.root);
        } else {
            monthView.render(common);
            viewHost.appendChild(monthView.root);
        }
    }

    let refreshing = false;
    async function refresh() {
        if (refreshing) return;
        refreshing = true;
        try {
            await Promise.all([loadLibrary(), loadPlanForVisible()]);
            library.render();
            renderToolbarState();
            renderCurrentView();
        } catch (err) {
            console.error('[food] refresh failed', err);
            DrawUI.toast(`Food: ${err.message}`, 'error').showIn(document.body);
        } finally {
            refreshing = false;
        }
    }

    // ---------- Wire signals ----------
    healthSignals.onLibraryChanged.add(refresh);
    healthSignals.onCategoriesChanged.add(refresh);
    healthSignals.onPlanChanged.add(refresh);
    healthSignals.onPrefsChanged.add(refresh);
    healthSignals.onImportCompleted.add(refresh);

    // ---------- Lifecycle ----------
    let initialized = false;
    async function notifyVisible() {
        if (initialized) return;
        initialized = true;
        try {
            await repos.categories.bulkSeedIfEmpty(ALL_SEED_CATEGORIES);
            await loadPrefs();
            // Seed bundled recipe templates on first run (idempotent via meta flag).
            try {
                const result = await seedTemplates();
                if (result.seeded > 0) {
                    DrawUI.toast(`Seeded ${result.seeded} template recipes`, 'info').showIn(document.body);
                }
            } catch (err) {
                console.warn('[food] template seed failed (non-fatal)', err);
            }
            await refresh();
        } catch (err) {
            console.error('[food] init failed', err);
            DrawUI.toast(`Food init failed: ${err.message}`, 'error').showIn(document.body);
        }
    }

    return { root, notifyVisible, refresh };
}

// re-export used by drop handlers (import path stability)
export { fromIsoDate, endOfMonth };
