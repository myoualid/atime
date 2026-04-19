import { DrawUI } from './drawUI/index.js';
import {
    OPEN_METEO_CURRENT_CORE,
    forecastUrl,
    archiveUrl,
    parseHourlySeries,
    fetchJson,
    todayLocalIso,
    addDays,
} from './openMeteo.js';

/** @param {number} deg */
function windDirLabel(deg) {
    if (deg === null || deg === undefined || !Number.isFinite(deg)) return '—';
    const dirs = [
        'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
    ];
    return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** @param {number | null | undefined} code */
function weatherCodeLabel(code) {
    if (code === null || code === undefined || !Number.isFinite(code)) return '—';
    const c = Math.round(code);
    const map = {
        0: 'Clear',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Rime fog',
        51: 'Light drizzle',
        53: 'Drizzle',
        55: 'Dense drizzle',
        56: 'Freezing drizzle',
        57: 'Freezing drizzle',
        61: 'Slight rain',
        63: 'Rain',
        65: 'Heavy rain',
        66: 'Freezing rain',
        67: 'Freezing rain',
        71: 'Slight snow',
        73: 'Snow',
        75: 'Heavy snow',
        77: 'Snow grains',
        80: 'Rain showers',
        81: 'Rain showers',
        82: 'Violent showers',
        85: 'Snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm & hail',
        99: 'Thunderstorm & hail',
    };
    return map[c] ?? `Code ${c}`;
}

/**
 * Uses plotted point positions so the marker stays correct when the x-axis
 * auto-skips tick labels.
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
 * @param {null | (() => string)} getSelectedDay If set, line only when that day is today (local).
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

/**
 * @param {{ time: string[]; temperature: unknown[]; windSpeed: unknown[]; windGust: unknown[] }} series
 * @param {(n: unknown) => number | null} num
 */
function alignedNumeric(series, num) {
    const { time, temperature, windSpeed, windGust } = series;
    const n = time.length;
    const out = {
        labels: [],
        temperature: [],
        windSpeed: [],
        windGust: [],
    };
    for (let i = 0; i < n; i++) {
        out.labels.push(shortTimeLabel(time[i]));
        out.temperature.push(num(temperature[i]));
        out.windSpeed.push(num(windSpeed[i]));
        out.windGust.push(num(windGust[i]));
    }
    return out;
}

function toNum(v) {
    if (v === null || v === undefined) return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
}

/**
 * @param {unknown} json
 * @param {string} dateStr yyyy-mm-dd (local API timestamps)
 */
function sliceForecastHourlyForDate(json, dateStr) {
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
        temperature: idx.map((i) => hourly.temperature_2m?.[i]),
        windSpeed: idx.map((i) => hourly.wind_speed_10m?.[i]),
        windGust: idx.map((i) => hourly.wind_gusts_10m?.[i]),
    };
}

