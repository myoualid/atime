import { makeDropTarget, promptForNumber } from './dragdrop.js?v=20260421';
import { planEntryChip } from './planChip.js';
import * as repos from '../store/repos.js';
import { STRINGS } from '../strings.js';

/**
 * Wire a slot element as a drop target for library items and plan entries.
 * @param {HTMLElement} slotEl  must already have data-date + data-meal-category-id
 * @param {() => { recipesById, foodItemsById }} getCtx
 */
export function wireSlotDropTarget(slotEl, getCtx) {
    makeDropTarget(slotEl, async (payload, { copy }) => {
        const date = slotEl.dataset.date;
        const mealCategoryId = slotEl.dataset.mealCategoryId;
        const course = slotEl.dataset.course || 'main';
        if (!date || !mealCategoryId) return;
        const rect = slotEl.getBoundingClientRect();

        if (payload.kind === 'library-food') {
            const grams = await promptForNumber({
                label: `${STRINGS.amountG} (${payload.label || ''})`,
                initial: payload.defaultAmountG || 100,
                unit: 'g',
                anchorRect: rect,
            });
            if (grams == null || grams <= 0) return;
            await repos.plan.put({
                date,
                mealCategoryId,
                course,
                slotOrder: Date.now(),
                target: { kind: 'food', foodItemId: payload.foodItemId, amountG: grams },
            });
        } else if (payload.kind === 'library-recipe') {
            const servings = await promptForNumber({
                label: `${STRINGS.servings} (${payload.label || ''})`,
                initial: payload.defaultServings || 1,
                unit: '',
                anchorRect: rect,
            });
            if (servings == null || servings <= 0) return;
            await repos.plan.put({
                date,
                mealCategoryId,
                course,
                slotOrder: Date.now(),
                target: { kind: 'recipe', recipeId: payload.recipeId, servings },
            });
        } else if (payload.kind === 'plan-entry') {
            if (copy) {
                // Copy: duplicate without id.
                const existing = await repos.plan.listByRange(date, date); // ensure db open
                const all = await repos.plan.listByRange('0000-01-01', '9999-12-31');
                const src = all.find((e) => e.id === payload.planEntryId);
                if (!src) return;
                await repos.plan.put({ ...src, id: undefined, date, mealCategoryId, course, slotOrder: Date.now() });
            } else {
                await repos.plan.move({ id: payload.planEntryId, date, mealCategoryId, course, slotOrder: Date.now() });
            }
        }
    });
}

/**
 * Render entry chips into a slot's body. Clears previous chips first.
 * @param {HTMLElement} slotBody
 * @param {Array} entries
 * @param {object} ctx { recipesById, foodItemsById, onEntryClick? }
 * @param {{ showCalories?: boolean }} opts
 */
export function renderSlotChips(slotBody, entries, ctx, opts = {}) {
    slotBody.innerHTML = '';
    if (!entries || entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'health-slot-empty-text';
        empty.textContent = STRINGS.dropHere;
        slotBody.appendChild(empty);
        return;
    }
    const showCalories = opts.showCalories ?? true;
    for (const entry of entries) {
        const chip = planEntryChip({
            entry,
            recipesById: ctx.recipesById,
            foodItemsById: ctx.foodItemsById,
            showCalories,
            onOpen: ctx.onEntryClick ? () => ctx.onEntryClick(entry) : undefined,
            onDragEnd: async ({ event, payload, dropEffect }) => {
                if (payload?.kind !== 'plan-entry') return;
                if (dropEffect !== 'none') return;
                const calendarRoot = event.currentTarget?.closest('.health-week, .health-day, .health-month')
                    || slotBody.closest('.health-week, .health-day, .health-month');
                if (!calendarRoot) return;

                const x = event.clientX;
                const y = event.clientY;
                const endTarget = Number.isFinite(x) && Number.isFinite(y)
                    ? document.elementFromPoint(x, y)
                    : null;
                if (endTarget && calendarRoot.contains(endTarget)) return;
                await repos.plan.remove(entry.id);
            },
        });
        slotBody.appendChild(chip);
    }
}
