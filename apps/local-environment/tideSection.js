import { DrawUI } from '../../shared/drawUI/index.js';
import {
    OPEN_METEO_MARINE_HOURLY_SEA,
    marineUrl,
    parseMarineSeaLevelSeries,
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
    hasAnyFinite,
    makeTabbed,
    meanFinite,
    rangeSelect,
    sectionChrome,
    shortTimeLabel,
    sidebarControls,
    toNum,
    weatherBtn,
} from './envUi.js';
import {
    createSeaLevelChart,
    dailyTidalRanges,
    fillTideEventsList,
    findSeaLevelExtrema,
    formatTideEventLines,
    formatTideSummary,
    marineHourlyDateBounds,
    paintSeaLevelView,
    sliceMarineHourlyForDate,
} from './marineCharts.js';

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

    const { root, heading, intro, status } = sectionChrome({
        title: 'Tides',
        intro:
            'Modelled sea level from Open-Meteo Marine (hourly, ~8 km ocean grid). Heights are informational only and not suitable for navigation.',
    });

    const tabbed = makeTabbed();

    const forecastWrap = DrawUI.div();
    forecastWrap.setClass('weather-tab-content');
    const fcToolbar = DrawUI.div();
    fcToolbar.setClass('weather-toolbar');
    const fcMeta = DrawUI.div();
    fcMeta.setClass('weather-meta');
    fcMeta.dom.textContent =
        'Past ~2 days through next ~8 days (hourly). Gold dashed line = current time.';
    const refreshFcBtn = weatherBtn('Refresh forecast');
    fcToolbar.add(refreshFcBtn);

    const fcSummary = DrawUI.div();
    fcSummary.setClass('weather-tide-summary');
    const fcSea = chartCard('Sea level (modelled, incl. tides)');
    const fcRange = chartCard('Daily tidal range (max − min)');
    const fcSeaCanvas = addCanvas(fcSea.inner).dom;
    const fcRangeCanvas = addCanvas(fcRange.inner).dom;
    const fcEvents = DrawUI.div();
    fcEvents.setClass('weather-tide-events-wrap');
    forecastWrap.add(
        fcMeta,
        fcSummary,
        fcSea.card,
        fcRange.card,
        fcEvents,
    );

    const dayWrap = DrawUI.div();
    dayWrap.setClass('weather-tab-content');
    const dayToolbar = DrawUI.div();
    dayToolbar.setClass('weather-toolbar weather-toolbar-wrap');
    const dayDateLabel = DrawUI.span('Day: ');
    dayDateLabel.setClass('weather-range-label');
    const dayDateField = dateField(todayLocalIso());
    dayDateField.setId('tide-day-date');
    const dayDateInput = dayDateField.dom;
    const applyDayBtn = weatherBtn('Apply');
    dayToolbar.add(dayDateLabel, dayDateField, applyDayBtn);

    const dayMeta = DrawUI.div();
    dayMeta.setClass('weather-meta');
    dayMeta.dom.textContent =
        'Hourly sea level for the selected calendar day. Vertical marker = now only when that day is today.';

    const daySea = chartCard('Sea level');
    const daySeaCanvas = addCanvas(daySea.inner).dom;
    const dayEvents = DrawUI.div();
    dayEvents.setClass('weather-tide-events-wrap');
    dayWrap.add(dayMeta, daySea.card, dayEvents);

    const historyWrap = DrawUI.div();
    historyWrap.setClass('weather-tab-content');
    const hiToolbar = DrawUI.div();
    hiToolbar.setClass('weather-toolbar weather-toolbar-wrap');
    const rangeLabel = DrawUI.span('Range: ');
    rangeLabel.setClass('weather-range-label');
    const presetSelectUi = rangeSelect('tide-history-preset');
    const presetSelect = presetSelectUi.dom;
    const loadHistBtn = weatherBtn('Load history');
    hiToolbar.add(rangeLabel, presetSelectUi, loadHistBtn);

    const historyMeta = DrawUI.div();
    historyMeta.setClass('weather-meta');
    historyMeta.dom.textContent = '';

    const hiSea = chartCard('Sea level (history)');
    const hiRange = chartCard('Daily tidal range (history)');
    const hiSeaCanvas = addCanvas(hiSea.inner).dom;
    const hiRangeCanvas = addCanvas(hiRange.inner).dom;
    historyWrap.add(historyMeta, hiSea.card, hiRange.card);

    const controlsPanel = sidebarControls('Tides', [
        { label: 'Forecast', content: fcToolbar },
        { label: 'Day', content: dayToolbar },
        { label: 'History', content: hiToolbar },
    ]);

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

    function latLon() {
        return {
            lat: services.LocationService.latitude,
            lon: services.LocationService.longitude,
        };
    }

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

    function resizeCharts() {
        chartFcSea?.resize();
        chartFcRange?.resize();
        chartDaySea?.resize();
        chartHiSea?.resize();
        chartHiRange?.resize();
    }

    async function loadTideForecast() {
        const { lat, lon } = latLon();
        status.dom.textContent = 'Loading tide forecast…';
        const url = marineUrl(lat, lon, {
            pastDays: 2,
            forecastDays: 8,
            timezone: 'auto',
            hourly: OPEN_METEO_MARINE_HOURLY_SEA,
            cellSelection: 'sea',
        });
        const json = await fetchJson(url);
        if (json?.error) {
            throw new Error(json.reason || 'Marine API error');
        }
        publishMarineReference(json);

        const raw = parseMarineSeaLevelSeries(json);
        const levels = raw.seaLevelM.map(toNum);
        const seaHasData = raw.time?.length > 0 && hasAnyFinite(levels);

        if (!seaHasData) {
            lastTideForecastJson = null;
            chartFcSea = destroyChart(chartFcSea);
            chartFcRange = destroyChart(chartFcRange);
            chartDaySea = destroyChart(chartDaySea);
            forecastViewTimes.list = [];
            dayViewTimes.list = [];
            fcSummary.dom.textContent = '';
            fcEvents.clear();
            fcMeta.dom.textContent =
                'No usable sea-level data (try coordinates closer to open water).';
            dayEvents.clear();
            dayMeta.dom.textContent =
                'No hourly sea-level data available for day view at this location.';
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
        fcSummary.dom.textContent = formatTideSummary(raw.time, levels, json);
        fillTideEventsList(
            fcEvents,
            formatTideEventLines(raw.time, levels, meanFinite(levels)),
        );
        fcMeta.dom.textContent =
            'Sea level is shown vs global MSL (not chart datum).';

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
                        hourly: OPEN_METEO_MARINE_HOURLY_SEA,
                        cellSelection: 'sea',
                    });
                    const j = await fetchJson(u);
                    if (!j?.error) {
                        publishMarineReference(j);
                        const sea = parseMarineSeaLevelSeries(j);
                        raw = {
                            time: sea.time,
                            seaLevelM: sea.seaLevelM,
                        };
                    }
                } catch {
                    /* ignore */
                }
            }
            if (!raw || raw.time.length === 0) {
                dayViewTimes.list = [];
                chartDaySea = destroyChart(chartDaySea);
                dayEvents.clear();
                dayMeta.dom.textContent = `No hourly sea-level data for ${dateStr}.`;
                return;
            }
            const levels = (raw.seaLevelM || []).map(toNum);
            if (!hasAnyFinite(levels)) {
                dayViewTimes.list = [];
                chartDaySea = destroyChart(chartDaySea);
                dayEvents.clear();
                dayMeta.dom.textContent = `No valid samples for ${dateStr}.`;
                return;
            }

            dayViewTimes.list = raw.time.slice();
            const isToday =
                (dayDateInput.value || todayLocalIso()) === todayLocalIso();
            chartDaySea = destroyChart(chartDaySea);
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
                dayEvents,
                formatTideEventLines(raw.time, levels, mean),
            );
            const dr = dailyTidalRanges(raw.time, levels);
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
                hourly: OPEN_METEO_MARINE_HOURLY_SEA,
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
                hourly: OPEN_METEO_MARINE_HOURLY_SEA,
                cellSelection: 'sea',
            });
            json = await fetchJson(u2);
        }
        if (json?.error) {
            throw new Error(json.reason || 'Marine API error');
        }
        publishMarineReference(json);

        const raw = parseMarineSeaLevelSeries(json);
        const levels = raw.seaLevelM.map(toNum);
        if (!(raw.time?.length > 0 && hasAnyFinite(levels))) {
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
        historyMeta.dom.textContent = `Tide history: ${start} → ${end} (${raw.time.length} hourly points).`;
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

    refreshFcBtn.onClick(async () => {
        stale = true;
        try {
            await loadTideForecast();
        } catch (e) {
            status.dom.textContent = `Forecast failed: ${e?.message || e}`;
        }
    });

    loadHistBtn.onClick(async () => {
        historyStale = true;
        try {
            await loadTideHistory();
        } catch (e) {
            status.dom.textContent = `History failed: ${e?.message || e}`;
        }
    });

    applyDayBtn.onClick(() => {
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
        onMarineReferenceChanged(null);
        lastTideForecastJson = null;
        dayDateInput.value = todayLocalIso();
        forecastViewTimes.list = [];
        dayViewTimes.list = [];
        fcSummary.dom.textContent = '';
        fcEvents.clear();
        fcMeta.dom.textContent =
            'Tide forecast will reload when you open this section.';
        dayEvents.clear();
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
        controlsPanel,
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
