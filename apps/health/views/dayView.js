import { wireSlotDropTarget, renderSlotChips } from '../planner/planSlot.js';
import { toIsoDate, formatLongDate } from '../dates.js';
import { planDayTotals } from '../nutrition/calc.js';
import { STRINGS } from '../strings.js';

const kcalFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const gFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export function createDayView({ onEntryClick, onClearDay } = {}) {
    const root = document.createElement('div');
    root.className = 'health-day';

    function render({ currentDate, mealCategories, entriesByDate, recipesById, foodItemsById }) {
        root.innerHTML = '';
        const dateIso = toIsoDate(currentDate);
        const dayEntries = entriesByDate[dateIso] || [];

        const headingRow = document.createElement('div');
        headingRow.className = 'health-day-header';

        const heading = document.createElement('h3');
        heading.className = 'health-h';
        heading.textContent = formatLongDate(currentDate);
        headingRow.appendChild(heading);

        const clearDayBtn = document.createElement('button');
        clearDayBtn.type = 'button';
        clearDayBtn.className = 'health-day-clear';
        clearDayBtn.textContent = STRINGS.clearDay;
        clearDayBtn.disabled = dayEntries.length === 0;
        clearDayBtn.addEventListener('click', async () => {
            if (!dayEntries.length) return;
            if (!confirm(STRINGS.confirmClearDay(formatLongDate(currentDate)))) return;
            clearDayBtn.disabled = true;
            try {
                await onClearDay?.(currentDate);
            } finally {
                clearDayBtn.disabled = false;
            }
        });
        headingRow.appendChild(clearDayBtn);
        root.appendChild(headingRow);

        const dayTotals = planDayTotals(dayEntries, recipesById, foodItemsById);
        const totalsStrip = document.createElement('div');
        totalsStrip.className = 'health-summary';
        totalsStrip.innerHTML = `
            <div class="health-summary-kv"><span class="health-summary-k">Total kcal</span><span class="health-summary-v">${kcalFmt.format(dayTotals.kcal)}</span></div>
            <div class="health-summary-kv"><span class="health-summary-k">Protein</span><span class="health-summary-v">${gFmt.format(dayTotals.protein_g)} g</span></div>
            <div class="health-summary-kv"><span class="health-summary-k">Carbs</span><span class="health-summary-v">${gFmt.format(dayTotals.carbs_g)} g</span></div>
            <div class="health-summary-kv"><span class="health-summary-k">Fat</span><span class="health-summary-v">${gFmt.format(dayTotals.fat_g)} g</span></div>
        `;
        root.appendChild(totalsStrip);

        for (const meal of mealCategories) {
            const mealEntries = dayEntries.filter((e) => e.mealCategoryId === meal.id);
            const mealTotals = planDayTotals(mealEntries, recipesById, foodItemsById);

            const box = document.createElement('div');
            box.className = 'health-day-meal';

            const header = document.createElement('div');
            header.className = 'health-day-meal-header';
            header.innerHTML = `
                <span style="color:${meal.color || 'var(--health-accent)'}">${meal.icon || '●'}</span>
                <span>${meal.name}</span>
                <span class="health-day-meal-totals"></span>
            `;
            header.querySelector('.health-day-meal-totals').textContent = `${kcalFmt.format(mealTotals.kcal)} kcal · ${mealEntries.length} item${mealEntries.length === 1 ? '' : 's'}`;
            box.appendChild(header);

            const slot = document.createElement('div');
            slot.className = 'health-slot';
            if (mealEntries.length === 0) slot.classList.add('health-slot--empty');
            slot.dataset.date = dateIso;
            slot.dataset.mealCategoryId = meal.id;
            renderSlotChips(slot, mealEntries, { recipesById, foodItemsById, onEntryClick });
            wireSlotDropTarget(slot, () => ({ recipesById, foodItemsById }));
            box.appendChild(slot);

            root.appendChild(box);
        }
    }

    return { root, render };
}
