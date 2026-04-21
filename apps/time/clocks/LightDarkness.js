import { DrawUI } from '../../../shared/drawUI/index.js';
import * as tools from '../../../shared/tools/index.js';
import { staticData } from '../data.js';


function createDayClock(container, {core, ops, services}) {
    const clockContainer = DrawUI.div();
    clockContainer.setClass('clock-container proportional-clock day-proportional-clock');
    
    const arcSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arcSvg.setAttribute('class', 'proportional-arc-svg');
    arcSvg.setAttribute('viewBox', '0 0 300 300');
    
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', '150');
    bgCircle.setAttribute('cy', '150');
    bgCircle.setAttribute('r', '140');
    bgCircle.setAttribute('fill', '#87ceeb');
    bgCircle.setAttribute('class', 'day-bg');
    arcSvg.appendChild(bgCircle);
    
    const dawnArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    dawnArc.setAttribute('class', 'prop-dawn-arc');
    dawnArc.setAttribute('fill', '#ff9060');
    arcSvg.appendChild(dawnArc);
    
    const duskArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    duskArc.setAttribute('class', 'prop-dusk-arc');
    duskArc.setAttribute('fill', '#ff9060');
    arcSvg.appendChild(duskArc);
    
    clockContainer.dom.appendChild(arcSvg);
    
    function describeArc(cx, cy, radius, startAngle, endAngle) {
        const start = {
            x: cx + radius * Math.cos(startAngle * Math.PI / 180),
            y: cy + radius * Math.sin(startAngle * Math.PI / 180)
        };
        const end = {
            x: cx + radius * Math.cos(endAngle * Math.PI / 180),
            y: cy + radius * Math.sin(endAngle * Math.PI / 180)
        };
        const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
        return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
    }
    
    const clockFace = DrawUI.div();
    clockFace.setClass('proportional-face day-face');
    
    const piMarkers = staticData.proportionalClock?.piMarkers ?? [
        { deg: 0, pi: '0' },
        { deg: 90, pi: 'π/4' },
        { deg: 180, pi: 'π/2' },
        { deg: 270, pi: '3π/4' },
    ];
    
    piMarkers.forEach(({ deg, pi }) => {
        const angle = deg - 90;
        const angleRad = angle * Math.PI / 180;
        
        const outerRadius = 130;
        const x = 150 + outerRadius * Math.cos(angleRad);
        const y = 150 + outerRadius * Math.sin(angleRad);
        
        const piLabel = DrawUI.div();
        piLabel.setClass('pi-label');
        piLabel.dom.textContent = pi;
        piLabel.dom.style.left = `${x}px`;
        piLabel.dom.style.top = `${y}px`;
        clockFace.add(piLabel);
        
        const tick = DrawUI.div();
        tick.setClass('degree-tick major');
        tick.dom.style.transform = `rotate(${deg}deg)`;
        clockFace.add(tick);
    });
    
    for (let i = 0; i < 10; i++) {
        const deg = i * 36;
        if (deg % 90 !== 0) {
            const tick = DrawUI.div();
            tick.setClass('degree-tick minor');
            tick.dom.style.transform = `rotate(${deg}deg)`;
            clockFace.add(tick);
        }
    }
    
    clockContainer.add(clockFace);
    
    const dawnMarker = DrawUI.div();
    dawnMarker.setClass('prop-sun-marker dawn');
    dawnMarker.dom.innerHTML = '✶';
    clockContainer.add(dawnMarker);
    
    const sunriseMarker = DrawUI.div();
    sunriseMarker.setClass('prop-sun-marker sunrise');
    sunriseMarker.dom.innerHTML = '☀↑';
    clockContainer.add(sunriseMarker);
    
    const solarNoonMarker = DrawUI.div();
    solarNoonMarker.setClass('prop-sun-marker noon');
    solarNoonMarker.dom.innerHTML = '☀';
    clockContainer.add(solarNoonMarker);
    
    const sunsetMarker = DrawUI.div();
    sunsetMarker.setClass('prop-sun-marker sunset');
    sunsetMarker.dom.innerHTML = '☀↓';
    clockContainer.add(sunsetMarker);
    
    const duskMarker = DrawUI.div();
    duskMarker.setClass('prop-sun-marker dusk');
    duskMarker.dom.innerHTML = '✶';
    clockContainer.add(duskMarker);
    
    const dawnLabel = DrawUI.div();
    dawnLabel.setClass('period-label start');
    dawnLabel.dom.textContent = 'FIRST LIGHT';
    clockContainer.add(dawnLabel);
    
    const middayLabel = DrawUI.div();
    middayLabel.setClass('period-label middle');
    middayLabel.dom.textContent = 'MIDDAY';
    clockContainer.add(middayLabel);
    
    const timeDisplay = DrawUI.div();
    timeDisplay.setClass('prop-time-display');
    clockContainer.add(timeDisplay);
    
    const dayHand = DrawUI.div();
    dayHand.setClass('hand proportional-hand day-hand');
    clockContainer.add(dayHand);
    
    const centerDot = DrawUI.div();
    centerDot.setClass('clock-center prop-center day-center');
    clockContainer.add(centerDot);
    
    container.add(clockContainer);
    
    function updateClock() {
        const now = new Date();
        const sunTimes = tools.astro.SolarCalculator.getSunTimes(
            now,
            services.LocationService.latitude,
            services.LocationService.longitude
        );
        
        if (sunTimes.isPolarNight) {
            timeDisplay.dom.textContent = 'POLAR NIGHT';
            dayHand.dom.style.display = 'none';
            return { status: 'polar-night' };
        }
        
        dayHand.dom.style.display = '';
        
        const dawn = sunTimes.dawn;
        const sunrise = sunTimes.sunrise;
        const sunset = sunTimes.sunset;
        const dusk = sunTimes.dusk;
        const solarNoon = sunTimes.solarNoon;
        
        const lightingPeriod = dusk - dawn;
        
        const dawnDuration = sunrise - dawn;
        const duskDuration = dusk - sunset;
        const dawnProp = dawnDuration / lightingPeriod;
        const duskProp = duskDuration / lightingPeriod;
        
        const startAngle = -90;
        const fullSpan = 360;
        const dawnEndAngle = startAngle + (dawnProp * fullSpan);
        dawnArc.setAttribute('d', describeArc(150, 150, 140, startAngle, dawnEndAngle));
        
        const duskStartAngle = startAngle + ((1 - duskProp) * fullSpan);
        const duskEndAngle = startAngle + fullSpan;
        duskArc.setAttribute('d', describeArc(150, 150, 140, duskStartAngle, duskEndAngle));
        
        const markerRadius = 160;
        
        const dawnX = 150 + markerRadius * Math.cos(startAngle * Math.PI / 180);
        const dawnY = 150 + markerRadius * Math.sin(startAngle * Math.PI / 180);
        dawnMarker.dom.style.left = `${dawnX}px`;
        dawnMarker.dom.style.top = `${dawnY}px`;
        
        const sunriseAngle = dawnEndAngle;
        sunriseMarker.dom.style.left = `${150 + markerRadius * Math.cos(sunriseAngle * Math.PI / 180)}px`;
        sunriseMarker.dom.style.top = `${150 + markerRadius * Math.sin(sunriseAngle * Math.PI / 180)}px`;
        
        const noonProp = (solarNoon - dawn) / lightingPeriod;
        const noonAngle = startAngle + (noonProp * fullSpan);
        solarNoonMarker.dom.style.left = `${150 + markerRadius * Math.cos(noonAngle * Math.PI / 180)}px`;
        solarNoonMarker.dom.style.top = `${150 + markerRadius * Math.sin(noonAngle * Math.PI / 180)}px`;
        
        const sunsetProp = (sunset - dawn) / lightingPeriod;
        const sunsetAngle = startAngle + (sunsetProp * fullSpan);
        sunsetMarker.dom.style.left = `${150 + markerRadius * Math.cos(sunsetAngle * Math.PI / 180)}px`;
        sunsetMarker.dom.style.top = `${150 + markerRadius * Math.sin(sunsetAngle * Math.PI / 180)}px`;
        
        const duskAngle = startAngle + fullSpan;
        duskMarker.dom.style.left = `${150 + markerRadius * Math.cos(duskAngle * Math.PI / 180)}px`;
        duskMarker.dom.style.top = `${150 + markerRadius * Math.sin(duskAngle * Math.PI / 180)}px`;
        
        dawnLabel.dom.style.left = '150px';
        dawnLabel.dom.style.top = '-25px';
        
        const labelRadius = 180;
        const middayX = 150 + labelRadius * Math.cos(noonAngle * Math.PI / 180);
        const middayY = 150 + labelRadius * Math.sin(noonAngle * Math.PI / 180);
        middayLabel.dom.style.left = `${middayX}px`;
        middayLabel.dom.style.top = `${middayY}px`;
        
        const currentHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
        
        let currentDegrees = 0;
        if (currentHour >= dawn && currentHour <= dusk) {
            const timeProp = (currentHour - dawn) / lightingPeriod;
            const handAngle = timeProp * fullSpan;
            dayHand.dom.style.transform = `rotate(${handAngle}deg)`;
            currentDegrees = Math.round(timeProp * 360) % 360;
            timeDisplay.dom.innerHTML = `${timeProp.toFixed(2)}π`;
        } else {
            if (currentHour < dawn) {
                dayHand.dom.style.transform = `rotate(0deg)`;
            } else {
                dayHand.dom.style.transform = `rotate(${fullSpan}deg)`;
            }
            timeDisplay.dom.innerHTML = `<span class="waiting">DARKNESS</span>`;
        }
        
        return {
            dawn,
            solarNoon,
            sunset,
            dusk,
            currentDegrees,
            lightingPeriodMinutes: (lightingPeriod * 60).toFixed(0),
        };
    }
    
    return { update: updateClock, container: clockContainer };
}

