/**
 * Shared application footer used by the Time, Local Environment, and Food apps.
 * Builds a consistent `<footer class="app-footer">` structure that matches the
 * rules in `styles.css` (`.app-footer`, `.app-footer-inner`, `.app-footer-block`,
 * `.app-footer-location`, `.app-footer-kv`, `.app-footer-phase`).
 *
 * Returns { el, mapButton, setLocation, setTime, setTemp, setWind, setPhase }.
 */
export function createAppFooter(opts = {}) {
    const {
        showLocation = true,
        showMap = false,
        showTime = true,
        showTemp = true,
        showWind = true,
        showPhase = false,
    } = opts;

    const el = document.createElement('footer');
    el.className = 'app-footer';
    el.setAttribute('role', 'contentinfo');

    const parts = [];
    const divider = '<span class="app-footer-divider" aria-hidden="true"></span>';

    if (showLocation) {
        parts.push(`
            <div class="app-footer-block app-footer-location">
                <span class="location-icon" aria-hidden="true">📍</span>
                <span class="location-text">—</span>
                <span class="location-coords"></span>
                ${showMap ? '<button class="location-map-btn" type="button" aria-expanded="false">Map</button>' : ''}
            </div>
        `);
    }
    if (showTime) {
        if (parts.length) parts.push(divider);
        parts.push(`
            <div class="app-footer-kv">
                <span class="app-footer-label">Local time</span>
                <span class="app-footer-value footer-time">--:--:--</span>
            </div>
        `);
    }
    if (showTemp) {
        if (parts.length) parts.push(divider);
        parts.push(`
            <div class="app-footer-kv">
                <span class="app-footer-label">Temperature</span>
                <span class="app-footer-value footer-temp">—</span>
            </div>
        `);
    }
    if (showWind) {
        if (parts.length) parts.push(divider);
        parts.push(`
            <div class="app-footer-kv">
                <span class="app-footer-label">Wind</span>
                <span class="app-footer-value footer-wind">—</span>
            </div>
        `);
    }
    if (showPhase) {
        if (parts.length) parts.push(divider);
        parts.push(`
            <div class="app-footer-phase">
                <div class="app-footer-phase-top">
                    <span class="app-footer-phase-label footer-phase-title">—</span>
                    <span class="app-footer-phase-pct footer-phase-pct">—</span>
                </div>
                <div class="app-footer-phase-bar">
                    <div class="app-footer-phase-bar-fill footer-phase-bar-fill is-night"></div>
                </div>
            </div>
        `);
    }

    el.innerHTML = `<div class="app-footer-inner">${parts.join('')}</div>`;

    const locText = el.querySelector('.app-footer-location .location-text');
    const locCoords = el.querySelector('.app-footer-location .location-coords');
    const mapButton = el.querySelector('.location-map-btn');
    const timeEl = el.querySelector('.footer-time');
    const tempEl = el.querySelector('.footer-temp');
    const windEl = el.querySelector('.footer-wind');
    const phaseTitle = el.querySelector('.footer-phase-title');
    const phasePct = el.querySelector('.footer-phase-pct');
    const phaseFill = el.querySelector('.footer-phase-bar-fill');

    return {
        el,
        mapButton,
        setLocation(name, lat, lon) {
            if (locText) locText.textContent = name || '—';
            if (locCoords) {
                locCoords.textContent = (Number.isFinite(lat) && Number.isFinite(lon))
                    ? `(${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`
                    : '';
            }
        },
        setTime(text) { if (timeEl) timeEl.textContent = text ?? '--:--:--'; },
        startClock() {
            const tick = () => {
                this.setTime(new Date().toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                }));
            };
            tick();
            const id = setInterval(tick, 1000);
            return () => clearInterval(id);
        },
        setTemp(text) { if (tempEl) tempEl.textContent = text ?? '—'; },
        setWind(text) { if (windEl) windEl.textContent = text ?? '—'; },
        /**
         * @param {{ title?:string, pct?:number|null, phase?:'day'|'night'|'polar' }} info
         */
        setPhase(info = {}) {
            if (!phaseTitle || !phasePct || !phaseFill) return;
            phaseTitle.textContent = info.title ?? '—';
            if (info.phase === 'polar') {
                phasePct.textContent = '—';
                phaseFill.style.width = '100%';
                phaseFill.classList.remove('is-day', 'is-night');
                phaseFill.classList.add('is-polar');
            } else {
                const pct = Number(info.pct);
                phasePct.textContent = Number.isFinite(pct) ? `${pct.toFixed(1)}%` : '—';
                phaseFill.style.width = `${Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0))}%`;
                phaseFill.classList.remove('is-polar');
                phaseFill.classList.toggle('is-day', info.phase === 'day');
                phaseFill.classList.toggle('is-night', info.phase === 'night');
            }
        },
    };
}
