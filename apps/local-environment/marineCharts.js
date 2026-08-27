import { DrawUI } from '../../shared/drawUI/index.js';
import {
    clamp,
    getChartCtor,
    hasAnyFinite,
    maxFinite,
    meanFinite,
    shortTimeLabel,
    toNum,
} from './envUi.js';

export const WAVE_PERIOD_HIGHLIGHT_S = 9;
export const WAVE_ENERGY_HIGHLIGHT_KJ = 7;
export const WAVE_TARGET_DEFAULT_M = 1.5;

/**
 * @param {string[]} targetTimes
 * @param {string[]} sourceTimes
 * @param {(number | null)[]} sourceValues
 */
export function alignValuesByTime(targetTimes, sourceTimes, sourceValues) {
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

/** @param {(number | null)[]} levels */
export function findSeaLevelExtrema(levels) {
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

/**
 * @param {string[]} timeIso
 * @param {(number | null)[]} values
 */
export function nearestFiniteToNow(timeIso, values) {
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
    return { time: timeIso[bestI], value: values[bestI], index: bestI };
}

/**
 * Wave energy flux per unit crest length (deep-water approximation),
 * expressed in kJ per second per metre (numerically equal to kW/m).
 *   P = (ρ g² / (64 π)) · H² · T  ≈ 0.49 · H² · T  (kW/m, seawater)
 */
export function waveEnergyKJ(heightM, periodS) {
    if (!Number.isFinite(heightM) || !Number.isFinite(periodS)) return NaN;
    if (heightM <= 0 || periodS <= 0) return 0;
    return 0.49 * heightM * heightM * periodS;
}

export function formatWaveSummary(
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
    const maxStr = Number.isFinite(waveMax) ? `${waveMax.toFixed(2)} m` : '—';
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

export function formatTideSummary(timeIso, levels, jsonGrid) {
    const mean = meanFinite(levels);
    const latR = jsonGrid?.latitude;
    const lonR = jsonGrid?.longitude;
    const grid =
        typeof latR === 'number' && typeof lonR === 'number'
            ? `Sample grid (${latR.toFixed(2)}°, ${lonR.toFixed(2)}°)`
            : 'Marine grid';
    const meanStr = Number.isFinite(mean) ? mean.toFixed(2) : '—';
    const near = nearestFiniteToNow(timeIso, levels);
    const nearStr = near
        ? `${near.value.toFixed(2)} m at ${shortTimeLabel(near.time)}`
        : '—';
    return `${grid}. Near now: ${nearStr} · Mean over chart window: ${meanStr} m · ${timeIso.length} hourly steps.`;
}

/**
 * @param {string} pluginId
 * @param {() => {
 *   timesIso: string[];
 *   periodS: (number | null)[];
 *   waveHeight: (number | null)[];
 * }} getData
 */
export function createWaveAnnotationsPlugin(pluginId, getData) {
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
export function createWaveTargetLinePlugin(pluginId, getTargetValue, setTargetValue) {
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
 * @param {import('../../shared/drawUI/index.js').UIDiv} host
 * @param {ReturnType<typeof DrawUI.canvas>} canvas
 * @param {string} inputId
 * @param {number} initialValueM
 */
export function mountWaveChartLayout(host, canvas, inputId, initialValueM) {
    const layout = DrawUI.div();
    layout.setClass('weather-wave-layout');

    const controlWrap = DrawUI.div();
    controlWrap.setClass('weather-wave-target-wrap');

    const controlLabel = DrawUI.label();
    controlLabel.setClass('weather-wave-target-control');
    controlLabel.setFor(inputId);

    const labelText = DrawUI.span('Target line');
    labelText.setClass('weather-wave-target-label');

    const input = DrawUI.inputText(initialValueM.toFixed(1));
    input.setClass('weather-wave-target-input');
    input.setId(inputId);
    input.dom.type = 'number';
    input.dom.step = '0.1';
    input.dom.min = '0';
    input.dom.max = '20';
    input.dom.setAttribute('aria-label', 'Wave height target line in metres');

    const unit = DrawUI.span('m');
    unit.setClass('weather-wave-target-unit');

    controlLabel.add(labelText, input, unit);
    controlWrap.add(controlLabel);

    const plotWrap = DrawUI.div();
    plotWrap.setClass('weather-wave-plot');
    plotWrap.add(canvas);

    layout.add(controlWrap, plotWrap);
    host.add(layout);
    return input.dom;
}

export function dailyTidalRanges(timeIso, levels) {
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

export function formatTideEventLines(timeIso, levels, mean) {
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

export function fillTideEventsList(container, lines) {
    container.clear();
    const list = DrawUI.div();
    list.setClass('weather-tide-events');
    for (const line of lines) {
        const item = DrawUI.div();
        item.setClass('weather-tide-events-item');
        item.dom.textContent = line;
        list.add(item);
    }
    container.add(list);
}

/**
 * @param {unknown} json
 * @param {string} dateStr yyyy-mm-dd
 */
export function sliceMarineHourlyForDate(json, dateStr) {
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
export function marineHourlyDateBounds(json) {
    const t = json?.hourly?.time;
    if (!t?.length) return { min: null, max: null };
    const first = String(t[0]).slice(0, 10);
    const last = String(t[t.length - 1]).slice(0, 10);
    return { min: first, max: last };
}

export function createSeaLevelChart(canvas, data, opts = {}, extraPlugins = []) {
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

export function createWaveHeightChart(canvas, data, opts = {}, extraPlugins = []) {
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
            layout: { padding: { top: opts.padTop ?? 34 } },
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

export function createTideRangeChart(canvas, daily) {
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

export function paintSeaLevelView(canvasSea, canvasRange, time, levels, plugins) {
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
            canvasRange && dr.labels.length > 0
                ? createTideRangeChart(canvasRange, dr)
                : null,
    };
}

export { toNum };
