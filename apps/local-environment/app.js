import { DrawUI } from '../../shared/drawUI/index.js';
import { createCore } from '../time/core.js';
import { createOps } from '../time/ops.js';
import { createWeatherSection } from './weatherSection.js';
import { createTideSection } from './tideSection.js';
import { createWaveSection } from './waveSection.js';
import { createGeneralSection } from './generalSection.js';
import { createAppShell } from '../../shared/components/appShell.js';
import { refreshFooterWeather } from '../../shared/components/footerWeather.js';

const LEAFLET_CSS_URL =
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS_URL =
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let leafletLoadPromise = null;

function ensureLeafletLoaded() {
    if (globalThis.L && typeof globalThis.L.map === 'function') {
        return Promise.resolve(globalThis.L);
    }
    if (leafletLoadPromise) return leafletLoadPromise;

    leafletLoadPromise = new Promise((resolve, reject) => {
        const cssId = 'leaflet-stylesheet';
        const scriptId = 'leaflet-script';

        if (!document.getElementById(cssId)) {
            const link = document.createElement('link');
            link.id = cssId;
            link.rel = 'stylesheet';
            link.href = LEAFLET_CSS_URL;
            document.head.appendChild(link);
        }

        const existingScript = document.getElementById(scriptId);
        if (existingScript) {
            existingScript.addEventListener('load', () => {
                if (globalThis.L) resolve(globalThis.L);
                else reject(new Error('Leaflet failed to load.'));
            });
            existingScript.addEventListener('error', () => {
                reject(new Error('Leaflet script failed to load.'));
            });
            return;
        }

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = LEAFLET_JS_URL;
        script.async = true;
        script.onload = () => {
            if (globalThis.L) resolve(globalThis.L);
            else reject(new Error('Leaflet loaded, but window.L is missing.'));
        };
        script.onerror = () => {
            reject(new Error('Leaflet script failed to load.'));
        };
        document.head.appendChild(script);
    });

    return leafletLoadPromise;
}

function hasValidCoords(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon);
}

function formatCoords(lat, lon) {
    if (!hasValidCoords(lat, lon)) return 'Unknown';
    return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
}

function createLocationService(core, ops) {
    return {
        get latitude() {
            return core.state.location.latitude;
        },
        get longitude() {
            return core.state.location.longitude;
        },
        get locationName() {
            return core.state.location.locationName;
        },
        async requestLocation() {
            return ops.requestLocation();
        },
    };
}

function legendItem(dotClass, label) {
    const item = DrawUI.span();
    item.setClass('location-map-legend-item');
    const dot = DrawUI.span();
    dot.setClass(`location-map-dot ${dotClass}`);
    const text = DrawUI.span(label);
    item.add(dot, text);
    return item;
}

function buildContent() {
    const locationMapPanel = DrawUI.div();
    locationMapPanel.setClass('location-map-panel');
    locationMapPanel.setHidden(true);

    const mapHeader = DrawUI.div();
    mapHeader.setClass('location-map-header');
    const mapTitle = DrawUI.h3('OpenStreetMap View');
    const mapCloseBtn = DrawUI.button('Close');
    mapCloseBtn.setClass('location-map-close');
    mapCloseBtn.dom.type = 'button';
    mapCloseBtn.dom.setAttribute('aria-label', 'Close map');
    mapHeader.add(mapTitle, mapCloseBtn);

    const mapMeta = DrawUI.div();
    mapMeta.setClass('location-map-meta');

    const mapLegend = DrawUI.div();
    mapLegend.setClass('location-map-legend');
    mapLegend.add(
        legendItem('is-current', 'Your location'),
        legendItem('is-marine', 'Marine calculation grid point'),
    );

    const mapCanvas = DrawUI.div();
    mapCanvas.setClass('location-map-canvas');
    mapCanvas.dom.setAttribute('role', 'img');
    mapCanvas.dom.setAttribute(
        'aria-label',
        'Map showing your location and marine calculation reference',
    );

    const mapFootnote = DrawUI.div();
    mapFootnote.setClass('location-map-footnote');
    mapFootnote.dom.textContent =
        'Marine point is sourced from the Open-Meteo marine response latitude/longitude.';

    locationMapPanel.add(mapHeader, mapMeta, mapLegend, mapCanvas, mapFootnote);

    const sectionGeneral = DrawUI.div();
    sectionGeneral.setId('section-general');
    sectionGeneral.setClass('app-section');

    const sectionWeather = DrawUI.div();
    sectionWeather.setId('section-weather');
    sectionWeather.setClass('app-section');

    const sectionTides = DrawUI.div();
    sectionTides.setId('section-tides');
    sectionTides.setClass('app-section');

    const sectionWaves = DrawUI.div();
    sectionWaves.setId('section-waves');
    sectionWaves.setClass('app-section');

    return {
        locationMapPanel,
        mapCloseBtn,
        mapMeta,
        mapCanvas,
        sectionGeneral,
        sectionWeather,
        sectionTides,
        sectionWaves,
    };
}

