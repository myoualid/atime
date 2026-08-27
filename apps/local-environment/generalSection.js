import { DrawUI } from '../../shared/drawUI/index.js';
import {
    OPEN_METEO_CURRENT_CORE,
    OPEN_METEO_MARINE_HOURLY_SEA_AND_WAVES,
    forecastUrl,
    marineUrl,
    parseHourlySeries,
    parseMarineSeaLevelSeries,
    parseMarineWaveSeries,
    fetchJson,
} from './openMeteo.js';
import {
    addCanvas,
    chartCard,
    createNowLinePlugin,
    destroyChart,
    hasAnyFinite,
    sectionChrome,
    shortTimeLabel,
    toNum,
    weatherBtn,
    meanFinite as meanFiniteEnv,
    sidebarControls,
} from './envUi.js';
import {
    alignedNumeric,
    createCurrentCard,
    createTempChart,
    createWindChart,
    fillCurrentSummary,
} from './weatherCharts.js';
import {
    createSeaLevelChart,
    createWaveHeightChart,
    findSeaLevelExtrema,
    formatTideSummary,
    formatWaveSummary,
} from './marineCharts.js';

const LAYERS = [
    { id: 'weather', label: 'Weather' },
    { id: 'wind', label: 'Wind' },
    { id: 'tides', label: 'Tides' },
    { id: 'waves', label: 'Wave heights' },
];

function layerBlock(id, title) {
    const block = DrawUI.div();
    block.setClass('env-general-block');
    block.dom.dataset.layer = id;

    const heading = DrawUI.h3(title);
    heading.setClass('env-general-block-title');

    const summary = DrawUI.div();
    summary.setClass('weather-tide-summary');

    block.add(heading, summary);
    return { block, summary };
}

/**
 * @param {{
 *   core: { signals: { onLocationChanged: { add: Function; remove: Function } } };
 *   services: { LocationService: { latitude: number; longitude: number } };
 *   onMarineReferenceChanged?: (coords: { lat: number; lon: number; source: string } | null) => void;
 * }} ctx
 */
