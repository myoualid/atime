import { wireSlotDropTarget, renderSlotChips } from '../planner/planSlot.js';
import { toIsoDate, addDays, startOfWeek, formatShortDay, isSameDay, weekdayNames } from '../dates.js';
import { planDayTotals } from '../nutrition/calc.js';

const kcalFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function createWeekView({ onEntryClick } = {}) {
    const root = document.createElement('div');
    root.className = 'health-week';

    function render({ currentDate, mealCategories, entriesByDate, recipesById, foodItemsById, weekStartsOn, today }) {
        root.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'health-week-grid';
        root.appendChild(grid);

        const weekStart = startOfWeek(currentDate, weekStartsOn);
        const days = [];
        for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));

        // Header row: corner + 7 day headers
        const corner = document.createElement('div');
        corner.className = 'health-week-meal-label';
        corner.textContent = '';
        grid.appendChild(corner);

        for (const d of days) {
            const h = document.createElement('div');
            h.className = 'health-week-day-header';
            if (today && isSameDay(d, today)) h.classList.add('is-today');
            h.innerHTML = `<span>${formatShortDay(d)}</span>`;
            grid.appendChild(h);
        }

        // Meal rows
        for (const meal of mealCategories) {
            const label = document.createElement('div');
            label.className = 'health-week-meal-label';
            label.innerHTML = `<span style="color:${meal.color || 'var(--health-accent)'}">${meal.icon || '●'}</span><span>${meal.name}</span>`;
            grid.appendChild(label);

            for (const d of days) {
                const iso = toIsoDate(d);
                const entries = (entriesByDate[iso] || []).filter((e) => e.mealCategoryId === meal.id);
                const cell = document.createElement('div');
                cell.className = 'health-week-cell';
                const slot = document.createElement('div');
                slot.className = 'health-slot';
                if (entries.length === 0) slot.classList.add('health-slot--empty');
                slot.dataset.date = iso;
                slot.dataset.mealCategoryId = meal.id;
                slot.dataset.course = 'main';
                renderSlotChips(slot, entries, { recipesById, foodItemsById, onEntryClick }, { showCalories: false });
                wireSlotDropTarget(slot, () => ({ recipesById, foodItemsById }));
                cell.appendChild(slot);
                grid.appendChild(cell);
            }
        }

        // Totals row
        const totalsLabel = document.createElement('div');
        totalsLabel.className = 'health-week-meal-label';
        totalsLabel.textContent = 'kcal';
        grid.appendChild(totalsLabel);
        for (const d of days) {
            const iso = toIsoDate(d);
            const entries = entriesByDate[iso] || [];
            const t = planDayTotals(entries, recipesById, foodItemsById);
            const cell = document.createElement('div');
            cell.className = 'health-week-totals';
            cell.textContent = kcalFmt.format(t.kcal);
            grid.appendChild(cell);
        }
        // Reference unused imports to avoid lint noise.
        void weekdayNames;
    }

    return { root, render };
}
