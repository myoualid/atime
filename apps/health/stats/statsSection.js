/**
 * Meal-planner statistics section.
 * - Shows the goal period active on the selected date range.
 * - Weight evolution chart (vs. the active period's weight target).
 * - Nutritional analysis: descriptive stats, charts, adherence to goals.
 *
 * Depends on Chart.js being loaded globally as `window.Chart` (see index.html).
 */

import * as repos from '../store/repos.js';
import { healthSignals } from '../signals.js';
import {
    buildDaySeries, allNutrientStats, adherence, macroEnergy,
    frequency, mealCategoryBreakdown, weightStats,
} from './aggregate.js';
import { toIsoDate, fromIsoDate, startOfDay, addDays } from '../dates.js';
import {
    activePeriodFor, periodsOverlappingRange, formatPeriodRange, GOAL_TARGET_FIELDS,
} from '../goals/goals.js';

const ACCENT = '#d4af37';
const DIM = 'rgba(255,255,255,0.62)';
const GRID = 'rgba(255,255,255,0.08)';
const MACRO_COLORS = {
    protein: '#8fc3df',
    carbs: '#f0c44b',
    fat: '#e06666',
};

// --- defaults applied globally to every chart (once) ---
let chartDefaultsApplied = false;
function applyChartDefaults() {
    if (chartDefaultsApplied) return;
    const C = globalThis.Chart;
    if (!C) return;
    chartDefaultsApplied = true;
    C.defaults.color = 'rgba(255,255,255,0.82)';
    C.defaults.borderColor = GRID;
    C.defaults.font.family = 'Segoe UI, Tahoma, sans-serif';
    C.defaults.font.size = 11;
    C.defaults.plugins.legend.labels.color = 'rgba(255,255,255,0.82)';
}

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
    if (!isFinite(n)) return '—';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtKcal(n) { return `${fmt(n, 0)} kcal`; }
function fmtG(n) { return `${fmt(n, 1)} g`; }
function fmtMg(n) { return `${fmt(n, 0)} mg`; }
function fmtPct(n) { return `${fmt(n, 1)}%`; }
function fmtKg(n) { return `${fmt(n, 2)} kg`; }

function statKv(label, value, hint) {
    return el('div', { class: 'health-stats-kv' }, [
        el('span', { class: 'health-stats-kv-label' }, label),
        el('span', { class: 'health-stats-kv-value' }, value),
        hint ? el('span', { class: 'health-stats-kv-hint' }, hint) : null,
    ]);
}

function labeledInput({ label, type = 'number', step, min, value, placeholder, suffix, onInput }) {
    const id = `health-stats-${Math.random().toString(36).slice(2, 9)}`;
    const input = el('input', { id, type, step, min, placeholder: placeholder || '', value: value == null ? '' : String(value) });
    if (onInput) input.addEventListener('change', (e) => onInput(e.target.value));
    return el('label', { class: 'health-stats-field', for: id }, [
        el('span', { class: 'health-stats-field-label' }, label),
        el('span', { class: 'health-stats-field-wrap' }, [
            input,
            suffix ? el('span', { class: 'health-stats-field-suffix' }, suffix) : null,
        ]),
    ]);
}

function section(titleText, { right } = {}) {
    const header = el('header', { class: 'health-stats-section-header' }, [
        el('h3', { class: 'health-stats-section-title' }, titleText),
        right || null,
    ]);
    const body = el('div', { class: 'health-stats-section-body' });
    const root = el('section', { class: 'health-stats-section' }, [header, body]);
    return { root, body };
}

