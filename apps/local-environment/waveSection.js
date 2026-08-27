import { DrawUI } from '../../shared/drawUI/index.js';
import {
    OPEN_METEO_MARINE_HOURLY_WAVES,
    marineUrl,
    parseMarineWaveSeries,
    fetchJson,
    todayLocalIso,
    addDays,
} from './openMeteo.js';
import {
    chartCard,
    clamp,
    createNowLinePlugin,
    dateField,
    destroyChart,
    hasAnyFinite,
    makeTabbed,
    rangeSelect,
    sectionChrome,
    shortTimeLabel,
    sidebarControls,
    toNum,
    weatherBtn,
} from './envUi.js';
import {
    WAVE_TARGET_DEFAULT_M,
    createWaveAnnotationsPlugin,
    createWaveHeightChart,
    createWaveTargetLinePlugin,
    formatWaveSummary,
    marineHourlyDateBounds,
    mountWaveChartLayout,
    sliceMarineHourlyForDate,
} from './marineCharts.js';

/**
 * @param {{
 *   core: { signals: { onLocationChanged: { add: Function; remove: Function } } };
 *   services: { LocationService: { latitude: number; longitude: number } };
 *   onMarineReferenceChanged?: (coords: { lat: number; lon: number; source: string } | null) => void;
 * }} ctx
 */
