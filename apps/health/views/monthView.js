import { toIsoDate, addDays, startOfMonth, endOfMonth, startOfWeek, isSameDay, weekdayNames } from '../dates.js';

export function createMonthView({ onDayClick, onEntryClick } = {}) {
    const root = document.createElement('div');
    root.className = 'health-month';

    function render({ currentDate, mealCategories, entriesByDate, recipesById, foodItemsById, weekStartsOn, today }) {
        root.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'health-month-grid';
        root.appendChild(grid);

        const categoryById = Object.fromEntries(mealCategories.map((c) => [c.id, c]));

        // Weekday headers
        for (const w of weekdayNames(weekStartsOn)) {
            const h = document.createElement('div');
            h.className = 'health-month-weekday';
            h.textContent = w;
            grid.appendChild(h);
        }

        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const gridStart = startOfWeek(monthStart, weekStartsOn);
        const daysCount = 42; // 6 weeks

        for (let i = 0; i < daysCount; i++) {
            const d = addDays(gridStart, i);
            const iso = toIsoDate(d);
            const cell = document.createElement('div');
            cell.className = 'health-month-cell';
            if (d.getMonth() !== monthStart.getMonth()) cell.classList.add('is-other');
            if (today && isSameDay(d, today)) cell.classList.add('is-today');
            cell.tabIndex = 0;
            cell.addEventListener('click', () => onDayClick?.(d));
            cell.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDayClick?.(d); }
            });

            const dateEl = document.createElement('div');
            dateEl.className = 'health-month-date';
            dateEl.textContent = String(d.getDate());
            cell.appendChild(dateEl);

            const entries = entriesByDate[iso] || [];
            const maxShown = 3;
            for (let j = 0; j < Math.min(maxShown, entries.length); j++) {
                const entry = entries[j];
                const pill = document.createElement('div');
                pill.className = 'health-month-pill';
                pill.setAttribute('role', 'button');
                pill.tabIndex = 0;
                const cat = categoryById[entry.mealCategoryId];
                if (cat?.color) pill.style.borderLeftColor = cat.color;
                let name = '(missing)';
                if (entry.target?.kind === 'recipe') {
                    name = recipesById[entry.target.recipeId]?.name || '(missing)';
                } else if (entry.target?.kind === 'food') {
                    name = foodItemsById[entry.target.foodItemId]?.name || '(missing)';
                }
                pill.textContent = name;
                const openEntry = () => onEntryClick?.({ date: d, entry });
                pill.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEntry();
                });
                pill.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        openEntry();
                    }
                });
                cell.appendChild(pill);
            }
            if (entries.length > maxShown) {
                const more = document.createElement('div');
                more.className = 'health-month-pill health-month-pill--more';
                more.textContent = `+${entries.length - maxShown} more`;
                cell.appendChild(more);
            }

            grid.appendChild(cell);

            if (d >= addDays(monthEnd, 7) && i >= 34) break; // early cut if fully past month
        }
    }

    return { root, render };
}
