/** Open-Meteo API helpers (non-commercial public endpoints). */

export const OPEN_METEO_HOURLY_CORE =
    'temperature_2m,wind_speed_10m,wind_gusts_10m';

/** Variables for the `current=` block (instant conditions). */
export const OPEN_METEO_CURRENT_CORE =
    'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m';

/** Open-Meteo Marine API: modelled sea level including tides (see marine docs). */
export const OPEN_METEO_MARINE_HOURLY_SEA = 'sea_level_height_msl';

/**
 * @param {number} lat
 * @param {number} lon
 * @param {{
 *   pastDays?: number;
 *   forecastDays?: number;
 *   timezone?: string;
 *   startDate?: string;
 *   endDate?: string;
 *   current?: string | false;
 * }} [opts]
 * Use either (pastDays + forecastDays) or (startDate + endDate), not both.
 */
export function forecastUrl(lat, lon, opts = {}) {
    const {
        pastDays = 2,
        forecastDays = 10,
        timezone = 'auto',
        startDate,
        endDate,
        current = false,
    } = opts;
    const u = new URL('https://api.open-meteo.com/v1/forecast');
    u.searchParams.set('latitude', String(lat));
    u.searchParams.set('longitude', String(lon));
    u.searchParams.set('hourly', OPEN_METEO_HOURLY_CORE);
    u.searchParams.set('timezone', timezone);
    if (startDate && endDate) {
        u.searchParams.set('start_date', startDate);
        u.searchParams.set('end_date', endDate);
    } else {
        u.searchParams.set('past_days', String(pastDays));
        u.searchParams.set('forecast_days', String(forecastDays));
    }
    if (current && typeof current === 'string') {
        u.searchParams.set('current', current);
    }
    return u.toString();
}

/**
 * Minimal forecast request: only `current` (for footer / quick widgets).
 * @param {number} lat
 * @param {number} lon
 * @param {string} [timezone]
 */
export function forecastCurrentOnlyUrl(lat, lon, timezone = 'auto') {
    const u = new URL('https://api.open-meteo.com/v1/forecast');
    u.searchParams.set('latitude', String(lat));
    u.searchParams.set('longitude', String(lon));
    u.searchParams.set('timezone', timezone);
    u.searchParams.set('current', 'temperature_2m,wind_speed_10m');
    return u.toString();
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {string} startDate yyyy-mm-dd
 * @param {string} endDate yyyy-mm-dd
 * @param {{ timezone?: string }} [opts]
 */
export function archiveUrl(lat, lon, startDate, endDate, opts = {}) {
    const { timezone = 'auto' } = opts;
    const u = new URL('https://archive-api.open-meteo.com/v1/archive');
    u.searchParams.set('latitude', String(lat));
    u.searchParams.set('longitude', String(lon));
    u.searchParams.set('start_date', startDate);
    u.searchParams.set('end_date', endDate);
    u.searchParams.set('hourly', OPEN_METEO_HOURLY_CORE);
    u.searchParams.set('timezone', timezone);
    return u.toString();
}

/** @param {unknown} json */
export function parseHourlySeries(json) {
    const hourly = json?.hourly;
    if (!hourly?.time || !Array.isArray(hourly.time)) {
        return {
            time: [],
            temperature: [],
            windSpeed: [],
            windGust: [],
        };
    }
    return {
        time: hourly.time,
        temperature: hourly.temperature_2m ?? [],
        windSpeed: hourly.wind_speed_10m ?? [],
        windGust: hourly.wind_gusts_10m ?? [],
    };
}

export async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }
    return res.json();
}

/**
 * Marine API (sea level, waves, …). Prefer `cell_selection=sea` near coasts.
 * Use either (`past_days` + `forecast_days`) or (`start_date` + `end_date`).
 * @param {number} lat
 * @param {number} lon
 * @param {{
 *   pastDays?: number;
 *   forecastDays?: number;
 *   startDate?: string;
 *   endDate?: string;
 *   timezone?: string;
 *   hourly?: string;
 *   cellSelection?: 'sea' | 'land' | 'nearest';
 * }} [opts]
 */
export function marineUrl(lat, lon, opts = {}) {
    const {
        timezone = 'auto',
        hourly = OPEN_METEO_MARINE_HOURLY_SEA,
        cellSelection = 'sea',
        pastDays,
        forecastDays,
        startDate,
        endDate,
    } = opts;
    const u = new URL('https://marine-api.open-meteo.com/v1/marine');
    u.searchParams.set('latitude', String(lat));
    u.searchParams.set('longitude', String(lon));
    u.searchParams.set('hourly', hourly);
    u.searchParams.set('timezone', timezone);
    u.searchParams.set('cell_selection', cellSelection);
    if (startDate && endDate) {
        u.searchParams.set('start_date', startDate);
        u.searchParams.set('end_date', endDate);
    } else {
        const pd = pastDays ?? 0;
        const fd = forecastDays ?? 8;
        u.searchParams.set('past_days', String(pd));
        u.searchParams.set('forecast_days', String(fd));
    }
    return u.toString();
}

/**
 * Short marine forecast window (no archive). Same as `marineUrl` with defaults.
 * @param {number} lat
 * @param {number} lon
 * @param {{ forecastDays?: number; timezone?: string; hourly?: string; cellSelection?: 'sea' | 'land' | 'nearest' }} [opts]
 */
export function marineForecastUrl(lat, lon, opts = {}) {
    const { forecastDays, timezone, hourly, cellSelection } = opts;
    return marineUrl(lat, lon, {
        pastDays: 0,
        forecastDays: forecastDays ?? 8,
        timezone,
        hourly,
        cellSelection,
    });
}

/** @param {unknown} json */
export function parseMarineSeaLevelSeries(json) {
    const hourly = json?.hourly;
    if (!hourly?.time || !Array.isArray(hourly.time)) {
        return { time: [], seaLevelM: [] };
    }
    return {
        time: hourly.time,
        seaLevelM: hourly.sea_level_height_msl ?? [],
    };
}

/**
 * @param {string} isoDate yyyy-mm-dd
 * @param {number} daysBack number of days to subtract from that calendar day (UTC)
 */
export function addDays(isoDate, daysBack) {
    const parts = String(isoDate).split('-').map((x) => parseInt(x, 10));
    const y = parts[0];
    const mo = parts[1];
    const da = parts[2];
    const d = new Date(Date.UTC(y, mo - 1, da, 12, 0, 0));
    d.setUTCDate(d.getUTCDate() - daysBack);
    return d.toISOString().slice(0, 10);
}

/** Local calendar date yyyy-mm-dd (for archive end date). */
export function todayLocalIso() {
    const d = new Date();
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
}