export function createWaveSection(ctx) {
    const { core, services } = ctx;
    const onMarineReferenceChanged =
        typeof ctx.onMarineReferenceChanged === 'function'
            ? ctx.onMarineReferenceChanged
            : () => {};

    const { root, heading, intro, status } = sectionChrome({
        title: 'Waves',
        intro:
            'Modelled significant, wind, and swell wave heights from Open-Meteo Marine (hourly, ~8 km ocean grid). Heights are informational only and not suitable for navigation.',
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

    const fcWaveSummary = DrawUI.div();
    fcWaveSummary.setClass('weather-tide-summary');
    const fcWaves = chartCard('Wave height (significant, wind, swell)');
    fcWaves.inner.addClass('weather-chart-inner-wave');
    const fcWaveCanvasUi = DrawUI.canvas();
    const fcWaveCanvas = fcWaveCanvasUi.dom;
    const fcWaveTargetInput = mountWaveChartLayout(
        fcWaves.inner,
        fcWaveCanvasUi,
        'wave-target-fc',
        WAVE_TARGET_DEFAULT_M,
    );
    forecastWrap.add(fcMeta, fcWaveSummary, fcWaves.card);

    const dayWrap = DrawUI.div();
    dayWrap.setClass('weather-tab-content');
    const dayToolbar = DrawUI.div();
    dayToolbar.setClass('weather-toolbar weather-toolbar-wrap');
    const dayDateLabel = DrawUI.span('Day: ');
    dayDateLabel.setClass('weather-range-label');
    const dayDateField = dateField(todayLocalIso());
    dayDateField.setId('wave-day-date');
    const dayDateInput = dayDateField.dom;
    const applyDayBtn = weatherBtn('Apply');
    dayToolbar.add(dayDateLabel, dayDateField, applyDayBtn);

    const dayMeta = DrawUI.div();
    dayMeta.setClass('weather-meta');
    dayMeta.dom.textContent =
        'Hourly wave height for the selected calendar day. Vertical marker = now only when that day is today.';

    const dayWaveSummary = DrawUI.div();
    dayWaveSummary.setClass('weather-tide-summary');
    const dayWaves = chartCard('Wave height (significant, wind, swell)');
    dayWaves.inner.addClass('weather-chart-inner-wave');
    const dayWaveCanvasUi = DrawUI.canvas();
    const dayWaveCanvas = dayWaveCanvasUi.dom;
    const dayWaveTargetInput = mountWaveChartLayout(
        dayWaves.inner,
        dayWaveCanvasUi,
        'wave-target-day',
        WAVE_TARGET_DEFAULT_M,
    );
    dayWrap.add(dayMeta, dayWaveSummary, dayWaves.card);

    const historyWrap = DrawUI.div();
    historyWrap.setClass('weather-tab-content');
    const hiToolbar = DrawUI.div();
    hiToolbar.setClass('weather-toolbar weather-toolbar-wrap');
    const rangeLabel = DrawUI.span('Range: ');
    rangeLabel.setClass('weather-range-label');
    const presetSelectUi = rangeSelect('wave-history-preset');
    const presetSelect = presetSelectUi.dom;
    const loadHistBtn = weatherBtn('Load history');
    hiToolbar.add(rangeLabel, presetSelectUi, loadHistBtn);

    const historyMeta = DrawUI.div();
    historyMeta.setClass('weather-meta');
    historyMeta.dom.textContent = '';

    const hiWaveSummary = DrawUI.div();
    hiWaveSummary.setClass('weather-tide-summary');
    const hiWaves = chartCard('Wave height (history)');
    hiWaves.inner.addClass('weather-chart-inner-wave');
    const hiWaveCanvasUi = DrawUI.canvas();
    const hiWaveCanvas = hiWaveCanvasUi.dom;
    const hiWaveTargetInput = mountWaveChartLayout(
        hiWaves.inner,
        hiWaveCanvasUi,
        'wave-target-hi',
        WAVE_TARGET_DEFAULT_M,
    );
    historyWrap.add(historyMeta, hiWaveSummary, hiWaves.card);

    const controlsPanel = sidebarControls('Waves', [
        { label: 'Forecast', content: fcToolbar },
        { label: 'Day', content: dayToolbar },
        { label: 'History', content: hiToolbar },
    ]);

    tabbed.addTab('wave-tab-forecast', 'Forecast', forecastWrap);
    tabbed.addTab('wave-tab-day', 'Day', dayWrap);
    tabbed.addTab('wave-tab-history', 'History', historyWrap);
    tabbed.select('wave-tab-forecast');

    root.add(heading, intro, status, tabbed);

    let chartFcWave = null;
    let chartDayWave = null;
    let chartHiWave = null;

    /** @type {unknown | null} */
    let lastWaveForecastJson = null;
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
        chartFcWave?.resize();
        chartDayWave?.resize();
        chartHiWave?.resize();
    }

    function paintWaveChart(canvas, times, series, plugins, extraOpts = {}) {
        const labels = times.map((t) => shortTimeLabel(t));
        return createWaveHeightChart(
            canvas,
            {
                labels,
                timesIso: times,
                waveHeight: series.waveHeight,
                windWaveHeight: series.windWaveHeight,
                swellWaveHeight: series.swellWaveHeight,
            },
            { yTitle: 'm (significant height)', ...extraOpts },
            plugins,
        );
    }

    function waveSeriesFromRaw(raw) {
        return {
            waveHeight: (raw.waveHeightM || []).map(toNum),
            windWaveHeight: (raw.windWaveHeightM || []).map(toNum),
            swellWaveHeight: (raw.swellWaveHeightM || []).map(toNum),
            wavePeriod: (raw.wavePeriodS || []).map(toNum),
        };
    }

    function waveHasData(series) {
        return (
            hasAnyFinite(series.waveHeight) ||
            hasAnyFinite(series.windWaveHeight) ||
            hasAnyFinite(series.swellWaveHeight)
        );
    }

    async function loadWaveForecast() {
        const { lat, lon } = latLon();
        status.dom.textContent = 'Loading wave forecast…';
        const url = marineUrl(lat, lon, {
            pastDays: 2,
            forecastDays: 8,
            timezone: 'auto',
            hourly: OPEN_METEO_MARINE_HOURLY_WAVES,
            cellSelection: 'sea',
        });
        const json = await fetchJson(url);
        if (json?.error) {
            throw new Error(json.reason || 'Marine API error');
        }
        publishMarineReference(json);

        const raw = parseMarineWaveSeries(json);
        const series = waveSeriesFromRaw(raw);
        const times = raw.time || [];
        if (!(times.length > 0 && waveHasData(series))) {
            lastWaveForecastJson = null;
            chartFcWave = destroyChart(chartFcWave);
            fcWaveData.timesIso = [];
            fcWaveData.periodS = [];
            fcWaveData.waveHeight = [];
            fcWaveSummary.dom.textContent = '';
            fcMeta.dom.textContent =
                'No usable wave-height data (try coordinates closer to open water).';
            dayWaveSummary.dom.textContent = '';
            dayMeta.dom.textContent =
                'No hourly wave data available for day view at this location.';
            stale = false;
            return;
        }

        lastWaveForecastJson = json;
        updateDayBoundsFromForecast(json);

        fcWaveData.timesIso = times.slice();
        fcWaveData.periodS = series.wavePeriod.slice();
        fcWaveData.waveHeight = series.waveHeight.slice();
        chartFcWave = destroyChart(chartFcWave);
        chartFcWave = paintWaveChart(fcWaveCanvas, times, series, [
            createNowLinePlugin('waveNowLineFc', () => fcWaveData.timesIso, null),
            createWaveAnnotationsPlugin('waveAnnotationsFc', () => fcWaveData),
            createWaveTargetLinePlugin(
                'waveTargetLineFc',
                () => waveTargetM,
                setWaveTarget,
            ),
        ]);
        fcWaveSummary.dom.textContent = formatWaveSummary(
            times,
            series.waveHeight,
            series.windWaveHeight,
            series.swellWaveHeight,
            series.wavePeriod,
        );
        fcMeta.dom.textContent =
            'Waves are significant modelled heights (not observations).';

        stale = false;
        status.dom.textContent = `Waves forecast updated (${times.length} hourly samples).`;
        await rebuildDayCharts();
    }

    async function rebuildDayCharts() {
        try {
            const dateStr = dayDateInput.value || todayLocalIso();
            let raw = lastWaveForecastJson
                ? sliceMarineHourlyForDate(lastWaveForecastJson, dateStr)
                : null;
            if (!raw || raw.time.length < 4) {
                const { lat, lon } = latLon();
                try {
                    const u = marineUrl(lat, lon, {
                        startDate: dateStr,
                        endDate: dateStr,
                        timezone: 'auto',
                        hourly: OPEN_METEO_MARINE_HOURLY_WAVES,
                        cellSelection: 'sea',
                    });
                    const j = await fetchJson(u);
                    if (!j?.error) {
                        publishMarineReference(j);
                        raw = parseMarineWaveSeries(j);
                    }
                } catch {
                    /* ignore */
                }
            }
            if (!raw || raw.time.length === 0) {
                chartDayWave = destroyChart(chartDayWave);
                dayWaveData.timesIso = [];
                dayWaveData.periodS = [];
                dayWaveData.waveHeight = [];
                dayWaveSummary.dom.textContent = '';
                dayMeta.dom.textContent = `No hourly wave data for ${dateStr}.`;
                return;
            }
            const series = waveSeriesFromRaw(raw);
            if (!waveHasData(series)) {
                chartDayWave = destroyChart(chartDayWave);
                dayWaveData.timesIso = [];
                dayWaveData.periodS = [];
                dayWaveData.waveHeight = [];
                dayWaveSummary.dom.textContent = '';
                dayMeta.dom.textContent = `No valid wave samples for ${dateStr}.`;
                return;
            }

            const isToday =
                (dayDateInput.value || todayLocalIso()) === todayLocalIso();
            dayWaveData.timesIso = raw.time.slice();
            dayWaveData.periodS = series.wavePeriod.slice();
            dayWaveData.waveHeight = series.waveHeight.slice();
            chartDayWave = destroyChart(chartDayWave);
            chartDayWave = paintWaveChart(
                dayWaveCanvas,
                raw.time,
                series,
                [
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
                ],
                { xMaxTicks: 24 },
            );
            dayWaveSummary.dom.textContent = formatWaveSummary(
                raw.time,
                series.waveHeight,
                series.windWaveHeight,
                series.swellWaveHeight,
                series.wavePeriod,
            );
            dayMeta.dom.textContent = `${raw.time.length} hourly samples for ${dateStr}${
                isToday ? ' · gold dashed = current time' : ''
            }`;
        } catch (e) {
            dayMeta.dom.textContent = `Day chart: ${e?.message || e}`;
        }
    }

    function waveHistoryRangeDays() {
        const end = todayLocalIso();
        const days = Number(presetSelect.value) || 14;
        const start = addDays(end, days - 1);
        return { start, end, days };
    }

    async function loadWaveHistory() {
        const { lat, lon } = latLon();
        const { start, end, days } = waveHistoryRangeDays();
        status.dom.textContent = 'Loading wave history…';

        let json = null;
        try {
            const u = marineUrl(lat, lon, {
                startDate: start,
                endDate: end,
                timezone: 'auto',
                hourly: OPEN_METEO_MARINE_HOURLY_WAVES,
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
                hourly: OPEN_METEO_MARINE_HOURLY_WAVES,
                cellSelection: 'sea',
            });
            json = await fetchJson(u2);
        }
        if (json?.error) {
            throw new Error(json.reason || 'Marine API error');
        }
        publishMarineReference(json);

        const raw = parseMarineWaveSeries(json);
        const series = waveSeriesFromRaw(raw);
        const times = raw.time || [];
        if (!(times.length > 0 && waveHasData(series))) {
            chartHiWave = destroyChart(chartHiWave);
            hiWaveData.timesIso = [];
            hiWaveData.periodS = [];
            hiWaveData.waveHeight = [];
            hiWaveSummary.dom.textContent = '';
            historyMeta.dom.textContent =
                'No usable wave-height history for this location.';
            historyStale = false;
            return;
        }

        hiWaveData.timesIso = times.slice();
        hiWaveData.periodS = series.wavePeriod.slice();
        hiWaveData.waveHeight = series.waveHeight.slice();
        chartHiWave = destroyChart(chartHiWave);
        chartHiWave = paintWaveChart(hiWaveCanvas, times, series, [
            createWaveAnnotationsPlugin('waveAnnotationsHi', () => hiWaveData),
            createWaveTargetLinePlugin(
                'waveTargetLineHi',
                () => waveTargetM,
                setWaveTarget,
            ),
        ]);
        hiWaveSummary.dom.textContent = formatWaveSummary(
            times,
            series.waveHeight,
            series.windWaveHeight,
            series.swellWaveHeight,
            series.wavePeriod,
        );
        historyMeta.dom.textContent = `Wave history: ${start} → ${end} (${times.length} hourly points).`;
        status.dom.textContent = `Wave history loaded (${days} days).`;
        historyStale = false;
    }

    async function refreshAll() {
        const errors = [];
        try {
            await loadWaveForecast();
        } catch (e) {
            errors.push(`Forecast: ${e?.message || e}`);
        }
        try {
            await loadWaveHistory();
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
            await loadWaveForecast();
        } catch (e) {
            status.dom.textContent = `Forecast failed: ${e?.message || e}`;
        }
    });

    loadHistBtn.onClick(async () => {
        historyStale = true;
        try {
            await loadWaveHistory();
        } catch (e) {
            status.dom.textContent = `History failed: ${e?.message || e}`;
        }
    });

    applyDayBtn.onClick(() => {
        rebuildDayCharts().then(() => {
            requestAnimationFrame(() => chartDayWave?.resize());
        });
    });
    dayDateInput.addEventListener('change', () => {
        rebuildDayCharts().then(() => {
            requestAnimationFrame(() => chartDayWave?.resize());
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
        lastWaveForecastJson = null;
        dayDateInput.value = todayLocalIso();
        fcWaveData.timesIso = [];
        fcWaveData.periodS = [];
        fcWaveData.waveHeight = [];
        dayWaveData.timesIso = [];
        dayWaveData.periodS = [];
        dayWaveData.waveHeight = [];
        hiWaveData.timesIso = [];
        hiWaveData.periodS = [];
        hiWaveData.waveHeight = [];
        fcWaveSummary.dom.textContent = '';
        dayWaveSummary.dom.textContent = '';
        hiWaveSummary.dom.textContent = '';
        fcMeta.dom.textContent =
            'Wave forecast will reload when you open this section.';
        chartFcWave = destroyChart(chartFcWave);
        chartDayWave = destroyChart(chartDayWave);
        chartHiWave = destroyChart(chartHiWave);
        const sec = document.getElementById('section-waves');
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
            chartFcWave = destroyChart(chartFcWave);
            chartDayWave = destroyChart(chartDayWave);
            chartHiWave = destroyChart(chartHiWave);
        },
    };
}
