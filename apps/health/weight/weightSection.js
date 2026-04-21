/**
 * Weight tracking section.
 * - Month calendar view (like the meal planner month view).
 * - Click a day cell to enter/update a weight value inline.
 * - Shows summary stats and a target row.
 *
 * The evolution chart lives in the Stats section; this section focuses on data entry.
 */

import * as repos from '../store/repos.js';
import { healthSignals } from '../signals.js';
import { weightStats } from '../stats/aggregate.js';
import { activePeriodFor, formatPeriodRange } from '../goals/goals.js';
import {
    toIsoDate, fromIsoDate, startOfDay, startOfMonth, endOfMonth,
    startOfWeek, addDays, addMonths, isSameDay, formatMonthYear, weekdayNames,
} from '../dates.js';

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v != null) node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
        if (c == null) continue;
        node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
}

function fmt(n, digits = 2) {
    if (!isFinite(n)) return '—';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
const fmtKg = (n) => `${fmt(n, 2)} kg`;
const fmtPct = (n) => `${fmt(n, 1)}%`;

function statKv(label, value, hint) {
    return el('div', { class: 'health-stats-kv' }, [
        el('span', { class: 'health-stats-kv-label' }, label),
        el('span', { class: 'health-stats-kv-value' }, value),
        hint ? el('span', { class: 'health-stats-kv-hint' }, hint) : null,
    ]);
}

export function createWeightSection() {
    const root = el('section', { class: 'health-weight' });
    root.setAttribute('aria-label', 'Weight tracking');

    const state = {
        prefs: null,
        entries: [],          // all weight entries, sorted by date asc
        byDate: new Map(),    // isoDate -> entry
        cursor: startOfDay(new Date()),
        weekStartsOn: 1,
        goalPeriods: [],
    };

    // ---------- Header ----------
    const header = el('header', { class: 'health-weight-header' }, [
        el('div', { class: 'health-weight-header-titles' }, [
            el('h2', { class: 'health-weight-title' }, 'Weight tracking'),
            el('p', { class: 'health-weight-subtitle' },
                'Click any day to log your weight. Targets come from your active goal period — edit them in the Goals section.'),
        ]),
        el('div', { class: 'health-weight-target-display', 'data-target-display': '' }),
    ]);

    // ---------- Toolbar (month navigation) ----------
    const toolbar = el('div', { class: 'health-weight-toolbar' });
    toolbar.innerHTML = `
        <div class="health-weight-toolbar-group">
            <button type="button" data-act="prev" aria-label="Previous month">◂</button>
            <button type="button" data-act="today">Today</button>
            <button type="button" data-act="next" aria-label="Next month">▸</button>
            <span class="health-weight-month-label" data-label></span>
        </div>
        <div class="health-weight-toolbar-group health-weight-legend">
            <span class="health-weight-dot health-weight-dot--on-target"></span><span>On target</span>
            <span class="health-weight-dot health-weight-dot--over"></span><span>Over</span>
            <span class="health-weight-dot health-weight-dot--under"></span><span>Under</span>
        </div>
    `;

    // Summary KVs
    const summary = el('div', { class: 'health-weight-summary health-stats-kvs' });

    // Calendar host
    const calHost = el('div', { class: 'health-weight-calendar' });

    root.append(header, toolbar, summary, calHost);

    // ---------- Toolbar wiring ----------
    toolbar.querySelector('[data-act="prev"]').addEventListener('click', () => { state.cursor = addMonths(state.cursor, -1); render(); });
    toolbar.querySelector('[data-act="next"]').addEventListener('click', () => { state.cursor = addMonths(state.cursor, 1); render(); });
    toolbar.querySelector('[data-act="today"]').addEventListener('click', () => { state.cursor = startOfDay(new Date()); render(); });

    // ---------- Inline cell editor ----------
    // Only one cell editable at a time.
    let openEditorFor = null;

    function closeEditor() {
        openEditorFor = null;
        render();
    }

    function makeEditor(cell, iso, existing) {
        cell.classList.add('is-editing');
        const form = el('form', { class: 'health-weight-cell-form' });
        const input = el('input', {
            type: 'number', step: '0.1', min: '0',
            value: existing ? String(existing.weightKg) : '',
            placeholder: 'kg',
            class: 'health-weight-cell-input',
            'aria-label': `Weight for ${iso}`,
        });
        const actions = el('div', { class: 'health-weight-cell-actions' });
        const save = el('button', { type: 'submit', class: 'health-weight-cell-btn health-weight-cell-btn--primary', title: 'Save (Enter)' }, '✓');
        const cancel = el('button', { type: 'button', class: 'health-weight-cell-btn', title: 'Cancel (Esc)' }, '×');
        const remove = existing
            ? el('button', { type: 'button', class: 'health-weight-cell-btn health-weight-cell-btn--danger', title: 'Remove entry' }, '🗑')
            : null;
        actions.append(save, cancel);
        if (remove) actions.append(remove);
        form.append(input, actions);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const v = parseFloat(input.value);
            if (!(v > 0)) { input.focus(); return; }
            if (existing) {
                await repos.weight.put({ ...existing, date: iso, weightKg: v, bodyFatPct: existing.bodyFatPct ?? null, notes: existing.notes || '' });
            } else {
                await repos.weight.put({ date: iso, weightKg: v });
            }
            // onWeightChanged listener triggers refresh which re-renders.
        });

        cancel.addEventListener('click', (e) => { e.stopPropagation(); closeEditor(); });
        if (remove) remove.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!existing) return;
            if (!confirm(`Remove weight entry for ${iso}?`)) return;
            await repos.weight.remove(existing.id);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); closeEditor(); }
        });
        // Prevent outer click handler on cell from re-opening / collapsing.
        form.addEventListener('click', (e) => e.stopPropagation());

        return { form, focus: () => { input.focus(); input.select(); } };
    }

    function openCellEditor(iso) {
        openEditorFor = iso;
        render();
    }

    // Close editor when clicking outside cells.
    document.addEventListener('click', (e) => {
        if (!openEditorFor) return;
        if (!root.contains(e.target)) {
            closeEditor();
            return;
        }
        // Clicks inside another cell are handled per-cell.
    });

    // ---------- Period target helpers ----------
    /** Returns the weightTargetKg for a given ISO date, or null. */
    function targetForDate(iso) {
        const p = activePeriodFor(state.goalPeriods, iso);
        return p?.weightTargetKg ?? null;
    }

    function activePeriodForToday() {
        return activePeriodFor(state.goalPeriods, toIsoDate(startOfDay(new Date())));
    }

    function renderTargetDisplay() {
        const el2 = header.querySelector('[data-target-display]');
        el2.innerHTML = '';
        const active = activePeriodForToday();
        if (!active) {
            el2.appendChild(Object.assign(document.createElement('span'), {
                className: 'health-weight-target-hint',
                textContent: 'No active goal period — set one in Goals.',
            }));
            return;
        }
        const label = document.createElement('div');
        label.className = 'health-weight-target-period';
        label.textContent = active.label || 'Unnamed period';
        const range = document.createElement('div');
        range.className = 'health-weight-target-range';
        range.textContent = formatPeriodRange(active);
        const value = document.createElement('div');
        value.className = 'health-weight-target-value';
        value.textContent = active.weightTargetKg != null
            ? `Target: ${fmtKg(active.weightTargetKg)}`
            : 'No weight target in this period';
        el2.append(label, range, value);
    }

    // ---------- Classification ----------
    function classifyDelta(weightKg, target) {
        if (!target || !(weightKg > 0)) return 'none';
        const lo = target - 1; // ±1 kg band
        const hi = target + 1;
        if (weightKg > hi) return 'over';
        if (weightKg < lo) return 'under';
        return 'on';
    }

    // ---------- Render ----------
    function renderSummary() {
        summary.innerHTML = '';
        const active = activePeriodForToday();
        const target = active?.weightTargetKg ?? null;
        if (!state.entries.length) {
            summary.appendChild(el('p', { class: 'health-stats-empty' }, 'No entries yet — click any day in the calendar to log your first weight.'));
            return;
        }
        const w = weightStats(state.entries);
        const deltaToTarget = target ? (w.last.weightKg - target) : null;
        const rows = [
            statKv('Latest', fmtKg(w.last.weightKg), w.last.date),
            statKv('Entries', fmt(w.n, 0), null),
            statKv('Change', `${w.totalChangeKg >= 0 ? '+' : ''}${fmtKg(w.totalChangeKg)}`, `over ${fmt(w.spanDays, 0)} d`),
            statKv('Rate', `${fmtKg(w.ratePerWeekKg)}/wk`, null),
            statKv('Average', fmtKg(w.mean), null),
            statKv('Min – Max', `${fmtKg(w.min)} – ${fmtKg(w.max)}`, null),
            target ? statKv('Target', fmtKg(target),
                deltaToTarget == null ? null
                    : Math.abs(deltaToTarget) < 0.05 ? 'at target'
                        : deltaToTarget > 0 ? `${fmtKg(deltaToTarget)} over`
                            : `${fmtKg(-deltaToTarget)} to go`) : null,
        ].filter(Boolean);
        for (const r of rows) summary.appendChild(r);
    }

    function renderCalendar() {
        calHost.innerHTML = '';
        const grid = el('div', { class: 'health-weight-grid' });
        calHost.appendChild(grid);

        const weekStartsOn = state.weekStartsOn;
        for (const w of weekdayNames(weekStartsOn)) {
            grid.appendChild(el('div', { class: 'health-weight-weekday' }, w));
        }

        const monthStart = startOfMonth(state.cursor);
        const monthEnd = endOfMonth(state.cursor);
        const gridStart = startOfWeek(monthStart, weekStartsOn);
        const today = startOfDay(new Date());

        for (let i = 0; i < 42; i++) {
            const d = addDays(gridStart, i);
            const iso = toIsoDate(d);
            const cell = el('div', { class: 'health-weight-cell' });
            cell.tabIndex = 0;
            if (d.getMonth() !== monthStart.getMonth()) cell.classList.add('is-other');
            if (isSameDay(d, today)) cell.classList.add('is-today');
            if (d > today) cell.classList.add('is-future');

            const entry = state.byDate.get(iso);
            const target = targetForDate(iso);
            const cls = entry ? classifyDelta(entry.weightKg, target) : 'none';
            if (entry) {
                cell.classList.add('has-entry');
                if (cls !== 'none') cell.classList.add(`is-${cls}`);
            }

            const dateEl = el('div', { class: 'health-weight-cell-date' }, String(d.getDate()));
            cell.appendChild(dateEl);

            if (openEditorFor === iso) {
                const editor = makeEditor(cell, iso, entry);
                cell.appendChild(editor.form);
                // focus after insertion
                queueMicrotask(() => editor.focus());
            } else if (entry) {
                const valEl = el('div', { class: 'health-weight-cell-value' }, fmtKg(entry.weightKg));
                cell.appendChild(valEl);
                if (target) {
                    const delta = entry.weightKg - target;
                    const sign = delta > 0 ? '+' : '';
                    const deltaEl = el('div', { class: 'health-weight-cell-delta' },
                        Math.abs(delta) < 0.05 ? 'on target' : `${sign}${fmt(delta, 1)}`);
                    cell.appendChild(deltaEl);
                }
            }

            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                // Toggle editor
                if (openEditorFor === iso) return;
                openCellEditor(iso);
            });
            cell.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openCellEditor(iso);
                }
            });

            grid.appendChild(cell);
            // Early cut when we've covered the whole month (at least 35 cells shown).
            if (i >= 34 && d >= monthEnd) {
                // continue to finish current week row
                if ((i + 1) % 7 === 0) break;
            }
        }
    }

    function render() {
        toolbar.querySelector('[data-label]').textContent = formatMonthYear(state.cursor);
        renderTargetDisplay();
        renderSummary();
        renderCalendar();
    }

    // ---------- Loading ----------
    let refreshing = false;
    async function refresh() {
        if (refreshing) return;
        refreshing = true;
        try {
            const [prefs, entries, periods] = await Promise.all([
                repos.prefs.get(),
                repos.weight.list(),
                repos.goalPeriods.list(),
            ]);
            state.prefs = prefs;
            state.weekStartsOn = prefs?.weekStartsOn ?? 1;
            state.goalPeriods = periods;
            // If multiple entries exist for the same day, keep the most recent.
            const byDate = new Map();
            for (const e of entries) {
                const prev = byDate.get(e.date);
                if (!prev || (e.updatedAt || '') > (prev.updatedAt || '')) byDate.set(e.date, e);
            }
            state.byDate = byDate;
            state.entries = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
            render();
        } catch (err) {
            console.error('[health-weight] refresh failed', err);
            root.innerHTML = '';
            root.appendChild(el('p', { class: 'health-stats-error' }, `Weight tracking failed: ${err.message}`));
        } finally {
            refreshing = false;
        }
    }

    healthSignals.onWeightChanged.add(() => {
        openEditorFor = null;
        refresh();
    });
    healthSignals.onPrefsChanged.add(refresh);
    healthSignals.onGoalsChanged.add(refresh);
    healthSignals.onImportCompleted.add(refresh);

    return { root, refresh };
}