export function createGeneralSection(ctx) {
    const { core, services } = ctx;
    const onMarineReferenceChanged =
        typeof ctx.onMarineReferenceChanged === 'function'
            ? ctx.onMarineReferenceChanged
            : () => {};

    const { root, heading, intro, status } = sectionChrome({
        title: 'Local conditions',
        intro:
            'Stacked overview of weather, wind, tides, and wave heights for this location. Use the sidebar to refresh data or hide layers.',
        statusText: 'Loading local conditions…',
    });
    root.addClass('env-general');

    const toolbar = DrawUI.div();
    toolbar.setClass('weather-toolbar');
    const refreshBtn = weatherBtn('Refresh');
    toolbar.add(refreshBtn);

    const currentCard = createCurrentCard();

    const weatherBlock = layerBlock('weather', 'Weather');
    const fcTemp = chartCard('Temperature');
    fcTemp.inner.addClass('env-chart-compact');
    const fcTempCanvas = addCanvas(fcTemp.inner).dom;
    weatherBlock.block.add(currentCard, fcTemp.card);

    const windBlock = layerBlock('wind', 'Wind');
    const fcWind = chartCard('Wind speed & gusts');
    fcWind.inner.addClass('env-chart-compact');
    const fcWindCanvas = addCanvas(fcWind.inner).dom;
    windBlock.block.add(fcWind.card);

    const tideBlock = layerBlock('tides', 'Tides');
    const fcSea = chartCard('Sea level (modelled, incl. tides)');
    fcSea.inner.addClass('env-chart-compact');
    const fcSeaCanvas = addCanvas(fcSea.inner).dom;
    tideBlock.block.add(fcSea.card);

    const waveBlock = layerBlock('waves', 'Wave heights');
    const fcWaves = chartCard('Significant, wind, and swell');
    fcWaves.inner.addClass('env-chart-compact');
    const fcWaveCanvas = addCanvas(fcWaves.inner).dom;
    waveBlock.block.add(fcWaves.card);

    const stack = DrawUI.div();
    stack.setClass('env-general-stack');
    stack.add(
        weatherBlock.block,
        windBlock.block,
        tideBlock.block,
        waveBlock.block,
    );

    root.add(heading, intro, status, stack);

    const visible = {
        weather: true,
        wind: true,
        tides: true,
        waves: true,
    };

    const layerList = DrawUI.div();
    layerList.setClass('env-layer-panel');

    const layerChecks = {};
    for (const layer of LAYERS) {
        const row = DrawUI.label();
        row.setClass('env-layer-toggle');
        row.dom.innerHTML = `<input type="checkbox" checked> <span>${layer.label}</span>`;
        const input = row.dom.querySelector('input');
        input.setAttribute('aria-label', `Show ${layer.label}`);
        input.addEventListener('change', () => {
            setLayerVisible(layer.id, input.checked);
        });
        layerList.add(row);
        layerChecks[layer.id] = input;
    }

    const controlsPanel = sidebarControls('Overview', [
        { label: 'Data', content: toolbar },
        { label: 'Layers', content: layerList },
    ]);

    function setLayerVisible(id, on) {
        visible[id] = on;
        const block = stack.dom.querySelector(`[data-layer="${id}"]`);
        if (block) block.hidden = !on;
        if (layerChecks[id]) layerChecks[id].checked = on;
        requestAnimationFrame(resizeCharts);
    }

    let chartTemp = null;
    let chartWind = null;
    let chartSea = null;
    let chartWave = null;
    const weatherTimes = { list: [] };
    const marineTimes = { list: [] };

    let stale = true;

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

    function resizeCharts() {
        chartTemp?.resize();
        chartWind?.resize();
        chartSea?.resize();
        chartWave?.resize();
    }

    async function loadWeather() {
        const { lat, lon } = latLon();
        const url = forecastUrl(lat, lon, {
            pastDays: 1,
            forecastDays: 3,
            timezone: 'auto',
            current: OPEN_METEO_CURRENT_CORE,
        });
        const json = await fetchJson(url);
        if (json?.error) {
            throw new Error(json.reason || 'Forecast API error');
        }
        fillCurrentSummary(currentCard.dom, json);
        const raw = parseHourlySeries(json);
        const data = alignedNumeric(raw, toNum);
        weatherTimes.list = raw.time.slice();

        const nowTemp = [
            createNowLinePlugin('genNowLineTemp', () => weatherTimes.list, null),
        ];
        const nowWind = [
            createNowLinePlugin('genNowLineWind', () => weatherTimes.list, null),
        ];
        chartTemp = destroyChart(chartTemp);
        chartWind = destroyChart(chartWind);
        chartTemp = createTempChart(fcTempCanvas, data, { yTitle: '°C' }, nowTemp);
        chartWind = createWindChart(fcWindCanvas, data, {}, nowWind);

        const nearTemp = data.temperature.find((v) => Number.isFinite(v));
        weatherBlock.summary.dom.textContent = Number.isFinite(nearTemp)
            ? `${data.labels.length} hourly samples · Open-Meteo forecast.`
            : 'No temperature samples in this window.';
        windBlock.summary.dom.textContent =
            'Wind speed and gusts at 10 m. Gold dashed line = now.';
    }

    async function loadMarine() {
        const { lat, lon } = latLon();
        const url = marineUrl(lat, lon, {
            pastDays: 1,
            forecastDays: 3,
            timezone: 'auto',
            hourly: OPEN_METEO_MARINE_HOURLY_SEA_AND_WAVES,
            cellSelection: 'sea',
        });
        const json = await fetchJson(url);
        if (json?.error) {
            throw new Error(json.reason || 'Marine API error');
        }
        publishMarineReference(json);

        const seaRaw = parseMarineSeaLevelSeries(json);
        const waveRaw = parseMarineWaveSeries(json);
        const levels = seaRaw.seaLevelM.map(toNum);
        const waveHeight = waveRaw.waveHeightM.map(toNum);
        const windWaveHeight = waveRaw.windWaveHeightM.map(toNum);
        const swellWaveHeight = waveRaw.swellWaveHeightM.map(toNum);
        const wavePeriod = waveRaw.wavePeriodS.map(toNum);
        const seaTimes = seaRaw.time || [];
        const waveTimes = waveRaw.time?.length ? waveRaw.time : seaTimes;
        marineTimes.list = (seaTimes.length ? seaTimes : waveTimes).slice();

        chartSea = destroyChart(chartSea);
        chartWave = destroyChart(chartWave);

        if (seaTimes.length && hasAnyFinite(levels)) {
            const mean = meanFiniteEnv(levels);
            const { highs, lows } = findSeaLevelExtrema(levels);
            const labels = seaTimes.map((t) => shortTimeLabel(t));
            chartSea = createSeaLevelChart(
                fcSeaCanvas,
                {
                    labels,
                    seaLevel: levels,
                    mean,
                    highIdx: new Set(highs),
                    lowIdx: new Set(lows),
                    timesIso: seaTimes,
                },
                { yTitle: 'm (above global MSL)' },
                [
                    createNowLinePlugin(
                        'genNowLineTide',
                        () => marineTimes.list,
                        null,
                    ),
                ],
            );
            tideBlock.summary.dom.textContent = formatTideSummary(
                seaTimes,
                levels,
                json,
            );
        } else {
            tideBlock.summary.dom.textContent =
                'No usable sea-level data (try coordinates closer to open water).';
        }

        if (
            waveTimes.length &&
            (hasAnyFinite(waveHeight) ||
                hasAnyFinite(windWaveHeight) ||
                hasAnyFinite(swellWaveHeight))
        ) {
            const labels = waveTimes.map((t) => shortTimeLabel(t));
            chartWave = createWaveHeightChart(
                fcWaveCanvas,
                {
                    labels,
                    timesIso: waveTimes,
                    waveHeight,
                    windWaveHeight,
                    swellWaveHeight,
                },
                { yTitle: 'm (significant height)', padTop: 8 },
                [
                    createNowLinePlugin(
                        'genNowLineWave',
                        () => waveTimes,
                        null,
                    ),
                ],
            );
            waveBlock.summary.dom.textContent = formatWaveSummary(
                waveTimes,
                waveHeight,
                windWaveHeight,
                swellWaveHeight,
                wavePeriod,
            );
        } else {
            waveBlock.summary.dom.textContent =
                'No usable wave-height samples for this window.';
        }
    }

    async function refreshAll() {
        const errors = [];
        try {
            await loadWeather();
        } catch (e) {
            errors.push(`Weather: ${e?.message || e}`);
        }
        try {
            await loadMarine();
        } catch (e) {
            errors.push(`Marine: ${e?.message || e}`);
        }
        stale = false;
        if (errors.length) {
            status.dom.textContent = errors.join(' · ');
        } else {
            status.dom.textContent =
                'Overview updated. Gold dashed line = current time.';
        }
    }

    refreshBtn.onClick(async () => {
        stale = true;
        status.dom.textContent = 'Refreshing…';
        try {
            await refreshAll();
        } catch (e) {
            status.dom.textContent = `Refresh failed: ${e?.message || e}`;
        } finally {
            requestAnimationFrame(resizeCharts);
        }
    });

    let loadPromise = null;

    function notifyVisible() {
        if (!stale) {
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
        onMarineReferenceChanged(null);
        fillCurrentSummary(currentCard.dom, null);
        weatherTimes.list = [];
        marineTimes.list = [];
        weatherBlock.summary.dom.textContent = '';
        windBlock.summary.dom.textContent = '';
        tideBlock.summary.dom.textContent = '';
        waveBlock.summary.dom.textContent = '';
        chartTemp = destroyChart(chartTemp);
        chartWind = destroyChart(chartWind);
        chartSea = destroyChart(chartSea);
        chartWave = destroyChart(chartWave);
        const sec = document.getElementById('section-general');
        if (sec?.classList.contains('is-active')) {
            notifyVisible();
        }
    }

    core.signals.onLocationChanged.add(onLocationChanged);

    return {
        root,
        controlsPanel,
        notifyVisible,
        setLayerVisible,
        dispose() {
            core.signals.onLocationChanged.remove(onLocationChanged);
            chartTemp = destroyChart(chartTemp);
            chartWind = destroyChart(chartWind);
            chartSea = destroyChart(chartSea);
            chartWave = destroyChart(chartWave);
        },
    };
}
