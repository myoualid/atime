import { DrawUI } from '../../shared/drawUI/index.js';
import {
    OPEN_METEO_MARINE_HOURLY_SEA_AND_WAVES,
    marineUrl,
    parseMarineSeaLevelSeries,
    parseMarineWaveSeries,
    fetchJson,
    todayLocalIso,
    addDays,
} from './openMeteo.js';

const WAVE_PERIOD_HIGHLIGHT_S = 9;
const WAVE_ENERGY_HIGHLIGHT_KJ = 7;
const WAVE_TARGET_DEFAULT_M = 1.5;

function clamp(min, max, value) {
    return Math.min(max, Math.max(min, value));
}

/**
 * @param {string[]} timesIso
 * @param {*} chart
 */
function pixelXForNow(timesIso, chart) {
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
function createNowLinePlugin(pluginId, getTimesIso, getSelectedDay) {
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

/** @returns {import('../../shared/drawUI/index.js').UIDiv} */
function chartCard(titleText) {
    const card = DrawUI.div();
    card.setClass('weather-chart-card');
    const title = DrawUI.h3(titleText);
    title.setClass('weather-chart-title');
    const inner = DrawUI.div();
    inner.setClass('weather-chart-inner');
    card.add(title, inner);
    return { card, inner };
}

/**
 * @param {HTMLElement} host
 * @param {HTMLCanvasElement} canvas
 * @param {string} inputId
 * @param {number} initialValueM
 */
function mountWaveChartLayout(host, canvas, inputId, initialValueM) {
    const layout = document.createElement('div');
    layout.className = 'weather-wave-layout';

    const controlWrap = document.createElement('div');
    controlWrap.className = 'weather-wave-target-wrap';

    const controlLabel = document.createElement('label');
    controlLabel.className = 'weather-wave-target-control';
    controlLabel.setAttribute('for', inputId);

    const labelText = document.createElement('span');
    labelText.className = 'weather-wave-target-label';
    labelText.textContent = 'Target line';

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'weather-wave-target-input';
    input.id = inputId;
    input.step = '0.1';
    input.min = '0';
    input.max = '20';
    input.value = initialValueM.toFixed(1);
    input.setAttribute('aria-label', 'Wave height target line in metres');

    const unit = document.createElement('span');
    unit.className = 'weather-wave-target-unit';
    unit.textContent = 'm';

    controlLabel.append(labelText, input, unit);
    controlWrap.appendChild(controlLabel);

    const plotWrap = document.createElement('div');
    plotWrap.className = 'weather-wave-plot';
    plotWrap.appendChild(canvas);

    layout.append(controlWrap, plotWrap);
    host.appendChild(layout);
    return input;
}

/** @param {string} iso */
function shortTimeLabel(iso) {
    if (!iso) return '';
    const m = String(iso).match(
        /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/,
    );
    if (!m) return String(iso).slice(0, 16);
    return `${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
}

function toNum(v) {
    if (v === null || v === undefined) return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
}

/**
 * @param {string[]} targetTimes
 * @param {string[]} sourceTimes
 * @param {(number | null)[]} sourceValues
 */
function alignValuesByTime(targetTimes, sourceTimes, sourceValues) {
    if (!targetTimes?.length || !sourceTimes?.length || !sourceValues?.length) {
        return targetTimes.map(() => null);
    }
    const byTime = new Map();
    const n = Math.min(sourceTimes.length, sourceValues.length);
    for (let i = 0; i < n; i++) {
        byTime.set(String(sourceTimes[i]), sourceValues[i]);
    }
    return targetTimes.map((t) => {
        const v = byTime.get(String(t));
        return Number.isFinite(v) ? v : null;
    });
}

/**
 * @param {(number | null)[]} levels
 */
function findSeaLevelExtrema(levels) {
    const n = levels.length;
    const highs = [];
    const lows = [];
    for (let i = 1; i < n - 1; i++) {
        const a = levels[i - 1];
        const b = levels[i];
        const c = levels[i + 1];
        if (
            !Number.isFinite(a) ||
            !Number.isFinite(b) ||
            !Number.isFinite(c)
        ) {
            continue;
        }
        if (b > a && b > c) highs.push(i);
        if (b < a && b < c) lows.push(i);
    }
    return { highs, lows };
}

/** @param {(number | null | undefined)[]} values */
function meanFinite(values) {
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

/** @param {(number | null | undefined)[]} values */
function hasAnyFinite(values) {
    return values.some((v) => Number.isFinite(v));
}

/** @param {(number | null | undefined)[]} values */
function maxFinite(values) {
    let m = -Infinity;
    let found = false;
    for (const v of values) {
        if (!Number.isFinite(v)) continue;
        m = Math.max(m, v);
        found = true;
    }
    return found ? m : NaN;
}

/**
 * @param {string[]} timeIso
 * @param {(number | null)[]} values
 */
function nearestFiniteToNow(timeIso, values) {
    if (!timeIso?.length || !values?.length) return null;
    const now = Date.now();
    let bestI = -1;
    let bestAbs = Infinity;
    const n = Math.min(timeIso.length, values.length);
    for (let i = 0; i < n; i++) {
        const v = values[i];
        if (!Number.isFinite(v)) continue;
        const tMs = new Date(timeIso[i]).getTime();
        if (!Number.isFinite(tMs)) continue;
        const d = Math.abs(tMs - now);
        if (d < bestAbs) {
            bestAbs = d;
            bestI = i;
        }
    }
    if (bestI < 0) return null;
    return { time: timeIso[bestI], value: values[bestI] };
}

/**
 * @param {string[]} timeIso
 * @param {(number | null)[]} waveHeight
 * @param {(number | null)[]} windWaveHeight
 * @param {(number | null)[]} swellWaveHeight
 * @param {(number | null)[]} [wavePeriod]
 */
function formatWaveSummary(
    timeIso,
    waveHeight,
    windWaveHeight,
    swellWaveHeight,
    wavePeriod,
) {
    const near = nearestFiniteToNow(timeIso, waveHeight);
    const waveMax = maxFinite(waveHeight);
    const windWaveMax = maxFinite(windWaveHeight);
    const swellWaveMax = maxFinite(swellWaveHeight);
    const nearStr = near
        ? `${near.value.toFixed(2)} m at ${shortTimeLabel(near.time)}`
        : '—';
    const maxStr = Number.isFinite(waveMax)
        ? `${waveMax.toFixed(2)} m`
        : '—';
    const windMaxStr = Number.isFinite(windWaveMax)
        ? `${windWaveMax.toFixed(2)} m`
        : '—';
    const swellMaxStr = Number.isFinite(swellWaveMax)
        ? `${swellWaveMax.toFixed(2)} m`
        : '—';
    let extra = '';
    if (wavePeriod && near) {
        const idx = timeIso.indexOf(near.time);
        if (idx >= 0) {
            const T = wavePeriod[idx];
            const kj = waveEnergyKJ(near.value, T);
            const bits = [];
            if (Number.isFinite(T)) bits.push(`${T.toFixed(1)} s period`);
            if (Number.isFinite(kj)) bits.push(`${kj.toFixed(1)} kJ/s·m`);
            if (bits.length) extra = ` · Now ${bits.join(' · ')}`;
        }
    }
    return `Significant wave height near now: ${nearStr} · Window max: ${maxStr} · Wind-wave max: ${windMaxStr} · Swell max: ${swellMaxStr}.${extra}`;
}

/**
 * Wave energy flux per unit crest length (deep-water approximation),
 * expressed in kJ per second per metre (numerically equal to kW/m).
 *   P = (ρ g² / (64 π)) · H² · T  ≈ 0.49 · H² · T  (kW/m, seawater)
 * @param {number | null | undefined} heightM
 * @param {number | null | undefined} periodS
 */
function waveEnergyKJ(heightM, periodS) {
    if (!Number.isFinite(heightM) || !Number.isFinite(periodS)) return NaN;
    if (heightM <= 0 || periodS <= 0) return 0;
    return 0.49 * heightM * heightM * periodS;
}

/**
 * Chart.js plugin: renders normalised period + energy annotations above the
 * wave-height series. Labels are placed at evenly spaced x positions so they
 * read as a guide strip across the chart rather than a second line graph.
 *
 * @param {string} pluginId
 * @param {() => {
 *   timesIso: string[];
 *   periodS: (number | null)[];
 *   waveHeight: (number | null)[];
 * }} getData
 */
function createWaveAnnotationsPlugin(pluginId, getData) {
    const drawChip = (ctx, x, y, text, isHighlighted) => {
        const padX = 4;
        const w = ctx.measureText(text).width + padX * 2;
        ctx.fillStyle = isHighlighted
            ? 'rgba(212, 175, 55, 0.88)'
            : 'rgba(12, 20, 34, 0.72)';
        ctx.fillRect(x - w / 2, y, w, 14);
        ctx.fillStyle = isHighlighted
            ? 'rgba(12, 20, 34, 0.96)'
            : 'rgba(226, 232, 240, 0.96)';
        ctx.fillText(text, x, y + 2);
    };

    return {
        id: pluginId,
        afterDatasetsDraw(chart) {
            const { timesIso, periodS, waveHeight } = getData();
            if (!timesIso?.length) return;
            const meta = chart.getDatasetMeta(0);
            const pts = meta?.data;
            if (!pts?.length) return;
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            const n = Math.min(timesIso.length, pts.length);
            if (n === 0) return;

            // Aim for ~8–12 annotations spread across the chart.
            const width = chartArea.right - chartArea.left;
            const desired = Math.max(6, Math.min(12, Math.round(width / 110)));
            const step = Math.max(1, Math.round(n / desired));
            const yTop = chartArea.top + 4;

            ctx.save();
            ctx.font = '600 10px system-ui,Segoe UI,sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (let i = Math.floor(step / 2); i < n; i += step) {
                const p = pts[i];
                if (!p || !Number.isFinite(p.x)) continue;
                const T = periodS?.[i];
                const H = waveHeight?.[i];
                const kj = waveEnergyKJ(H, T);
                if (Number.isFinite(T)) {
                    drawChip(
                        ctx,
                        p.x,
                        yTop,
                        `${T.toFixed(0)}s`,
                        T >= WAVE_PERIOD_HIGHLIGHT_S,
                    );
                }
                if (Number.isFinite(kj)) {
                    drawChip(
                        ctx,
                        p.x,
                        yTop + 15,
                        `${kj.toFixed(0)}kJ`,
                        kj > WAVE_ENERGY_HIGHLIGHT_KJ,
                    );
                }
            }
            ctx.restore();
        },
    };
}

/**
 * @param {string} pluginId
 * @param {() => number} getTargetValue
 * @param {(value: number, sourceChart: any) => void} setTargetValue
 */
function createWaveTargetLinePlugin(pluginId, getTargetValue, setTargetValue) {
    let dragging = false;

    return {
        id: pluginId,
        afterDatasetsDraw(chart) {
            const yScale = chart.scales?.y;
            const { ctx, chartArea } = chart;
            if (!yScale || !chartArea) return;

            const target = getTargetValue();
            if (!Number.isFinite(target)) return;

            const y = yScale.getPixelForValue(target);
            if (!Number.isFinite(y)) return;

            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 138, 101, 0.92)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 5]);
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(chartArea.right, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255, 138, 101, 0.96)';
            ctx.font = '600 10px system-ui,Segoe UI,sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(
                `Target ${target.toFixed(1)} m`,
                chartArea.left + 4,
                clamp(chartArea.top + 14, chartArea.bottom - 2, y - 4),
            );
            ctx.restore();
        },
        afterEvent(chart, args) {
            const event = args?.event;
            if (!event) return;

            const yScale = chart.scales?.y;
            const chartArea = chart.chartArea;
            if (!yScale || !chartArea) return;

            const target = getTargetValue();
            if (!Number.isFinite(target)) return;

            const lineY = yScale.getPixelForValue(target);
            const insideX = event.x >= chartArea.left && event.x <= chartArea.right;
            const nearLine = insideX && Math.abs(event.y - lineY) <= 8;

            if (event.type === 'mousedown' && nearLine) {
                dragging = true;
                chart.canvas.style.cursor = 'ns-resize';
                const next = clamp(
                    yScale.min,
                    yScale.max,
                    yScale.getValueForPixel(event.y),
                );
                setTargetValue(next, chart);
                args.changed = true;
                return;
            }

            if (event.type === 'mousemove') {
                if (dragging) {
                    const next = clamp(
                        yScale.min,
                        yScale.max,
                        yScale.getValueForPixel(event.y),
                    );
                    setTargetValue(next, chart);
                    args.changed = true;
                    return;
                }
                chart.canvas.style.cursor = nearLine ? 'ns-resize' : 'default';
                return;
            }

            if (
                event.type === 'mouseup' ||
                event.type === 'mouseout' ||
                event.type === 'mouseleave'
            ) {
                dragging = false;
                chart.canvas.style.cursor = 'default';
            }
        },
    };
}

/**
 * @param {string[]} timeIso
 * @param {(number | null)[]} levels
 */
function dailyTidalRanges(timeIso, levels) {
    /** @type {Map<string, { min: number; max: number }>} */
    const map = new Map();
    for (let i = 0; i < timeIso.length; i++) {
        const day = String(timeIso[i]).slice(0, 10);
        const v = levels[i];
        if (!Number.isFinite(v)) continue;
        let o = map.get(day);
        if (!o) {
            o = { min: v, max: v };
            map.set(day, o);
        } else {
            o.min = Math.min(o.min, v);
            o.max = Math.max(o.max, v);
        }
    }
    const dates = [...map.keys()].sort();
    return {
        labels: dates.map((d) => d.slice(5)),
        ranges: dates.map((d) => map.get(d).max - map.get(d).min),
        dates,
    };
}

/**
 * @param {string[]} timeIso
 * @param {(number | null)[]} levels
 * @param {number} mean
 */
function formatTideEventLines(timeIso, levels, mean) {
    const { highs, lows } = findSeaLevelExtrema(levels);
    /** @type {{ kind: 'high' | 'low'; i: number }[]} */
    const ev = [];
    highs.forEach((i) => ev.push({ kind: 'high', i }));
    lows.forEach((i) => ev.push({ kind: 'low', i }));
    ev.sort((a, b) => a.i - b.i);
    return ev.map(({ kind, i }) => {
        const h = levels[i];
        const t = timeIso[i];
        const short = shortTimeLabel(t);
        const delta =
            Number.isFinite(h) && Number.isFinite(mean) ? h - mean : NaN;
        const tag = kind === 'high' ? 'High' : 'Low';
        const dStr = Number.isFinite(delta)
            ? `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} m vs mean`
            : '—';
        return `${tag} · ${short} · ${
            Number.isFinite(h) ? `${h.toFixed(2)} m` : '—'
        } (${dStr})`;
    });
}

/**
 * @param {HTMLElement} container
 * @param {string[]} lines
 */
function fillTideEventsList(container, lines) {
    container.replaceChildren();
    const ul = document.createElement('ul');
    ul.className = 'weather-tide-events';
    for (const line of lines) {
        const li = document.createElement('li');
        li.textContent = line;
        ul.appendChild(li);
    }
    container.appendChild(ul);
}

/**
 * @param {unknown} json
 * @param {string} dateStr yyyy-mm-dd
 */
function sliceMarineHourlyForDate(json, dateStr) {
    const hourly = json?.hourly;
    if (!hourly?.time || !Array.isArray(hourly.time)) return null;
    const prefix = String(dateStr);
    const idx = [];
    for (let i = 0; i < hourly.time.length; i++) {
        if (String(hourly.time[i]).startsWith(prefix)) idx.push(i);
    }
    if (idx.length === 0) return null;
    return {
        time: idx.map((i) => hourly.time[i]),
        seaLevelM: idx.map((i) => hourly.sea_level_height_msl?.[i]),
        waveHeightM: idx.map((i) => hourly.wave_height?.[i]),
        windWaveHeightM: idx.map((i) => hourly.wind_wave_height?.[i]),
        swellWaveHeightM: idx.map((i) => hourly.swell_wave_height?.[i]),
        wavePeriodS: idx.map((i) => hourly.wave_period?.[i]),
    };
}

/** @param {unknown} json */
function marineHourlyDateBounds(json) {
    const t = json?.hourly?.time;
    if (!t?.length) return { min: null, max: null };
    const first = String(t[0]).slice(0, 10);
    const last = String(t[t.length - 1]).slice(0, 10);
    return { min: first, max: last };
}

function getChartCtor() {
    const C = globalThis.Chart;
    if (typeof C !== 'function') {
        throw new Error(
            'Chart.js not loaded. Ensure vendor/chart/chart.js is included before the app module.',
        );
    }
    return C;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   labels: string[];
 *   seaLevel: (number | null)[];
 *   mean: number;
 *   highIdx: Set<number>;
 *   lowIdx: Set<number>;
 *   timesIso: string[];
 * }} data
 * @param {{ yTitle?: string; xMaxTicks?: number }} [opts]
 * @param {object[]} [extraPlugins]
 */
function createSeaLevelChart(canvas, data, opts = {}, extraPlugins = []) {
    const Chart = getChartCtor();
    const maxTicks = opts.xMaxTicks ?? 14;
    const { labels, seaLevel, mean, timesIso } = data;
    const highSet =
        data.highIdx instanceof Set ? data.highIdx : new Set(data.highIdx);
    const lowSet =
        data.lowIdx instanceof Set ? data.lowIdx : new Set(data.lowIdx);
    const n = labels.length;
    const meanOk = Number.isFinite(mean);
    const meanArr = meanOk ? Array(n).fill(mean) : Array(n).fill(null);
    const highs = seaLevel.map((v, i) =>
        highSet.has(i) && Number.isFinite(v) ? v : null,
    );
    const lows = seaLevel.map((v, i) =>
        lowSet.has(i) && Number.isFinite(v) ? v : null,
    );
    return new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Sea level',
                    data: seaLevel,
                    borderColor: 'rgba(79, 195, 247, 0.95)',
                    backgroundColor: 'rgba(79, 195, 247, 0.12)',
                    fill: true,
                    tension: 0.25,
                    spanGaps: false,
                },
                {
                    label: 'Window mean',
                    data: meanArr,
                    borderColor: 'rgba(212, 175, 55, 0.72)',
                    borderDash: [6, 4],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    spanGaps: true,
                },
                {
                    label: 'Est. high',
                    data: highs,
                    borderColor: 'rgba(179, 229, 252, 0.98)',
                    backgroundColor: 'rgba(179, 229, 252, 0.95)',
                    showLine: false,
                    fill: false,
                    pointRadius: 6,
                    spanGaps: true,
                },
                {
                    label: 'Est. low',
                    data: lows,
                    borderColor: 'rgba(255, 183, 77, 0.98)',
                    backgroundColor: 'rgba(255, 183, 77, 0.95)',
                    showLine: false,
                    fill: false,
                    pointRadius: 6,
                    spanGaps: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: { color: 'rgba(255,255,255,0.82)' },
                },
                tooltip: {
                    callbacks: {
                        title(items) {
                            const i = items[0]?.dataIndex;
                            return i >= 0 && timesIso[i]
                                ? String(timesIso[i]).replace('T', ' ')
                                : '';
                        },
                    },
                },
            },
            scales: {
                x: {
                    ticks: {
                        color: 'rgba(255,255,255,0.55)',
                        maxTicksLimit: maxTicks,
                        autoSkip: true,
                    },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                },
                y: {
                    title: {
                        display: true,
                        text: opts.yTitle ?? 'm (global MSL)',
                        color: 'rgba(255,255,255,0.55)',
                    },
                    ticks: { color: 'rgba(255,255,255,0.55)' },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                },
            },
        },
        plugins: extraPlugins,
    });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   labels: string[];
 *   timesIso: string[];
 *   waveHeight: (number | null)[];
 *   windWaveHeight: (number | null)[];
 *   swellWaveHeight: (number | null)[];
 *   seaLevel?: (number | null)[];
 * }} data
 * @param {{ yTitle?: string; xMaxTicks?: number }} [opts]
 * @param {object[]} [extraPlugins]
 */
function createWaveHeightChart(canvas, data, opts = {}, extraPlugins = []) {
    const Chart = getChartCtor();
    const maxTicks = opts.xMaxTicks ?? 14;
    const {
        labels,
        timesIso,
        waveHeight,
        windWaveHeight,
        swellWaveHeight,
        seaLevel,
    } = data;
    const hasSeaLevel = Array.isArray(seaLevel) && hasAnyFinite(seaLevel);

    const datasets = [
        {
            label: 'Wave height',
            data: waveHeight,
            borderColor: 'rgba(66, 165, 245, 0.96)',
            backgroundColor: 'rgba(66, 165, 245, 0.18)',
            fill: true,
            tension: 0.25,
            spanGaps: true,
        },
        {
            label: 'Wind wave',
            data: windWaveHeight,
            borderColor: 'rgba(255, 213, 79, 0.95)',
            backgroundColor: 'rgba(255, 213, 79, 0.18)',
            fill: false,
            tension: 0.25,
            spanGaps: true,
        },
        {
            label: 'Swell wave',
            data: swellWaveHeight,
            borderColor: 'rgba(129, 199, 132, 0.95)',
            backgroundColor: 'rgba(129, 199, 132, 0.18)',
            fill: false,
            tension: 0.25,
            spanGaps: true,
        },
    ];

    if (hasSeaLevel) {
        datasets.push({
            label: 'Sea level (tide)',
            data: seaLevel,
            borderColor: 'rgba(230, 238, 156, 0.96)',
            backgroundColor: 'rgba(230, 238, 156, 0.08)',
            borderDash: [5, 4],
            fill: false,
            tension: 0.2,
            spanGaps: true,
            pointRadius: 0,
        });
    }

    return new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 34 } },
            plugins: {
                legend: {
                    labels: { color: 'rgba(255,255,255,0.82)' },
                },
                tooltip: {
                    callbacks: {
                        title(items) {
                            const i = items[0]?.dataIndex;
                            return i >= 0 && timesIso[i]
                                ? String(timesIso[i]).replace('T', ' ')
                                : '';
                        },
                    },
                },
            },
            scales: {
                x: {
                    ticks: {
                        color: 'rgba(255,255,255,0.55)',
                        maxTicksLimit: maxTicks,
                        autoSkip: true,
                    },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                },
                y: {
                    title: {
                        display: true,
                        text: opts.yTitle ?? 'm (significant height)',
                        color: 'rgba(255,255,255,0.55)',
                    },
                    ticks: { color: 'rgba(255,255,255,0.55)' },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    beginAtZero: true,
                },
            },
        },
        plugins: extraPlugins,
    });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ labels: string[]; ranges: number[] }} daily
 */
function createTideRangeChart(canvas, daily) {
    const Chart = getChartCtor();
    return new Chart(canvas, {
        type: 'bar',
        data: {
            labels: daily.labels,
            datasets: [
                {
                    label: 'Daily range (max − min)',
                    data: daily.ranges,
                    backgroundColor: 'rgba(100, 181, 246, 0.42)',
                    borderColor: 'rgba(100, 181, 246, 0.9)',
                    borderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: 'rgba(255,255,255,0.82)' },
                },
            },
            scales: {
                x: {
                    ticks: { color: 'rgba(255,255,255,0.55)' },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                },
                y: {
                    title: {
                        display: true,
                        text: 'm',
                        color: 'rgba(255,255,255,0.55)',
                    },
                    ticks: { color: 'rgba(255,255,255,0.55)' },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    beginAtZero: true,
                },
            },
        },
    });
}

/**
 * @param {{
 *   core: { signals: { onLocationChanged: { add: Function; remove: Function } } };
 *   services: { LocationService: { latitude: number; longitude: number } };
 *   onMarineReferenceChanged?: (coords: { lat: number; lon: number; source: string } | null) => void;
 * }} ctx
 */
export function createTideSection(ctx) {
    const { core, services } = ctx;
    const onMarineReferenceChanged =
        typeof ctx.onMarineReferenceChanged === 'function'
            ? ctx.onMarineReferenceChanged
            : () => {};

    const root = DrawUI.div();
    root.setClass('weather-section');

    const heading = DrawUI.h2('Tides & Waves');
    heading.setClass('weather-section-heading');

    const intro = DrawUI.div();
    intro.setClass('weather-section-intro');
    intro.dom.textContent =
        'Modelled sea level and waves from Open-Meteo Marine (hourly, ~8 km ocean grid). Heights are informational only and not suitable for navigation.';

    const status = DrawUI.div();
    status.setClass('weather-status');
    status.dom.textContent = 'Open this section to load data.';

    const tabbed = DrawUI.tabbedPanel();
    tabbed.addClass('inner-tabbed-panel');
    tabbed.addClass('weather-tabbed');

    /* ---- Forecast ---- */
    const forecastWrap = DrawUI.div();
    forecastWrap.setClass('weather-tab-content');
    const fcToolbar = DrawUI.div();
    fcToolbar.setClass('weather-toolbar');
    const fcMeta = DrawUI.div();
    fcMeta.setClass('weather-meta');
    fcMeta.dom.textContent =
        'Past ~2 days through next ~8 days (hourly). Gold dashed line = current time.';
    const refreshFcBtn = document.createElement('button');
    refreshFcBtn.type = 'button';
    refreshFcBtn.className = 'weather-btn';
    refreshFcBtn.textContent = 'Refresh forecast';
    fcToolbar.dom.appendChild(refreshFcBtn);

    const fcSummary = DrawUI.div();
    fcSummary.setClass('weather-tide-summary');
    const fcWaveSummary = DrawUI.div();
    fcWaveSummary.setClass('weather-tide-summary');

    const fcSea = chartCard('Sea level (modelled, incl. tides)');
    const fcWaves = chartCard('Wave height (significant, wind, swell)');
    const fcRange = chartCard('Daily tidal range (max − min)');
    fcWaves.inner.dom.classList.add('weather-chart-inner-wave');
    const fcSeaCanvas = document.createElement('canvas');
    const fcWaveCanvas = document.createElement('canvas');
    const fcRangeCanvas = document.createElement('canvas');
    fcSea.inner.dom.appendChild(fcSeaCanvas);
    const fcWaveTargetInput = mountWaveChartLayout(
        fcWaves.inner.dom,
        fcWaveCanvas,
        'tide-wave-target-fc',
        WAVE_TARGET_DEFAULT_M,
    );
    fcRange.inner.dom.appendChild(fcRangeCanvas);

    const fcEvents = DrawUI.div();
    fcEvents.setClass('weather-tide-events-wrap');

    forecastWrap.add(
        fcToolbar,
        fcMeta,
        fcSummary,
        fcSea.card,
        fcWaveSummary,
        fcWaves.card,
        fcRange.card,
        fcEvents,
    );

    /* ---- Day ---- */
    const dayWrap = DrawUI.div();
    dayWrap.setClass('weather-tab-content');
    const dayToolbar = DrawUI.div();
    dayToolbar.setClass('weather-toolbar weather-toolbar-wrap');
    const dayDateLabel = DrawUI.span('Day: ');
    dayDateLabel.setClass('weather-range-label');
    const dayDateInput = document.createElement('input');
    dayDateInput.type = 'date';
    dayDateInput.className = 'weather-date-input';
    dayDateInput.id = 'tide-day-date';
    dayDateInput.value = todayLocalIso();
    const applyDayBtn = document.createElement('button');
    applyDayBtn.type = 'button';
    applyDayBtn.className = 'weather-btn';
    applyDayBtn.textContent = 'Apply';
    dayToolbar.dom.appendChild(dayDateLabel.dom);
    dayToolbar.dom.appendChild(dayDateInput);
    dayToolbar.dom.appendChild(applyDayBtn);

    const dayMeta = DrawUI.div();
    dayMeta.setClass('weather-meta');
    dayMeta.dom.textContent =
        'Hourly sea level for the selected calendar day. Vertical marker = now only when that day is today.';

    const daySea = chartCard('Sea level');
    const daySeaCanvas = document.createElement('canvas');
    daySea.inner.dom.appendChild(daySeaCanvas);

    const dayWaveSummary = DrawUI.div();
    dayWaveSummary.setClass('weather-tide-summary');
    const dayWaves = chartCard('Wave height (significant, wind, swell)');
    dayWaves.inner.dom.classList.add('weather-chart-inner-wave');
    const dayWaveCanvas = document.createElement('canvas');
    const dayWaveTargetInput = mountWaveChartLayout(
        dayWaves.inner.dom,
        dayWaveCanvas,
        'tide-wave-target-day',
        WAVE_TARGET_DEFAULT_M,
    );

    const dayEvents = DrawUI.div();
    dayEvents.setClass('weather-tide-events-wrap');

    dayWrap.add(
        dayToolbar,
        dayMeta,
        daySea.card,
        dayWaveSummary,
        dayWaves.card,
        dayEvents,
    );

    /* ---- History ---- */
    const historyWrap = DrawUI.div();
    historyWrap.setClass('weather-tab-content');
    const hiToolbar = DrawUI.div();
    hiToolbar.setClass('weather-toolbar weather-toolbar-wrap');

    const rangeLabel = DrawUI.span('Range: ');
    rangeLabel.setClass('weather-range-label');

    const presetSelect = document.createElement('select');
    presetSelect.className = 'weather-select';
    presetSelect.id = 'tide-history-preset';
    presetSelect.innerHTML = `
      <option value="7">Last 7 days</option>
      <option value="14" selected>Last 14 days</option>
      <option value="30">Last 30 days</option>
    `;

    const loadHistBtn = document.createElement('button');
    loadHistBtn.type = 'button';
    loadHistBtn.className = 'weather-btn';
    loadHistBtn.textContent = 'Load history';

    hiToolbar.dom.appendChild(rangeLabel.dom);
    hiToolbar.dom.appendChild(presetSelect);
    hiToolbar.dom.appendChild(loadHistBtn);

    const historyMeta = DrawUI.div();
    historyMeta.setClass('weather-meta');
    historyMeta.dom.textContent = '';

    const hiSea = chartCard('Sea level (history)');
    const hiRange = chartCard('Daily tidal range (history)');
    const hiSeaCanvas = document.createElement('canvas');
    const hiRangeCanvas = document.createElement('canvas');
    hiSea.inner.dom.appendChild(hiSeaCanvas);
    hiRange.inner.dom.appendChild(hiRangeCanvas);

    const hiWaveSummary = DrawUI.div();
    hiWaveSummary.setClass('weather-tide-summary');
    const hiWaves = chartCard('Wave height (history)');
    hiWaves.inner.dom.classList.add('weather-chart-inner-wave');
    const hiWaveCanvas = document.createElement('canvas');
    const hiWaveTargetInput = mountWaveChartLayout(
        hiWaves.inner.dom,
        hiWaveCanvas,
        'tide-wave-target-hi',
        WAVE_TARGET_DEFAULT_M,
    );

    historyWrap.add(
        hiToolbar,
        historyMeta,
        hiSea.card,
        hiRange.card,
        hiWaveSummary,
        hiWaves.card,
    );

    tabbed.addTab('tide-tab-forecast', 'Forecast', forecastWrap);
    tabbed.addTab('tide-tab-day', 'Day', dayWrap);
    tabbed.addTab('tide-tab-history', 'History', historyWrap);
    tabbed.select('tide-tab-forecast');

    root.add(heading, intro, status, tabbed);

    let chartFcSea = null;
    let chartFcWave = null;
    let chartFcRange = null;
    let chartDaySea = null;
    let chartDayWave = null;
    let chartHiSea = null;
    let chartHiRange = null;
    let chartHiWave = null;

    /** @type {unknown | null} */
    let lastTideForecastJson = null;

    const forecastViewTimes = { list: [] };
    const dayViewTimes = { list: [] };
    const fcWaveData = { timesIso: [], periodS: [], waveHeight: [] };
    const dayWaveData = { timesIso: [], periodS: [], waveHeight: [] };
    const hiWaveData = { timesIso: [], periodS: [], waveHeight: [] };
    const waveTargetInputs = [
        fcWaveTargetInput,
        dayWaveTargetInput,
        hiWaveTargetInput,
    ];

    let waveTargetM = WAVE_TARGET_DEFAULT_M;

    let stale = true;
    let historyStale = true;

    function setWaveTarget(value, sourceChart = null, sourceInput = null) {
        if (!Number.isFinite(value)) return;
        waveTargetM = clamp(0, 20, value);

        for (const input of waveTargetInputs) {
            if (input === sourceInput) continue;
            input.value = waveTargetM.toFixed(1);
        }

        if (sourceInput) {
            sourceInput.setAttribute('aria-valuenow', waveTargetM.toFixed(1));
        }

        if (chartFcWave && chartFcWave !== sourceChart) chartFcWave.update('none');
        if (chartDayWave && chartDayWave !== sourceChart)
            chartDayWave.update('none');
        if (chartHiWave && chartHiWave !== sourceChart) chartHiWave.update('none');
    }

    for (const input of waveTargetInputs) {
        input.addEventListener('input', () => {
            const v = Number(input.value);
            if (!Number.isFinite(v)) return;
            setWaveTarget(v, null, input);
        });
        input.addEventListener('change', () => {
            input.value = waveTargetM.toFixed(1);
        });
    }

    function destroyChart(c) {
        if (c) {
            try {
                c.destroy();
            } catch {
                /* ignore */
            }
        }
        return null;
    }

    function latLon() {
        return {
            lat: services.LocationService.latitude,
            lon: services.LocationService.longitude,
        };
    }

    /** @param {unknown} json */
    function publishMarineReference(json) {
        const lat = Number(json?.latitude);
        const lon = Number(json?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        onMarineReferenceChanged({
            lat,
            lon,
            source: 'Open-Meteo marine grid',
        });
    }

    function updateDayBoundsFromForecast(json) {
        const { min, max } = marineHourlyDateBounds(json);
        if (min && max) {
            dayDateInput.min = min;
            dayDateInput.max = max;
        }
    }

    /**
     * @param {string[]} time
     * @param {(number | null)[]} levels
     * @param {unknown} jsonGrid
     * @param {HTMLElement} summaryDom
     */
    function fillGridSummary(time, levels, jsonGrid, summaryDom) {
        const mean = meanFinite(levels);
        const latR = jsonGrid?.latitude;
        const lonR = jsonGrid?.longitude;
        const grid =
            typeof latR === 'number' && typeof lonR === 'number'
                ? `Sample grid (${latR.toFixed(2)}°, ${lonR.toFixed(2)}°)`
                : 'Marine grid';
        const meanStr = Number.isFinite(mean) ? mean.toFixed(2) : '—';
        summaryDom.textContent = `${grid}. Mean over chart window: ${meanStr} m · ${time.length} hourly steps.`;
    }

    function paintSeaLevelView(canvasSea, canvasRange, time, levels, plugins) {
        const mean = meanFinite(levels);
        const { highs, lows } = findSeaLevelExtrema(levels);
        const labels = time.map((t) => shortTimeLabel(t));
        const dr = dailyTidalRanges(time, levels);
        const args = {
            labels,
            seaLevel: levels,
            mean,
            highIdx: new Set(highs),
            lowIdx: new Set(lows),
            timesIso: time,
        };
        return {
            chartSea: createSeaLevelChart(
                canvasSea,
                args,
                { yTitle: 'm (above global MSL)' },
                plugins,
            ),
            chartRange:
                dr.labels.length > 0
                    ? createTideRangeChart(canvasRange, dr)
                    : null,
        };
    }

    async function loadTideForecast() {
        const { lat, lon } = latLon();
        status.dom.textContent = 'Loading marine forecast…';
        const url = marineUrl(lat, lon, {
            pastDays: 2,
            forecastDays: 8,
            timezone: 'auto',
            hourly: OPEN_METEO_MARINE_HOURLY_SEA_AND_WAVES,
            cellSelection: 'sea',
        });
        const json = await fetchJson(url);
        if (json?.error) {
            throw new Error(json.reason || 'Marine API error');
        }
        publishMarineReference(json);

        const raw = parseMarineSeaLevelSeries(json);
        const waveRaw = parseMarineWaveSeries(json);
        const levels = raw.seaLevelM.map(toNum);
        const waveHeight = waveRaw.waveHeightM.map(toNum);
        const windWaveHeight = waveRaw.windWaveHeightM.map(toNum);
        const swellWaveHeight = waveRaw.swellWaveHeightM.map(toNum);
        const wavePeriod = waveRaw.wavePeriodS.map(toNum);
        const waveTimes = waveRaw.time?.length ? waveRaw.time : raw.time;
        const waveSeaLevel = alignValuesByTime(waveTimes, raw.time, levels);
        const seaHasData = raw.time?.length > 0 && hasAnyFinite(levels);
        const waveHasData =
            waveTimes?.length > 0 &&
            (hasAnyFinite(waveHeight) ||
                hasAnyFinite(windWaveHeight) ||
                hasAnyFinite(swellWaveHeight));

        if (!seaHasData && !waveHasData) {
            lastTideForecastJson = null;
            chartFcSea = destroyChart(chartFcSea);
            chartFcWave = destroyChart(chartFcWave);
            chartFcRange = destroyChart(chartFcRange);
            chartDaySea = destroyChart(chartDaySea);
            forecastViewTimes.list = [];
            dayViewTimes.list = [];
            fcSummary.dom.textContent = '';
            fcWaveSummary.dom.textContent = '';
            fcEvents.dom.replaceChildren();
            fcMeta.dom.textContent =
                'No usable marine data (try coordinates closer to open water).';
            dayEvents.dom.replaceChildren();
            dayMeta.dom.textContent =
                'No hourly sea-level data available for day view at this location.';
            stale = false;
            return;
        }

        lastTideForecastJson = seaHasData || waveHasData ? json : null;
        if (seaHasData) {
            updateDayBoundsFromForecast(json);
        }

        forecastViewTimes.list = (seaHasData ? raw.time : waveTimes).slice();
        chartFcSea = destroyChart(chartFcSea);
        chartFcWave = destroyChart(chartFcWave);
        chartFcRange = destroyChart(chartFcRange);

        if (seaHasData) {
            const pluginsFc = [
                createNowLinePlugin(
                    'tideNowLineFc',
                    () => forecastViewTimes.list,
                    null,
                ),
            ];
            const painted = paintSeaLevelView(
                fcSeaCanvas,
                fcRangeCanvas,
                raw.time,
                levels,
                pluginsFc,
            );
            chartFcSea = painted.chartSea;
            chartFcRange = painted.chartRange;

            fillGridSummary(raw.time, levels, json, fcSummary.dom);
            fillTideEventsList(
                fcEvents.dom,
                formatTideEventLines(raw.time, levels, meanFinite(levels)),
            );
        } else {
            fcSummary.dom.textContent =
                'No usable sea-level samples for this forecast window.';
            fcEvents.dom.replaceChildren();
        }

        if (waveHasData) {
            const waveLabels = waveTimes.map((t) => shortTimeLabel(t));
            fcWaveData.timesIso = waveTimes.slice();
            fcWaveData.periodS = wavePeriod.slice();
            fcWaveData.waveHeight = waveHeight.slice();
            const wavePlugins = [
                createNowLinePlugin(
                    'waveNowLineFc',
                    () => waveTimes,
                    null,
                ),
                createWaveAnnotationsPlugin(
                    'waveAnnotationsFc',
                    () => fcWaveData,
                ),
                createWaveTargetLinePlugin(
                    'waveTargetLineFc',
                    () => waveTargetM,
                    setWaveTarget,
                ),
            ];
            chartFcWave = createWaveHeightChart(
                fcWaveCanvas,
                {
                    labels: waveLabels,
                    timesIso: waveTimes,
                    waveHeight,
                    windWaveHeight,
                    swellWaveHeight,
                    seaLevel: waveSeaLevel,
                },
                { yTitle: 'm (significant height)' },
                wavePlugins,
            );
            fcWaveSummary.dom.textContent = formatWaveSummary(
                waveTimes,
                waveHeight,
                windWaveHeight,
                swellWaveHeight,
                wavePeriod,
            );
        } else {
            fcWaveData.timesIso = [];
            fcWaveData.periodS = [];
            fcWaveData.waveHeight = [];
            fcWaveSummary.dom.textContent =
                'No usable wave-height samples for this forecast window.';
        }

        fcMeta.dom.textContent =
            'Sea level is shown vs global MSL (not chart datum). Waves are significant modelled heights.';

        stale = false;
        if (seaHasData && waveHasData) {
            status.dom.textContent = `Tides + waves forecast updated (${forecastViewTimes.list.length} hourly samples).`;
            await rebuildDayCharts();
            return;
        }
        if (seaHasData) {
            status.dom.textContent = `Tides forecast updated (${raw.time.length} hourly samples).`;
            await rebuildDayCharts();
            return;
        }

        status.dom.textContent = `Waves forecast updated (${waveTimes.length} hourly samples).`;
        await rebuildDayCharts();
    }

    async function rebuildDayCharts() {
        try {
            const dateStr = dayDateInput.value || todayLocalIso();
            let raw = lastTideForecastJson
                ? sliceMarineHourlyForDate(lastTideForecastJson, dateStr)
                : null;
            if (!raw || raw.time.length < 4) {
                const { lat, lon } = latLon();
                try {
                    const u = marineUrl(lat, lon, {
                        startDate: dateStr,
                        endDate: dateStr,
                        timezone: 'auto',
                        hourly: OPEN_METEO_MARINE_HOURLY_SEA_AND_WAVES,
                        cellSelection: 'sea',
                    });
                    const j = await fetchJson(u);
                    if (!j?.error) {
                        publishMarineReference(j);
                        const sea = parseMarineSeaLevelSeries(j);
                        const wav = parseMarineWaveSeries(j);
                        raw = {
                            time: sea.time,
                            seaLevelM: sea.seaLevelM,
                            waveHeightM: wav.waveHeightM,
                            windWaveHeightM: wav.windWaveHeightM,
                            swellWaveHeightM: wav.swellWaveHeightM,
                            wavePeriodS: wav.wavePeriodS,
                        };
                    }
                } catch {
                    /* ignore */
                }
            }
            if (!raw || raw.time.length === 0) {
                dayViewTimes.list = [];
                chartDaySea = destroyChart(chartDaySea);
                chartDayWave = destroyChart(chartDayWave);
                dayWaveData.timesIso = [];
                dayWaveData.periodS = [];
                dayWaveData.waveHeight = [];
                dayEvents.dom.replaceChildren();
                dayWaveSummary.dom.textContent = '';
                dayMeta.dom.textContent = `No hourly sea-level data for ${dateStr}.`;
                return;
            }
            const levels = (raw.seaLevelM || []).map(toNum);
            const waveHeight = (raw.waveHeightM || []).map(toNum);
            const windWaveHeight = (raw.windWaveHeightM || []).map(toNum);
            const swellWaveHeight = (raw.swellWaveHeightM || []).map(toNum);
            const wavePeriod = (raw.wavePeriodS || []).map(toNum);
            const waveSeaLevel = alignValuesByTime(raw.time, raw.time, levels);
            const seaHasData = hasAnyFinite(levels);
            const waveHasData =
                hasAnyFinite(waveHeight) ||
                hasAnyFinite(windWaveHeight) ||
                hasAnyFinite(swellWaveHeight);
            if (!seaHasData && !waveHasData) {
                dayViewTimes.list = [];
                chartDaySea = destroyChart(chartDaySea);
                chartDayWave = destroyChart(chartDayWave);
                dayWaveData.timesIso = [];
                dayWaveData.periodS = [];
                dayWaveData.waveHeight = [];
                dayEvents.dom.replaceChildren();
                dayWaveSummary.dom.textContent = '';
                dayMeta.dom.textContent = `No valid samples for ${dateStr}.`;
                return;
            }

            dayViewTimes.list = raw.time.slice();
            const isToday =
                (dayDateInput.value || todayLocalIso()) === todayLocalIso();

            chartDaySea = destroyChart(chartDaySea);
            if (seaHasData) {
                const mean = meanFinite(levels);
                const pluginsDay = [
                    createNowLinePlugin(
                        'tideNowLineDay',
                        () => dayViewTimes.list,
                        () => dayDateInput.value || todayLocalIso(),
                    ),
                ];
                const labels = raw.time.map((t) => shortTimeLabel(t));
                const { highs, lows } = findSeaLevelExtrema(levels);
                chartDaySea = createSeaLevelChart(
                    daySeaCanvas,
                    {
                        labels,
                        seaLevel: levels,
                        mean,
                        highIdx: new Set(highs),
                        lowIdx: new Set(lows),
                        timesIso: raw.time,
                    },
                    { yTitle: 'm (above global MSL)', xMaxTicks: 24 },
                    pluginsDay,
                );
                fillTideEventsList(
                    dayEvents.dom,
                    formatTideEventLines(raw.time, levels, mean),
                );
            } else {
                dayEvents.dom.replaceChildren();
            }

            chartDayWave = destroyChart(chartDayWave);
            if (waveHasData) {
                dayWaveData.timesIso = raw.time.slice();
                dayWaveData.periodS = wavePeriod.slice();
                dayWaveData.waveHeight = waveHeight.slice();
                const waveLabels = raw.time.map((t) => shortTimeLabel(t));
                const wavePlugins = [
                    createNowLinePlugin(
                        'waveNowLineDay',
                        () => dayWaveData.timesIso,
                        () => dayDateInput.value || todayLocalIso(),
                    ),
                    createWaveAnnotationsPlugin(
                        'waveAnnotationsDay',
                        () => dayWaveData,
                    ),
                    createWaveTargetLinePlugin(
                        'waveTargetLineDay',
                        () => waveTargetM,
                        setWaveTarget,
                    ),
                ];
                chartDayWave = createWaveHeightChart(
                    dayWaveCanvas,
                    {
                        labels: waveLabels,
                        timesIso: raw.time,
                        waveHeight,
                        windWaveHeight,
                        swellWaveHeight,
                        seaLevel: waveSeaLevel,
                    },
                    { yTitle: 'm (significant height)', xMaxTicks: 24 },
                    wavePlugins,
                );
                dayWaveSummary.dom.textContent = formatWaveSummary(
                    raw.time,
                    waveHeight,
                    windWaveHeight,
                    swellWaveHeight,
                    wavePeriod,
                );
            } else {
                dayWaveData.timesIso = [];
                dayWaveData.periodS = [];
                dayWaveData.waveHeight = [];
                dayWaveSummary.dom.textContent =
                    'No usable wave-height samples for this day.';
            }

            const dr = seaHasData
                ? dailyTidalRanges(raw.time, levels)
                : { ranges: [] };
            const rangeStr =
                dr.ranges.length === 1 && Number.isFinite(dr.ranges[0])
                    ? `Tidal range this day: ${dr.ranges[0].toFixed(2)} m`
                    : '';
            dayMeta.dom.textContent = `${raw.time.length} hourly samples for ${dateStr}${
                rangeStr ? ` · ${rangeStr}` : ''
            }${isToday ? ' · gold dashed = current time' : ''}`;
        } catch (e) {
            dayMeta.dom.textContent = `Day chart: ${e?.message || e}`;
        }
    }

    function tideHistoryRangeDays() {
        const end = todayLocalIso();
        const days = Number(presetSelect.value) || 14;
        const start = addDays(end, days - 1);
        return { start, end, days };
    }

    async function loadTideHistory() {
        const { lat, lon } = latLon();
        const { start, end, days } = tideHistoryRangeDays();
        status.dom.textContent = 'Loading sea-level history…';

        let json = null;
        try {
            const u = marineUrl(lat, lon, {
                startDate: start,
                endDate: end,
                timezone: 'auto',
                hourly: OPEN_METEO_MARINE_HOURLY_SEA_AND_WAVES,
                cellSelection: 'sea',
            });
            json = await fetchJson(u);
        } catch {
            /* fall back */
        }
        if (!json || json?.error) {
            const u2 = marineUrl(lat, lon, {
                pastDays: days,
                forecastDays: 0,
                timezone: 'auto',
                hourly: OPEN_METEO_MARINE_HOURLY_SEA_AND_WAVES,
                cellSelection: 'sea',
            });
            json = await fetchJson(u2);
        }
        if (json?.error) {
            throw new Error(json.reason || 'Marine API error');
        }
        publishMarineReference(json);

        const raw = parseMarineSeaLevelSeries(json);
        const waveRaw = parseMarineWaveSeries(json);
        const levels = raw.seaLevelM.map(toNum);
        const waveHeight = waveRaw.waveHeightM.map(toNum);
        const windWaveHeight = waveRaw.windWaveHeightM.map(toNum);
        const swellWaveHeight = waveRaw.swellWaveHeightM.map(toNum);
        const wavePeriod = waveRaw.wavePeriodS.map(toNum);
        const waveTimes = waveRaw.time?.length ? waveRaw.time : raw.time;
        const waveSeaLevel = alignValuesByTime(waveTimes, raw.time, levels);
        const seaHasData = raw.time?.length > 0 && hasAnyFinite(levels);
        const waveHasData =
            waveTimes?.length > 0 &&
            (hasAnyFinite(waveHeight) ||
                hasAnyFinite(windWaveHeight) ||
                hasAnyFinite(swellWaveHeight));
        if (!seaHasData && !waveHasData) {
            chartHiSea = destroyChart(chartHiSea);
            chartHiRange = destroyChart(chartHiRange);
            chartHiWave = destroyChart(chartHiWave);
            hiWaveData.timesIso = [];
            hiWaveData.periodS = [];
            hiWaveData.waveHeight = [];
            hiWaveSummary.dom.textContent = '';
            historyMeta.dom.textContent =
                'No usable sea-level history for this location.';
            historyStale = false;
            return;
        }

        chartHiSea = destroyChart(chartHiSea);
        chartHiRange = destroyChart(chartHiRange);
        chartHiWave = destroyChart(chartHiWave);
        if (seaHasData) {
            const painted = paintSeaLevelView(
                hiSeaCanvas,
                hiRangeCanvas,
                raw.time,
                levels,
                [],
            );
            chartHiSea = painted.chartSea;
            chartHiRange = painted.chartRange;
        }

        if (waveHasData) {
            hiWaveData.timesIso = waveTimes.slice();
            hiWaveData.periodS = wavePeriod.slice();
            hiWaveData.waveHeight = waveHeight.slice();
            const waveLabels = waveTimes.map((t) => shortTimeLabel(t));
            const wavePlugins = [
                createWaveAnnotationsPlugin(
                    'waveAnnotationsHi',
                    () => hiWaveData,
                ),
                createWaveTargetLinePlugin(
                    'waveTargetLineHi',
                    () => waveTargetM,
                    setWaveTarget,
                ),
            ];
            chartHiWave = createWaveHeightChart(
                hiWaveCanvas,
                {
                    labels: waveLabels,
                    timesIso: waveTimes,
                    waveHeight,
                    windWaveHeight,
                    swellWaveHeight,
                    seaLevel: waveSeaLevel,
                },
                { yTitle: 'm (significant height)' },
                wavePlugins,
            );
            hiWaveSummary.dom.textContent = formatWaveSummary(
                waveTimes,
                waveHeight,
                windWaveHeight,
                swellWaveHeight,
                wavePeriod,
            );
        } else {
            hiWaveData.timesIso = [];
            hiWaveData.periodS = [];
            hiWaveData.waveHeight = [];
            hiWaveSummary.dom.textContent =
                'No usable wave-height history for this location.';
        }

        const baseCount = seaHasData ? raw.time.length : waveTimes.length;
        historyMeta.dom.textContent = `Marine history: ${start} → ${end} (${baseCount} hourly points). Scroll the timeline above; use Forecast or Day for a readable high/low list.`;
        status.dom.textContent = `Tide history loaded (${days} days).`;
        historyStale = false;
    }

    async function refreshAll() {
        const errors = [];
        try {
            await loadTideForecast();
        } catch (e) {
            errors.push(`Forecast: ${e?.message || e}`);
        }
        try {
            await loadTideHistory();
        } catch (e) {
            errors.push(`History: ${e?.message || e}`);
        }
        if (errors.length) {
            status.dom.textContent = errors.join(' · ');
        }
    }

    refreshFcBtn.addEventListener('click', async () => {
        stale = true;
        try {
            await loadTideForecast();
        } catch (e) {
            status.dom.textContent = `Forecast failed: ${e?.message || e}`;
        }
    });

    loadHistBtn.addEventListener('click', async () => {
        historyStale = true;
        try {
            await loadTideHistory();
        } catch (e) {
            status.dom.textContent = `History failed: ${e?.message || e}`;
        }
    });

    applyDayBtn.addEventListener('click', () => {
        rebuildDayCharts().then(() => {
            requestAnimationFrame(() => {
                chartDaySea?.resize();
                chartDayWave?.resize();
            });
        });
    });
    dayDateInput.addEventListener('change', () => {
        rebuildDayCharts().then(() => {
            requestAnimationFrame(() => {
                chartDaySea?.resize();
                chartDayWave?.resize();
            });
        });
    });

    let loadPromise = null;

    function notifyVisible() {
        if (!stale && !historyStale) {
            requestAnimationFrame(() => {
                chartFcSea?.resize();
                chartFcWave?.resize();
                chartFcRange?.resize();
                chartDaySea?.resize();
                chartDayWave?.resize();
                chartHiSea?.resize();
                chartHiRange?.resize();
                chartHiWave?.resize();
            });
            return;
        }
        if (loadPromise) return;
        loadPromise = refreshAll().finally(() => {
            loadPromise = null;
            requestAnimationFrame(() => {
                chartFcSea?.resize();
                chartFcWave?.resize();
                chartFcRange?.resize();
                chartDaySea?.resize();
                chartDayWave?.resize();
                chartHiSea?.resize();
                chartHiRange?.resize();
                chartHiWave?.resize();
            });
        });
    }

    function onLocationChanged() {
        stale = true;
        historyStale = true;
        onMarineReferenceChanged(null);
        lastTideForecastJson = null;
        dayDateInput.value = todayLocalIso();
        forecastViewTimes.list = [];
        dayViewTimes.list = [];
        fcWaveData.timesIso = [];
        fcWaveData.periodS = [];
        fcWaveData.waveHeight = [];
        dayWaveData.timesIso = [];
        dayWaveData.periodS = [];
        dayWaveData.waveHeight = [];
        hiWaveData.timesIso = [];
        hiWaveData.periodS = [];
        hiWaveData.waveHeight = [];
        fcSummary.dom.textContent = '';
        fcWaveSummary.dom.textContent = '';
        fcEvents.dom.replaceChildren();
        fcMeta.dom.textContent =
            'Marine forecast will reload when you open this section.';
        dayEvents.dom.replaceChildren();
        dayWaveSummary.dom.textContent = '';
        hiWaveSummary.dom.textContent = '';
        chartFcSea = destroyChart(chartFcSea);
        chartFcWave = destroyChart(chartFcWave);
        chartFcRange = destroyChart(chartFcRange);
        chartDaySea = destroyChart(chartDaySea);
        chartDayWave = destroyChart(chartDayWave);
        chartHiSea = destroyChart(chartHiSea);
        chartHiRange = destroyChart(chartHiRange);
        chartHiWave = destroyChart(chartHiWave);
        const sec = document.getElementById('section-tides');
        if (sec?.classList.contains('is-active')) {
            notifyVisible();
        }
    }

    core.signals.onLocationChanged.add(onLocationChanged);

    return {
        root,
        notifyVisible,
        dispose() {
            core.signals.onLocationChanged.remove(onLocationChanged);
            chartFcSea = destroyChart(chartFcSea);
            chartFcWave = destroyChart(chartFcWave);
            chartFcRange = destroyChart(chartFcRange);
            chartDaySea = destroyChart(chartDaySea);
            chartDayWave = destroyChart(chartDayWave);
            chartHiSea = destroyChart(chartHiSea);
            chartHiRange = destroyChart(chartHiRange);
            chartHiWave = destroyChart(chartHiWave);
        },
    };
}
