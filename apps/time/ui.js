import { DrawUI } from '../../shared/drawUI/index.js';
import * as tools from '../../shared/tools/index.js';
import { staticData } from './data.js';
import { fetchJson, forecastCurrentOnlyUrl } from '../local-environment/openMeteo.js';
import { createAppFooter } from '../../shared/components/appFooter.js';

import {
    createDayClock,
    createNightClock,
    createDayNightBar,
} from './clocks/LightDarkness.js';

import {
    createHijriCalendarClock,
} from './clocks/HijriClocks.js';

import {
    createMoonPhaseClock,
    createMoonriseClock,
} from './clocks/MoonClocks.js';

export async function start({ core, ops, services }) {

    const { root, refreshFooterWeather } = await create({ core, ops, services });

    core.signals.onLocationChanged.add(() => {
        document.querySelectorAll('.location-text').forEach((el) => {
            el.textContent = services.LocationService.locationName;
        });
        document.querySelectorAll('.location-coords').forEach((el) => {
            el.textContent = `(${services.LocationService.latitude.toFixed(
                2,
            )}°, ${services.LocationService.longitude.toFixed(2)}°)`;
        });
        refreshFooterWeather?.();
    });

    return { root, refreshFooterWeather };
}

function createAstronomicalSummary(services) {

    const summarySection = DrawUI.div();

    summarySection.setClass('astronomical-summary');
    
    const title = DrawUI.h2('Astronomical Phenomena');
    summarySection.add(title);
    
    const summaryGrid = DrawUI.div();
    summaryGrid.setClass('summary-grid');
    
    // Moon Phases Section
    const moonPhasesCard = DrawUI.div();
    moonPhasesCard.setClass('summary-card moon-phases-card');
    moonPhasesCard.dom.innerHTML = `
        <h3>🌙 Next Moon Phases</h3>
        <div class="moon-phases-list"></div>
    `;
    summaryGrid.add(moonPhasesCard);
    
    // Equinoxes & Solstices Section
    const equinoxCard = DrawUI.div();
    equinoxCard.setClass('summary-card equinox-card');
    equinoxCard.dom.innerHTML = `
        <h3>🌍 Equinoxes & Solstices</h3>
        <div class="equinox-list"></div>
    `;
    summaryGrid.add(equinoxCard);
    
    // Equal Day/Night Section
    const equal12hCard = DrawUI.div();
    equal12hCard.setClass('summary-card equal12h-card');
    equal12hCard.dom.innerHTML = `
        <h3>☯ Equal 12h/12h Days</h3>
        <div class="equal12h-list"></div>
    `;
    summaryGrid.add(equal12hCard);
    
    // Season Durations Section
    const seasonsCard = DrawUI.div();
    seasonsCard.setClass('summary-card seasons-card');
    seasonsCard.dom.innerHTML = `
        <h3>🗓️ Season Durations</h3>
        <div class="seasons-list"></div>
    `;
    summaryGrid.add(seasonsCard);
    
    summarySection.add(summaryGrid);

    function update() {
        const now = new Date();
        const year = now.getFullYear();
        const lat = services.LocationService.latitude;
        const lon = services.LocationService.longitude;
        
        // Update Moon Phases
        const nextPhases = tools.astro.getNextMoonPhases(now);
        const moonPhasesHtml = nextPhases.map(phase => {
            const moonTimes = tools.astro.getMoonTimesForDate(phase.date, lat, lon);
            const riseStr = moonTimes.moonrise ? tools.time.formatShortDate(moonTimes.moonrise).split(', ')[1] : '--:--';
            const setStr = moonTimes.moonset ? tools.time.formatShortDate(moonTimes.moonset).split(', ')[1] : '--:--';
            
            return `
                <div class="phase-item">
                    <span class="phase-symbol">${phase.symbol}</span>
                    <div class="phase-details">
                        <span class="phase-name">${phase.name}</span>
                        <span class="phase-date">${tools.time.formatShortDate(phase.date)}</span>
                        <span class="phase-times">↑${riseStr} ↓${setStr}</span>
                    </div>
                </div>
            `;
        }).join('');
        moonPhasesCard.dom.querySelector('.moon-phases-list').innerHTML = moonPhasesHtml;
        
        // Update Equinoxes & Solstices
        const events = tools.astro.getSolarEvents(year);
        const nextYearEvents = tools.astro.getSolarEvents(year + 1);
        const allEvents = [...events, ...nextYearEvents].filter(e => e.date > now).slice(0, 4);
        
        const equinoxHtml = allEvents.map(event => `
            <div class="equinox-item ${event.type}">
                <span class="event-symbol">${event.symbol}</span>
                <div class="event-details">
                    <span class="event-name">${event.name}</span>
                    <span class="event-date">${tools.time.formatShortDate(event.date)}</span>
                </div>
            </div>
        `).join('');
        equinoxCard.dom.querySelector('.equinox-list').innerHTML = equinoxHtml;
        
        // Update Equal 12h/12h
        const equal12hItems = tools.astro.getEqual12hDates(lat, year, lon);
        const equal12hHtml = equal12hItems.map(item => {
            const dateStr = typeof item.date === 'string' ? item.date : tools.time.formatShortDate(item.date);
            return `
                <div class="equal12h-item">
                    <span class="equal-symbol">◐</span>
                    <div class="equal-details">
                        <span class="equal-desc">${item.description}</span>
                        <span class="equal-date">${dateStr}</span>
                    </div>
                </div>
            `;
        }).join('');
        equal12hCard.dom.querySelector('.equal12h-list').innerHTML = equal12hHtml;
        
        // Update Season Durations
        const seasonData = tools.astro.getSeasonDurations(lat, year);
        const seasonOrder = seasonData.isNorthernHemisphere 
            ? ['winter', 'spring', 'summer', 'autumn']
            : ['summer', 'autumn', 'winter', 'spring'];
        
        const seasonsHtml = seasonOrder.map(key => {
            const season = seasonData.seasons[key];
            return `
                <div class="season-item">
                    <span class="season-symbol">${season.symbol}</span>
                    <div class="season-details">
                        <span class="season-name">${season.name}</span>
                        <span class="season-days">${season.days} days (${season.percentage}%)</span>
                    </div>
                    <div class="season-bar">
                        <div class="season-bar-fill" style="width: ${season.percentage}%"></div>
                    </div>
                </div>
            `;
        }).join('');
        seasonsCard.dom.querySelector('.seasons-list').innerHTML = seasonsHtml;
        
        return { nextPhases, allEvents, equal12hItems, seasonData };
    }
    
    // Initial update
    update();

    summarySection.update = update;

    return summarySection;
}

function createAnalogClock(container, {core, ops, services}) {
    const clockContainer = DrawUI.div();
    clockContainer.setClass('clock-container analog-clock');
    
    const clockFace = DrawUI.div();
    clockFace.setClass('clock-face');
    
    // Create Roman numeral markers
    for (let i = 0; i < 12; i++) {
        const angle = (i * 30) - 90; // Start from 12 o'clock
        const radius = 115;
        const x = 150 + radius * Math.cos(angle * Math.PI / 180);
        const y = 150 + radius * Math.sin(angle * Math.PI / 180);
        
        const numeral = DrawUI.div();
        numeral.setClass('roman-numeral');
        numeral.dom.textContent = staticData.clockFace.romanNumerals[i];
        numeral.dom.style.left = `${x}px`;
        numeral.dom.style.top = `${y}px`;
        clockFace.add(numeral);
    }
    
    // Minute markers (small ticks between hours)
    for (let i = 0; i < 60; i++) {
        const marker = DrawUI.div();
        if (i % 5 === 0) {
            // Hour position - slightly longer tick
            marker.setClass('hour-tick');
        } else {
            marker.setClass('minute-marker');
        }
        marker.dom.style.transform = `rotate(${i * 6}deg)`;
        clockFace.add(marker);
    }
    
    // Create clock hands
    const hourHand = DrawUI.div();
    hourHand.setClass('hand hour-hand');
    
    const minuteHand = DrawUI.div();
    minuteHand.setClass('hand minute-hand');
    
    const secondHand = DrawUI.div();
    secondHand.setClass('hand second-hand');
    
    const centerDot = DrawUI.div();
    centerDot.setClass('clock-center');
    
    clockFace.add(hourHand);
    clockFace.add(minuteHand);
    clockFace.add(secondHand);
    clockFace.add(centerDot);
    
    clockContainer.add(clockFace);
    container.add(clockContainer);
    
    function updateClock() {
        const now = new Date();
        const hours = now.getHours() % 12;
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        const milliseconds = now.getMilliseconds();
        
        const secondDegrees = (seconds + milliseconds / 1000) * 6;
        const minuteDegrees = (minutes + seconds / 60) * 6;
        const hourDegrees = (hours + minutes / 60) * 30;
        
        secondHand.dom.style.transform = `rotate(${secondDegrees}deg)`;
        minuteHand.dom.style.transform = `rotate(${minuteDegrees}deg)`;
        hourHand.dom.style.transform = `rotate(${hourDegrees}deg)`;
        
        return { hours: now.getHours(), minutes, seconds };
    }
    
    return { update: updateClock, container: clockContainer };
}

