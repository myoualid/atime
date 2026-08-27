import { DrawUI } from '../../shared/drawUI/index.js';
import { todayLocalIso } from './openMeteo.js';

export function clamp(min, max, value) {
    return Math.min(max, Math.max(min, value));
}

export function toNum(v) {
    if (v === null || v === undefined) return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
}

export function hasAnyFinite(values) {
    return values.some((v) => Number.isFinite(v));
}

export function meanFinite(values) {
    let s = 0;
    let c = 0;
    for (const v of values) {
        if (Number.isFinite(v)) {
            s += v;
            c += 1;
        }
    }
    return c > 0 ? s / c : NaN;
}

export function maxFinite(values) {
    let m = -Infinity;
    let found = false;
    for (const v of values) {
        if (!Number.isFinite(v)) continue;
        m = Math.max(m, v);
        found = true;
    }
    return found ? m : NaN;
}

export function shortTimeLabel(iso) {
    if (!iso) return '';
    const m = String(iso).match(
        /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/,
    );
    if (!m) return String(iso).slice(0, 16);
    return `${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
}

/**
 * @param {string[]} timesIso
 * @param {*} chart
 */
export function pixelXForNow(timesIso, chart) {
    if (!timesIso?.length) return null;
    const meta = chart.getDatasetMeta(0);
    const pts = meta?.data;
    if (!pts?.length) return null;
    const now = Date.now();
    const ms = timesIso.map((t) => new Date(t).getTime());
    const n = ms.length;
    if (n < 2) return null;
    const xAt = (j) => {
        const p = pts[j];
        return p && Number.isFinite(p.x) ? p.x : null;
    };
    if (now <= ms[0]) return xAt(0);
    if (now >= ms[n - 1]) return xAt(n - 1);
    for (let i = 0; i < n - 1; i++) {
        if (now >= ms[i] && now < ms[i + 1]) {
            const x0 = xAt(i);
            const x1 = xAt(i + 1);
            if (x0 === null || x1 === null) return null;
            const f = (now - ms[i]) / (ms[i + 1] - ms[i]);
            return x0 + f * (x1 - x0);
        }
    }
    return null;
}

/**
 * @param {string} pluginId
 * @param {() => string[]} getTimesIso
 * @param {null | (() => string)} getSelectedDay
 */
export function createNowLinePlugin(pluginId, getTimesIso, getSelectedDay) {
    return {
        id: pluginId,
        afterDatasetsDraw(chart) {
            if (
                getSelectedDay != null &&
                getSelectedDay() !== todayLocalIso()
            ) {
                return;
            }
            const timesIso = getTimesIso();
            const x = pixelXForNow(timesIso, chart);
            if (x === null || !Number.isFinite(x)) return;
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(212, 175, 55, 0.92)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(212, 175, 55, 0.95)';
            ctx.font = '600 10px system-ui,Segoe UI,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Now', x, chartArea.top + 11);
            ctx.restore();
        },
    };
}

export function getChartCtor() {
    const C = globalThis.Chart;
    if (typeof C !== 'function') {
        throw new Error(
            'Chart.js not loaded. Ensure vendor/chart/chart.js is included before the app module.',
        );
    }
    return C;
}

export function destroyChart(c) {
    if (c) {
        try {
            c.destroy();
        } catch {
            /* ignore */
        }
    }
    return null;
}

/** @returns {{ card: import('../../shared/drawUI/index.js').UIDiv, inner: import('../../shared/drawUI/index.js').UIDiv }} */
export function chartCard(titleText) {
    const card = DrawUI.div();
    card.setClass('weather-chart-card');
    const title = DrawUI.h3(titleText);
    title.setClass('weather-chart-title');
    const inner = DrawUI.div();
    inner.setClass('weather-chart-inner');
    card.add(title, inner);
    return { card, inner };
}

export function weatherBtn(label) {
    const btn = DrawUI.button(label);
    btn.setClass('weather-btn');
    btn.dom.type = 'button';
    return btn;
}

export function dateField(value) {
    const input = DrawUI.inputText(value);
    input.setClass('weather-date-input');
    input.dom.type = 'date';
    return input;
}

export function rangeSelect(id) {
    const select = DrawUI.inputDropdown();
    select.setClass('weather-select');
    if (id) select.setId(id);
    select.setOptions({
        7: 'Last 7 days',
        14: 'Last 14 days',
        30: 'Last 30 days',
    });
    select.setValue('14');
    return select;
}

export function addCanvas(parent, id) {
    const canvas = DrawUI.canvas();
    if (id) canvas.setId(id);
    parent.add(canvas);
    return canvas;
}

export function sectionChrome({ title, intro, statusText }) {
    const root = DrawUI.div();
    root.setClass('weather-section');

    const heading = DrawUI.h2(title);
    heading.setClass('weather-section-heading');

    const introEl = DrawUI.div();
    introEl.setClass('weather-section-intro');
    introEl.dom.textContent = intro;

    const status = DrawUI.div();
    status.setClass('weather-status');
    status.dom.textContent = statusText ?? 'Open this section to load data.';

    return { root, heading, intro: introEl, status };
}

export function makeTabbed() {
    const tabbed = DrawUI.tabbedPanel();
    tabbed.addClass('inner-tabbed-panel');
    tabbed.addClass('weather-tabbed');
    return tabbed;
}

/**
 * @param {string} title
 * @param {{ label?: string, content: import('../../shared/drawUI/index.js').UIDiv }[]} groups
 */
export function sidebarControls(title, groups) {
    const panel = DrawUI.div();
    panel.setClass('env-controls-panel');
    const heading = DrawUI.h3(title);
    heading.setClass('env-sidebar-heading');
    panel.add(heading);
    for (const { label, content } of groups) {
        const group = DrawUI.div();
        group.setClass('env-control-group');
        if (label) {
            const lab = DrawUI.div();
            lab.setClass('env-control-group-label');
            lab.dom.textContent = label;
            group.add(lab);
        }
        group.add(content);
        panel.add(group);
    }
    return panel;
}
