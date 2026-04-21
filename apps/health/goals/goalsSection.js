/**
 * Goals section.
 * Lets the user create/edit/delete *time-bounded* goal periods. Each period
 * holds targets (calories, macros, micros, weight) and a start/end date
 * window. Downstream (Stats, Weight) consume the active period for the
 * relevant date range.
 */

import * as repos from '../store/repos.js';
import { healthSignals } from '../signals.js';
import {
    GOAL_TARGET_FIELDS, activePeriodFor, formatPeriodRange, isCurrentlyActive,
} from './goals.js';
import { toIsoDate, startOfDay } from '../dates.js';

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

function fmt(n, digits = 0) {
    if (!isFinite(n) || n == null) return '—';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

const FIELD_META = [
    { key: 'calorieTarget', label: 'Calories', suffix: 'kcal', step: 10, min: 0, digits: 0 },
    { key: 'proteinTarget_g', label: 'Protein', suffix: 'g', step: 1, min: 0, digits: 0 },
    { key: 'carbsTarget_g', label: 'Carbs', suffix: 'g', step: 1, min: 0, digits: 0 },
    { key: 'fatTarget_g', label: 'Fat', suffix: 'g', step: 1, min: 0, digits: 0 },
    { key: 'fiberTarget_g', label: 'Fiber (min)', suffix: 'g', step: 1, min: 0, digits: 0 },
    { key: 'sugarTargetMax_g', label: 'Sugar (max)', suffix: 'g', step: 1, min: 0, digits: 0 },
    { key: 'sodiumTargetMax_mg', label: 'Sodium (max)', suffix: 'mg', step: 50, min: 0, digits: 0 },
    { key: 'saturatedFatTargetMax_g', label: 'Sat. fat (max)', suffix: 'g', step: 1, min: 0, digits: 0 },
    { key: 'weightTargetKg', label: 'Target weight', suffix: 'kg', step: 0.1, min: 0, digits: 1 },
];

export function createGoalsSection() {
    const root = el('section', { class: 'health-goals' });
    root.setAttribute('aria-label', 'Goal periods');

    const state = {
        periods: [],
        editingId: null, // null | 'new' | <existing id>
    };

    const header = el('header', { class: 'health-goals-header' }, [
        el('div', { class: 'health-goals-header-titles' }, [
            el('h2', { class: 'health-goals-title' }, 'Goals'),
            el('p', { class: 'health-goals-subtitle' },
                'Set nutrition and weight targets that apply across a specific date range. Different periods can hold different goals — Stats and Weight use whichever period is active on each date.'),
        ]),
        el('button', {
            type: 'button',
            class: 'health-goals-btn health-goals-btn--primary',
            onclick: () => { state.editingId = 'new'; render(); },
        }, '+ New period'),
    ]);

    const activeBanner = el('div', { class: 'health-goals-active-banner' });
    const listHost = el('div', { class: 'health-goals-list' });
    const emptyHost = el('p', { class: 'health-stats-empty' },
        'No goal periods yet. Click “New period” to define your first targets.');

    root.append(header, activeBanner, listHost);

    // ------------- Form (create/edit) -------------
    function makeForm(existing) {
        const isNew = !existing;
        const today = toIsoDate(startOfDay(new Date()));
        const base = existing || { label: '', startDate: today, endDate: '' };
        const form = el('form', { class: 'health-goals-form' });

        form.appendChild(el('div', { class: 'health-goals-form-title' },
            isNew ? 'New goal period' : `Edit: ${base.label || formatPeriodRange(base)}`));

        // Top row: label + start + end
        const topRow = el('div', { class: 'health-goals-form-top' });
        const labelIn = el('input', { type: 'text', name: 'label', placeholder: 'Label (e.g. "Cut — Q2 2026")', value: base.label || '' });
        const startIn = el('input', { type: 'date', name: 'startDate', required: 'required', value: base.startDate || today });
        const endIn = el('input', { type: 'date', name: 'endDate', value: base.endDate || '' });
        topRow.append(
            el('label', { class: 'health-goals-field health-goals-field--wide' }, [
                el('span', { class: 'health-goals-field-label' }, 'Label'),
                labelIn,
            ]),
            el('label', { class: 'health-goals-field' }, [
                el('span', { class: 'health-goals-field-label' }, 'Start date'),
                startIn,
            ]),
            el('label', { class: 'health-goals-field' }, [
                el('span', { class: 'health-goals-field-label' }, 'End date'),
                el('span', { class: 'health-goals-field-date-wrap' }, [
                    endIn,
                    el('span', { class: 'health-goals-field-hint' }, 'empty = open-ended'),
                ]),
            ]),
        );
        form.appendChild(topRow);

        // Targets grid
        const grid = el('div', { class: 'health-goals-form-grid' });
        const inputsByKey = {};
        for (const m of FIELD_META) {
            const inp = el('input', {
                type: 'number', name: m.key,
                min: String(m.min), step: String(m.step),
                value: base[m.key] == null ? '' : String(base[m.key]),
                placeholder: '—',
            });
            inputsByKey[m.key] = inp;
            grid.appendChild(el('label', { class: 'health-goals-field' }, [
                el('span', { class: 'health-goals-field-label' }, m.label),
                el('span', { class: 'health-goals-field-wrap' }, [
                    inp,
                    el('span', { class: 'health-goals-field-suffix' }, m.suffix),
                ]),
            ]));
        }
        form.appendChild(grid);

        // Actions
        const actions = el('div', { class: 'health-goals-form-actions' });
        const saveBtn = el('button', { type: 'submit', class: 'health-goals-btn health-goals-btn--primary' }, isNew ? 'Create period' : 'Save changes');
        const cancelBtn = el('button', { type: 'button', class: 'health-goals-btn' }, 'Cancel');
        const deleteBtn = !isNew
            ? el('button', { type: 'button', class: 'health-goals-btn health-goals-btn--danger' }, 'Delete period')
            : null;
        actions.append(saveBtn, cancelBtn);
        if (deleteBtn) actions.appendChild(deleteBtn);
        form.appendChild(actions);

        cancelBtn.addEventListener('click', () => { state.editingId = null; render(); });

        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                if (!confirm(`Delete this goal period? This cannot be undone.`)) return;
                await repos.goalPeriods.remove(existing.id);
                state.editingId = null;
                // refresh() is triggered by onGoalsChanged.
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const startDate = startIn.value;
            const endDate = endIn.value || null;
            if (!startDate) { startIn.focus(); return; }
            if (endDate && endDate < startDate) {
                alert('End date cannot be before start date.');
                endIn.focus();
                return;
            }
            const patch = {
                id: existing?.id,
                createdAt: existing?.createdAt,
                version: existing?.version,
                label: labelIn.value.trim(),
                startDate,
                endDate,
            };
            for (const m of FIELD_META) {
                const raw = inputsByKey[m.key].value;
                patch[m.key] = raw === '' ? null : Number(raw);
            }
            await repos.goalPeriods.put(patch);
            state.editingId = null;
            // refresh() via onGoalsChanged.
        });

        return form;
    }

    // ------------- Period card (read-only) -------------
    function makeCard(period, { isActive }) {
        const card = el('article', { class: `health-goals-card${isActive ? ' is-active' : ''}` });

        const top = el('div', { class: 'health-goals-card-top' });
        const titles = el('div', { class: 'health-goals-card-titles' });
        titles.append(
            el('div', { class: 'health-goals-card-label' }, period.label || 'Unnamed period'),
            el('div', { class: 'health-goals-card-range' }, formatPeriodRange(period)),
        );
        if (isActive) titles.appendChild(el('span', { class: 'health-goals-card-badge' }, 'Active today'));
        top.appendChild(titles);

        const actions = el('div', { class: 'health-goals-card-actions' });
        actions.appendChild(el('button', {
            type: 'button', class: 'health-goals-btn',
            onclick: () => { state.editingId = period.id; render(); },
        }, 'Edit'));
        top.appendChild(actions);
        card.appendChild(top);

        // Targets summary
        const summary = el('div', { class: 'health-goals-card-targets' });
        const definedFields = FIELD_META.filter((m) => period[m.key] != null);
        if (!definedFields.length) {
            summary.appendChild(el('span', { class: 'health-stats-empty' }, 'No targets defined.'));
        } else {
            for (const m of definedFields) {
                summary.appendChild(el('div', { class: 'health-goals-target' }, [
                    el('span', { class: 'health-goals-target-label' }, m.label),
                    el('span', { class: 'health-goals-target-value' },
                        `${fmt(period[m.key], m.digits)} ${m.suffix}`),
                ]));
            }
        }
        card.appendChild(summary);
        return card;
    }

    // ------------- Active banner -------------
    function renderActiveBanner() {
        activeBanner.innerHTML = '';
        const today = toIsoDate(startOfDay(new Date()));
        const active = activePeriodFor(state.periods, today);
        if (!active) {
            activeBanner.appendChild(el('p', { class: 'health-goals-active-empty' },
                'No period is active today. Create one to start tracking adherence.'));
            return;
        }
        activeBanner.append(
            el('span', { class: 'health-goals-active-label' }, 'Active today:'),
            el('strong', {}, active.label || 'Unnamed period'),
            el('span', { class: 'health-goals-active-range' }, formatPeriodRange(active)),
        );
    }

    // ------------- Main render -------------
    function render() {
        renderActiveBanner();
        listHost.innerHTML = '';

        const today = toIsoDate(startOfDay(new Date()));
        // Sort: active-today first, then by startDate desc.
        const sorted = [...state.periods].sort((a, b) => {
            const aActive = isCurrentlyActive(a, today) ? 0 : 1;
            const bActive = isCurrentlyActive(b, today) ? 0 : 1;
            if (aActive !== bActive) return aActive - bActive;
            return (b.startDate || '').localeCompare(a.startDate || '');
        });

        if (state.editingId === 'new') {
            listHost.appendChild(makeForm(null));
        }

        if (!sorted.length && state.editingId !== 'new') {
            listHost.appendChild(emptyHost);
            return;
        }

        for (const p of sorted) {
            if (state.editingId === p.id) {
                listHost.appendChild(makeForm(p));
            } else {
                listHost.appendChild(makeCard(p, { isActive: isCurrentlyActive(p, today) }));
            }
        }
    }

    let refreshing = false;
    async function refresh() {
        if (refreshing) return;
        refreshing = true;
        try {
            // Attempt lazy migration from legacy prefs targets.
            await repos.goalPeriods.seedFromLegacyPrefsOnce();
            state.periods = await repos.goalPeriods.list();
            render();
        } catch (err) {
            console.error('[health-goals] refresh failed', err);
            root.innerHTML = '';
            root.appendChild(el('p', { class: 'health-stats-error' }, `Goals failed: ${err.message}`));
        } finally {
            refreshing = false;
        }
    }

    healthSignals.onGoalsChanged.add(refresh);
    healthSignals.onImportCompleted.add(refresh);

    return { root, refresh };
}
