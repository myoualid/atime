import { createCore } from '../time/core.js';
import { createOps } from '../time/ops.js';
import { createWeatherSection } from './weatherSection.js';
import { createTideSection } from './tideSection.js';
import { fetchJson, forecastCurrentOnlyUrl } from './openMeteo.js';
import { createAppFooter } from '../../shared/components/appFooter.js';

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

function buildShell() {
    const shell = document.createElement('div');
    shell.className = 'app-shell';

    const mainRow = document.createElement('div');
    mainRow.className = 'app-main-row';

    const sideNav = document.createElement('nav');
    sideNav.className = 'app-side-nav';
    sideNav.setAttribute('aria-label', 'Local Environement sections');

    const mainPanel = document.createElement('div');
    mainPanel.className = 'Panel app-main-panel';

    const scrollInner = document.createElement('div');
    scrollInner.className = 'app-panel-scroll';

    const intro = document.createElement('header');
    intro.className = 'location-info';
    intro.innerHTML = [
        '<span class="location-icon" aria-hidden="true">📍</span>',
        '<span class="location-name-row">',
        '  <span class="location-text">Loading location...</span>',
        '  <button class="location-map-btn" type="button" aria-expanded="false">Map</button>',
        '</span>',
        '<span class="location-coords"></span>',
    ].join('');

    const locationMapPanel = document.createElement('section');
    locationMapPanel.className = 'location-map-panel';
    locationMapPanel.hidden = true;
    locationMapPanel.innerHTML = [
        '<div class="location-map-header">',
        '  <h3>OpenStreetMap View</h3>',
        '  <button class="location-map-close" type="button" aria-label="Close map">Close</button>',
        '</div>',
        '<div class="location-map-meta"></div>',
        '<div class="location-map-legend">',
        '  <span class="location-map-legend-item"><span class="location-map-dot is-current"></span>Your location</span>',
        '  <span class="location-map-legend-item"><span class="location-map-dot is-marine"></span>Marine calculation grid point</span>',
        '</div>',
        '<div class="location-map-canvas" role="img" aria-label="Map showing your location and marine calculation reference"></div>',
        '<div class="location-map-footnote">Marine point is sourced from the Open-Meteo marine response latitude/longitude.</div>',
    ].join('');

    const sectionWeather = document.createElement('section');
    sectionWeather.id = 'section-weather';
    sectionWeather.className = 'app-section';

    const sectionTides = document.createElement('section');
    sectionTides.id = 'section-tides';
    sectionTides.className = 'app-section';

    scrollInner.append(intro, locationMapPanel, sectionWeather, sectionTides);
    mainPanel.appendChild(scrollInner);
    mainRow.append(sideNav, mainPanel);

    const footer = createAppFooter({ showPhase: false });

    shell.append(mainRow, footer.el);

    return {
        shell,
        sideNav,
        scrollInner,
        intro,
        locationMapPanel,
        sectionWeather,
        sectionTides,
        footer,
    };
}

function buildNav(sideNav, onSelect) {
    const links = [
        { href: '../../', label: 'Launcher', icon: '⌂' },
        { href: '../time/', label: 'Time', icon: '⌚' },
        { href: '../food/', label: 'Food', icon: '☰' },
    ];

    for (const link of links) {
        const a = document.createElement('a');
        a.className = 'app-nav-btn';
        a.href = link.href;
        a.innerHTML = `<span class="app-nav-icon" aria-hidden="true">${link.icon}</span><span class="app-nav-label">${link.label}</span>`;
        sideNav.appendChild(a);
    }

    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.margin = '6px 0 8px';
    divider.style.background = 'rgba(255,255,255,0.12)';
    sideNav.appendChild(divider);

    const sections = [
        { id: 'section-weather', label: 'Weather', icon: '☁' },
        { id: 'section-tides', label: 'Tides', icon: '≋' },
    ];

    const buttons = [];

    for (const spec of sections) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'app-nav-btn';
        btn.dataset.section = spec.id;
        btn.setAttribute('aria-label', spec.label);
        btn.innerHTML = `<span class="app-nav-icon" aria-hidden="true">${spec.icon}</span><span class="app-nav-label">${spec.label}</span>`;
        btn.addEventListener('click', () => onSelect(spec.id));
        sideNav.appendChild(btn);
        buttons.push(btn);
    }

    return { buttons, sections };
}

