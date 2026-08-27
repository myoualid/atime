/**
 * Sports planner app.
 *
 * Reuses meal-planner drag/drop and date helpers, plus the shared health
 * IndexedDB stores for sport definitions and planned sessions.
 */
import { makeDraggable, makeDropTarget, promptForNumber } from '../health/planner/dragdrop.js';
import { toIsoDate, addDays, startOfWeek, startOfMonth, endOfMonth, eachDayOfRange, formatShortDay, formatLongDate, isSameDay, weekdayNames } from '../health/dates.js';
import { sportDefinitions, sportPlan, prefs } from '../health/store/repos.js';
import { healthSignals } from '../health/signals.js';
import { DEFAULT_SPORTS } from './seed.js';

const SPORT_MIME = 'application/x-health-sport-drag';
const minFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'style') node.setAttribute('style', v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v);
    }
    const kids = Array.isArray(children) ? children : [children];
    for (const c of kids) {
        if (c == null) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
}

function libraryChip(def, onEdit) {
    const chip = el('div', {
        class: 'health-chip health-chip--library health-sport-chip',
        role: 'button',
        tabindex: '0',
        'aria-label': `Sport: ${def.name}, default ${def.defaultDurationMin} min`,
    });
    chip.innerHTML = `
        <span class="health-chip-thumb health-chip-thumb--placeholder">${def.icon || '🏃'}</span>
        <span class="health-chip-content">
            <span class="health-chip-top">
                <span class="health-chip-kind">SPORT</span>
                <span class="health-chip-name"></span>
            </span>
            <span class="health-chip-meta"></span>
        </span>
    `;
    chip.querySelector('.health-chip-name').textContent = def.name;
    chip.querySelector('.health-chip-meta').textContent = `${minFmt.format(def.defaultDurationMin)} min default`;
    makeDraggable(chip, () => ({
        kind: 'library-sport',
        sportDefinitionId: def.id,
        defaultDurationMin: def.defaultDurationMin,
        label: def.name,
    }), { mime: SPORT_MIME });
    if (onEdit) {
        chip.addEventListener('click', () => onEdit(def));
        chip.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(def); }
        });
    }
    return chip;
}

function entryChip(entry, defsById, onDragEnd) {
    const def = defsById[entry.sportDefinitionId];
    const chip = el('div', { class: 'health-chip health-sport-entry' + (def ? '' : ' health-chip--missing'), role: 'button', tabindex: '0' });
    const icon = def?.icon || '🏃';
    const name = def?.name || '(missing)';
    chip.innerHTML = `
        <span class="health-chip-thumb health-chip-thumb--placeholder">${icon}</span>
        <span class="health-chip-name"></span>
        <span class="health-chip-meta"></span>
    `;
    chip.querySelector('.health-chip-name').textContent = name;
    chip.querySelector('.health-chip-meta').textContent = `${minFmt.format(entry.durationMin)} min`;
    chip.setAttribute('aria-label', `${name}, ${entry.durationMin} minutes`);
    makeDraggable(chip, () => ({
        kind: 'sport-entry',
        sportEntryId: entry.id,
        label: name,
    }), { mime: SPORT_MIME, onDragEnd });
    return chip;
}

function renderSlotChips(slotBody, entries, defsById, { onEntryDragEnd }) {
    slotBody.innerHTML = '';
    if (!entries.length) {
        const empty = el('div', { class: 'health-slot-empty-text' }, 'Drop sport here');
        slotBody.appendChild(empty);
        return;
    }
    for (const entry of entries) slotBody.appendChild(entryChip(entry, defsById, onEntryDragEnd));
}

function wireSportSlotDropTarget(slotEl) {
    makeDropTarget(slotEl, async (payload, { copy }) => {
        const date = slotEl.dataset.date;
        if (!date) return;
        const rect = slotEl.getBoundingClientRect();

        if (payload.kind === 'library-sport') {
            const duration = await promptForNumber({
                label: `Duration (${payload.label || 'sport'})`,
                initial: payload.defaultDurationMin || 30,
                unit: 'min',
                anchorRect: rect,
            });
            if (duration == null || duration <= 0) return;
            await sportPlan.put({
                date,
                sportDefinitionId: payload.sportDefinitionId,
                durationMin: duration,
                slotOrder: Date.now(),
            });
        } else if (payload.kind === 'sport-entry') {
            if (copy) {
                // Duplicate: fetch source entry, drop id.
                const all = await sportPlan.listByRange('0000-01-01', '9999-12-31');
                const src = all.find((e) => e.id === payload.sportEntryId);
                if (!src) return;
                await sportPlan.put({ ...src, id: undefined, date, slotOrder: Date.now() });
            } else {
                await sportPlan.move({ id: payload.sportEntryId, date, slotOrder: Date.now() });
            }
        }
    }, { mime: SPORT_MIME });
}

// ---------- Library editor dialog ----------

