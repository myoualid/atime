import { DrawUI } from '../../shared/drawUI/index.js';
import { getChartCtor, shortTimeLabel, toNum } from './envUi.js';

export { toNum };

export function createCurrentCard() {
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
    return currentCard;
}

export function fillCurrentSummary(cardDom, json) {
    const cur = json?.current;
    const units = json?.current_units ?? {};
    const q = (name) => cardDom.querySelector(`[data-cur="${name}"]`);
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
    set('weather_code', weatherCodeLabel(cur.weather_code));
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

/** @param {number} deg */
export function windDirLabel(deg) {
    if (deg === null || deg === undefined || !Number.isFinite(deg)) return '—';
    const dirs = [
        'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
    ];
    return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** @param {number | null | undefined} code */
export function weatherCodeLabel(code) {
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
 * @param {{ time: string[]; temperature: unknown[]; windSpeed: unknown[]; windGust: unknown[] }} series
 * @param {(n: unknown) => number | null} num
 */
export function alignedNumeric(series, num = toNum) {
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

/**
 * @param {unknown} json
 * @param {string} dateStr yyyy-mm-dd
 */
export function sliceForecastHourlyForDate(json, dateStr) {
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
export function hourlyDateBounds(json) {
    const t = json?.hourly?.time;
    if (!t?.length) return { min: null, max: null };
    const first = String(t[0]).slice(0, 10);
    const last = String(t[t.length - 1]).slice(0, 10);
    return { min: first, max: last };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {ReturnType<typeof alignedNumeric>} data
 * @param {{ yTitle: string; xMaxTicks?: number }} opts
 * @param {object[]} [extraPlugins]
 */
export function createTempChart(canvas, data, opts, extraPlugins = []) {
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
export function createWindChart(canvas, data, scaleOpts = {}, extraPlugins = []) {
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