/** @param {unknown} json */
function hourlyDateBounds(json) {
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
 * @param {ReturnType<typeof alignedNumeric>} data
 * @param {{ yTitle: string; xMaxTicks?: number }} opts
 * @param {object[]} [extraPlugins]
 */
function createTempChart(canvas, data, opts, extraPlugins = []) {
    const Chart = getChartCtor();
    const maxTicks = opts.xMaxTicks ?? 14;
    return new Chart(canvas, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: data.temperature,
                    borderColor: 'rgba(212, 175, 55, 0.95)',
                    backgroundColor: 'rgba(212, 175, 55, 0.12)',
                    fill: true,
                    tension: 0.2,
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
                            return i >= 0 ? String(data.labels[i] ?? '') : '';
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
                        text: opts.yTitle,
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
 * @param {ReturnType<typeof alignedNumeric>} data
 * @param {{ xMaxTicks?: number }} [scaleOpts]
 * @param {object[]} [extraPlugins]
 */
function createWindChart(canvas, data, scaleOpts = {}, extraPlugins = []) {
    const Chart = getChartCtor();
    const maxTicks = scaleOpts.xMaxTicks ?? 14;
    return new Chart(canvas, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Wind speed (km/h)',
                    data: data.windSpeed,
                    borderColor: 'rgba(100, 181, 246, 0.95)',
                    backgroundColor: 'rgba(100, 181, 246, 0.08)',
                    fill: false,
                    tension: 0.2,
                    spanGaps: true,
                },
                {
                    label: 'Wind gusts (km/h)',
                    data: data.windGust,
                    borderColor: 'rgba(239, 154, 154, 0.95)',
                    backgroundColor: 'rgba(239, 154, 154, 0.08)',
                    fill: false,
                    tension: 0.2,
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
                        text: 'km/h',
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
 * @param {{ core: { signals: { onLocationChanged: { add: Function; remove: Function } } }; services: { LocationService: { latitude: number; longitude: number } } }} ctx
 */
export function createWeatherSection(ctx) {
    const { core, services } = ctx;

    const root = DrawUI.div();
    root.setClass('weather-section');

    const heading = DrawUI.h2('Weather');
    heading.setClass('weather-section-heading');

    const intro = DrawUI.div();
    intro.setClass('weather-section-intro');
    intro.dom.textContent =
        'Hourly temperature, wind, and gusts from Open-Meteo (forecast blends national models; history uses reanalysis).';

    const status = DrawUI.div();
    status.setClass('weather-status');
    status.dom.textContent = 'Open this section to load data.';

    const currentCard = DrawUI.div();
    currentCard.setClass('weather-current');
    currentCard.dom.innerHTML = `
        <h3 class="weather-current-title">Current</h3>
        <div class="weather-current-grid">
            <div class="weather-current-cell">
                <span class="weather-current-label">Temperature</span>
                <span class="weather-current-value" data-cur="temperature_2m">—</span>
            </div>
            <div class="weather-current-cell">
                <span class="weather-current-label">Feels like</span>
                <span class="weather-current-value" data-cur="apparent_temperature">—</span>
            </div>
            <div class="weather-current-cell">
                <span class="weather-current-label">Humidity</span>
                <span class="weather-current-value" data-cur="relative_humidity_2m">—</span>
            </div>
            <div class="weather-current-cell">
                <span class="weather-current-label">Sky</span>
                <span class="weather-current-value" data-cur="weather_code">—</span>
            </div>
            <div class="weather-current-cell">
                <span class="weather-current-label">Wind</span>
                <span class="weather-current-value" data-cur="wind">—</span>
            </div>
            <div class="weather-current-cell">
                <span class="weather-current-label">Gusts</span>
                <span class="weather-current-value" data-cur="wind_gusts_10m">—</span>
            </div>
            <div class="weather-current-cell weather-current-cell-wide">
                <span class="weather-current-label">As of</span>
                <span class="weather-current-value weather-current-meta" data-cur="time">—</span>
            </div>
        </div>
    `;

    function fillCurrentSummary(json) {
        const cur = json?.current;
        const units = json?.current_units ?? {};
        const q = (name) => currentCard.dom.querySelector(`[data-cur="${name}"]`);
        if (!cur) {
            [
                'temperature_2m',
                'apparent_temperature',
                'relative_humidity_2m',
                'weather_code',
                'wind',
                'wind_gusts_10m',
                'time',
            ].forEach((k) => {
                const el = q(k);
                if (el) el.textContent = '—';
            });
            return;
        }
        const set = (name, text) => {
            const el = q(name);
            if (el) el.textContent = text;
        };
        const u = (k) => units[k] ?? '';
        set(
            'temperature_2m',
            cur.temperature_2m != null
                ? `${cur.temperature_2m}${u('temperature_2m') || '°C'}`
                : '—',
        );
        set(
            'apparent_temperature',
            cur.apparent_temperature != null
                ? `${cur.apparent_temperature}${u('apparent_temperature') || '°C'}`
                : '—',
        );
        set(
            'relative_humidity_2m',
            cur.relative_humidity_2m != null
                ? `${cur.relative_humidity_2m}${u('relative_humidity_2m') || '%'}`
                : '—',
        );
        set(
            'weather_code',
            weatherCodeLabel(cur.weather_code),
        );
        const ws = cur.wind_speed_10m;
        const wd = cur.wind_direction_10m;
        const windStr =
            ws != null
                ? `${ws}${u('wind_speed_10m') || ' km/h'} ${
                      wd != null ? windDirLabel(wd) : ''
                  }`.trim()
                : '—';
        set('wind', windStr);
        set(
            'wind_gusts_10m',
            cur.wind_gusts_10m != null
                ? `${cur.wind_gusts_10m}${u('wind_gusts_10m') || ' km/h'}`
                : '—',
        );
        set('time', cur.time ? String(cur.time).replace('T', ' ') : '—');
    }

    const tabbed = DrawUI.tabbedPanel();
    tabbed.addClass('inner-tabbed-panel');
    tabbed.addClass('weather-tabbed');

    /** --- Forecast tab --- */
    const forecastWrap = DrawUI.div();
    forecastWrap.setClass('weather-tab-content');
    const forecastToolbar = DrawUI.div();
    forecastToolbar.setClass('weather-toolbar');
    const forecastMeta = DrawUI.div();
    forecastMeta.setClass('weather-meta');
    forecastMeta.dom.textContent =
        'Past ~2 days through next ~10 days (hourly). Gold dashed line = current time.';
    const refreshForecastBtn = document.createElement('button');
    refreshForecastBtn.type = 'button';
    refreshForecastBtn.className = 'weather-btn';
    refreshForecastBtn.textContent = 'Refresh forecast';
    forecastToolbar.dom.appendChild(refreshForecastBtn);

    const fcTemp = chartCard('Temperature');
    const fcWind = chartCard('Wind speed & gusts');
    const fcTempCanvas = document.createElement('canvas');
    const fcWindCanvas = document.createElement('canvas');
    fcTemp.inner.dom.appendChild(fcTempCanvas);
    fcWind.inner.dom.appendChild(fcWindCanvas);
    forecastWrap.add(forecastToolbar, forecastMeta, fcTemp.card, fcWind.card);

    /** --- One day tab --- */
    const dayWrap = DrawUI.div();
    dayWrap.setClass('weather-tab-content');
    const dayToolbar = DrawUI.div();
    dayToolbar.setClass('weather-toolbar weather-toolbar-wrap');
    const dayDateLabel = DrawUI.span('Day: ');
    dayDateLabel.setClass('weather-range-label');
    const dayDateInput = document.createElement('input');
    dayDateInput.type = 'date';
    dayDateInput.className = 'weather-date-input';
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
        'Hourly evolution for the selected calendar day. The vertical marker shows the current time when the day is today.';

    const dayTemp = chartCard('Temperature');
    const dayWind = chartCard('Wind speed & gusts');
    const dayTempCanvas = document.createElement('canvas');
    const dayWindCanvas = document.createElement('canvas');
    dayTempCanvas.id = 'weather-day-temp-canvas';
    dayWindCanvas.id = 'weather-day-wind-canvas';
    dayTemp.inner.dom.appendChild(dayTempCanvas);
    dayWind.inner.dom.appendChild(dayWindCanvas);
    dayWrap.add(dayToolbar, dayMeta, dayTemp.card, dayWind.card);

    /** --- Historical tab --- */
    const historyWrap = DrawUI.div();
    historyWrap.setClass('weather-tab-content');
    const historyToolbar = DrawUI.div();
    historyToolbar.setClass('weather-toolbar weather-toolbar-wrap');

    const rangeLabel = DrawUI.span('Range: ');
    rangeLabel.setClass('weather-range-label');

    const presetSelect = document.createElement('select');
    presetSelect.className = 'weather-select';
    presetSelect.innerHTML = `
      <option value="7">Last 7 days</option>
      <option value="14" selected>Last 14 days</option>
      <option value="30">Last 30 days</option>
    `;

    const loadHistoryBtn = document.createElement('button');
    loadHistoryBtn.type = 'button';
    loadHistoryBtn.className = 'weather-btn';
    loadHistoryBtn.textContent = 'Load history';

    historyToolbar.dom.appendChild(rangeLabel.dom);
    historyToolbar.dom.appendChild(presetSelect);
    historyToolbar.dom.appendChild(loadHistoryBtn);

    const historyMeta = DrawUI.div();
    historyMeta.setClass('weather-meta');
    historyMeta.dom.textContent = '';

    const hiTemp = chartCard('Temperature (archive)');
    const hiWind = chartCard('Wind speed & gusts (archive)');
    const hiTempCanvas = document.createElement('canvas');
    const hiWindCanvas = document.createElement('canvas');
    hiTemp.inner.dom.appendChild(hiTempCanvas);
    hiWind.inner.dom.appendChild(hiWindCanvas);
    historyWrap.add(historyToolbar, historyMeta, hiTemp.card, hiWind.card);

    tabbed.addTab('weather-tab-forecast', 'Forecast', forecastWrap);
    tabbed.addTab('weather-tab-day', 'Day', dayWrap);
    tabbed.addTab('weather-tab-history', 'History', historyWrap);
    tabbed.select('weather-tab-forecast');

    root.add(heading, intro, currentCard, status, tabbed);

    let chartFcTemp = null;
    let chartFcWind = null;
    let chartHiTemp = null;
    let chartHiWind = null;
    let chartDayTemp = null;
    let chartDayWind = null;

    /** @type {unknown | null} */
    let lastForecastJson = null;
    /** ISO timestamps for forecast charts (“now” marker) */
    const forecastViewTimes = { list: [] };
    /** @type {string[]} ISO timestamps for the day charts (shared ref for “now” plugin) */
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

    function updateDayDateBoundsFromForecast(json) {
        const { min, max } = hourlyDateBounds(json);
        if (min && max) {
            dayDateInput.min = min;
            dayDateInput.max = max;
        }
    }

    async function rebuildDayCharts() {
        try {
            const dateStr = dayDateInput.value || todayLocalIso();
            let raw = lastForecastJson
                ? sliceForecastHourlyForDate(lastForecastJson, dateStr)
                : null;
            if (!raw || raw.time.length < 6) {
                const { lat, lon } = latLon();
                try {
                    const u = forecastUrl(lat, lon, {
                        startDate: dateStr,
                        endDate: dateStr,
                        timezone: 'auto',
                    });
                    const j = await fetchJson(u);
                    if (!j?.error) raw = parseHourlySeries(j);
                } catch {
                    /* try archive */
                }
            }
            if (!raw || raw.time.length < 6) {
                const { lat, lon } = latLon();
                try {
                    const u = archiveUrl(lat, lon, dateStr, dateStr, {
                        timezone: 'auto',
                    });
                    const j = await fetchJson(u);
                    if (!j?.error) raw = parseHourlySeries(j);
                } catch {
                    /* ignore */
                }
            }
            if (!raw || raw.time.length === 0) {
                dayViewTimes.list = [];
                chartDayTemp = destroyChart(chartDayTemp);
                chartDayWind = destroyChart(chartDayWind);
                dayMeta.dom.textContent = `No hourly data for ${dateStr}.`;
                return;
            }
            dayViewTimes.list = raw.time.slice();
            const data = alignedNumeric(raw, toNum);
            const pluginsT = [
                createNowLinePlugin(
                    'weatherNowLineDayT',
                    () => dayViewTimes.list,
                    () => dayDateInput.value || todayLocalIso(),
                ),
            ];
            const pluginsW = [
                createNowLinePlugin(
                    'weatherNowLineDayW',
                    () => dayViewTimes.list,
                    () => dayDateInput.value || todayLocalIso(),
                ),
            ];
            chartDayTemp = destroyChart(chartDayTemp);
            chartDayWind = destroyChart(chartDayWind);
            chartDayTemp = createTempChart(
                dayTempCanvas,
                data,
                { yTitle: '°C', xMaxTicks: 24 },
                pluginsT,
            );
            chartDayWind = createWindChart(
                dayWindCanvas,
                data,
                { xMaxTicks: 24 },
                pluginsW,
            );
            const isToday =
                (dayDateInput.value || todayLocalIso()) === todayLocalIso();
            dayMeta.dom.textContent = `${
                raw.time.length
            } hourly samples for ${dateStr}${
                isToday ? ' · gold dashed line = current time' : ''
            }`;
        } catch (e) {
            dayMeta.dom.textContent = `Day chart: ${e?.message || e}`;
        }
    }

    async function loadForecast() {
        const { lat, lon } = latLon();
        status.dom.textContent = 'Loading forecast…';
        const url = forecastUrl(lat, lon, {
            pastDays: 2,
            forecastDays: 10,
            timezone: 'auto',
            current: OPEN_METEO_CURRENT_CORE,
        });
        const json = await fetchJson(url);
        if (json?.error) {
            throw new Error(json.reason || 'Forecast API error');
        }
        lastForecastJson = json;
        fillCurrentSummary(json);
        updateDayDateBoundsFromForecast(json);

        const raw = parseHourlySeries(json);
        const data = alignedNumeric(raw, toNum);

        forecastViewTimes.list = raw.time.slice();
        const fcPluginsT = [
            createNowLinePlugin(
                'weatherNowLineFcT',
                () => forecastViewTimes.list,
                null,
            ),
        ];
        const fcPluginsW = [
            createNowLinePlugin(
                'weatherNowLineFcW',
                () => forecastViewTimes.list,
                null,
            ),
        ];

        chartFcTemp = destroyChart(chartFcTemp);
        chartFcWind = destroyChart(chartFcWind);
        chartFcTemp = createTempChart(
            fcTempCanvas,
            data,
            { yTitle: '°C' },
            fcPluginsT,
        );
        chartFcWind = createWindChart(
            fcWindCanvas,
            data,
            {},
            fcPluginsW,
        );

        await rebuildDayCharts();

        status.dom.textContent = `Forecast updated (${data.labels.length} hourly samples). Source: Open-Meteo.`;
        stale = false;
    }

    function historyRangeDates() {
        const end = todayLocalIso();
        const days = Number(presetSelect.value) || 14;
        const start = addDays(end, days - 1);
        return { start, end, days };
    }

    async function loadHistory() {
        const { lat, lon } = latLon();
        const { start, end, days } = historyRangeDates();
        status.dom.textContent = 'Loading historical series…';
        const url = archiveUrl(lat, lon, start, end, { timezone: 'auto' });
        const json = await fetchJson(url);
        if (json?.error) {
            throw new Error(json.reason || 'Archive API error');
        }
        const raw = parseHourlySeries(json);
        const data = alignedNumeric(raw, toNum);

        chartHiTemp = destroyChart(chartHiTemp);
        chartHiWind = destroyChart(chartHiWind);
        chartHiTemp = createTempChart(hiTempCanvas, data, { yTitle: '°C' });
        chartHiWind = createWindChart(hiWindCanvas, data);

        historyMeta.dom.textContent = `Archive: ${start} → ${end} (${data.labels.length} hourly points).`;
        status.dom.textContent = `History loaded (${days} days).`;
        historyStale = false;
    }

    async function refreshAll() {
        const errors = [];
        try {
            await loadForecast();
        } catch (e) {
            errors.push(`Forecast: ${e?.message || e}`);
        }
        try {
            await loadHistory();
        } catch (e) {
            errors.push(`History: ${e?.message || e}`);
        }
        if (errors.length) {
            status.dom.textContent = errors.join(' · ');
        }
    }

    refreshForecastBtn.addEventListener('click', async () => {
        stale = true;
        try {
            await loadForecast();
        } catch (e) {
            status.dom.textContent = `Forecast failed: ${e?.message || e}`;
        }
    });

    loadHistoryBtn.addEventListener('click', async () => {
        historyStale = true;
        try {
            await loadHistory();
        } catch (e) {
            status.dom.textContent = `History failed: ${e?.message || e}`;
        }
    });

    applyDayBtn.addEventListener('click', () => {
        rebuildDayCharts().then(() => {
            requestAnimationFrame(() => {
                chartDayTemp?.resize();
                chartDayWind?.resize();
            });
        });
    });
    dayDateInput.addEventListener('change', () => {
        rebuildDayCharts().then(() => {
            requestAnimationFrame(() => {
                chartDayTemp?.resize();
                chartDayWind?.resize();
            });
        });
    });

    let loadPromise = null;

    function notifyVisible() {
        if (!stale && !historyStale) {
            requestAnimationFrame(() => {
                chartFcTemp?.resize();
                chartFcWind?.resize();
                chartHiTemp?.resize();
                chartHiWind?.resize();
                chartDayTemp?.resize();
                chartDayWind?.resize();
            });
            return;
        }
        if (loadPromise) return;
        loadPromise = refreshAll().finally(() => {
            loadPromise = null;
            requestAnimationFrame(() => {
                chartFcTemp?.resize();
                chartFcWind?.resize();
                chartHiTemp?.resize();
                chartHiWind?.resize();
                chartDayTemp?.resize();
                chartDayWind?.resize();
            });
        });
    }

    function onLocationChanged() {
        stale = true;
        historyStale = true;
        lastForecastJson = null;
        dayDateInput.value = todayLocalIso();
        fillCurrentSummary(null);
        forecastViewTimes.list = [];
        dayViewTimes.list = [];
        chartDayTemp = destroyChart(chartDayTemp);
        chartDayWind = destroyChart(chartDayWind);
        const sec = document.getElementById('section-weather');
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
            chartFcTemp = destroyChart(chartFcTemp);
            chartFcWind = destroyChart(chartFcWind);
            chartHiTemp = destroyChart(chartHiTemp);
            chartHiWind = destroyChart(chartHiWind);
            chartDayTemp = destroyChart(chartDayTemp);
            chartDayWind = destroyChart(chartDayWind);
        },
    };
}