function openEditor(existing, onSaved) {
    const backdrop = el('div', { class: 'health-modal-backdrop' });
    const modal = el('div', { class: 'health-modal' });
    const isNew = !existing;
    modal.innerHTML = `
        <div class="health-modal-header"><h3>${isNew ? 'New sport' : 'Edit sport'}</h3></div>
        <div class="health-modal-body">
            <label class="health-field"><span>Name</span><input data-f="name" type="text" required></label>
            <label class="health-field"><span>Icon (emoji)</span><input data-f="icon" type="text" maxlength="4"></label>
            <label class="health-field"><span>Default duration (min)</span><input data-f="dur" type="number" min="1" step="1"></label>
        </div>
        <div class="health-modal-actions">
            ${isNew ? '' : '<button type="button" data-a="del" class="health-btn health-btn--danger">Delete</button>'}
            <span class="spacer" style="flex:1"></span>
            <button type="button" data-a="cancel" class="health-btn">Cancel</button>
            <button type="button" data-a="save" class="health-btn health-btn--primary">${isNew ? 'Create' : 'Save'}</button>
        </div>
    `;
    const nameEl = modal.querySelector('[data-f="name"]');
    const iconEl = modal.querySelector('[data-f="icon"]');
    const durEl = modal.querySelector('[data-f="dur"]');
    nameEl.value = existing?.name || '';
    iconEl.value = existing?.icon || '🏃';
    durEl.value = existing?.defaultDurationMin ?? 30;

    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    modal.querySelector('[data-a="cancel"]').addEventListener('click', close);
    modal.querySelector('[data-a="save"]').addEventListener('click', async () => {
        const patch = {
            ...(existing || {}),
            name: nameEl.value.trim(),
            icon: iconEl.value.trim() || '🏃',
            defaultDurationMin: Math.max(1, Number(durEl.value) || 30),
        };
        if (!patch.name) { nameEl.focus(); return; }
        await sportDefinitions.put(patch);
        close();
        onSaved?.();
    });
    modal.querySelector('[data-a="del"]')?.addEventListener('click', async () => {
        if (!confirm(`Delete "${existing.name}"?`)) return;
        await sportDefinitions.remove(existing.id);
        close();
        onSaved?.();
    });

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    setTimeout(() => nameEl.focus(), 0);
}

// ---------- Main section factory ----------