(async function bootLocalEnvironement() {
    const core = createCore();
    const ops = createOps(core);
    const LocationService = createLocationService(core, ops);
    const services = { LocationService };

    const sectionSpecs = [
        { id: 'section-general', label: 'General', icon: 'dashboard' },
        { id: 'section-weather', label: 'Weather', icon: 'partly_cloudy_day' },
        { id: 'section-tides', label: 'Tides', icon: 'water' },
        { id: 'section-waves', label: 'Waves', icon: 'waves' },
    ];

    const {
        locationMapPanel,
        mapCloseBtn,
        mapMeta,
        mapCanvas,
        sectionGeneral,
        sectionWeather,
        sectionTides,
        sectionWaves,
    } = buildContent();

    const sectionEls = {
        'section-general': sectionGeneral,
        'section-weather': sectionWeather,
        'section-tides': sectionTides,
        'section-waves': sectionWaves,
    };

    /** @type {{ notifyVisible: Function, root: *, dispose?: Function, controlsPanel?: * } | undefined} */
    let generalUI;
    /** @type {{ notifyVisible: Function, root: *, dispose?: Function, controlsPanel?: * } | undefined} */
    let weatherUI;
    /** @type {{ notifyVisible: Function, root: *, dispose?: Function, controlsPanel?: * } | undefined} */
    let tideUI;
    /** @type {{ notifyVisible: Function, root: *, dispose?: Function, controlsPanel?: * } | undefined} */
    let waveUI;

    const {
        root: shell,
        sidebar,
        scrollInner,
        footer,
        setSection,
        dispose,
    } = createAppShell({
        currentApp: 'local-environment',
        sections: sectionSpecs,
        initialSection: 'section-general',
        footer: { showPhase: false, showMap: true },
        onSection(sectionId) {
            showSection(sectionId);
        },
        sectionNavLabel: 'Local Environment sections',
    });

    sidebar.addClass('app-sidebar-nav');
    sidebar.dom.setAttribute('aria-label', 'Local Environment controls');
    sidebar.dom.hidden = false;

    const notifyBySection = {
        'section-general': () => generalUI?.notifyVisible(),
        'section-weather': () => weatherUI?.notifyVisible(),
        'section-tides': () => tideUI?.notifyVisible(),
        'section-waves': () => waveUI?.notifyVisible(),
    };

    function controlPanels() {
        return {
            'section-general': generalUI?.controlsPanel,
            'section-weather': weatherUI?.controlsPanel,
            'section-tides': tideUI?.controlsPanel,
            'section-waves': waveUI?.controlsPanel,
        };
    }

    function showSection(sectionId) {
        for (const [id, node] of Object.entries(sectionEls)) {
            if (id === sectionId) node.addClass('is-active');
            else node.removeClass('is-active');
        }
        for (const [id, panel] of Object.entries(controlPanels())) {
            panel?.setHidden(id !== sectionId);
        }
        scrollInner.dom.scrollTop = 0;
        notifyBySection[sectionId]?.();
    }

    scrollInner.add(
        locationMapPanel,
        sectionGeneral,
        sectionWeather,
        sectionTides,
        sectionWaves,
    );

    document.body.innerHTML = '';
    document.body.appendChild(shell.dom);

    const mapToggleBtn = footer.mapButton;

    /** @type {{ lat: number; lon: number; source: string } | null} */
    let marineReference = null;
    /** @type {*} */
    let mapInstance = null;
    /** @type {*} */
    let currentMarker = null;
    /** @type {*} */
    let marineMarker = null;
    /** @type {*} */
    let linkLine = null;

    function updateMapMeta() {
        const curLat = services.LocationService.latitude;
        const curLon = services.LocationService.longitude;
        const currentLabel = hasValidCoords(curLat, curLon)
            ? formatCoords(curLat, curLon)
            : 'Unknown';
        const marineLabel = marineReference
            ? formatCoords(marineReference.lat, marineReference.lon)
            : 'Not available yet (open Tides or Waves to load marine data)';
        mapMeta.dom.textContent = `Current: ${currentLabel} · Marine grid: ${marineLabel}`;
    }

    async function refreshLocationMap() {
        updateMapMeta();
        if (locationMapPanel.isHidden()) return;

        const curLat = services.LocationService.latitude;
        const curLon = services.LocationService.longitude;
        const hasCurrent = hasValidCoords(curLat, curLon);

        if (!hasCurrent) {
            mapMeta.dom.textContent = 'Current location is unavailable.';
            return;
        }

        const L = await ensureLeafletLoaded();
        if (!mapInstance) {
            mapInstance = L.map(mapCanvas.dom, {
                zoomControl: true,
                attributionControl: true,
            });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors',
            }).addTo(mapInstance);
        }

        if (currentMarker) currentMarker.remove();
        currentMarker = L.circleMarker([curLat, curLon], {
            radius: 8,
            color: '#f5f9ff',
            weight: 2,
            fillColor: '#1d8ff2',
            fillOpacity: 0.95,
        })
            .bindPopup('Your current location')
            .addTo(mapInstance);

        if (marineMarker) {
            marineMarker.remove();
            marineMarker = null;
        }
        if (linkLine) {
            linkLine.remove();
            linkLine = null;
        }

        if (marineReference && hasValidCoords(marineReference.lat, marineReference.lon)) {
            marineMarker = L.circleMarker(
                [marineReference.lat, marineReference.lon],
                {
                    radius: 8,
                    color: '#fff2de',
                    weight: 2,
                    fillColor: '#e08f2a',
                    fillOpacity: 0.95,
                },
            )
                .bindPopup(marineReference.source)
                .addTo(mapInstance);

            linkLine = L.polyline(
                [
                    [curLat, curLon],
                    [marineReference.lat, marineReference.lon],
                ],
                {
                    color: 'rgba(250, 214, 120, 0.9)',
                    weight: 2,
                    dashArray: '6 5',
                },
            ).addTo(mapInstance);

            mapInstance.fitBounds(
                [
                    [curLat, curLon],
                    [marineReference.lat, marineReference.lon],
                ],
                {
                    padding: [24, 24],
                    maxZoom: 11,
                },
            );
        } else {
            mapInstance.setView([curLat, curLon], 10);
        }

        setTimeout(() => mapInstance.invalidateSize(), 0);
    }

    function setMapPanelOpen(open) {
        locationMapPanel.setHidden(!open);
        mapToggleBtn?.setAttribute('aria-expanded', String(open));
        mapToggleBtn?.classList.toggle('is-open', open);
        if (open) {
            if (!marineReference) {
                generalUI?.notifyVisible();
                tideUI?.notifyVisible();
            }
            refreshLocationMap().catch((err) => {
                mapMeta.dom.textContent = `Map failed to load: ${err?.message || err}`;
            });
        }
    }

    function onMarineReferenceChanged(coords) {
        marineReference = coords;
        refreshLocationMap().catch(() => {
            /* map may still be closed */
        });
    }

    generalUI = createGeneralSection({
        core,
        services,
        onMarineReferenceChanged,
    });
    weatherUI = createWeatherSection({ core, services });
    tideUI = createTideSection({
        core,
        services,
        onMarineReferenceChanged,
    });
    waveUI = createWaveSection({
        core,
        services,
        onMarineReferenceChanged,
    });

    sectionGeneral.add(generalUI.root);
    sectionWeather.add(weatherUI.root);
    sectionTides.add(tideUI.root);
    sectionWaves.add(waveUI.root);

    for (const panel of Object.values(controlPanels())) {
        if (panel) sidebar.add(panel);
    }

    mapToggleBtn?.addEventListener('click', () => {
        setMapPanelOpen(locationMapPanel.isHidden());
    });
    mapCloseBtn.onClick(() => {
        setMapPanelOpen(false);
    });

    function updateLocationLabels() {
        const name = services.LocationService.locationName || 'Unknown location';
        const lat = services.LocationService.latitude;
        const lon = services.LocationService.longitude;

        footer.setLocation(name, lat, lon);
        refreshLocationMap().catch(() => {
            /* best effort */
        });
    }

    const updateFooterWeather = () => refreshFooterWeather(
        footer,
        services.LocationService.latitude,
        services.LocationService.longitude,
    );

    const onLocationChanged = () => {
        updateLocationLabels();
        updateFooterWeather();
    };

    core.signals.onLocationChanged.add(onLocationChanged);

    updateLocationLabels();
    updateMapMeta();
    setSection('section-general');

    try {
        await services.LocationService.requestLocation();
        updateLocationLabels();
    } finally {
        await updateFooterWeather();
    }

    window.addEventListener('beforeunload', () => {
        core.signals.onLocationChanged.remove(onLocationChanged);
        generalUI.dispose?.();
        weatherUI.dispose?.();
        tideUI.dispose?.();
        waveUI.dispose?.();
        mapInstance?.remove();
        mapInstance = null;
        dispose();
    });
})();
