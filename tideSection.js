import { DrawUI } from './drawUI/index.js';
import {
    marineUrl,
    parseMarineSeaLevelSeries,
    fetchJson,
    todayLocalIso,
    addDays,
} from './openMeteo.js';

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

/** @returns {import('./drawUI/index.js').UIDiv} */
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
 * @param {{ core: { signals: { onLocationChanged: { add: Function; remove: Function } } }; services: { LocationService: { latitude: number; longitude: number } } }} ctx
 */
export function createTideSection(ctx) {
    const { core, services } = ctx;

    const root = DrawUI.div();
    root.setClass('weather-section');

    const heading = DrawUI.h2('Tides');
    heading.setClass('weather-section-heading');

    const intro = DrawUI.div();
    intro.setClass('weather-section-intro');
    intro.dom.textContent =
        'Modelled sea level from Open-Meteo Marine (hourly, ~8 km ocean grid). Heights are vs global mean sea level — informational only, not for navigation.';

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

    const fcSea = chartCard('Sea level (modelled, incl. tides)');
    const fcRange = chartCard('Daily tidal range (max − min)');
    const fcSeaCanvas = document.createElement('canvas');
    const fcRangeCanvas = document.createElement('canvas');
    fcSea.inner.dom.appendChild(fcSeaCanvas);
    fcRange.inner.dom.appendChild(fcRangeCanvas);

    const fcEvents = DrawUI.div();
    fcEvents.setClass('weather-tide-events-wrap');

    forecastWrap.add(
        fcToolbar,
        fcMeta,
        fcSummary,
        fcSea.card,
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

    const dayEvents = DrawUI.div();
    dayEvents.setClass('weather-tide-events-wrap');

    dayWrap.add(dayToolbar, dayMeta, daySea.card, dayEvents);

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

    historyWrap.add(hiToolbar, historyMeta, hiSea.card, hiRange.card);

    tabbed.addTab('tide-tab-forecast', 'Forecast', forecastWrap);
    tabbed.addTab('tide-tab-day', 'Day', dayWrap);
    tabbed.addTab('tide-tab-history', 'History', historyWrap);
    tabbed.select('tide-tab-forecast');

    root.add(heading, intro, status, tabbed);

    let chartFcSea = null;
    let chartFcRange = null;
    let chartDaySea = null;
    let chartHiSea = null;
    let chartHiRange = null;

    /** @type {unknown | null} */
    let lastTideForecastJson = null;

    const forecastViewTimes = { list: [] };
    const dayViewTimes = { list: [] };

    let stale = true;
    let historyStale = true;

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
            cellSelection: 'sea',
        });
        const json = await fetchJson(url);
        if (json?.error) {
            throw new Error(json.reason || 'Marine API error');
        }

        const raw = parseMarineSeaLevelSeries(json);
        const levels = raw.seaLevelM.map(toNum);
        if (!raw.time?.length || levels.every((v) => !Number.isFinite(v))) {
            lastTideForecastJson = null;
            chartFcSea = destroyChart(chartFcSea);
            chartFcRange = destroyChart(chartFcRange);
            forecastViewTimes.list = [];
            fcSummary.dom.textContent = '';
            fcEvents.dom.replaceChildren();
            fcMeta.dom.textContent =
                'No usable sea-level data (try coordinates closer to open water).';
            stale = false;
            return;
        }
        lastTideForecastJson = json;
        updateDayBoundsFromForecast(json);

        forecastViewTimes.list = raw.time.slice();
        chartFcSea = destroyChart(chartFcSea);
        chartFcRange = destroyChart(chartFcRange);
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
        fcMeta.dom.textContent =
            'Heights vs global MSL (not chart datum). Est. high/low from hourly samples.';

        fillTideEventsList(
            fcEvents.dom,
            formatTideEventLines(raw.time, levels, meanFinite(levels)),
        );

        stale = false;
        status.dom.textContent = `Tides forecast updated (${raw.time.length} hourly samples).`;
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
                        cellSelection: 'sea',
                    });
                    const j = await fetchJson(u);
                    if (!j?.error) {
                        raw = parseMarineSeaLevelSeries(j);
                    }
                } catch {
                    /* ignore */
                }
            }
            if (!raw || raw.time.length === 0) {
                dayViewTimes.list = [];
                chartDaySea = destroyChart(chartDaySea);
                dayEvents.dom.replaceChildren();
                dayMeta.dom.textContent = `No hourly sea-level data for ${dateStr}.`;
                return;
            }
            const levels = raw.seaLevelM.map(toNum);
            if (levels.every((v) => !Number.isFinite(v))) {
                dayViewTimes.list = [];
                chartDaySea = destroyChart(chartDaySea);
                dayEvents.dom.replaceChildren();
                dayMeta.dom.textContent = `No valid samples for ${dateStr}.`;
                return;
            }

            dayViewTimes.list = raw.time.slice();
            const mean = meanFinite(levels);
            const dr = dailyTidalRanges(raw.time, levels);
            const rangeStr =
                dr.ranges.length === 1 && Number.isFinite(dr.ranges[0])
                    ? `Tidal range this day: ${dr.ranges[0].toFixed(2)} m`
                    : '';

            chartDaySea = destroyChart(chartDaySea);
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

            const isToday =
                (dayDateInput.value || todayLocalIso()) === todayLocalIso();
            dayMeta.dom.textContent = `${raw.time.length} hourly samples for ${dateStr}${
                rangeStr ? ` · ${rangeStr}` : ''
            }${isToday ? ' · gold dashed = current time' : ''}`;

            fillTideEventsList(
                dayEvents.dom,
                formatTideEventLines(raw.time, levels, mean),
            );
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
                cellSelection: 'sea',
            });
            json = await fetchJson(u2);
        }
        if (json?.error) {
            throw new Error(json.reason || 'Marine API error');
        }

        const raw = parseMarineSeaLevelSeries(json);
        const levels = raw.seaLevelM.map(toNum);
        if (!raw.time?.length || levels.every((v) => !Number.isFinite(v))) {
            chartHiSea = destroyChart(chartHiSea);
            chartHiRange = destroyChart(chartHiRange);
            historyMeta.dom.textContent =
                'No usable sea-level history for this location.';
            historyStale = false;
            return;
        }

        chartHiSea = destroyChart(chartHiSea);
        chartHiRange = destroyChart(chartHiRange);
        const painted = paintSeaLevelView(
            hiSeaCanvas,
            hiRangeCanvas,
            raw.time,
            levels,
            [],
        );
        chartHiSea = painted.chartSea;
        chartHiRange = painted.chartRange;

        historyMeta.dom.textContent = `Marine history: ${start} → ${end} (${raw.time.length} hourly points). Scroll the timeline above; use Forecast or Day for a readable high/low list.`;
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
            requestAnimationFrame(() => chartDaySea?.resize());
        });
    });
    dayDateInput.addEventListener('change', () => {
        rebuildDayCharts().then(() => {
            requestAnimationFrame(() => chartDaySea?.resize());
        });
    });

    let loadPromise = null;

    function notifyVisible() {
        if (!stale && !historyStale) {
            requestAnimationFrame(() => {
                chartFcSea?.resize();
                chartFcRange?.resize();
                chartDaySea?.resize();
                chartHiSea?.resize();
                chartHiRange?.resize();
            });
            return;
        }
        if (loadPromise) return;
        loadPromise = refreshAll().finally(() => {
            loadPromise = null;
            requestAnimationFrame(() => {
                chartFcSea?.resize();
                chartFcRange?.resize();
                chartDaySea?.resize();
                chartHiSea?.resize();
                chartHiRange?.resize();
            });
        });
    }

    function onLocationChanged() {
        stale = true;
        historyStale = true;
        lastTideForecastJson = null;
        dayDateInput.value = todayLocalIso();
        forecastViewTimes.list = [];
        dayViewTimes.list = [];
        fcSummary.dom.textContent = '';
        fcEvents.dom.replaceChildren();
        fcMeta.dom.textContent =
            'Sea level will reload when you open this section.';
        dayEvents.dom.replaceChildren();
        chartFcSea = destroyChart(chartFcSea);
        chartFcRange = destroyChart(chartFcRange);
        chartDaySea = destroyChart(chartDaySea);
        chartHiSea = destroyChart(chartHiSea);
        chartHiRange = destroyChart(chartHiRange);
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
            chartFcRange = destroyChart(chartFcRange);
            chartDaySea = destroyChart(chartDaySea);
            chartHiSea = destroyChart(chartHiSea);
            chartHiRange = destroyChart(chartHiRange);
        },
    };
}