function createNightClock(container, {core, ops, services}) {
    const clockContainer = DrawUI.div();
    clockContainer.setClass('clock-container proportional-clock night-proportional-clock');
    
    const arcSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arcSvg.setAttribute('class', 'proportional-arc-svg');
    arcSvg.setAttribute('viewBox', '0 0 300 300');
    
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', '150');
    bgCircle.setAttribute('cy', '150');
    bgCircle.setAttribute('r', '140');
    bgCircle.setAttribute('fill', '#0a1628');
    bgCircle.setAttribute('class', 'night-bg');
    arcSvg.appendChild(bgCircle);
    
    const duskArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    duskArc.setAttribute('class', 'prop-dusk-arc');
    duskArc.setAttribute('fill', '#ff9060');
    arcSvg.appendChild(duskArc);
    
    clockContainer.dom.appendChild(arcSvg);
    
    const clockFace = DrawUI.div();
    clockFace.setClass('proportional-face night-face');
    
    const piMarkers = staticData.proportionalClock?.piMarkers ?? [
        { deg: 0, pi: '0' },
        { deg: 90, pi: 'π/4' },
        { deg: 180, pi: 'π/2' },
        { deg: 270, pi: '3π/4' },
    ];
    
    piMarkers.forEach(({ deg, pi }) => {
        const angle = deg - 90;
        const angleRad = angle * Math.PI / 180;
        
        const outerRadius = 130;
        const x = 150 + outerRadius * Math.cos(angleRad);
        const y = 150 + outerRadius * Math.sin(angleRad);
        
        const piLabel = DrawUI.div();
        piLabel.setClass('pi-label night');
        piLabel.dom.textContent = pi;
        piLabel.dom.style.left = `${x}px`;
        piLabel.dom.style.top = `${y}px`;
        clockFace.add(piLabel);
        
        const tick = DrawUI.div();
        tick.setClass('degree-tick major night');
        tick.dom.style.transform = `rotate(${deg}deg)`;
        clockFace.add(tick);
    });
    
    for (let i = 0; i < 10; i++) {
        const deg = i * 36;
        if (deg % 90 !== 0) {
            const tick = DrawUI.div();
            tick.setClass('degree-tick minor night');
            tick.dom.style.transform = `rotate(${deg}deg)`;
            clockFace.add(tick);
        }
    }
    
    clockContainer.add(clockFace);
    
    const duskMarker = DrawUI.div();
    duskMarker.setClass('prop-moon-marker dusk');
    duskMarker.dom.innerHTML = '★';
    clockContainer.add(duskMarker);
    
    const midnightMarker = DrawUI.div();
    midnightMarker.setClass('prop-moon-marker midnight');
    midnightMarker.dom.innerHTML = '☽';
    clockContainer.add(midnightMarker);
    
    const dawnMarker = DrawUI.div();
    dawnMarker.setClass('prop-moon-marker dawn');
    dawnMarker.dom.innerHTML = '✶';
    clockContainer.add(dawnMarker);
    
    const duskLabel = DrawUI.div();
    duskLabel.setClass('period-label start night');
    duskLabel.dom.textContent = 'DUSK';
    clockContainer.add(duskLabel);
    
    const midnightLabel = DrawUI.div();
    midnightLabel.setClass('period-label middle night');
    midnightLabel.dom.textContent = 'MIDNIGHT';
    clockContainer.add(midnightLabel);
    
    const timeDisplay = DrawUI.div();
    timeDisplay.setClass('prop-time-display night');
    clockContainer.add(timeDisplay);
    
    const nightHand = DrawUI.div();
    nightHand.setClass('hand proportional-hand night-hand');
    clockContainer.add(nightHand);
    
    const centerDot = DrawUI.div();
    centerDot.setClass('clock-center prop-center night-center');
    clockContainer.add(centerDot);
    
    container.add(clockContainer);
    
    function updateClock() {
        const now = new Date();
        const today = new Date(now);
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const sunTimesToday = tools.astro.SolarCalculator.getSunTimes(today, services.LocationService.latitude, services.LocationService.longitude);
        const sunTimesTomorrow = tools.astro.SolarCalculator.getSunTimes(tomorrow, services.LocationService.latitude, services.LocationService.longitude);
        const sunTimesYesterday = tools.astro.SolarCalculator.getSunTimes(yesterday, services.LocationService.latitude, services.LocationService.longitude);
        
        if (sunTimesToday.isPolarDay) {
            timeDisplay.dom.textContent = 'POLAR DAY';
            nightHand.dom.style.display = 'none';
            return { status: 'polar-day' };
        }
        
        nightHand.dom.style.display = '';
        
        const currentHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
        
        let nightStart, nightEnd;
        let isInNight = false;
        
        const duskToday = sunTimesToday.dusk;
        const dawnToday = sunTimesToday.dawn;
        const dawnTomorrow = sunTimesTomorrow.dawn;
        const duskYesterday = sunTimesYesterday.dusk;
        
        if (currentHour < dawnToday) {
            nightStart = duskYesterday;
            nightEnd = dawnToday;
            isInNight = true;
        } else if (currentHour >= duskToday) {
            nightStart = duskToday;
            nightEnd = dawnTomorrow;
            isInNight = true;
        } else {
            nightStart = duskToday;
            nightEnd = dawnTomorrow;
            isInNight = false;
        }
        
        let nightPeriod;
        if (nightEnd > nightStart) {
            nightPeriod = nightEnd - nightStart;
        } else {
            nightPeriod = (24 - nightStart) + nightEnd;
        }
        
        duskArc.setAttribute('d', '');
        const startAngle = -90;
        const fullSpan = 360;
        
        const solarMidnight = (() => {
            let m = nightStart + (nightPeriod / 2);
            if (m >= 24) m -= 24;
            return m;
        })();
        
        const markerRadius = 160;
        
        duskMarker.dom.style.left = `${150 + markerRadius * Math.cos(startAngle * Math.PI / 180)}px`;
        duskMarker.dom.style.top = `${150 + markerRadius * Math.sin(startAngle * Math.PI / 180)}px`;
        
        const midnightAngle = startAngle + 180;
        const midnightX = 150 + markerRadius * Math.cos(midnightAngle * Math.PI / 180);
        const midnightY = 150 + markerRadius * Math.sin(midnightAngle * Math.PI / 180);
        midnightMarker.dom.style.left = `${midnightX}px`;
        midnightMarker.dom.style.top = `${midnightY}px`;
        
        const dawnAngle = startAngle + fullSpan;
        dawnMarker.dom.style.left = `${150 + markerRadius * Math.cos(dawnAngle * Math.PI / 180)}px`;
        dawnMarker.dom.style.top = `${150 + markerRadius * Math.sin(dawnAngle * Math.PI / 180)}px`;
        
        duskLabel.dom.style.left = '150px';
        duskLabel.dom.style.top = '-25px';
        
        midnightLabel.dom.style.left = `${midnightX}px`;
        midnightLabel.dom.style.top = `${midnightY + 30}px`;
        
        let currentDegrees = 0;
        if (isInNight) {
            let timeProp;
            if (currentHour >= nightStart) {
                timeProp = (currentHour - nightStart) / nightPeriod;
            } else {
                timeProp = (24 - nightStart + currentHour) / nightPeriod;
            }
            
            timeProp = Math.max(0, Math.min(1, timeProp));
            const handAngle = timeProp * fullSpan;
            nightHand.dom.style.transform = `rotate(${handAngle}deg)`;
            currentDegrees = Math.round(timeProp * 360) % 360;
            timeDisplay.dom.innerHTML = `${timeProp.toFixed(2)}π`;
        } else {
            nightHand.dom.style.transform = `rotate(0deg)`;
            timeDisplay.dom.innerHTML = `<span class="waiting">LIGHTING</span>`;
        }
        
        return {
            dusk: nightStart,
            solarMidnight,
            dawn: nightEnd,
            currentDegrees,
            darknessPeriodMinutes: (nightPeriod * 60).toFixed(0),
        };
    }
    
    return { update: updateClock, container: clockContainer };
}

