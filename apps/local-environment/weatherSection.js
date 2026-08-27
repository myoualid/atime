import { DrawUI } from '../../shared/drawUI/index.js';
import {
    OPEN_METEO_CURRENT_CORE,
    forecastUrl,
    archiveUrl,
    parseHourlySeries,
    fetchJson,
    todayLocalIso,
    addDays,
} from './openMeteo.js';
import {
    addCanvas,
    chartCard,
    createNowLinePlugin,
    dateField,
    destroyChart,
    makeTabbed,
    rangeSelect,
    sectionChrome,
    sidebarControls,
    weatherBtn,
} from './envUi.js';
import {
    alignedNumeric,
    createCurrentCard,
    createTempChart,
    createWindChart,
    fillCurrentSummary,
    hourlyDateBounds,
    sliceForecastHourlyForDate,
    toNum,
} from './weatherCharts.js';

/**
 * @param {{ core: { signals: { onLocationChanged: { add: Function; remove: Function } } }; services: { LocationService: { latitude: number; longitude: number } } }} ctx
 */
export function createWeatherSection(ctx) {
    const { core, services } = ctx;

    const { root, heading, intro, status } = sectionChrome({
        title: 'Weather',
        intro:
            'Hourly temperature, wind, and gusts from Open-Meteo (forecast blends national models; history uses reanalysis).',
    });

    const currentCard = createCurrentCard();
    const tabbed = makeTabbed();

    const forecastWrap = DrawUI.div();
    forecastWrap.setClass('weather-tab-content');
    const forecastToolbar = DrawUI.div();
    forecastToolbar.setClass('weather-toolbar');
    const forecastMeta = DrawUI.div();
    forecastMeta.setClass('weather-meta');
    forecastMeta.dom.textContent =
        'Past ~2 days through next ~10 days (hourly). Gold dashed line = current time.';
    const refreshForecastBtn = weatherBtn('Refresh forecast');
    forecastToolbar.add(refreshForecastBtn);

    const fcTemp = chartCard('Temperature');
    const fcWind = chartCard('Wind speed & gusts');
    const fcTempCanvas = addCanvas(fcTemp.inner).dom;
    const fcWindCanvas = addCanvas(fcWind.inner).dom;
    forecastWrap.add(forecastMeta, fcTemp.card, fcWind.card);

    const dayWrap = DrawUI.div();
    dayWrap.setClass('weather-tab-content');
    const dayToolbar = DrawUI.div();
    dayToolbar.setClass('weather-toolbar weather-toolbar-wrap');
    const dayDateLabel = DrawUI.span('Day: ');
    dayDateLabel.setClass('weather-range-label');
    const dayDateField = dateField(todayLocalIso());
    const dayDateInput = dayDateField.dom;
    const applyDayBtn = weatherBtn('Apply');
    dayToolbar.add(dayDateLabel, dayDateField, applyDayBtn);

    const dayMeta = DrawUI.div();
    dayMeta.setClass('weather-meta');
    dayMeta.dom.textContent =
        'Hourly evolution for the selected calendar day. The vertical marker shows the current time when the day is today.';

    const dayTemp = chartCard('Temperature');
    const dayWind = chartCard('Wind speed & gusts');
    const dayTempCanvas = addCanvas(dayTemp.inner, 'weather-day-temp-canvas').dom;
    const dayWindCanvas = addCanvas(dayWind.inner, 'weather-day-wind-canvas').dom;
    dayWrap.add(dayMeta, dayTemp.card, dayWind.card);

    const historyWrap = DrawUI.div();
    historyWrap.setClass('weather-tab-content');
    const historyToolbar = DrawUI.div();
    historyToolbar.setClass('weather-toolbar weather-toolbar-wrap');
    const rangeLabel = DrawUI.span('Range: ');
    rangeLabel.setClass('weather-range-label');
    const presetSelectUi = rangeSelect();
    const presetSelect = presetSelectUi.dom;
    const loadHistoryBtn = weatherBtn('Load history');
    historyToolbar.add(rangeLabel, presetSelectUi, loadHistoryBtn);

    const historyMeta = DrawUI.div();
    historyMeta.setClass('weather-meta');
    historyMeta.dom.textContent = '';

    const hiTemp = chartCard('Temperature (archive)');
    const hiWind = chartCard('Wind speed & gusts (archive)');
    const hiTempCanvas = addCanvas(hiTemp.inner).dom;
    const hiWindCanvas = addCanvas(hiWind.inner).dom;
    historyWrap.add(historyMeta, hiTemp.card, hiWind.card);

    const controlsPanel = sidebarControls('Weather', [
        { label: 'Forecast', content: forecastToolbar },
        { label: 'Day', content: dayToolbar },
        { label: 'History', content: historyToolbar },
    ]);

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
    const forecastViewTimes = { list: [] };
    const dayViewTimes = { list: [] };

    let stale = true;
    let historyStale = true;

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

    function resizeCharts() {
        chartFcTemp?.resize();
        chartFcWind?.resize();
        chartHiTemp?.resize();
        chartHiWind?.resize();
        chartDayTemp?.resize();
        chartDayWind?.resize();
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
            dayMeta.dom.textContent = `${raw.time.length} hourly samples for ${dateStr}${
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
        fillCurrentSummary(currentCard.dom, json);
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
        chartFcWind = createWindChart(fcWindCanvas, data, {}, fcPluginsW);

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

    refreshForecastBtn.onClick(async () => {
        stale = true;
        try {
            await loadForecast();
        } catch (e) {
            status.dom.textContent = `Forecast failed: ${e?.message || e}`;
        }
    });

    loadHistoryBtn.onClick(async () => {
        historyStale = true;
        try {
            await loadHistory();
        } catch (e) {
            status.dom.textContent = `History failed: ${e?.message || e}`;
        }
    });

    applyDayBtn.onClick(() => {
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
            requestAnimationFrame(resizeCharts);
            return;
        }
        if (loadPromise) return;
        loadPromise = refreshAll().finally(() => {
            loadPromise = null;
            requestAnimationFrame(resizeCharts);
        });
    }

    function onLocationChanged() {
        stale = true;
        historyStale = true;
        lastForecastJson = null;
        dayDateInput.value = todayLocalIso();
        fillCurrentSummary(currentCard.dom, null);
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
        controlsPanel,
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