function createYearClock(container, {core, ops, services}) {
    const clockContainer = DrawUI.div();
    clockContainer.setClass('clock-container year-clock');
    
    const progressSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    progressSvg.setAttribute('class', 'year-progress-svg');
    progressSvg.setAttribute('viewBox', '0 0 300 300');
    
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('class', 'year-bg-circle');
    bgCircle.setAttribute('cx', '150');
    bgCircle.setAttribute('cy', '150');
    bgCircle.setAttribute('r', '140');
    progressSvg.appendChild(bgCircle);
    
    const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressCircle.setAttribute('class', 'year-progress-circle');
    progressCircle.setAttribute('cx', '150');
    progressCircle.setAttribute('cy', '150');
    progressCircle.setAttribute('r', '140');
    progressSvg.appendChild(progressCircle);
    
    clockContainer.dom.appendChild(progressSvg);
    
    // Week markers
    for (let i = 0; i < 52; i++) {
        const weekMarker = DrawUI.div();
        weekMarker.setClass('week-marker');
        weekMarker.dom.style.transform = `rotate(${i * (360 / 52)}deg)`;
        clockContainer.add(weekMarker);
    }
    
    // Week number labels
    const weekNumbers = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52];
    weekNumbers.forEach(weekNum => {
        const angle = (weekNum * (360 / 52)) - 90;
        const radius = 115;
        const x = 150 + radius * Math.cos(angle * Math.PI / 180);
        const y = 150 + radius * Math.sin(angle * Math.PI / 180);
        
        const label = DrawUI.div();
        label.setClass('week-number');
        label.dom.textContent = weekNum;
        label.dom.style.left = `${x}px`;
        label.dom.style.top = `${y}px`;
        clockContainer.add(label);
    });
    
    const yearHand = DrawUI.div();
    yearHand.setClass('hand year-hand');
    clockContainer.add(yearHand);
    
    // Percentage label at end of hand
    const percentLabel = DrawUI.div();
    percentLabel.setClass('year-percent-label');
    clockContainer.add(percentLabel);
    
    const centerDot = DrawUI.div();
    centerDot.setClass('clock-center year-center');
    clockContainer.add(centerDot);
    
    container.add(clockContainer);
    
    function updateClock() {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
        const yearProgress = (now - startOfYear) / (endOfYear - startOfYear);
        const currentWeek = Math.floor(yearProgress * 52);
        
        const circumference = 2 * Math.PI * 140;
        const offset = circumference * (1 - yearProgress);
        progressCircle.style.strokeDasharray = circumference;
        progressCircle.style.strokeDashoffset = offset;
        
        const yearDegrees = yearProgress * 360;
        yearHand.dom.style.transform = `rotate(${yearDegrees}deg)`;
        
        // Position percentage label at end of hand
        const angleRad = (yearDegrees - 90) * Math.PI / 180;
        const labelRadius = 95; // Near end of hand
        const labelX = 150 + labelRadius * Math.cos(angleRad);
        const labelY = 150 + labelRadius * Math.sin(angleRad);
        percentLabel.dom.style.left = `${labelX}px`;
        percentLabel.dom.style.top = `${labelY}px`;
        percentLabel.dom.textContent = `${(yearProgress * 100).toFixed(1)}%`;
        
        return { yearProgress, currentWeek: currentWeek + 1, year: now.getFullYear() };
    }
    
    return { update: updateClock, container: clockContainer };
}

function startOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addLocalDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
}

/** Monday-start contribution grid for calendar year Y; cells from Monday on/before Jan 1 through Sunday on/after Dec 31. */
function createYearProgressHeatmap(container, { core, ops, services }) {
    const clockContainer = DrawUI.div();
    clockContainer.setClass('clock-container year-progress-heatmap');

    const inner = DrawUI.div();
    inner.setClass('year-heatmap-inner');

    const monthsStrip = DrawUI.div();
    monthsStrip.setClass('year-heatmap-months');

    const body = DrawUI.div();
    body.setClass('year-heatmap-body');

    const dowCol = DrawUI.div();
    dowCol.setClass('year-heatmap-dow');
    const dowNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dowLabelRows = new Set([0, 2, 4]);
    for (let r = 0; r < 7; r++) {
        const lab = DrawUI.div();
        lab.setClass('year-heatmap-dow-label');
        lab.dom.textContent = dowLabelRows.has(r) ? dowNames[r] : '';
        dowCol.add(lab);
    }

    const cellsWrap = DrawUI.div();
    cellsWrap.setClass('year-heatmap-cells');

    body.add(dowCol);
    body.add(cellsWrap);
    inner.add(monthsStrip);
    inner.add(body);
    clockContainer.add(inner);
    container.add(clockContainer);

    let builtYear = null;
    let cellEls = [];

    function buildForYear(Y) {
        cellEls = [];

        const jan1 = new Date(Y, 0, 1);
        const mondayIndex = (jan1.getDay() + 6) % 7;
        const gridStart = addLocalDays(jan1, -mondayIndex);

        const dec31 = new Date(Y, 11, 31);
        const daysToSunday = 6 - ((dec31.getDay() + 6) % 7);
        const gridEnd = addLocalDays(dec31, daysToSunday);

        const totalDays =
            Math.round((gridEnd - gridStart) / 86400000) + 1;
        const weekCount = totalDays / 7;

        cellsWrap.dom.style.gridTemplateColumns = `repeat(${weekCount}, 1fr)`;

        monthsStrip.dom.replaceChildren();
        const monthFormatter = new Intl.DateTimeFormat('en', { month: 'short' });
        for (let m = 0; m < 12; m++) {
            const first = new Date(Y, m, 1);
            const dayOffset = Math.round((startOfLocalDay(first) - gridStart) / 86400000);
            if (dayOffset < 0 || dayOffset >= totalDays) continue;
            const col = Math.floor(dayOffset / 7);
            const label = document.createElement('span');
            label.className = 'year-heatmap-month-label';
            label.textContent = monthFormatter.format(first);
            label.style.left = `calc(${col} / ${weekCount} * 100%)`;
            monthsStrip.dom.appendChild(label);
        }

        cellsWrap.dom.replaceChildren();
        for (let d = 0; d < 7; d++) {
            for (let w = 0; w < weekCount; w++) {
                const cell = document.createElement('div');
                cell.className = 'year-heatmap-cell';
                const dayDate = addLocalDays(gridStart, w * 7 + d);
                const inYear =
                    dayDate.getFullYear() === Y &&
                    dayDate >= new Date(Y, 0, 1) &&
                    dayDate <= new Date(Y, 11, 31);

                if (!inYear) {
                    cell.classList.add('year-heatmap-out');
                    cellEls.push({ el: cell, inYear: false });
                } else {
                    cell.classList.add('year-heatmap-in');
                    cellEls.push({
                        el: cell,
                        inYear: true,
                        dayDate: startOfLocalDay(dayDate),
                    });
                }
                cellsWrap.dom.appendChild(cell);
            }
        }

        builtYear = Y;
    }

    function updateClock() {
        const now = services.TimeSimulator.getClockTime('clock24');
        const Y = now.getFullYear();
        if (builtYear !== Y) {
            buildForYear(Y);
        }

        const today = startOfLocalDay(now);
        const yStart = new Date(Y, 0, 1);
        const yearProgress = (now - yStart) / (new Date(Y + 1, 0, 1) - yStart);
        const currentWeek = Math.min(52, Math.floor(yearProgress * 52)) + 1;

        for (const c of cellEls) {
            if (!c.inYear) continue;
            const ds = c.dayDate;
            c.el.classList.remove('year-heatmap-passed', 'year-heatmap-future', 'year-heatmap-today');
            if (ds.getTime() === today.getTime()) {
                c.el.classList.add('year-heatmap-today');
            }
            if (ds <= today) {
                c.el.classList.add('year-heatmap-passed');
            } else {
                c.el.classList.add('year-heatmap-future');
            }
        }

        const startOfYear = new Date(Y, 0, 1);
        const dayOfYear =
            Math.floor((startOfLocalDay(now) - startOfYear) / 86400000) + 1;
        const isLeap = new Date(Y, 1, 29).getMonth() === 1;
        const daysInYear = isLeap ? 366 : 365;

        return {
            yearProgress,
            currentWeek,
            year: Y,
            dayOfYear,
            daysInYear,
        };
    }

    return { update: updateClock, container: clockContainer };
}

function createDayOfMonthClock(container, {core, ops, services}) {
    const clockContainer = DrawUI.div();
    clockContainer.setClass('clock-container day-clock');
    
    const clockFace = DrawUI.div();
    clockFace.setClass('subdial-face');
    
    // Day markers (31 days)
    for (let i = 1; i <= 31; i++) {
        const angle = ((i - 1) * (360 / 31)) - 90;
        const radius = 55;
        const x = 75 + radius * Math.cos(angle * Math.PI / 180);
        const y = 75 + radius * Math.sin(angle * Math.PI / 180);
        
        if (i % 5 === 0 || i === 1) {
            const label = DrawUI.div();
            label.setClass('day-label');
            label.dom.textContent = i;
            label.dom.style.left = `${x}px`;
            label.dom.style.top = `${y}px`;
            clockFace.add(label);
        } else {
            const marker = DrawUI.div();
            marker.setClass('day-marker');
            marker.dom.style.transform = `rotate(${(i - 1) * (360 / 31)}deg)`;
            clockFace.add(marker);
        }
    }
    
    const dayHand = DrawUI.div();
    dayHand.setClass('hand day-hand');
    clockFace.add(dayHand);
    
    const centerDot = DrawUI.div();
    centerDot.setClass('subdial-center');
    clockFace.add(centerDot);
    
    clockContainer.add(clockFace);
    container.add(clockContainer);
    
    function updateClock() {
        const now = new Date();
        const day = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        
        const degrees = ((day - 1) / 31) * 360;
        dayHand.dom.style.transform = `rotate(${degrees}deg)`;
        
        return { day, daysInMonth, month: now.toLocaleString('default', { month: 'long' }) };
    }
    
    return { update: updateClock, container: clockContainer };
}