export function createStatsSection() {
    const root = el('section', { class: 'health-stats' });
    root.setAttribute('aria-label', 'Meal planner statistics');

    // ----------------- State -----------------
    const state = {
        prefs: null,
        entries: [],
        foodItems: [],
        recipes: [],
        categories: [],
        mealCategories: [],
        recipesById: {},
        foodItemsById: {},
        weight: [],
        goalPeriods: [],
        activeTargets: null,      // targets resolved for current range
        activePeriod: null,       // period whose targets are being used
        overlappingPeriods: [],
        rangeDays: 30,
        fromDate: null,
        toDate: null,
    };

    // ----------------- Layout -----------------
    const header = el('header', { class: 'health-stats-header' }, [
        el('h2', { class: 'health-stats-title' }, 'Statistics'),
        el('p', { class: 'health-stats-subtitle' },
            'Analyze nutrition and weight trends against the goal period that is active on each day.'),
    ]);

    // Range picker
    const rangeBar = el('div', { class: 'health-stats-rangebar' });
    const rangePresets = [
        { d: 7, label: '7 d' },
        { d: 14, label: '14 d' },
        { d: 30, label: '30 d' },
        { d: 90, label: '90 d' },
        { d: 365, label: '1 y' },
    ];
    for (const p of rangePresets) {
        rangeBar.appendChild(el('button', {
            type: 'button',
            class: 'health-stats-range-btn',
            'data-days': p.d,
            onclick: () => { state.rangeDays = p.d; state.fromDate = null; state.toDate = null; refresh(); },
        }, p.label));
    }
    const fromInput = el('input', { type: 'date', class: 'health-stats-range-date' });
    const toInput = el('input', { type: 'date', class: 'health-stats-range-date' });
    const applyRange = el('button', { type: 'button', class: 'health-stats-range-apply' }, 'Apply');
    applyRange.addEventListener('click', () => {
        if (fromInput.value && toInput.value) {
            state.fromDate = fromIsoDate(fromInput.value);
            state.toDate = fromIsoDate(toInput.value);
            refresh();
        }
    });
    rangeBar.appendChild(el('span', { class: 'health-stats-range-sep' }, 'or'));
    rangeBar.appendChild(fromInput);
    rangeBar.appendChild(el('span', { class: 'health-stats-range-sep' }, '→'));
    rangeBar.appendChild(toInput);
    rangeBar.appendChild(applyRange);

    // Build sections (refs for later population).
    const goalsSec = section('Active goal period', {});
    const weightSec = section('Weight evolution', {});
    const summarySec = section('Period summary', {});
    const caloriesSec = section('Calories', {});
    const macrosSec = section('Macronutrients', {});
    const microSec = section('Other nutrients', {});
    const distributionSec = section('Meal & macro distribution', {});
    const frequencySec = section('Frequent items', {});

    root.append(
        header,
        rangeBar,
        goalsSec.root,
        weightSec.root,
        summarySec.root,
        caloriesSec.root,
        macrosSec.root,
        microSec.root,
        distributionSec.root,
        frequencySec.root,
    );

    // ----------------- Chart registry (destroy/reuse by key) -----------------
    const charts = new Map();
    function renderChart(container, key, config) {
        if (!globalThis.Chart) {
            container.textContent = 'Chart.js not loaded';
            return null;
        }
        applyChartDefaults();
        const prev = charts.get(key);
        if (prev) { try { prev.destroy(); } catch { /* ignore */ } charts.delete(key); }
        container.innerHTML = '';
        const canvas = el('canvas', { class: 'health-stats-canvas' });
        container.appendChild(canvas);
        const chart = new globalThis.Chart(canvas.getContext('2d'), config);
        charts.set(key, chart);
        return chart;
    }

    // ----------------- Goal period summary -----------------
    function renderGoals() {
        goalsSec.body.innerHTML = '';
        const periods = state.overlappingPeriods;
        const active = state.activePeriod;
        const targets = state.activeTargets || {};

        const banner = el('div', { class: 'health-stats-goal-banner' });
        if (!periods.length) {
            banner.appendChild(el('p', { class: 'health-stats-empty' },
                'No goal period overlaps this range. Create one in the Goals section to see adherence.'));
            goalsSec.body.appendChild(banner);
            return;
        }
        if (active) {
            banner.append(
                el('strong', { class: 'health-stats-goal-banner-label' }, active.label || 'Unnamed period'),
                el('span', { class: 'health-stats-goal-banner-range' }, formatPeriodRange(active)),
            );
        } else {
            // Multiple periods overlap but none fully covers range end — show the latest.
            const latest = [...periods].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))[0];
            banner.append(
                el('strong', { class: 'health-stats-goal-banner-label' }, latest.label || 'Unnamed period'),
                el('span', { class: 'health-stats-goal-banner-range' }, formatPeriodRange(latest)),
            );
        }
        if (periods.length > 1) {
            banner.appendChild(el('span', { class: 'health-stats-goal-banner-note' },
                `${periods.length} periods overlap this range — adherence uses each day’s active period.`));
        }
        goalsSec.body.appendChild(banner);

        // Show targets (derived from active or latest overlapping period).
        const kvs = el('div', { class: 'health-stats-kvs' });
        const defined = [
            ['calorieTarget', 'Calories', fmtKcal],
            ['proteinTarget_g', 'Protein', fmtG],
            ['carbsTarget_g', 'Carbs', fmtG],
            ['fatTarget_g', 'Fat', fmtG],
            ['fiberTarget_g', 'Fiber (min)', fmtG],
            ['sugarTargetMax_g', 'Sugar (max)', fmtG],
            ['sodiumTargetMax_mg', 'Sodium (max)', fmtMg],
            ['saturatedFatTargetMax_g', 'Sat. fat (max)', fmtG],
            ['weightTargetKg', 'Target weight', fmtKg],
        ].filter(([k]) => targets[k] != null);

        if (!defined.length) {
            goalsSec.body.appendChild(el('p', { class: 'health-stats-hint' },
                'The active period has no targets defined yet.'));
        } else {
            for (const [k, label, f] of defined) {
                kvs.appendChild(statKv(label, f(targets[k]), null));
            }
            goalsSec.body.appendChild(kvs);
        }

        // Macro energy hint
        if (targets.proteinTarget_g && targets.carbsTarget_g && targets.fatTarget_g) {
            const e = macroEnergy({
                protein_g: targets.proteinTarget_g,
                carbs_g: targets.carbsTarget_g,
                fat_g: targets.fatTarget_g,
            });
            const total = (targets.proteinTarget_g * 4) + (targets.carbsTarget_g * 4) + (targets.fatTarget_g * 9);
            goalsSec.body.appendChild(el('p', { class: 'health-stats-hint' },
                `Macro targets imply ~${fmt(total, 0)} kcal (${fmtPct(e.protein_pct)} P · ${fmtPct(e.carbs_pct)} C · ${fmtPct(e.fat_pct)} F).`));
        }
    }

    // ----------------- Weight evolution chart -----------------
    function renderWeight() {
        weightSec.body.innerHTML = '';
        const points = state.weight;
        if (!points.length) {
            weightSec.body.appendChild(el('p', { class: 'health-stats-empty' },
                'No weight entries yet. Log measurements from the Weight section to see the evolution here.'));
            return;
        }

        const w = weightStats(points);
        const target = state.activeTargets?.weightTargetKg;
        const deltaToTarget = target ? (w.last.weightKg - target) : null;
        const kvs = el('div', { class: 'health-stats-kvs' });
        kvs.append(
            statKv('Latest', fmtKg(w.last.weightKg), w.last.date),
            statKv('Change', `${w.totalChangeKg >= 0 ? '+' : ''}${fmtKg(w.totalChangeKg)}`, `over ${fmt(w.spanDays, 0)} days`),
            statKv('Rate', `${fmtKg(w.ratePerWeekKg)}/wk`, null),
            statKv('Average', fmtKg(w.mean), null),
            statKv('Min – Max', `${fmtKg(w.min)} – ${fmtKg(w.max)}`, null),
            statKv('Std dev', fmtKg(w.stdDev), null),
            target ? statKv('Target', fmtKg(target),
                deltaToTarget == null ? null
                    : deltaToTarget > 0 ? `${fmtKg(deltaToTarget)} over`
                        : `${fmtKg(-deltaToTarget)} to go`) : null,
        );
        weightSec.body.appendChild(kvs);

        const chartHost = el('div', { class: 'health-stats-chart-host health-stats-chart-host--tall' });
        weightSec.body.appendChild(chartHost);

        const labels = points.map((p) => p.date);
        const datasets = [
            {
                label: 'Weight (kg)',
                data: points.map((p) => p.weightKg),
                borderColor: ACCENT,
                backgroundColor: 'rgba(212,175,55,0.16)',
                tension: 0.25,
                pointRadius: 3,
                fill: true,
            },
            {
                label: '7-pt moving avg',
                data: w.movingAverage,
                borderColor: '#8fc3df',
                borderDash: [4, 4],
                pointRadius: 0,
                fill: false,
            },
        ];
        if (target) {
            datasets.push({
                label: 'Target',
                data: new Array(points.length).fill(target),
                borderColor: '#58c073',
                borderDash: [2, 6],
                pointRadius: 0,
                fill: false,
            });
        }
        renderChart(chartHost, 'weight', {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { grid: { color: GRID }, ticks: { color: DIM } },
                    y: { grid: { color: GRID }, title: { display: true, text: 'kg' } },
                },
            },
        });
    }

    // ----------------- Period summary -----------------
    function renderSummary(series, nutrientAgg) {
        summarySec.body.innerHTML = '';
        const { days, totals } = series;
        const plannedDays = days.filter((d) => d.count > 0).length;
        const coverage = days.length ? (plannedDays / days.length) * 100 : 0;
        const avgKcalPlanned = plannedDays ? totals.kcal / plannedDays : 0;
        const kvs = el('div', { class: 'health-stats-kvs' });
        kvs.append(
            statKv('Days in range', fmt(days.length), null),
            statKv('Days planned', fmt(plannedDays), `${fmtPct(coverage)} coverage`),
            statKv('Total meals', fmt(days.reduce((s, d) => s + d.count, 0)), null),
            statKv('Total calories', fmtKcal(totals.kcal), null),
            statKv('Avg kcal / planned day', fmtKcal(avgKcalPlanned), null),
            statKv('Protein total', fmtG(totals.protein_g), null),
            statKv('Carbs total', fmtG(totals.carbs_g), null),
            statKv('Fat total', fmtG(totals.fat_g), null),
        );
        summarySec.body.appendChild(kvs);

        const target = state.activeTargets?.calorieTarget;
        if (target) {
            const adh = adherence(days, 'kcal', target, 0.1);
            if (adh) {
                const bar = el('div', { class: 'health-stats-adherence' }, [
                    el('span', {}, `Calorie goal adherence (±10%): `),
                    el('strong', {}, fmtPct(adh.adherencePct)),
                    el('span', { class: 'health-stats-hint' },
                        ` — ${adh.hits} on target, ${adh.overs} over, ${adh.unders} under, avg deviation ${fmtPct(adh.avgDeviationPct)} across ${adh.plannedDays} planned day(s).`),
                ]);
                summarySec.body.appendChild(bar);
            }
        }
    }

    // ----------------- Calories chart -----------------
    function renderCalories(series) {
        caloriesSec.body.innerHTML = '';
        const host = el('div', { class: 'health-stats-chart-host health-stats-chart-host--tall' });
        caloriesSec.body.appendChild(host);
        const labels = series.days.map((d) => d.date.slice(5));
        const target = state.activeTargets?.calorieTarget;
        const kcal = series.days.map((d) => d.nutrition.kcal || 0);
        // 7d moving avg
        const mov = kcal.map((_, i) => {
            const start = Math.max(0, i - 6);
            const slice = kcal.slice(start, i + 1);
            return slice.reduce((a, b) => a + b, 0) / slice.length;
        });
        const datasets = [
            {
                label: 'Calories',
                data: kcal,
                backgroundColor: kcal.map((v) => {
                    if (!target || !v) return 'rgba(212,175,55,0.55)';
                    if (v < target * 0.9) return 'rgba(143,195,223,0.7)';
                    if (v > target * 1.1) return 'rgba(224,102,102,0.75)';
                    return 'rgba(88,192,115,0.75)';
                }),
                borderColor: ACCENT,
                borderWidth: 0,
                type: 'bar',
            },
            {
                label: '7-day avg',
                data: mov,
                type: 'line',
                borderColor: ACCENT,
                backgroundColor: 'transparent',
                pointRadius: 0,
                borderWidth: 2,
                tension: 0.3,
            },
        ];
        if (target) {
            datasets.push({
                label: 'Target',
                data: new Array(labels.length).fill(target),
                type: 'line',
                borderColor: '#58c073',
                borderDash: [4, 4],
                pointRadius: 0,
                borderWidth: 1.5,
            });
        }
        renderChart(host, 'calories', {
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: DIM, maxRotation: 0, autoSkip: true }, grid: { display: false } },
                    y: { grid: { color: GRID }, title: { display: true, text: 'kcal' } },
                },
            },
        });
    }

    // ----------------- Macros chart -----------------
    function renderMacros(series, stats) {
        macrosSec.body.innerHTML = '';
        const kvs = el('div', { class: 'health-stats-kvs' });
        const keys = [
            { k: 'protein_g', label: 'Protein', tgt: state.activeTargets?.proteinTarget_g, fmt: fmtG },
            { k: 'carbs_g', label: 'Carbs', tgt: state.activeTargets?.carbsTarget_g, fmt: fmtG },
            { k: 'fat_g', label: 'Fat', tgt: state.activeTargets?.fatTarget_g, fmt: fmtG },
        ];
        for (const m of keys) {
            const s = stats[m.k];
            const adh = m.tgt ? adherence(series.days, m.k, m.tgt, 0.15) : null;
            kvs.append(statKv(
                m.label,
                `${m.fmt(s.mean)}/day`,
                `σ ${m.fmt(s.stdDev)} · range ${m.fmt(s.min)}–${m.fmt(s.max)}${adh ? ` · adh ${fmtPct(adh.adherencePct)}` : ''}`,
            ));
        }
        macrosSec.body.appendChild(kvs);

        const host = el('div', { class: 'health-stats-chart-host health-stats-chart-host--tall' });
        macrosSec.body.appendChild(host);

        const labels = series.days.map((d) => d.date.slice(5));
        const dataSets = [
            { label: 'Protein (g)', data: series.days.map((d) => d.nutrition.protein_g || 0), backgroundColor: MACRO_COLORS.protein, stack: 'macro' },
            { label: 'Carbs (g)', data: series.days.map((d) => d.nutrition.carbs_g || 0), backgroundColor: MACRO_COLORS.carbs, stack: 'macro' },
            { label: 'Fat (g)', data: series.days.map((d) => d.nutrition.fat_g || 0), backgroundColor: MACRO_COLORS.fat, stack: 'macro' },
        ];
        renderChart(host, 'macros', {
            type: 'bar',
            data: { labels, datasets: dataSets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { color: DIM } },
                    y: { stacked: true, grid: { color: GRID }, title: { display: true, text: 'grams' } },
                },
            },
        });
    }

    // ----------------- Micro / other nutrients -----------------
    function renderMicro(series, stats) {
        microSec.body.innerHTML = '';
        const host = el('div', { class: 'health-stats-chart-host' });
        microSec.body.appendChild(host);

        const labels = series.days.map((d) => d.date.slice(5));
        const datasets = [
            { label: 'Fiber (g)', data: series.days.map((d) => d.nutrition.fiber_g || 0), borderColor: '#58c073', backgroundColor: 'rgba(88,192,115,0.15)', tension: 0.25, fill: true, yAxisID: 'y' },
            { label: 'Sugar (g)', data: series.days.map((d) => d.nutrition.sugar_g || 0), borderColor: '#f0c44b', backgroundColor: 'rgba(240,196,75,0.12)', tension: 0.25, yAxisID: 'y', fill: false },
            { label: 'Saturated fat (g)', data: series.days.map((d) => d.nutrition.saturatedFat_g || 0), borderColor: '#e06666', backgroundColor: 'transparent', tension: 0.25, yAxisID: 'y', fill: false },
            { label: 'Sodium (mg)', data: series.days.map((d) => d.nutrition.sodium_mg || 0), borderColor: '#c084fc', backgroundColor: 'transparent', tension: 0.25, yAxisID: 'y2', fill: false },
        ];
        renderChart(host, 'micro', {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { grid: { display: false }, ticks: { color: DIM } },
                    y: { position: 'left', grid: { color: GRID }, title: { display: true, text: 'g' } },
                    y2: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'mg' } },
                },
            },
        });

        // Quick stats table for all nutrients
        const table = el('table', { class: 'health-stats-table' });
        table.appendChild(el('thead', {}, [el('tr', {}, [
            el('th', {}, 'Nutrient'),
            el('th', {}, 'Mean / day'),
            el('th', {}, 'Median'),
            el('th', {}, 'σ'),
            el('th', {}, 'Min'),
            el('th', {}, 'Max'),
            el('th', {}, 'Total'),
        ])]));
        const rows = [
            ['Calories', 'kcal', fmtKcal],
            ['Protein', 'protein_g', fmtG],
            ['Carbs', 'carbs_g', fmtG],
            ['Fat', 'fat_g', fmtG],
            ['Fiber', 'fiber_g', fmtG],
            ['Sugar', 'sugar_g', fmtG],
            ['Saturated fat', 'saturatedFat_g', fmtG],
            ['Sodium', 'sodium_mg', fmtMg],
        ];
        const tb = el('tbody');
        for (const [label, key, f] of rows) {
            const s = stats[key];
            tb.appendChild(el('tr', {}, [
                el('td', {}, label),
                el('td', {}, f(s.mean)),
                el('td', {}, f(s.median)),
                el('td', {}, f(s.stdDev)),
                el('td', {}, f(s.min)),
                el('td', {}, f(s.max)),
                el('td', {}, f(s.sum)),
            ]));
        }
        table.appendChild(tb);
        microSec.body.appendChild(table);
    }

    // ----------------- Distribution (meal category + macro pie) -----------------
    function renderDistribution(series) {
        distributionSec.body.innerHTML = '';
        const grid = el('div', { class: 'health-stats-twocol' });
        distributionSec.body.appendChild(grid);

        // Macro energy pie
        const macroHost = el('div', { class: 'health-stats-chart-host' });
        grid.appendChild(el('div', { class: 'health-stats-subpanel' }, [
            el('h4', {}, 'Calorie split by macro'),
            macroHost,
        ]));
        const me = macroEnergy(series.totals);
        renderChart(macroHost, 'macro-pie', {
            type: 'doughnut',
            data: {
                labels: [`Protein (${fmtPct(me.protein_pct)})`, `Carbs (${fmtPct(me.carbs_pct)})`, `Fat (${fmtPct(me.fat_pct)})`],
                datasets: [{
                    data: [me.protein_kcal, me.carbs_kcal, me.fat_kcal],
                    backgroundColor: [MACRO_COLORS.protein, MACRO_COLORS.carbs, MACRO_COLORS.fat],
                    borderColor: 'transparent',
                }],
            },
            options: { responsive: true, maintainAspectRatio: false },
        });

        // Meal category bar
        const mealHost = el('div', { class: 'health-stats-chart-host' });
        grid.appendChild(el('div', { class: 'health-stats-subpanel' }, [
            el('h4', {}, 'Calories by meal category'),
            mealHost,
        ]));
        const breakdown = mealCategoryBreakdown(state.entries, state.mealCategories, state.recipesById, state.foodItemsById);
        renderChart(mealHost, 'meal-cat', {
            type: 'bar',
            data: {
                labels: breakdown.map((b) => b.name),
                datasets: [{
                    label: 'kcal (total)',
                    data: breakdown.map((b) => b.kcal),
                    backgroundColor: breakdown.map((b) => b.color || ACCENT),
                    borderColor: 'transparent',
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: GRID }, title: { display: true, text: 'kcal' } },
                },
            },
        });
    }

    // ----------------- Frequency lists -----------------
    function renderFrequency() {
        frequencySec.body.innerHTML = '';
        const freq = frequency(state.entries, state.recipesById, state.foodItemsById);
        const grid = el('div', { class: 'health-stats-twocol' });
        const mkList = (title, items, valueFn) => {
            const panel = el('div', { class: 'health-stats-subpanel' });
            panel.appendChild(el('h4', {}, title));
            if (!items.length) {
                panel.appendChild(el('p', { class: 'health-stats-empty' }, 'No entries in this range.'));
                return panel;
            }
            const ul = el('ol', { class: 'health-stats-freq' });
            for (const it of items.slice(0, 10)) {
                ul.appendChild(el('li', {}, [
                    el('span', { class: 'health-stats-freq-name' }, it.name),
                    el('span', { class: 'health-stats-freq-val' }, valueFn(it)),
                ]));
            }
            panel.appendChild(ul);
            return panel;
        };
        grid.appendChild(mkList('Top recipes', freq.recipes, (r) => `${r.count}× · ${fmt(r.servings, 1)} servings`));
        grid.appendChild(mkList('Top foods', freq.foods, (f) => `${f.count}× · ${fmt(f.grams, 0)} g`));
        frequencySec.body.appendChild(grid);
    }

    // ----------------- Loaders / refresh -----------------
    function getRangeDates() {
        if (state.fromDate && state.toDate) {
            const a = state.fromDate <= state.toDate ? state.fromDate : state.toDate;
            const b = state.fromDate <= state.toDate ? state.toDate : state.fromDate;
            return { from: startOfDay(a), to: startOfDay(b) };
        }
        const today = startOfDay(new Date());
        return { from: addDays(today, -(state.rangeDays - 1)), to: today };
    }

    function renderRangeControls() {
        rangeBar.querySelectorAll('[data-days]').forEach((btn) => {
            btn.classList.toggle('is-active',
                !state.fromDate && Number(btn.dataset.days) === state.rangeDays);
        });
        const { from, to } = getRangeDates();
        fromInput.value = toIsoDate(from);
        toInput.value = toIsoDate(to);
    }

    async function loadAll() {
        const { from, to } = getRangeDates();
        const fromIso = toIsoDate(from);
        const toIso = toIsoDate(to);
        const [prefs, cats, foods, recs, entries, weightPoints, periods] = await Promise.all([
            repos.prefs.get(),
            repos.categories.list(),
            repos.foodItems.list(),
            repos.recipes.list(),
            repos.plan.listByRange(fromIso, toIso),
            repos.weight.list(),
            repos.goalPeriods.list(),
        ]);
        state.prefs = prefs;
        state.categories = cats;
        state.foodItems = foods;
        state.recipes = recs;
        state.mealCategories = cats.filter((c) => c.kind === 'meal');
        state.entries = entries;
        state.weight = weightPoints;
        state.recipesById = Object.fromEntries(recs.map((r) => [r.id, r]));
        state.foodItemsById = Object.fromEntries(foods.map((f) => [f.id, f]));
        state.goalPeriods = periods;
        state.overlappingPeriods = periodsOverlappingRange(periods, fromIso, toIso);
        // Pick the period that covers the *end* of the range as the primary
        // target source; if none, fall back to the most recent overlapping.
        const activeAtEnd = activePeriodFor(periods, toIso);
        state.activePeriod = activeAtEnd
            || [...state.overlappingPeriods].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))[0]
            || null;
        const targets = {};
        for (const f of GOAL_TARGET_FIELDS) targets[f] = state.activePeriod ? state.activePeriod[f] ?? null : null;
        state.activeTargets = targets;
    }

    let refreshing = false;
    async function refresh() {
        if (refreshing) return;
        refreshing = true;
        try {
            await loadAll();
            renderRangeControls();
            renderGoals();
            renderWeight();
            const { from, to } = getRangeDates();
            const series = buildDaySeries({
                fromDate: from, toDate: to,
                entries: state.entries,
                recipesById: state.recipesById,
                foodItemsById: state.foodItemsById,
            });
            const nstats = allNutrientStats(series.days);
            renderSummary(series, nstats);
            renderCalories(series);
            renderMacros(series, nstats);
            renderMicro(series, nstats);
            renderDistribution(series);
            renderFrequency();
        } catch (err) {
            console.error('[health-stats] refresh failed', err);
            root.innerHTML = '';
            root.appendChild(el('p', { class: 'health-stats-error' }, `Stats failed: ${err.message}`));
        } finally {
            refreshing = false;
        }
    }

    function destroyCharts() {
        for (const c of charts.values()) { try { c.destroy(); } catch { /* ignore */ } }
        charts.clear();
    }

    // React to data changes
    healthSignals.onPlanChanged.add(refresh);
    healthSignals.onLibraryChanged.add(refresh);
    healthSignals.onCategoriesChanged.add(refresh);
    healthSignals.onPrefsChanged.add(refresh);
    healthSignals.onWeightChanged.add(refresh);
    healthSignals.onGoalsChanged.add(refresh);
    healthSignals.onImportCompleted.add(refresh);

    return {
        root,
        refresh,
        destroy: destroyCharts,
    };
}
