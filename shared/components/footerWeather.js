/**
 * Shared footer weather refresh used by Time and Local Environment.
 */
import { fetchJson, forecastCurrentOnlyUrl } from '../../apps/local-environment/openMeteo.js';

/**
 * @param {{ setTemp: (text: string) => void, setWind: (text: string) => void }} footer
 * @param {number} lat
 * @param {number} lon
 */
export async function refreshFooterWeather(footer, lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    try {
        const json = await fetchJson(forecastCurrentOnlyUrl(lat, lon, 'auto'));
        const cur = json?.current;
        const units = json?.current_units ?? {};
        if (json?.error || !cur) return;

        if (typeof cur.temperature_2m === 'number') {
            footer.setTemp(
                `${cur.temperature_2m.toFixed(1)}${units.temperature_2m || '°C'}`,
            );
        }
        if (typeof cur.wind_speed_10m === 'number') {
            footer.setWind(
                `${cur.wind_speed_10m.toFixed(1)}${units.wind_speed_10m || ' km/h'}`,
            );
        }
    } catch {
        /* keep previous values */
    }
}