(async function bootLocalEnvironement() {
    const core = createCore();
    const ops = createOps(core);
    const LocationService = createLocationService(core, ops);
    const services = { LocationService };

    const {
        shell,
        sideNav,
        scrollInner,
        intro,
        locationMapPanel,
        sectionWeather,
        sectionTides,
        footer,
    } = buildShell();

    document.body.innerHTML = '';
    document.body.appendChild(shell);

    const mapToggleBtn = intro.querySelector('.location-map-btn');
    const mapCloseBtn = locationMapPanel.querySelector('.location-map-close');
    const mapMeta = locationMapPanel.querySelector('.location-map-meta');
    const mapCanvas = locationMapPanel.querySelector('.location-map-canvas');

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
            : 'Not available yet (open Tides section to load marine data)';
        mapMeta.textContent = `Current: ${currentLabel} · Marine grid: ${marineLabel}`;
    }

    async function refreshLocationMap() {
        updateMapMeta();
        if (locationMapPanel.hidden) return;

        const curLat = services.LocationService.latitude;
        const curLon = services.LocationService.longitude;
        const hasCurrent = hasValidCoords(curLat, curLon);

        if (!hasCurrent) {
            mapMeta.textContent = 'Current location is unavailable.';
            return;
        }

        const L = await ensureLeafletLoaded();
        if (!mapInstance) {
            mapInstance = L.map(mapCanvas, {
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
        locationMapPanel.hidden = !open;
        mapToggleBtn.setAttribute('aria-expanded', String(open));
        if (open) {
            if (!marineReference) {
                tideUI.notifyVisible();
            }
            refreshLocationMap().catch((err) => {
                mapMeta.textContent = `Map failed to load: ${err?.message || err}`;
            });
        }
    }

    const weatherUI = createWeatherSection({ core, services });
    const tideUI = createTideSection({
        core,
        services,
        onMarineReferenceChanged(coords) {
            marineReference = coords;
            refreshLocationMap().catch(() => {
                /* map may still be closed */
            });
        },
    });
    sectionWeather.appendChild(weatherUI.root.dom ?? weatherUI.root);
    sectionTides.appendChild(tideUI.root.dom ?? tideUI.root);

    mapToggleBtn.addEventListener('click', () => {
        setMapPanelOpen(locationMapPanel.hidden);
    });
    mapCloseBtn.addEventListener('click', () => {
        setMapPanelOpen(false);
    });

    const sectionEls = {
        'section-weather': sectionWeather,
        'section-tides': sectionTides,
    };

    function activateSection(sectionId) {
        for (const [id, node] of Object.entries(sectionEls)) {
            if (id === sectionId) node.classList.add('is-active');
            else node.classList.remove('is-active');
        }

        nav.buttons.forEach((btn) => {
            const on = btn.dataset.section === sectionId;
            btn.setAttribute('aria-pressed', String(on));
            if (on) btn.setAttribute('aria-current', 'true');
            else btn.removeAttribute('aria-current');
        });

        scrollInner.scrollTop = 0;

        if (sectionId === 'section-weather') {
            weatherUI.notifyVisible();
        }
        if (sectionId === 'section-tides') {
            tideUI.notifyVisible();
        }
    }

    const nav = buildNav(sideNav, activateSection);

    function updateLocationLabels() {
        const name = services.LocationService.locationName || 'Unknown location';
        const lat = services.LocationService.latitude;
        const lon = services.LocationService.longitude;
        const coords = Number.isFinite(lat) && Number.isFinite(lon)
            ? `(${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`
            : '';

        document.querySelectorAll('.location-text').forEach((el) => {
            el.textContent = name;
        });
        document.querySelectorAll('.location-coords').forEach((el) => {
            el.textContent = coords;
        });

        footer.setLocation(name, lat, lon);
        refreshLocationMap().catch(() => {
            /* best effort */
        });
    }

    async function refreshFooterWeather() {
        try {
            const lat = services.LocationService.latitude;
            const lon = services.LocationService.longitude;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

            const json = await fetchJson(forecastCurrentOnlyUrl(lat, lon, 'auto'));
            const cur = json?.current;

            if (typeof cur?.temperature_2m === 'number') {
                footer.setTemp(`${cur.temperature_2m.toFixed(1)}°C`);
            }
            if (typeof cur?.wind_speed_10m === 'number') {
                footer.setWind(`${cur.wind_speed_10m.toFixed(1)} km/h`);
            }
        } catch {
            footer.setTemp('--.-°C');
            footer.setWind('--.- km/h');
        }
    }

    function tickClock() {
        const now = new Date();
        footer.setTime(now.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        }));
    }

    const onLocationChanged = () => {
        updateLocationLabels();
        refreshFooterWeather();
    };

    core.signals.onLocationChanged.add(onLocationChanged);

    updateLocationLabels();
    updateMapMeta();
    tickClock();
    setInterval(tickClock, 1000);

    activateSection('section-weather');

    try {
        await services.LocationService.requestLocation();
        updateLocationLabels();
    } finally {
        refreshFooterWeather();
    }

    window.addEventListener('beforeunload', () => {
        core.signals.onLocationChanged.remove(onLocationChanged);
        weatherUI.dispose?.();
        tideUI.dispose?.();
        mapInstance?.remove();
        mapInstance = null;
    });
})();