export function createSportsSection() {
    const state = {
        view: 'week',          // 'day' | 'week' | 'month'
        current: new Date(),
        defs: [],
        defsById: {},
        weekStartsOn: 1,
    };

    const libraryRoot = el('aside', {
        class: 'health-sports-library',
        'aria-label': 'Sports library',
    });

    const plannerRoot = el('section', {
        class: 'health-section health-sports-section',
        'aria-label': 'Sports planner',
    });

    const header = el('header', { class: 'health-sports-header' });
    const title = el('h2', { class: 'health-h' }, 'Sports planner');
    const viewToggle = el('div', { class: 'health-sports-view-toggle' });
    for (const v of ['day', 'week', 'month']) {
        const btn = el('button', { type: 'button', class: 'health-btn', 'data-v': v }, v[0].toUpperCase() + v.slice(1));
        btn.addEventListener('click', () => { state.view = v; render(); });
        viewToggle.appendChild(btn);
    }
    const navRow = el('div', { class: 'health-sports-nav' });
    const prevBtn = el('button', { type: 'button', class: 'health-btn' }, '◀');
    const todayBtn = el('button', { type: 'button', class: 'health-btn' }, 'Today');
    const nextBtn = el('button', { type: 'button', class: 'health-btn' }, '▶');
    const currentLabel = el('span', { class: 'health-sports-current' });
    prevBtn.addEventListener('click', () => { shiftCurrent(-1); });
    nextBtn.addEventListener('click', () => { shiftCurrent(+1); });
    todayBtn.addEventListener('click', () => { state.current = new Date(); render(); });
    navRow.append(prevBtn, currentLabel, nextBtn, todayBtn);

    header.append(title, viewToggle, navRow);
    plannerRoot.appendChild(header);

    const calendarCol = el('div', { class: 'health-sports-calendar' });
    plannerRoot.appendChild(calendarCol);

    function shiftCurrent(dir) {
        if (state.view === 'day') state.current = addDays(state.current, dir);
        else if (state.view === 'week') state.current = addDays(state.current, dir * 7);
        else {
            const d = new Date(state.current);
            d.setMonth(d.getMonth() + dir);
            state.current = d;
        }
        render();
    }

    async function loadData() {
        const p = await prefs.get();
        state.weekStartsOn = p.weekStartsOn ?? 1;
        state.defs = await sportDefinitions.list();
        state.defsById = Object.fromEntries(state.defs.map((d) => [d.id, d]));
    }

    async function loadEntriesForRange(fromIso, toIso) {
        const all = await sportPlan.listByRange(fromIso, toIso);
        const byDate = {};
        for (const e of all) (byDate[e.date] = byDate[e.date] || []).push(e);
        return byDate;
    }

    function renderLibrary() {
        libraryRoot.innerHTML = '';
        const head = el('div', { class: 'health-sports-library-head' }, [
            el('h3', { class: 'health-h' }, 'Sports'),
            el('button', { type: 'button', class: 'health-btn health-btn--primary' }, '+ Sport'),
        ]);
        head.querySelector('button').addEventListener('click', () => {
            openEditor(null, () => { /* signal triggers refresh */ });
        });
        libraryRoot.appendChild(head);
        const grid = el('div', { class: 'health-sports-library-grid' });
        if (!state.defs.length) {
            grid.appendChild(el('p', { class: 'health-empty' }, 'No sports yet. Click "+ Sport" to add one.'));
        }
        for (const def of state.defs) grid.appendChild(libraryChip(def, openEditor));
        libraryRoot.appendChild(grid);
    }

    async function renderCalendar() {
        calendarCol.innerHTML = '';
        const onEntryDragEnd = async ({ event, payload, dropEffect }) => {
            if (payload?.kind !== 'sport-entry' || dropEffect !== 'none') return;
            const calRoot = calendarCol;
            const x = event.clientX, y = event.clientY;
            const endTarget = Number.isFinite(x) && Number.isFinite(y) ? document.elementFromPoint(x, y) : null;
            if (endTarget && calRoot.contains(endTarget)) return;
            await sportPlan.remove(payload.sportEntryId);
        };

        if (state.view === 'day') {
            const iso = toIsoDate(state.current);
            const byDate = await loadEntriesForRange(iso, iso);
            currentLabel.textContent = formatLongDate(state.current);
            const slot = el('div', { class: 'health-slot health-sports-day-slot' });
            slot.dataset.date = iso;
            const entries = byDate[iso] || [];
            if (!entries.length) slot.classList.add('health-slot--empty');
            renderSlotChips(slot, entries, state.defsById, { onEntryDragEnd });
            wireSportSlotDropTarget(slot);
            calendarCol.appendChild(slot);
        } else if (state.view === 'week') {
            const weekStart = startOfWeek(state.current, state.weekStartsOn);
            const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
            const endIso = toIsoDate(days[6]);
            const startIso = toIsoDate(days[0]);
            currentLabel.textContent = `Week of ${formatLongDate(days[0])}`;
            const byDate = await loadEntriesForRange(startIso, endIso);
            const grid = el('div', { class: 'health-sports-week-grid' });
            const today = new Date();
            for (const d of days) {
                const iso = toIsoDate(d);
                const cell = el('div', { class: 'health-sports-week-cell' + (isSameDay(d, today) ? ' is-today' : '') });
                const head = el('div', { class: 'health-sports-week-day-head' }, formatShortDay(d));
                const slot = el('div', { class: 'health-slot health-sports-week-slot' });
                slot.dataset.date = iso;
                const entries = byDate[iso] || [];
                if (!entries.length) slot.classList.add('health-slot--empty');
                renderSlotChips(slot, entries, state.defsById, { onEntryDragEnd });
                wireSportSlotDropTarget(slot);
                cell.append(head, slot);
                grid.appendChild(cell);
            }
            calendarCol.appendChild(grid);
            void weekdayNames;
        } else {
            // month
            const first = startOfMonth(state.current);
            const last = endOfMonth(state.current);
            const gridStart = startOfWeek(first, state.weekStartsOn);
            const gridEnd = addDays(startOfWeek(last, state.weekStartsOn), 6);
            currentLabel.textContent = state.current.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            const byDate = await loadEntriesForRange(toIsoDate(gridStart), toIsoDate(gridEnd));
            const days = eachDayOfRange(gridStart, gridEnd);
            const grid = el('div', { class: 'health-sports-month-grid' });
            const today = new Date();
            for (const d of days) {
                const iso = toIsoDate(d);
                const inMonth = d.getMonth() === state.current.getMonth();
                const cell = el('div', { class: 'health-sports-month-cell' + (inMonth ? '' : ' is-outside') + (isSameDay(d, today) ? ' is-today' : '') });
                cell.appendChild(el('div', { class: 'health-sports-month-num' }, String(d.getDate())));
                const slot = el('div', { class: 'health-slot health-sports-month-slot' });
                slot.dataset.date = iso;
                const entries = byDate[iso] || [];
                if (!entries.length) slot.classList.add('health-slot--empty');
                renderSlotChips(slot, entries, state.defsById, { onEntryDragEnd });
                wireSportSlotDropTarget(slot);
                cell.appendChild(slot);
                grid.appendChild(cell);
            }
            calendarCol.appendChild(grid);
        }

        // Mark active view button
        for (const btn of viewToggle.querySelectorAll('[data-v]')) {
            btn.classList.toggle('is-active', btn.dataset.v === state.view);
        }
    }

    let loading = false;
    async function render() {
        if (loading) return;
        loading = true;
        try {
            await loadData();
            renderLibrary();
            await renderCalendar();
        } finally { loading = false; }
    }

    async function seedOnce() {
        await sportDefinitions.bulkSeedIfEmpty(DEFAULT_SPORTS);
    }

    async function refresh() {
        await seedOnce();
        await render();
    }

    // Re-render on sport data changes.
    healthSignals.onSportsLibraryChanged.add(() => { render().catch(() => {}); });
    healthSignals.onSportsPlanChanged.add(() => { render().catch(() => {}); });

    return { libraryRoot, plannerRoot, refresh };
}