function create24HourClock(container, {core, ops, services}) {
    const clockContainer = DrawUI.div();
    clockContainer.setClass('clock-container clock-24h');
    
    // SVG for day/night arc segments
    const arcSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arcSvg.setAttribute('class', 'daynight-arc-svg');
    arcSvg.setAttribute('viewBox', '0 0 300 300');
    
    // Gradient definitions
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    const dawnGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    dawnGradient.setAttribute('id', 'dawnGradient');
    dawnGradient.innerHTML = `
        <stop offset="0%" stop-color="#0a1628"/>
        <stop offset="50%" stop-color="#ff7f50"/>
        <stop offset="100%" stop-color="#87ceeb"/>
    `;
    defs.appendChild(dawnGradient);
    
    const duskGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    duskGradient.setAttribute('id', 'duskGradient');
    duskGradient.innerHTML = `
        <stop offset="0%" stop-color="#87ceeb"/>
        <stop offset="50%" stop-color="#ff7f50"/>
        <stop offset="100%" stop-color="#0a1628"/>
    `;
    defs.appendChild(duskGradient);
    arcSvg.appendChild(defs);
    
    // Background circle
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', '150');
    bgCircle.setAttribute('cy', '150');
    bgCircle.setAttribute('r', '140');
    bgCircle.setAttribute('fill', '#0a1628');
    arcSvg.appendChild(bgCircle);
    
    // Night arc (will be updated)
    const nightArc1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    nightArc1.setAttribute('class', 'night-arc');
    arcSvg.appendChild(nightArc1);
    
    // Dawn arc
    const dawnArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    dawnArc.setAttribute('class', 'dawn-arc');
    arcSvg.appendChild(dawnArc);
    
    // Day arc
    const dayArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    dayArc.setAttribute('class', 'day-arc');
    arcSvg.appendChild(dayArc);
    
    // Dusk arc
    const duskArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    duskArc.setAttribute('class', 'dusk-arc');
    arcSvg.appendChild(duskArc);
    
    // Night arc 2 (after sunset)
    const nightArc2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    nightArc2.setAttribute('class', 'night-arc');
    arcSvg.appendChild(nightArc2);
    
    // Yearly extent lines (winter/summer solstice boundaries) - ON TOP
    const winterSunriseLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    winterSunriseLine.setAttribute('class', 'yearly-extent winter');
    arcSvg.appendChild(winterSunriseLine);
    
    const winterSunsetLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    winterSunsetLine.setAttribute('class', 'yearly-extent winter');
    arcSvg.appendChild(winterSunsetLine);
    
    const summerSunriseLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    summerSunriseLine.setAttribute('class', 'yearly-extent summer');
    arcSvg.appendChild(summerSunriseLine);
    
    const summerSunsetLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    summerSunsetLine.setAttribute('class', 'yearly-extent summer');
    arcSvg.appendChild(summerSunsetLine);
    
    clockContainer.dom.appendChild(arcSvg);
    
    // Clock face overlay (semi-transparent)
    const clockFace = DrawUI.div();
    clockFace.setClass('clock-face-24h');
    
    // Hour markers (24 hours)
    for (let i = 0; i < 24; i++) {
        const angle = (i * 15) - 90; // 15 degrees per hour
        const radius = 125;
        const x = 150 + radius * Math.cos(angle * Math.PI / 180);
        const y = 150 + radius * Math.sin(angle * Math.PI / 180);
        
        const label = DrawUI.div();
        label.setClass('hour-24-label');
        label.dom.textContent = i.toString().padStart(2, '0');
        label.dom.style.left = `${x}px`;
        label.dom.style.top = `${y}px`;
        
        // Style differently for key hours
        if (i === 0 || i === 12) {
            label.dom.classList.add('major');
        } else if (i === 6 || i === 18) {
            label.dom.classList.add('semi-major');
        }
        
        clockFace.add(label);
    }
    
    // Tick marks for hours
    for (let i = 0; i < 48; i++) {
        const tick = DrawUI.div();
        tick.setClass(i % 2 === 0 ? 'tick-24h major' : 'tick-24h');
        tick.dom.style.transform = `rotate(${i * 7.5}deg)`;
        clockFace.add(tick);
    }
    
    // Inner minute track circle
    const minuteTrack = DrawUI.div();
    minuteTrack.setClass('minute-track-24h');
    clockFace.add(minuteTrack);
    
    // Minute markers (60 ticks inside the minute track)
    for (let i = 0; i < 60; i++) {
        const tick = DrawUI.div();
        tick.setClass(i % 5 === 0 ? 'minute-tick-24h major' : 'minute-tick-24h');
        tick.dom.style.transform = `rotate(${i * 6}deg)`;
        minuteTrack.add(tick);
    }
    
    clockContainer.add(clockFace);
    
    // Dawn marker (first light - civil twilight start)
    const dawnMarker = DrawUI.div();
    dawnMarker.setClass('sun-marker dawn');
    dawnMarker.dom.innerHTML = '✶';
    clockContainer.add(dawnMarker);
    
    const dawnTime = DrawUI.div();
    dawnTime.setClass('sun-time dawn-time');
    clockContainer.add(dawnTime);
    
    // Sunrise marker
    const sunriseMarker = DrawUI.div();
    sunriseMarker.setClass('sun-marker sunrise');
    sunriseMarker.dom.innerHTML = '☀';
    clockContainer.add(sunriseMarker);
    
    const sunriseTime = DrawUI.div();
    sunriseTime.setClass('sun-time sunrise-time');
    clockContainer.add(sunriseTime);
    
    // Solar noon marker
    const noonMarker = DrawUI.div();
    noonMarker.setClass('sun-marker noon');
    noonMarker.dom.innerHTML = '☀';
    clockContainer.add(noonMarker);
    
    // Sunset marker
    const sunsetMarker = DrawUI.div();
    sunsetMarker.setClass('sun-marker sunset');
    sunsetMarker.dom.innerHTML = '☀';
    clockContainer.add(sunsetMarker);
    
    const sunsetTime = DrawUI.div();
    sunsetTime.setClass('sun-time sunset-time');
    clockContainer.add(sunsetTime);
    
    // Dusk marker (last light - civil twilight end)
    const duskMarker = DrawUI.div();
    duskMarker.setClass('sun-marker dusk');
    duskMarker.dom.innerHTML = '✶';
    clockContainer.add(duskMarker);
    
    const duskTime = DrawUI.div();
    duskTime.setClass('sun-time dusk-time');
    clockContainer.add(duskTime);
    
    // Moonrise marker
    const moonriseMarker = DrawUI.div();
    moonriseMarker.setClass('sun-marker moonrise');
    moonriseMarker.dom.innerHTML = '☽↑';
    moonriseMarker.dom.title = 'Moonrise';
    clockContainer.add(moonriseMarker);
    
    const moonriseTime = DrawUI.div();
    moonriseTime.setClass('sun-time moonrise-time');
    clockContainer.add(moonriseTime);
    
    // Moonset marker
    const moonsetMarker = DrawUI.div();
    moonsetMarker.setClass('sun-marker moonset');
    moonsetMarker.dom.innerHTML = '☽↓';
    moonsetMarker.dom.title = 'Moonset';
    clockContainer.add(moonsetMarker);
    
    const moonsetTime = DrawUI.div();
    moonsetTime.setClass('sun-time moonset-time');
    clockContainer.add(moonsetTime);
    
    // Summer/Winter extent labels
    const summerLabel = DrawUI.div();
    summerLabel.setClass('season-extent-label summer');
    summerLabel.dom.textContent = 'SUMMER';
    clockContainer.add(summerLabel);
    
    const winterLabel = DrawUI.div();
    winterLabel.setClass('season-extent-label winter');
    winterLabel.dom.textContent = 'WINTER';
    clockContainer.add(winterLabel);
    
    // Hour hand (24-hour)
    const hourHand = DrawUI.div();
    hourHand.setClass('hand hour-hand-24');
    clockContainer.add(hourHand);
    
    // Minute hand
    const minuteHand = DrawUI.div();
    minuteHand.setClass('hand minute-hand-24');
    clockContainer.add(minuteHand);
    
    // Center dot
    const centerDot = DrawUI.div();
    centerDot.setClass('clock-center clock-center-24');
    clockContainer.add(centerDot);
    
    container.add(clockContainer);
    
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
    
    function hourToAngle(hour) {
        return (hour * 15) - 90; // 0h at top, clockwise
    }
    
    // Calculate and draw yearly extent boundaries (solstices)
    function drawYearlyExtents() {
        const year = new Date().getFullYear();
        const lat = services.LocationService.latitude;
        const lon = services.LocationService.longitude;
        const cx = 150, cy = 150, r = 140;
        
        // Winter solstice (Dec 21) - shortest day
        const winterSolstice = new Date(year, 11, 21);
        const winterTimes = tools.astro.SolarCalculator.getSunTimes(winterSolstice, lat, lon);
        
        // Summer solstice (Jun 21) - longest day  
        const summerSolstice = new Date(year, 5, 21);
        const summerTimes = tools.astro.SolarCalculator.getSunTimes(summerSolstice, lat, lon);
        
        if (!winterTimes.isPolarNight && !winterTimes.isPolarDay) {
            const winterSunriseAngle = hourToAngle(winterTimes.sunrise) * Math.PI / 180;
            winterSunriseLine.setAttribute('x1', cx.toString());
            winterSunriseLine.setAttribute('y1', cy.toString());
            winterSunriseLine.setAttribute('x2', (cx + r * Math.cos(winterSunriseAngle)).toString());
            winterSunriseLine.setAttribute('y2', (cy + r * Math.sin(winterSunriseAngle)).toString());
            winterSunriseLine.setAttribute('stroke', '#6af');
            winterSunriseLine.setAttribute('stroke-width', '2');
            winterSunriseLine.setAttribute('stroke-dasharray', '4,3');
            
            const winterSunsetAngle = hourToAngle(winterTimes.sunset) * Math.PI / 180;
            winterSunsetLine.setAttribute('x1', cx.toString());
            winterSunsetLine.setAttribute('y1', cy.toString());
            winterSunsetLine.setAttribute('x2', (cx + r * Math.cos(winterSunsetAngle)).toString());
            winterSunsetLine.setAttribute('y2', (cy + r * Math.sin(winterSunsetAngle)).toString());
            winterSunsetLine.setAttribute('stroke', '#6af');
            winterSunsetLine.setAttribute('stroke-width', '2');
            winterSunsetLine.setAttribute('stroke-dasharray', '4,3');
            
            const winterMidAngleRad = (hourToAngle(winterTimes.sunrise) + hourToAngle(winterTimes.sunset)) / 2 * Math.PI / 180;
            const winterLabelRadius = 60;
            const winterLabelX = 150 + winterLabelRadius * Math.cos(winterMidAngleRad);
            const winterLabelY = 150 + winterLabelRadius * Math.sin(winterMidAngleRad);
            winterLabel.dom.style.left = `${winterLabelX}px`;
            winterLabel.dom.style.top = `${winterLabelY}px`;
        }
        
        if (!summerTimes.isPolarNight && !summerTimes.isPolarDay) {
            const summerSunriseAngle = hourToAngle(summerTimes.sunrise) * Math.PI / 180;
            summerSunriseLine.setAttribute('x1', cx.toString());
            summerSunriseLine.setAttribute('y1', cy.toString());
            summerSunriseLine.setAttribute('x2', (cx + r * Math.cos(summerSunriseAngle)).toString());
            summerSunriseLine.setAttribute('y2', (cy + r * Math.sin(summerSunriseAngle)).toString());
            summerSunriseLine.setAttribute('stroke', '#fa0');
            summerSunriseLine.setAttribute('stroke-width', '2');
            summerSunriseLine.setAttribute('stroke-dasharray', '4,3');
            
            const summerSunsetAngle = hourToAngle(summerTimes.sunset) * Math.PI / 180;
            summerSunsetLine.setAttribute('x1', cx.toString());
            summerSunsetLine.setAttribute('y1', cy.toString());
            summerSunsetLine.setAttribute('x2', (cx + r * Math.cos(summerSunsetAngle)).toString());
            summerSunsetLine.setAttribute('y2', (cy + r * Math.sin(summerSunsetAngle)).toString());
            summerSunsetLine.setAttribute('stroke', '#fa0');
            summerSunsetLine.setAttribute('stroke-width', '2');
            summerSunsetLine.setAttribute('stroke-dasharray', '4,3');
            
            const summerMidAngleRad = (hourToAngle(summerTimes.sunrise) + hourToAngle(summerTimes.sunset)) / 2 * Math.PI / 180;
            const summerLabelRadius = 60;
            const summerLabelX = 150 + summerLabelRadius * Math.cos(summerMidAngleRad);
            const summerLabelY = 150 + summerLabelRadius * Math.sin(summerMidAngleRad);
            summerLabel.dom.style.left = `${summerLabelX}px`;
            summerLabel.dom.style.top = `${summerLabelY}px`;
        }
        
        return { winterTimes, summerTimes };
    }
    
    // Draw extents once on init
    let yearlyExtents = null;
    setTimeout(() => {
        yearlyExtents = drawYearlyExtents();
    }, 100);
    
    // Helper to format decimal hours to HH:MM
    function formatHourMin(h) {
        if (h === null || h === undefined) return '--:--';
        const hr = Math.floor(h);
        const min = Math.round((h - hr) * 60);
        return `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    }
    
    function updateClock(simulatedDate) {
        const now = simulatedDate || services.TimeSimulator.getClockTime('clock24');
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        void seconds;
        
        // Get sun times
        const sunTimes = tools.astro.SolarCalculator.getSunTimes(
            now,
            services.LocationService.latitude,
            services.LocationService.longitude
        );
        
        // Update arcs if we have valid sun times
        if (!sunTimes.isPolarDay && !sunTimes.isPolarNight) {
            const dawn = sunTimes.dawn;
            const sunrise = sunTimes.sunrise;
            const sunset = sunTimes.sunset;
            const dusk = sunTimes.dusk;
            
            // Night (midnight to dawn)
            nightArc1.setAttribute('d', describeArc(150, 150, 140, hourToAngle(0), hourToAngle(dawn)));
            nightArc1.setAttribute('fill', '#0a1628');
            
            // Dawn (twilight)
            dawnArc.setAttribute('d', describeArc(150, 150, 140, hourToAngle(dawn), hourToAngle(sunrise)));
            dawnArc.setAttribute('fill', '#ff7f50');
            
            // Day
            dayArc.setAttribute('d', describeArc(150, 150, 140, hourToAngle(sunrise), hourToAngle(sunset)));
            dayArc.setAttribute('fill', '#87ceeb');
            
            // Dusk
            duskArc.setAttribute('d', describeArc(150, 150, 140, hourToAngle(sunset), hourToAngle(dusk)));
            duskArc.setAttribute('fill', '#ff7f50');
            
            // Night (dusk to midnight)
            nightArc2.setAttribute('d', describeArc(150, 150, 140, hourToAngle(dusk), hourToAngle(24)));
            nightArc2.setAttribute('fill', '#0a1628');
            
            // Position dawn marker (first light)
            const dawnAngle = hourToAngle(dawn);
            const dawnX = 150 + 160 * Math.cos(dawnAngle * Math.PI / 180);
            const dawnY = 150 + 160 * Math.sin(dawnAngle * Math.PI / 180);
            dawnMarker.dom.style.left = `${dawnX}px`;
            dawnMarker.dom.style.top = `${dawnY}px`;
            dawnMarker.dom.style.display = '';
            
            // Dawn time label
            const dawnTimeX = 150 + 180 * Math.cos(dawnAngle * Math.PI / 180);
            const dawnTimeY = 150 + 180 * Math.sin(dawnAngle * Math.PI / 180);
            dawnTime.dom.style.left = `${dawnTimeX}px`;
            dawnTime.dom.style.top = `${dawnTimeY}px`;
            dawnTime.dom.textContent = formatHourMin(dawn);
            dawnTime.dom.style.display = '';
            
            // Position sunrise marker
            const sunriseAngle = hourToAngle(sunrise);
            const sunriseX = 150 + 160 * Math.cos(sunriseAngle * Math.PI / 180);
            const sunriseY = 150 + 160 * Math.sin(sunriseAngle * Math.PI / 180);
            sunriseMarker.dom.style.left = `${sunriseX}px`;
            sunriseMarker.dom.style.top = `${sunriseY}px`;
            sunriseMarker.dom.style.display = '';
            
            // Sunrise time label
            const sunriseTimeX = 150 + 180 * Math.cos(sunriseAngle * Math.PI / 180);
            const sunriseTimeY = 150 + 180 * Math.sin(sunriseAngle * Math.PI / 180);
            sunriseTime.dom.style.left = `${sunriseTimeX}px`;
            sunriseTime.dom.style.top = `${sunriseTimeY}px`;
            sunriseTime.dom.textContent = formatHourMin(sunrise);
            sunriseTime.dom.style.display = '';
            
            // Solar noon marker
            const noonAngle = hourToAngle(sunTimes.solarNoon);
            const noonX = 150 + 160 * Math.cos(noonAngle * Math.PI / 180);
            const noonY = 150 + 160 * Math.sin(noonAngle * Math.PI / 180);
            noonMarker.dom.style.left = `${noonX}px`;
            noonMarker.dom.style.top = `${noonY}px`;
            
            // Position sunset marker
            const sunsetAngle = hourToAngle(sunset);
            const sunsetX = 150 + 160 * Math.cos(sunsetAngle * Math.PI / 180);
            const sunsetY = 150 + 160 * Math.sin(sunsetAngle * Math.PI / 180);
            sunsetMarker.dom.style.left = `${sunsetX}px`;
            sunsetMarker.dom.style.top = `${sunsetY}px`;
            sunsetMarker.dom.style.display = '';
            
            // Sunset time label
            const sunsetTimeX = 150 + 180 * Math.cos(sunsetAngle * Math.PI / 180);
            const sunsetTimeY = 150 + 180 * Math.sin(sunsetAngle * Math.PI / 180);
            sunsetTime.dom.style.left = `${sunsetTimeX}px`;
            sunsetTime.dom.style.top = `${sunsetTimeY}px`;
            sunsetTime.dom.textContent = formatHourMin(sunset);
            sunsetTime.dom.style.display = '';
            
            // Position dusk marker (last light)
            const duskAngle = hourToAngle(dusk);
            const duskX = 150 + 160 * Math.cos(duskAngle * Math.PI / 180);
            const duskY = 150 + 160 * Math.sin(duskAngle * Math.PI / 180);
            duskMarker.dom.style.left = `${duskX}px`;
            duskMarker.dom.style.top = `${duskY}px`;
            duskMarker.dom.style.display = '';
            
            // Dusk time label
            const duskTimeX = 150 + 180 * Math.cos(duskAngle * Math.PI / 180);
            const duskTimeY = 150 + 180 * Math.sin(duskAngle * Math.PI / 180);
            duskTime.dom.style.left = `${duskTimeX}px`;
            duskTime.dom.style.top = `${duskTimeY}px`;
            duskTime.dom.textContent = formatHourMin(dusk);
            duskTime.dom.style.display = '';
            
            // Get moonrise/moonset times
            const moonTimes = tools.astro.LunarCalculator.getMoonTimes(
                now,
                services.LocationService.latitude,
                services.LocationService.longitude
            );
            
            // Position moonrise marker
            if (moonTimes.moonrise !== null) {
                const moonriseAngle = hourToAngle(moonTimes.moonrise);
                const moonriseX = 150 + 160 * Math.cos(moonriseAngle * Math.PI / 180);
                const moonriseY = 150 + 160 * Math.sin(moonriseAngle * Math.PI / 180);
                moonriseMarker.dom.style.left = `${moonriseX}px`;
                moonriseMarker.dom.style.top = `${moonriseY}px`;
                moonriseMarker.dom.style.display = '';
                
                const moonriseTimeX = 150 + 180 * Math.cos(moonriseAngle * Math.PI / 180);
                const moonriseTimeY = 150 + 180 * Math.sin(moonriseAngle * Math.PI / 180);
                moonriseTime.dom.style.left = `${moonriseTimeX}px`;
                moonriseTime.dom.style.top = `${moonriseTimeY}px`;
                moonriseTime.dom.textContent = formatHourMin(moonTimes.moonrise);
                moonriseTime.dom.style.display = '';
            } else {
                moonriseMarker.dom.style.display = 'none';
                moonriseTime.dom.style.display = 'none';
            }
            
            // Position moonset marker
            if (moonTimes.moonset !== null) {
                const moonsetAngle = hourToAngle(moonTimes.moonset);
                const moonsetX = 150 + 160 * Math.cos(moonsetAngle * Math.PI / 180);
                const moonsetY = 150 + 160 * Math.sin(moonsetAngle * Math.PI / 180);
                moonsetMarker.dom.style.left = `${moonsetX}px`;
                moonsetMarker.dom.style.top = `${moonsetY}px`;
                moonsetMarker.dom.style.display = '';
                
                const moonsetTimeX = 150 + 180 * Math.cos(moonsetAngle * Math.PI / 180);
                const moonsetTimeY = 150 + 180 * Math.sin(moonsetAngle * Math.PI / 180);
                moonsetTime.dom.style.left = `${moonsetTimeX}px`;
                moonsetTime.dom.style.top = `${moonsetTimeY}px`;
                moonsetTime.dom.textContent = formatHourMin(moonTimes.moonset);
                moonsetTime.dom.style.display = '';
            } else {
                moonsetMarker.dom.style.display = 'none';
                moonsetTime.dom.style.display = 'none';
            }
        } else {
            const fillColor = sunTimes.isPolarDay ? '#87ceeb' : '#0a1628';
            dayArc.setAttribute('d', describeArc(150, 150, 140, 0, 359.9));
            dayArc.setAttribute('fill', fillColor);
            nightArc1.setAttribute('d', '');
            nightArc2.setAttribute('d', '');
            dawnArc.setAttribute('d', '');
            duskArc.setAttribute('d', '');
            dawnMarker.dom.style.display = 'none';
            dawnTime.dom.style.display = 'none';
            sunriseMarker.dom.style.display = 'none';
            sunriseTime.dom.style.display = 'none';
            sunsetMarker.dom.style.display = 'none';
            sunsetTime.dom.style.display = 'none';
            duskMarker.dom.style.display = 'none';
            duskTime.dom.style.display = 'none';
            moonriseMarker.dom.style.display = 'none';
            moonriseTime.dom.style.display = 'none';
            moonsetMarker.dom.style.display = 'none';
            moonsetTime.dom.style.display = 'none';
        }
        
        // Get moon times for return data (always computed, even in polar regions)
        const moonTimesData = tools.astro.LunarCalculator.getMoonTimes(
            now,
            services.LocationService.latitude,
            services.LocationService.longitude
        );
        
        // Update hands (24-hour)
        const hourDegrees = ((hours + minutes / 60) / 24) * 360;
        const minuteDegrees = (minutes) * 6;
        
        hourHand.dom.style.transform = `rotate(${hourDegrees}deg)`;
        minuteHand.dom.style.transform = `rotate(${minuteDegrees}deg)`;
        
        return { 
            hours, 
            minutes, 
            dawn: sunTimes.dawn,
            sunrise: sunTimes.sunrise,
            sunset: sunTimes.sunset,
            dusk: sunTimes.dusk,
            daylightHours: sunTimes.daylightHours,
            moonrise: moonTimesData.moonrise,
            moonset: moonTimesData.moonset,
            yearlyExtents,
            simulatedDate: now
        };
    }
    
    return { update: updateClock, container: clockContainer };
}

function createSecondsClock(container, {core, ops, services}) {
    const clockContainer = DrawUI.div();
    clockContainer.setClass('clock-container seconds-clock');
    
    const clockFace = DrawUI.div();
    clockFace.setClass('subdial-face');
    
    // Second markers
    for (let i = 0; i < 60; i += 5) {
        const angle = (i * 6) - 90;
        const radius = 55;
        const x = 75 + radius * Math.cos(angle * Math.PI / 180);
        const y = 75 + radius * Math.sin(angle * Math.PI / 180);
        
        const label = DrawUI.div();
        label.setClass('seconds-label');
        label.dom.textContent = i === 0 ? '60' : i;
        label.dom.style.left = `${x}px`;
        label.dom.style.top = `${y}px`;
        clockFace.add(label);
    }
    
    const secondsHand = DrawUI.div();
    secondsHand.setClass('hand subdial-second-hand');
    clockFace.add(secondsHand);
    
    const centerDot = DrawUI.div();
    centerDot.setClass('subdial-center gold');
    clockFace.add(centerDot);
    
    clockContainer.add(clockFace);
    container.add(clockContainer);
    
    function updateClock() {
        const now = new Date();
        const seconds = now.getSeconds();
        const milliseconds = now.getMilliseconds();
        
        const degrees = (seconds + milliseconds / 1000) * 6;
        secondsHand.dom.style.transform = `rotate(${degrees}deg)`;
        
        return { seconds };
    }
    
    return { update: updateClock, container: clockContainer };
}

/** Astronomical season boundaries (day-of-year), aligned with `staticData.solarSeasons` / equinox dataset */
const SEASON_SPRING_START = 79;
const SEASON_SUMMER_START = 172;
const SEASON_AUTUMN_START = 265;
const SEASON_WINTER_START = 355;

function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

function getDaysInYearForDate(date) {
    const isLeapYear = date.getFullYear() % 4 === 0;
    return isLeapYear ? 366 : 365;
}

function getCurrentSeason(dayOfYear) {
    if (dayOfYear < SEASON_SPRING_START || dayOfYear >= SEASON_WINTER_START) return 'Winter';
    if (dayOfYear < SEASON_SUMMER_START) return 'Spring';
    if (dayOfYear < SEASON_AUTUMN_START) return 'Summer';
    return 'Autumn';
}

/** Days elapsed since spring equinox (0 = first day of spring), wrapping over the civil year */
function daysFromSpringEquinox(dayOfYear, daysInYear) {
    return (dayOfYear - SEASON_SPRING_START + daysInYear) % daysInYear;
}

function springLinearPercent(dayOfYear, daysInYear) {
    return (daysFromSpringEquinox(dayOfYear, daysInYear) / daysInYear) * 100;
}

/** Linear timeline: Spring → Summer → Autumn → Winter (fractions of `daysInYear`) */
function getSeasonSegmentFractions(daysInYear) {
    const springDays = SEASON_SUMMER_START - SEASON_SPRING_START;
    const summerDays = SEASON_AUTUMN_START - SEASON_SUMMER_START;
    const autumnDays = SEASON_WINTER_START - SEASON_AUTUMN_START;
    const winterDays = daysInYear - springDays - summerDays - autumnDays;
    return {
        spring: springDays / daysInYear,
        summer: summerDays / daysInYear,
        autumn: autumnDays / daysInYear,
        winter: winterDays / daysInYear,
    };
}

function dayOfYearToSpringLinearLeftPct(eventDoy, daysInYear) {
    return springLinearPercent(eventDoy, daysInYear);
}

function createSeasonsTimeline(container, { core, ops, services }) {
    const barContainer = DrawUI.div();
    barContainer.setClass('seasons-timeline-container');

    const barWrapper = DrawUI.div();
    barWrapper.setClass('seasons-timeline-wrapper');

    const labelStrip = DrawUI.div();
    labelStrip.setClass('seasons-timeline-labels');
    const seasonLabelTexts = ['Spring', 'Summer', 'Autumn', 'Winter'];
    const labelEls = seasonLabelTexts.map((text) => {
        const el = DrawUI.div();
        el.setClass('seasons-timeline-season-label');
        el.dom.textContent = text;
        labelStrip.add(el);
        return el;
    });

    const bar = DrawUI.div();
    bar.setClass('seasons-timeline-bar');

    const springSeg = DrawUI.div();
    springSeg.setClass('seasons-timeline-segment spring');
    const summerSeg = DrawUI.div();
    summerSeg.setClass('seasons-timeline-segment summer');
    const autumnSeg = DrawUI.div();
    autumnSeg.setClass('seasons-timeline-segment autumn');
    const winterSeg = DrawUI.div();
    winterSeg.setClass('seasons-timeline-segment winter');
    bar.add(springSeg, summerSeg, autumnSeg, winterSeg);

    const eventsLayer = DrawUI.div();
    eventsLayer.setClass('seasons-timeline-events');
    const solarEvents = staticData.solarEvents ?? [];
    const eventMarkers = solarEvents.map((event) => {
        const tick = DrawUI.div();
        tick.setClass(`seasons-timeline-event-tick ${event.type}`);
        tick.dom.title = `${event.name} — ${event.date}`;
        eventsLayer.add(tick);
        return { tick, event };
    });

    const indicator = DrawUI.div();
    indicator.setClass('seasons-timeline-indicator');

    barWrapper.add(labelStrip, bar, eventsLayer, indicator);
    barContainer.add(barWrapper);
    container.add(barContainer);

    function layoutSegments(daysInYear) {
        const f = getSeasonSegmentFractions(daysInYear);
        let left = 0;
        const segments = [
            { el: springSeg, w: f.spring },
            { el: summerSeg, w: f.summer },
            { el: autumnSeg, w: f.autumn },
            { el: winterSeg, w: f.winter },
        ];
        segments.forEach(({ el, w }) => {
            el.dom.style.left = `${left * 100}%`;
            el.dom.style.width = `${w * 100}%`;
            left += w;
        });

        let labelLeft = 0;
        labelEls.forEach((labelEl, i) => {
            const w = segments[i].w;
            const center = labelLeft + w / 2;
            labelEl.dom.style.left = `${center * 100}%`;
            labelLeft += w;
        });

        eventMarkers.forEach(({ tick, event }) => {
            const pct = dayOfYearToSpringLinearLeftPct(event.dayOfYear, daysInYear);
            tick.dom.style.left = `${pct}%`;
        });
    }

    function updateTimeline() {
        const now = new Date();
        const dayOfYear = getDayOfYear(now);
        const daysInYear = getDaysInYearForDate(now);
        const season = getCurrentSeason(dayOfYear);

        layoutSegments(daysInYear);

        const pct = springLinearPercent(dayOfYear, daysInYear);
        indicator.dom.style.left = `${pct}%`;

        return { dayOfYear, season, daysInYear };
    }

    return { update: updateTimeline, container: barContainer };
}

function createSolarSeasonsClock(container, {core, ops, services}) {
    const clockContainer = DrawUI.div();
    clockContainer.setClass('clock-container solar-clock');
    
    const clockFace = DrawUI.div();
    clockFace.setClass('solar-face');
    
    // Solar events dataset comes from `data.js` (via core state)
    const solarEvents = staticData.solarEvents ?? [];
    
    // Background seasonal arcs
    const seasonsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    seasonsSvg.setAttribute('class', 'seasons-svg');
    seasonsSvg.setAttribute('viewBox', '0 0 300 300');
    
    // Draw seasonal segments (dataset from `data.js`)
    const seasons = staticData.solarSeasons?.seasons ?? [];
    
    seasons.forEach(season => {
        const startAngle = (season.startDay / 365) * 360 - 90;
        const endAngle = (season.endDay / 365) * 360 - 90;
        const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        const startRad = startAngle * Math.PI / 180;
        const endRad = endAngle * Math.PI / 180;
        const radius = 135;
        const innerRadius = 100;
        
        const x1 = 150 + radius * Math.cos(startRad);
        const y1 = 150 + radius * Math.sin(startRad);
        const x2 = 150 + radius * Math.cos(endRad);
        const y2 = 150 + radius * Math.sin(endRad);
        const x3 = 150 + innerRadius * Math.cos(endRad);
        const y3 = 150 + innerRadius * Math.sin(endRad);
        const x4 = 150 + innerRadius * Math.cos(startRad);
        const y4 = 150 + innerRadius * Math.sin(startRad);
        
        const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
        
        arc.setAttribute('d', `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`);
        arc.setAttribute('fill', season.color);
        arc.setAttribute('opacity', '0.3');
        seasonsSvg.appendChild(arc);
    });
    
    clockFace.dom.appendChild(seasonsSvg);
    
    // Add month markers (dataset from `data.js`)
    const months = staticData.solarSeasons?.months ?? [];
    const monthDays = staticData.solarSeasons?.monthDays ?? [];
    
    months.forEach((month, i) => {
        const dayOfYear = monthDays[i] + 15; // Middle of month
        const angle = (dayOfYear / 365) * 360 - 90;
        const radius = 145;
        const x = 150 + radius * Math.cos(angle * Math.PI / 180);
        const y = 150 + radius * Math.sin(angle * Math.PI / 180);
        
        const label = DrawUI.div();
        label.setClass('month-label');
        label.dom.textContent = month;
        label.dom.style.left = `${x}px`;
        label.dom.style.top = `${y}px`;
        clockFace.add(label);
    });
    
    // Add solar event markers (equinoxes and solstices) with lines and external icons
    solarEvents.forEach(event => {
        const angle = (event.dayOfYear / 365) * 360 - 90;
        const angleRad = angle * Math.PI / 180;
        
        // Line from center to perimeter
        const line = DrawUI.div();
        line.setClass(`solar-line ${event.type}`);
        line.dom.style.transform = `rotate(${(event.dayOfYear / 365) * 360}deg)`;
        clockFace.add(line);
        
        // External icon/marker
        const iconRadius = 175;
        const x = 150 + iconRadius * Math.cos(angleRad);
        const y = 150 + iconRadius * Math.sin(angleRad);
        
        const icon = DrawUI.div();
        icon.setClass(`solar-icon ${event.type}`);
        icon.dom.innerHTML = event.type === 'solstice' ? 
            (event.dayOfYear > 180 ? '❄' : '☀') : '◎';
        icon.dom.style.left = `${x}px`;
        icon.dom.style.top = `${y}px`;
        icon.dom.title = `${event.name} - ${event.date}\n${event.description}`;
        clockFace.add(icon);
        
        // Date label near icon
        const labelRadius = 195;
        const lx = 150 + labelRadius * Math.cos(angleRad);
        const ly = 150 + labelRadius * Math.sin(angleRad);
        
        const dateLabel = DrawUI.div();
        dateLabel.setClass('solar-date-label');
        dateLabel.dom.textContent = event.date;
        dateLabel.dom.style.left = `${lx}px`;
        dateLabel.dom.style.top = `${ly}px`;
        clockFace.add(dateLabel);
    });
    
    // Season name labels inside (dataset from `data.js`)
    const seasonLabels = staticData.solarSeasons?.seasonLabels ?? [];
    
    seasonLabels.forEach(season => {
        const angle = (season.dayOfYear / 365) * 360 - 90;
        const radius = 70;
        const x = 150 + radius * Math.cos(angle * Math.PI / 180);
        const y = 150 + radius * Math.sin(angle * Math.PI / 180);
        
        const label = DrawUI.div();
        label.setClass('season-name-label');
        label.dom.textContent = season.name;
        label.dom.style.left = `${x}px`;
        label.dom.style.top = `${y}px`;
        label.dom.style.color = season.color;
        clockFace.add(label);
    });
    
    // Hand showing current position in year
    const solarHand = DrawUI.div();
    solarHand.setClass('hand solar-hand');
    clockFace.add(solarHand);
    
    const centerDot = DrawUI.div();
    centerDot.setClass('clock-center solar-center');
    clockFace.add(centerDot);
    
    clockContainer.add(clockFace);
    container.add(clockContainer);
    
    function updateClock() {
        const now = new Date();
        const dayOfYear = getDayOfYear(now);
        const daysInYear = getDaysInYearForDate(now);
        
        const degrees = (dayOfYear / daysInYear) * 360;
        solarHand.dom.style.transform = `rotate(${degrees}deg)`;
        
        const season = getCurrentSeason(dayOfYear);
        
        return { dayOfYear, season, daysInYear };
    }
    
    return { update: updateClock, container: clockContainer };
}

export async function create({core, ops, services}) {
    await services.LocationService.requestLocation();

    const appShell = DrawUI.div();
    appShell.setClass('app-shell');

    const sideNav = DrawUI.div();
    sideNav.setClass('app-side-nav');
    sideNav.dom.setAttribute('role', 'navigation');
    sideNav.dom.setAttribute('aria-label', 'App sections');

    const mainPanel = DrawUI.panel();
    mainPanel.setId('main-panel');
    mainPanel.addClass('app-main-panel');

    const scrollInner = DrawUI.div();
    scrollInner.setClass('app-panel-scroll');

    const locationInfo = DrawUI.div();
    locationInfo.setClass('location-info');
    locationInfo.dom.innerHTML = `
        <span class="location-icon">📍</span>
        <span class="location-text">${services.LocationService.locationName}</span>
        <span class="location-coords">(${services.LocationService.latitude.toFixed(2)}°, ${services.LocationService.longitude.toFixed(2)}°)</span>
    `;

    const astronomicalSummary = createAstronomicalSummary(services);
    
    const timeSliderPanel = DrawUI.div();
    timeSliderPanel.setClass('time-slider-panel');
    
    const sliderPanelTitle = DrawUI.h2('Time Navigation');
    timeSliderPanel.add(sliderPanelTitle);
    
    const slidersContainer = DrawUI.div();
    slidersContainer.setClass('sliders-container');
    
    const sliderConfigs = staticData.timeSlider?.configs ?? [
        { id: 'moonPhase', label: 'Moon Phase', clockKey: 'moonPhase' },
        { id: 'moonrise', label: 'Moonrise/Set', clockKey: 'moonrise' },
        { id: 'clock24', label: '24-Hour / Hijri', clockKey: 'clock24' }
    ];
    
    const sliderRefs = {};
    const maxOffset = services.TimeSimulator.getMaxOffset();
    
    sliderConfigs.forEach(config => {
        const sliderControl = DrawUI.div();
        sliderControl.setClass('slider-control');
        
        const label = DrawUI.div();
        label.setClass('slider-label');
        label.dom.textContent = config.label;
        sliderControl.add(label);
        
        const dateDisplay = DrawUI.div();
        dateDisplay.setClass('slider-date-display');
        dateDisplay.dom.textContent = services.TimeSimulator.formatDate(new Date());
        sliderControl.add(dateDisplay);
        
        const offsetDisplay = DrawUI.div();
        offsetDisplay.setClass('slider-offset-display');
        offsetDisplay.dom.textContent = 'NOW';
        sliderControl.add(offsetDisplay);
        
        const sliderWrapper = DrawUI.div();
        sliderWrapper.setClass('slider-wrapper');
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'time-slider';
        slider.min = -maxOffset;
        slider.max = maxOffset;
        slider.value = 0;
        slider.step = 1;
        sliderWrapper.dom.appendChild(slider);
        
        const resetBtn = document.createElement('button');
        resetBtn.className = 'slider-reset-btn';
        resetBtn.textContent = '⟲';
        resetBtn.title = 'Reset to NOW';
        sliderWrapper.dom.appendChild(resetBtn);
        
        sliderControl.add(sliderWrapper);
        slidersContainer.add(sliderControl);
        
        sliderRefs[config.id] = { slider, dateDisplay, offsetDisplay, resetBtn, clockKey: config.clockKey };
        
        slider.addEventListener('input', () => {
            const hours = parseInt(slider.value, 10);
            services.TimeSimulator.setClockOffset(config.clockKey, hours);
            const simDate = services.TimeSimulator.getClockTime(config.clockKey);
            dateDisplay.dom.textContent = services.TimeSimulator.formatDate(simDate);
            offsetDisplay.dom.textContent = services.TimeSimulator.formatOffset(hours);
        });
        
        resetBtn.addEventListener('click', () => {
            slider.value = 0;
            services.TimeSimulator.resetClock(config.clockKey);
            const realNow = new Date();
            dateDisplay.dom.textContent = services.TimeSimulator.formatDate(realNow);
            offsetDisplay.dom.textContent = 'NOW';
        });
    });
    
    timeSliderPanel.add(slidersContainer);

    const dayNightSection = DrawUI.div();
    dayNightSection.setClass('daynight-section');
    const dayNightTitle = DrawUI.h2('Day / Night');
    dayNightSection.add(dayNightTitle);


    const dayNightBar = createDayNightBar(dayNightSection, {core, ops, services});

    const dayNightInfo = DrawUI.text('Sunrise 06:00 | Sunset 18:00 | 12.0h daylight');
    dayNightInfo.setClass('digital-time');
    dayNightSection.add(dayNightInfo);

    // === Clock gallery (5 per row) ===
    const clocksGrid = DrawUI.div();
    clocksGrid.setClass('clocks-grid');

    const moonClocksGrid = DrawUI.div();
    moonClocksGrid.setClass('clocks-grid moon-clocks-grid');

    const yearMonthGrid = DrawUI.div();
    yearMonthGrid.setClass('clocks-grid year-month-grid');

    // In-place click-to-zoom (no popup): toggles a "zoomed" class on the card.
    let zoomedCard = null;

    function closeZoom() {
        if (!zoomedCard) return;
        zoomedCard.dom.classList.remove('zoomed');
        zoomedCard = null;
    }

    function openZoom(card) {
        if (zoomedCard === card) return closeZoom();

        closeZoom();
        zoomedCard = card;
        zoomedCard.dom.classList.add('zoomed');
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeZoom();
    });

    function createClockCard(clockInfo) {
        const card = DrawUI.div();
        card.setClass('clock-cell clock-gallery-item');

        card.dom.tabIndex = 0;
        card.dom.setAttribute('role', 'button');
        card.dom.setAttribute('aria-label', clockInfo.title);

        const cardTitle = DrawUI.h2(clockInfo.title);
        card.add(cardTitle);

        const slot = DrawUI.div();
        slot.setClass('clock-slot');
        card.add(slot);

        const clock = clockInfo.createClock(slot, {core, ops, services});

        const infoText = DrawUI.badge('')
        infoText.addClass('digital-time').addClass('clock-info').addClass('small');
        card.add(infoText);

        card.dom.addEventListener('click', () => openZoom(card));
        card.dom.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openZoom(card);
            }
        });

        if (clockInfo.mount && clockInfo.grid) clockInfo.grid.add(card);

        return { card, clock, infoText };
    }

    const CLOCKS = {
        LIGHT: {
            title: 'Lighting Time (pi)',
            createClock: createDayClock,
            mount: false,
        },
        DARKNESS: {
            title: 'Darkness Time (pi)',
            createClock: createNightClock,
            mount: false,
        },
        ANALOG: {
            title: 'Time (12h)',
            createClock: createAnalogClock,
            mount: false,
        },
        MOON_PHASE: {
            title: 'Moon Phase',
            createClock: createMoonPhaseClock,
            mount: true,
            grid: moonClocksGrid,
        },
        MOONRISE: {
            title: 'Moonrise / Set',
            createClock: createMoonriseClock,
            mount: true,
            grid: moonClocksGrid,
        },
        YEAR: {
            title: 'Year Progress',
            createClock: createYearClock,
            mount: true,
            grid: yearMonthGrid,
        },
        YEAR_HEATMAP: {
            title: 'Year at a glance',
            createClock: createYearProgressHeatmap,
            mount: true,
            grid: yearMonthGrid,
        },
        DAY_OF_MONTH: {
            title: 'Day of Month',
            createClock: createDayOfMonthClock,
            mount: true,
            grid: yearMonthGrid,
        },
        CLOCK24: {
            title: '24-Hour',
            createClock: create24HourClock,
            mount: true,
            grid: clocksGrid,
        },
        HIJRI: {
            title: 'Hijri Calendar',
            createClock: createHijriCalendarClock,
            mount: true,
            grid: clocksGrid,
        },
        SECONDS: {
            title: 'Seconds',
            createClock: createSecondsClock,
            mount: true,
            grid: clocksGrid,
        },
        SOLAR_SEASONS: {
            title: 'Solar Seasons',
            createClock: createSolarSeasonsClock,
            mount: false,
        },
    }

    // Put Lighting / Darkness first (so they appear first in the grid).
    const day = createClockCard(CLOCKS.LIGHT);
    const dayCard = day.card;
    const dayClock = day.clock;
    const dayInfo = day.infoText;
    
    const night = createClockCard(CLOCKS.DARKNESS);
    const nightCard = night.card;
    const nightClock = night.clock;
    const nightInfo = night.infoText;

    const analog = createClockCard(CLOCKS.ANALOG);
    const analogCard = analog.card;
    const analogClock = analog.clock;
    const analogInfo = analog.infoText;

    const moonPhaseCard = createClockCard(CLOCKS.MOON_PHASE);
    const moonPhaseClock = moonPhaseCard.clock;
    const moonPhaseInfo = moonPhaseCard.infoText;

    const moonriseCard = createClockCard(CLOCKS.MOONRISE);
    const moonriseClock = moonriseCard.clock;
    const moonriseInfo = moonriseCard.infoText;

    const yearCard = createClockCard(CLOCKS.YEAR);
    const yearClock = yearCard.clock;
    const yearInfo = yearCard.infoText;

    const yearHeatmapCard = createClockCard(CLOCKS.YEAR_HEATMAP);
    const yearHeatmapClock = yearHeatmapCard.clock;
    const yearHeatmapInfo = yearHeatmapCard.infoText;

    const dayOfMonthCard = createClockCard(CLOCKS.DAY_OF_MONTH);
    const dayOfMonthClock = dayOfMonthCard.clock;
    const dayOfMonthInfo = dayOfMonthCard.infoText;

    const clock24Card = createClockCard(CLOCKS.CLOCK24);
    const clock24 = clock24Card.clock;
    const clock24Info = clock24Card.infoText;

    const hijriCard = createClockCard(CLOCKS.HIJRI);
    const hijriClock = hijriCard.clock;
    const hijriInfo = hijriCard.infoText;

    const secondsCard = createClockCard(CLOCKS.SECONDS);
    const secondsClock = secondsCard.clock;
    const secondsInfo = secondsCard.infoText;

    const solarSeasonsCard = createClockCard(CLOCKS.SOLAR_SEASONS);
    const solarSeasonsClock = solarSeasonsCard.clock;
    const solarSeasonsInfo = solarSeasonsCard.infoText;

    const seasonsSection = DrawUI.div();
    seasonsSection.setClass('seasons-section');
    const seasonsTitle = DrawUI.h2('Seasons');
    seasonsSection.add(seasonsTitle);
    const seasonsSectionInner = DrawUI.div();
    seasonsSectionInner.setClass('seasons-section-inner');
    seasonsSectionInner.add(solarSeasonsCard.card);
    const seasonsTimeline = createSeasonsTimeline(seasonsSectionInner, { core, ops, services });
    seasonsSection.add(seasonsSectionInner);

    const dayNight = DrawUI.row()
        .gap('clamp(6px, 1.5vw, 16px)')
        .addClass('justify-between')
        .addClass('hero-clocks-row')
        .setStyles({
            width: '100%',
        });
    dayNight.add(dayCard, analogCard, nightCard);

    const sectionNow = DrawUI.div();
    sectionNow.setClass('app-section is-active');
    sectionNow.setId('section-now');
    sectionNow.add(locationInfo, dayNightSection, dayNight);

    const sectionMoon = DrawUI.div();
    sectionMoon.setClass('app-section');
    sectionMoon.setId('section-moon');
    sectionMoon.add(moonClocksGrid);

    const sectionSeasons = DrawUI.div();
    sectionSeasons.setClass('app-section');
    sectionSeasons.setId('section-seasons');
    sectionSeasons.add(seasonsSection);

    const sectionYearMonth = DrawUI.div();
    sectionYearMonth.setClass('app-section');
    sectionYearMonth.setId('section-year-month');
    const yearMonthHeading = DrawUI.h2('Year & month');
    sectionYearMonth.add(yearMonthHeading, yearMonthGrid);

    const sectionClocks = DrawUI.div();
    sectionClocks.setClass('app-section');
    sectionClocks.setId('section-clocks');
    sectionClocks.add(clocksGrid);

    const sectionPhenomena = DrawUI.div();
    sectionPhenomena.setClass('app-section');
    sectionPhenomena.setId('section-phenomena');
    sectionPhenomena.add(astronomicalSummary);

    const sectionSim = DrawUI.div();
    sectionSim.setClass('app-section');
    sectionSim.setId('section-sim');
    sectionSim.add(timeSliderPanel);

    scrollInner.add(sectionNow, sectionMoon, sectionSeasons, sectionYearMonth, sectionClocks, sectionPhenomena, sectionSim);
    mainPanel.add(scrollInner);

    const sectionOrder = ['section-now', 'section-moon', 'section-seasons', 'section-year-month', 'section-clocks', 'section-phenomena', 'section-sim'];
    const sectionEls = {
        'section-now': sectionNow,
        'section-moon': sectionMoon,
        'section-seasons': sectionSeasons,
        'section-year-month': sectionYearMonth,
        'section-clocks': sectionClocks,
        'section-phenomena': sectionPhenomena,
        'section-sim': sectionSim,
    };

    const navSpec = [
        { id: 'section-now', label: 'Now', icon: '⌚' },
        { id: 'section-moon', label: 'Moon', icon: '☽' },
        { id: 'section-seasons', label: 'Seasons', icon: '◎' },
        { id: 'section-year-month', label: 'Year & month', icon: '◴' },
        { id: 'section-clocks', label: 'Clocks', icon: '◷' },
        { id: 'section-phenomena', label: 'Phenomena', icon: '✦' },
        { id: 'section-sim', label: 'Time travel', icon: '⟲' },
    ];

    const navButtons = [];

    const appLinks = [
        { href: '../../', label: 'Launcher', icon: '⌂' },
        { href: '../food/', label: 'Food', icon: '☰' },
        { href: '../local-environment/', label: 'Local', icon: '☁' },
    ];

    appLinks.forEach((linkSpec) => {
        const link = document.createElement('a');
        link.className = 'app-nav-btn';
        link.href = linkSpec.href;
        link.setAttribute('aria-label', linkSpec.label);
        link.innerHTML = `<span class="app-nav-icon" aria-hidden="true">${linkSpec.icon}</span><span class="app-nav-label">${linkSpec.label}</span>`;
        sideNav.dom.appendChild(link);
    });

    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.margin = '4px 8px';
    divider.style.background = 'rgba(255,255,255,0.12)';
    sideNav.dom.appendChild(divider);

    function activateSection(sectionId) {
        sectionOrder.forEach((id) => {
            const el = sectionEls[id];
            if (id === sectionId) el.addClass('is-active');
            else el.removeClass('is-active');
        });
        navButtons.forEach((btn) => {
            const on = btn.dataset.section === sectionId;
            btn.setAttribute('aria-pressed', String(on));
            if (on) btn.setAttribute('aria-current', 'true');
            else btn.removeAttribute('aria-current');
        });
        scrollInner.dom.scrollTop = 0;
    }

    navSpec.forEach((spec) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'app-nav-btn';
        btn.dataset.section = spec.id;
        btn.setAttribute('aria-label', spec.label);
        btn.innerHTML = `<span class="app-nav-icon" aria-hidden="true">${spec.icon}</span><span class="app-nav-label">${spec.label}</span>`;
        const initial = spec.id === 'section-now';
        btn.setAttribute('aria-pressed', String(initial));
        if (initial) btn.setAttribute('aria-current', 'true');
        btn.addEventListener('click', () => activateSection(spec.id));
        sideNav.dom.appendChild(btn);
        navButtons.push(btn);
    });

    const mainRow = DrawUI.div();
    mainRow.setClass('app-main-row');
    mainRow.add(sideNav, mainPanel);

    const footer = createAppFooter({ showPhase: true });
    footer.setLocation(
        services.LocationService.locationName,
        services.LocationService.latitude,
        services.LocationService.longitude,
    );

    let lastFooterWeatherFetch = 0;
    const footerWeatherIntervalMs = 10 * 60 * 1000;

    async function refreshFooterWeather() {
        try {
            const lat = services.LocationService.latitude;
            const lon = services.LocationService.longitude;
            const url = forecastCurrentOnlyUrl(lat, lon, 'auto');
            const j = await fetchJson(url);
            if (j?.error || !j?.current) return;
            const u = j.current_units ?? {};
            const t = j.current.temperature_2m;
            const w = j.current.wind_speed_10m;
            footer.setTemp(
                t != null && Number.isFinite(t)
                    ? `${t}${u.temperature_2m || '°C'}`
                    : '—',
            );
            footer.setWind(
                w != null && Number.isFinite(w)
                    ? `${w}${u.wind_speed_10m || ' km/h'}`
                    : '—',
            );
        } catch {
            /* keep previous values */
        }
    }

    appShell.dom.appendChild(mainRow.dom);
    appShell.dom.appendChild(footer.el);

    refreshFooterWeather();
    lastFooterWeatherFetch = Date.now();

    // === Main loop ===
    function tick() {
        // Update summary panel first
        if (astronomicalSummary?.update) astronomicalSummary.update();
        
        function pad2(n) {
            return String(n).padStart(2, '0');
        }

        function formatTime(h, m, s) {
            if (h === null || h === undefined) return '--:--:--';
            return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
        }

        function formatHour(h) {
            if (h === null || h === undefined) return '--:--';
            const hr = Math.floor(h);
            const min = Math.round((h - hr) * 60);
            return `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        }

        function getDaySuffix(day) {
            if (day >= 11 && day <= 13) return 'th';
            switch (day % 10) {
                case 1: return 'st';
                case 2: return 'nd';
                case 3: return 'rd';
                default: return 'th';
            }
        }

        // Update clocks + info
        const analogData = analogClock.update();
        analogInfo.dom.textContent = formatTime(
            analogData.hours,
            analogData.minutes,
            analogData.seconds
        );

        const moonData = moonPhaseClock.update();
        moonPhaseInfo.dom.textContent = `Day ${moonData.moonAge} - ${moonData.phaseName}`;

        const moonriseData = moonriseClock.update();
        moonriseInfo.dom.textContent = `↑${moonriseData.riseStr} ↓${moonriseData.setStr}`;

        const yearData = yearClock.update();
        yearInfo.dom.textContent = `Week ${yearData.currentWeek} of ${yearData.year}`;

        const yearHeatmapData = yearHeatmapClock.update();
        yearHeatmapInfo.dom.textContent = `Day ${yearHeatmapData.dayOfYear} of ${yearHeatmapData.daysInYear} · ${yearHeatmapData.year}`;

        const dayData = dayOfMonthClock.update();
        dayOfMonthInfo.dom.textContent = `${dayData.month} ${dayData.day}${getDaySuffix(dayData.day)}`;

        const clock24Data = clock24.update();
        clock24Info.dom.textContent = `✶ ${formatHour(clock24Data.dawn)} | ☀ ${formatHour(clock24Data.sunrise)} → ${formatHour(clock24Data.sunset)} | ✶ ${formatHour(clock24Data.dusk)} | ☽↑ ${formatHour(clock24Data.moonrise)} ☽↓ ${formatHour(clock24Data.moonset)}`;

        const hijriData = hijriClock.update();
        if (hijriData?.hijriDate) {
            hijriInfo.dom.textContent = `${hijriData.hijriDate.day} ${hijriData.hijriDate.monthNameShort} ${hijriData.hijriDate.year} AH`;
        } else {
            hijriInfo.dom.textContent = '';
        }

        const secondsData = secondsClock.update();
        secondsInfo.dom.textContent = `Seconds: ${pad2(secondsData.seconds)}`;

        const solarData = solarSeasonsClock.update();
        solarSeasonsInfo.dom.textContent = `Day ${solarData.dayOfYear} - ${solarData.season}`;
        seasonsTimeline.update();

        const dayClockData = dayClock.update();
        if (dayClockData?.lightingPeriodMinutes !== undefined) {
            const totalMins = Number(dayClockData.lightingPeriodMinutes);
            const dHours = Math.floor(totalMins / 60);
            const dMins = totalMins % 60;
            const deg = String(dayClockData.currentDegrees ?? 0).padStart(3, ' ');
            dayInfo.dom.textContent = `${deg}° | Total light: ${dHours}h ${dMins}min`;
        }

        const nightClockData = nightClock.update();
        if (nightClockData?.darknessPeriodMinutes !== undefined) {
            const totalMins = Number(nightClockData.darknessPeriodMinutes);
            const nHours = Math.floor(totalMins / 60);
            const nMins = totalMins % 60;
            const deg = String(nightClockData.currentDegrees ?? 0).padStart(3, ' ');
            nightInfo.dom.textContent = `${deg}° | Total dark: ${nHours}h ${nMins}min`;
        }
        
        // Update day/night bar info
        const dayNight = dayNightBar.update();
        if (dayNight) {
            const sunrise = dayNight.sunrise ?? '--:--';
            const sunset = dayNight.sunset ?? '--:--';
            const dh = dayNight.daylightHours ?? '--';
            dayNightInfo.dom.textContent = `Sunrise ${sunrise} | Sunset ${sunset} | ${dh}h daylight`;
        }

        const wallNow = new Date();
        footer.setTime(
            `${pad2(wallNow.getHours())}:${pad2(wallNow.getMinutes())}:${pad2(wallNow.getSeconds())}`,
        );

        const lat = services.LocationService.latitude;
        const lon = services.LocationService.longitude;
        const dn = tools.astro.getDayNightProgress(lat, lon, wallNow);
        if (dn.phase === 'polar-day' || dn.phase === 'polar-night') {
            footer.setPhase({
                title: dn.phase === 'polar-day' ? 'Polar day' : 'Polar night',
                phase: 'polar',
            });
        } else {
            footer.setPhase({
                title: dn.phase === 'day' ? 'Daylight' : 'Night',
                pct: dn.pct,
                phase: dn.phase,
            });
        }

        const tMs = Date.now();
        if (tMs - lastFooterWeatherFetch >= footerWeatherIntervalMs) {
            lastFooterWeatherFetch = tMs;
            refreshFooterWeather();
        }

        requestAnimationFrame(tick);
    }
    
    tick();
    return { root: appShell, refreshFooterWeather };
}