function createDayNightBar(container, {core, ops, services}) {
    const barContainer = DrawUI.div();
    barContainer.setClass('daynight-container');
    
    const barWrapper = DrawUI.div();
    barWrapper.setClass('daynight-wrapper');
    
    const timeLine = DrawUI.div();
    timeLine.setClass('daynight-timeline');
    const hourLabels = [];
    const hourTicks = [];
    
    const labelCount = staticData.dayNightBar?.timelineLabelCount ?? 9;
    
    for (let i = 0; i <= labelCount - 1; i++) {
        const tick = DrawUI.div();
        tick.setClass('daynight-tick');
        hourTicks.push(tick);
        
        const label = DrawUI.div();
        label.setClass('daynight-hour');
        hourLabels.push(label);
        timeLine.add(label);
        timeLine.add(tick);
    }
    barWrapper.add(timeLine);
    
    const bar = DrawUI.div();
    bar.setClass('daynight-bar');
    
    const dawnSegment = DrawUI.div();
    dawnSegment.setClass('daynight-segment dawn');
    bar.add(dawnSegment);
    
    const daySegment = DrawUI.div();
    daySegment.setClass('daynight-segment day');
    bar.add(daySegment);
    
    const duskSegment = DrawUI.div();
    duskSegment.setClass('daynight-segment dusk');
    bar.add(duskSegment);
    
    const nightAfter = DrawUI.div();
    nightAfter.setClass('daynight-segment night');
    bar.add(nightAfter);
    
    barWrapper.add(bar);
    
    const currentIndicator = DrawUI.div();
    currentIndicator.setClass('daynight-indicator');
    barWrapper.add(currentIndicator);
    
    const sunriseLabel = DrawUI.div();
    sunriseLabel.setClass('daynight-label sunrise');
    sunriseLabel.dom.innerHTML = '☀︎ ↑';
    barWrapper.add(sunriseLabel);
    
    const sunsetLabel = DrawUI.div();
    sunsetLabel.setClass('daynight-label sunset');
    sunsetLabel.dom.innerHTML = '☀︎ ↓';
    barWrapper.add(sunsetLabel);
    
    barContainer.add(barWrapper);
    container.add(barContainer);
    
    function formatHourMin(hours) {
        if (hours === null) return '--:--';
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    
    function hourToPct(hour, dawnHour) {
        let relative = hour - dawnHour;
        if (relative < 0) relative += 24;
        return (relative / 24) * 100;
    }
    
    function updateBar() {
        const now = new Date();
        
        const sunTimes = tools.astro.SolarCalculator.getSunTimes(
            now,
            services.LocationService.latitude,
            services.LocationService.longitude
        );
        
        if (sunTimes.isPolarDay) {
            dawnSegment.dom.style.width = '0%';
            daySegment.dom.style.left = '0%';
            daySegment.dom.style.width = '100%';
            duskSegment.dom.style.width = '0%';
            nightAfter.dom.style.width = '0%';
            sunriseLabel.dom.style.display = 'none';
            sunsetLabel.dom.style.display = 'none';
            
            const currentHour = now.getHours() + now.getMinutes() / 60;
            currentIndicator.dom.style.left = `${(currentHour / 24) * 100}%`;
            
            for (let i = 0; i <= labelCount - 1; i++) {
                const h = (i * 3) % 24;
                hourLabels[i].dom.textContent = h.toString().padStart(2, '0');
                hourLabels[i].dom.style.left = `${(i * 3 / 24) * 100}%`;
                hourTicks[i].dom.style.left = `${(i * 3 / 24) * 100}%`;
            }
            
            return { sunrise: 'Polar Day', sunset: '24h Sun', daylightHours: '24.0' };
        }
        
        if (sunTimes.isPolarNight) {
            dawnSegment.dom.style.width = '0%';
            daySegment.dom.style.width = '0%';
            duskSegment.dom.style.width = '0%';
            nightAfter.dom.style.left = '0%';
            nightAfter.dom.style.width = '100%';
            sunriseLabel.dom.style.display = 'none';
            sunsetLabel.dom.style.display = 'none';
            
            const currentHour = now.getHours() + now.getMinutes() / 60;
            currentIndicator.dom.style.left = `${(currentHour / 24) * 100}%`;
            
            for (let i = 0; i <= labelCount - 1; i++) {
                const h = (i * 3) % 24;
                hourLabels[i].dom.textContent = h.toString().padStart(2, '0');
                hourLabels[i].dom.style.left = `${(i * 3 / 24) * 100}%`;
                hourTicks[i].dom.style.left = `${(i * 3 / 24) * 100}%`;
            }
            
            return { sunrise: 'Polar Night', sunset: 'No Sun', daylightHours: '0.0' };
        }
        
        sunriseLabel.dom.style.display = '';
        sunsetLabel.dom.style.display = '';
        
        const dawnHour = sunTimes.dawn;
        
        for (let i = 0; i <= labelCount - 1; i++) {
            const baseHour = Math.floor(dawnHour / 3) * 3;
            const h = (baseHour + i * 3) % 24;
            hourLabels[i].dom.textContent = h.toString().padStart(2, '0');
            const pct = hourToPct(h, dawnHour);
            hourLabels[i].dom.style.left = `${pct}%`;
            hourTicks[i].dom.style.left = `${pct}%`;
        }
        
        const sunrisePct = hourToPct(sunTimes.sunrise, dawnHour);
        const sunsetPct = hourToPct(sunTimes.sunset, dawnHour);
        const duskPct = hourToPct(sunTimes.dusk, dawnHour);
        
        dawnSegment.dom.style.left = '0%';
        dawnSegment.dom.style.width = `${sunrisePct}%`;
        
        daySegment.dom.style.left = `${sunrisePct}%`;
        daySegment.dom.style.width = `${sunsetPct - sunrisePct}%`;
        
        duskSegment.dom.style.left = `${sunsetPct}%`;
        duskSegment.dom.style.width = `${duskPct - sunsetPct}%`;
        
        nightAfter.dom.style.left = `${duskPct}%`;
        nightAfter.dom.style.width = `${100 - duskPct}%`;
        
        sunriseLabel.dom.style.left = `${sunrisePct}%`;
        sunsetLabel.dom.style.left = `${sunsetPct}%`;
        
        const currentHour = now.getHours() + now.getMinutes() / 60;
        const currentPct = hourToPct(currentHour, dawnHour);
        currentIndicator.dom.style.left = `${currentPct}%`;
        
        const sunAltitude = tools.astro.SolarCalculator.getSunAltitude(
            now,
            services.LocationService.latitude,
            services.LocationService.longitude
        );
        
        return {
            sunrise: formatHourMin(sunTimes.sunrise),
            sunset: formatHourMin(sunTimes.sunset),
            daylightHours: sunTimes.daylightHours.toFixed(1),
            sunAltitude: sunAltitude.toFixed(1),
            solarNoon: formatHourMin(sunTimes.solarNoon),
        };
    }
    
    return { update: updateBar, container: barContainer };
}

export {
    createDayClock,
    createNightClock,
    createDayNightBar,
}