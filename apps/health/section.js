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
import { downloadJson, pickJsonFile } from './store/io.js';
import { exportMealPlan, importMealPlan, inspectMealPlan } from './store/planIo.js';
import { healthSignals } from './signals.js';
import { ALL_SEED_CATEGORIES } from './seed.js';
import { rebuildIndex } from './store/search.js';
import {
    toIsoDate, fromIsoDate, startOfDay, startOfWeek, startOfMonth, endOfMonth,
    addDays, addMonths, formatLongDate, formatWeekRange, formatMonthYear,
} from './dates.js';
import { STRINGS } from './strings.js';

/**
 * Top-level factory for the meal planner: foods/recipes for the app sidebar,
 * and the calendar/schedule for the main Planner section.
 * @param {{ core:any, services:any }} ctx
 * @returns {{ libraryRoot:HTMLElement, plannerRoot:HTMLElement, notifyVisible:Function, refresh:Function }}
 */
export function createFoodSection(ctx) {
    // ---------- State ----------
    const state = {
        foodItems: [],
        recipes: [],
        categories: [],
        menus: [],
        selectedMenuId: null,
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
    const library = createLibraryPanel({
        getState: () => ({
            foodItems: state.foodItems,
            recipes: state.recipes,
            categories: state.categories,
            menus: state.menus,
            selectedMenuId: state.selectedMenuId,
        }),
        onMenuChange: (menuId) => {
            state.selectedMenuId = menuId || null;
            persistPrefs();
            library.render();
        },
    });
    library.root.setAttribute('aria-label', 'Foods and recipes');

    const plannerRoot = document.createElement('section');
    plannerRoot.className = 'health-section health-planner-section';
    plannerRoot.setAttribute('aria-label', STRINGS.sectionTitle);

    const heading = document.createElement('h2');
    heading.className = 'health-h';
    heading.textContent = STRINGS.sectionTitle;
    plannerRoot.appendChild(heading);

    const planner = document.createElement('div');
    planner.className = 'health-planner';
    plannerRoot.appendChild(planner);

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
            <button type="button" data-act="save-plan">${STRINGS.savePlan}</button>
            <button type="button" data-act="load-plan">${STRINGS.loadPlan}</button>
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
    toolbar.querySelector('[data-act="save-plan"]').addEventListener('click', async () => {
        try {
            const { from, to } = getVisibleRange();
            const fromIso = toIsoDate(from);
            const toIso = toIsoDate(to);
            const payload = await exportMealPlan(fromIso, toIso);
            if (!payload.planEntries.length) {
                DrawUI.toast(STRINGS.savePlanEmpty, 'warning').showIn(document.body);
                return;
            }
            downloadJson(payload, STRINGS.planExportFilename(fromIso, toIso));
            DrawUI.toast(STRINGS.savePlanSuccess(payload.planEntries.length), 'success').showIn(document.body);
        } catch (err) {
            DrawUI.toast(`Save plan failed: ${err.message}`, 'error').showIn(document.body);
        }
    });
    toolbar.querySelector('[data-act="load-plan"]').addEventListener('click', async () => {
        try {
            const payload = await pickJsonFile();
            if (!payload) return;
            const preview = inspectMealPlan(payload);
            if (preview.entryCount === 0 && preview.foodCount === 0 && preview.recipeCount === 0) {
                throw new Error('No meal plan entries in this file');
            }
            let dateMode = 'original';
            if (preview.entryCount > 0 && preview.from) {
                const choice = await chooseMealPlanPlacement({
                    from: preview.from,
                    to: preview.to || preview.from,
                    entryCount: preview.entryCount,
                    view: state.view,
                });
                if (!choice) return;
                dateMode = choice;
            }
            const { from } = getVisibleRange();
            const stats = await importMealPlan(payload, {
                dateMode,
                targetFromIso: toIsoDate(from),
            });
            DrawUI.toast(STRINGS.loadPlanSuccess(stats), 'success').showIn(document.body);
        } catch (err) {
            DrawUI.toast(`Load plan failed: ${err.message}`, 'error').showIn(document.body);
        }
    });

    function chooseMealPlanPlacement({ from, to, entryCount, view }) {
        return new Promise((resolve) => {
            const panel = DrawUI.floatingPanel({ title: STRINGS.loadPlan, closable: true });
            const origClose = panel.close.bind(panel);
            let settled = false;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
                origClose();
            };
            panel.close = () => {
                origClose();
                if (!settled) {
                    settled = true;
                    resolve(null);
                }
            };

            const host = document.createElement('div');
            host.className = 'health-plan-load';
            const note = document.createElement('p');
            note.className = 'health-template-note';
            note.textContent = STRINGS.loadPlanNote(from, to, entryCount);
            const hint = document.createElement('p');
            hint.className = 'health-template-note';
            hint.textContent = STRINGS.loadPlanUpdateNote;
            const actions = document.createElement('div');
            actions.className = 'health-plan-load-actions';
            actions.innerHTML = `
                <button type="button" class="primary" data-act="shift"></button>
                <button type="button" data-act="original"></button>
                <button type="button" data-act="cancel"></button>
            `;
            actions.querySelector('[data-act="shift"]').textContent = STRINGS.loadPlanPlaceOn(view);
            actions.querySelector('[data-act="original"]').textContent = STRINGS.loadPlanOriginalDates;
            actions.querySelector('[data-act="cancel"]').textContent = STRINGS.cancel;
            actions.querySelector('[data-act="shift"]').addEventListener('click', () => finish('shift'));
            actions.querySelector('[data-act="original"]').addEventListener('click', () => finish('original'));
            actions.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(null));
            host.append(note, hint, actions);
            panel.content.appendChild(host);
            panel.show(document.body);
        });
    }

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
        const [cats, foods, recs, menuList] = await Promise.all([
            repos.categories.list(),
            repos.foodItems.list(),
            repos.recipes.list(),
            repos.menus.list(),
        ]);
        state.categories = cats;
        state.foodItems = foods;
        state.recipes = recs;
        state.menus = menuList;
        state.mealCategories = cats.filter((c) => c.kind === 'meal');
        state.recipesById = Object.fromEntries(recs.map((r) => [r.id, r]));
        state.foodItemsById = Object.fromEntries(foods.map((f) => [f.id, f]));
        if (state.selectedMenuId && !menuList.some((m) => m.id === state.selectedMenuId)) {
            state.selectedMenuId = null;
            persistPrefs();
        }
        rebuildIndex({ foodItems: foods, recipes: recs });
    }

    async function loadPrefs() {
        state.prefs = await repos.prefs.get();
        if (state.prefs.defaultView && ['day', 'week', 'month'].includes(state.prefs.defaultView)) {
            state.view = state.prefs.defaultView;
        }
        state.selectedMenuId = state.prefs.selectedMenuId || null;
    }

    async function persistPrefs() {
        await repos.prefs.put({ defaultView: state.view, selectedMenuId: state.selectedMenuId || null });
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
    let refreshQueued = false;
    async function refresh() {
        if (refreshing) {
            refreshQueued = true;
            return;
        }
        refreshing = true;
        try {
            do {
                refreshQueued = false;
                await Promise.all([loadLibrary(), loadPlanForVisible()]);
                library.render();
                renderToolbarState();
                renderCurrentView();
            } while (refreshQueued);
        } catch (err) {
            console.error('[food] refresh failed', err);
            DrawUI.toast(`Food: ${err.message}`, 'error').showIn(document.body);
        } finally {
            refreshing = false;
        }
        if (refreshQueued) refresh();
    }

    // ---------- Wire signals ----------
    healthSignals.onLibraryChanged.add(refresh);
    healthSignals.onCategoriesChanged.add(refresh);
    healthSignals.onMenusChanged.add(refresh);
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
            await refresh();
        } catch (err) {
            console.error('[food] init failed', err);
            DrawUI.toast(`Food init failed: ${err.message}`, 'error').showIn(document.body);
        }
    }

    return {
        libraryRoot: library.root,
        plannerRoot,
        notifyVisible,
        refresh,
    };
}

// re-export used by drop handlers (import path stability)
export { fromIsoDate, endOfMonth };
