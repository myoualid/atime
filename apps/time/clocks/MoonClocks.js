import { DrawUI } from '../../../shared/drawUI/index.js';
import * as tools from '../../../shared/tools/index.js';
import { staticData } from '../data.js';


function createMoonPhaseClock(container, {core, ops, services}) {
    const clockContainer = DrawUI.div();
    clockContainer.setClass('clock-container moon-clock');
    
    // Create moon disc container (central moon visualization)
    const moonDisc = DrawUI.div();
    moonDisc.setClass('moon-disc');
    
    const moonSphere = DrawUI.div();
    moonSphere.setClass('moon-sphere');
    
    const moonShadow = DrawUI.div();
    moonShadow.setClass('moon-shadow');
    moonSphere.add(moonShadow);
    
    moonDisc.add(moonSphere);
    clockContainer.add(moonDisc);
    
    // Synodic month = exact lunar cycle (owned by data.js)
    const synodicMonth = staticData.moonPhaseClock.synodicMonthDays
    
    // Phase definitions with exact boundaries
    const moonPhases = staticData.moonPhaseClock.phaseBoundaries

    // Create evenly spaced tick marks - 29 marks for ~29.5 day cycle
    for (let i = 0; i < 29; i++) {
        const angleDeg = (i / 29) * 360;
        const marker = DrawUI.div();
        // Major ticks at quarters (0, 7, 14, 22 roughly)
        const isMajor = (i === 0 || i === 7 || i === 15 || i === 22);
        marker.setClass(`moon-marker${isMajor ? ' major' : ''}`);
        marker.dom.style.transform = `rotate(${angleDeg}deg)`;
        clockContainer.add(marker);
    }
    
    // Add phase names around the perimeter
    const phaseLabels = staticData.moonPhaseClock.phaseLabels ?? [
        { name: 'NEW', angle: 0 },
        { name: '1ST QTR', angle: 90 },
        { name: 'FULL', angle: 180 },
        { name: 'LAST QTR', angle: 270 }
    ];
    
    phaseLabels.forEach(({ name, angle }) => {
        const angleRad = (angle - 90) * Math.PI / 180;
        const labelRadius = 175;
        const x = 150 + labelRadius * Math.cos(angleRad);
        const y = 150 + labelRadius * Math.sin(angleRad);
        
        const label = DrawUI.div();
        label.setClass('moon-phase-label');
        label.dom.textContent = name;
        label.dom.style.left = `${x}px`;
        label.dom.style.top = `${y}px`;
        clockContainer.add(label);
    });
    
    // Add 4 quarter phase icons
    const quarterPhases = (staticData.moonPhaseClock.quarterPhases ?? [
        { phase: 'new', symbol: '●', day: 0 },
        { phase: 'first', symbol: '◐', dayFraction: 0.25 },
        { phase: 'full', symbol: '○', dayFraction: 0.5 },
        { phase: 'last', symbol: '◑', dayFraction: 0.75 },
    ]).map((p) => ({
        day: p.day ?? ((p.dayFraction ?? 0) * synodicMonth),
        name: p.phase,
        symbol: p.symbol,
    }));
    
    quarterPhases.forEach(({ day, name, symbol }) => {
        const angleDeg = (day / synodicMonth) * 360;
        const angleRad = (angleDeg - 90) * Math.PI / 180;
        
        const outsideRadius = 205;
        const x = 150 + outsideRadius * Math.cos(angleRad);
        const y = 150 + outsideRadius * Math.sin(angleRad);
        
        const phaseIcon = DrawUI.div();
        phaseIcon.setClass(`moon-phase-icon phase-${name}`);
        phaseIcon.dom.textContent = symbol;
        phaseIcon.dom.style.left = `${x}px`;
        phaseIcon.dom.style.top = `${y}px`;
        clockContainer.add(phaseIcon);
        
        // Quarter line
        const quarterLine = DrawUI.div();
        quarterLine.setClass('quarter-line');
        quarterLine.dom.style.transform = `rotate(${angleDeg}deg)`;
        clockContainer.add(quarterLine);
    });
    
    // Add "29½" label
    const label29 = DrawUI.div();
    label29.setClass('moon-29-label');
    label29.dom.innerHTML = '29&frac12;';
    clockContainer.add(label29);
    
    // Time remaining display (below center)
    const timeRemaining = DrawUI.div();
    timeRemaining.setClass('moon-time-remaining');
    clockContainer.add(timeRemaining);
    
    // Main moon hand
    const moonHand = DrawUI.div();
    moonHand.setClass('hand moon-hand');
    clockContainer.add(moonHand);
    
    const centerDot = DrawUI.div();
    centerDot.setClass('clock-center moon-center');
    clockContainer.add(centerDot);
    
    container.add(clockContainer);
    

    
    function getCurrentPhase(age) {
        for (const phase of moonPhases) {
            if (age >= phase.start && age < phase.end) {
                return phase;
            }
        }
        return moonPhases[0]; // Default to New Moon
    }
    
    function getNextPhase(currentPhase) {
        const idx = moonPhases.indexOf(currentPhase);
        return moonPhases[(idx + 1) % moonPhases.length];
    }
    
    function getTimeUntilNextPhase(age, currentPhase) {
        let daysUntil = currentPhase.end - age;
        if (daysUntil < 0) {
            daysUntil = (synodicMonth - age) + moonPhases[0].end;
        }
        
        const days = Math.floor(daysUntil);
        const hours = Math.floor((daysUntil - days) * 24);
        const minutes = Math.floor(((daysUntil - days) * 24 - hours) * 60);
        
        return { days, hours, minutes };
    }
    
    function updateClock(simulatedDate) {
        const now = simulatedDate || services.TimeSimulator.getClockTime('moonPhase');
        const moonAge = tools.astro.getMoonAge(now);
        const currentPhase = getCurrentPhase(moonAge);
        const nextPhase = getNextPhase(currentPhase);
        const timeUntil = getTimeUntilNextPhase(moonAge, currentPhase);
        
        // Update hand position
        const degrees = (moonAge / synodicMonth) * 360;
        moonHand.dom.style.transform = `rotate(${degrees}deg)`;
        
        // Update moon shadow
        const illumination = moonAge / synodicMonth;
        let shadowPosition;
        
        if (illumination <= 0.5) {
            shadowPosition = -(illumination * 200);
        } else {
            shadowPosition = (1 - illumination) * 200;
        }
        
        moonShadow.dom.style.transform = `translateX(${shadowPosition}%)`;
        
        // Update time remaining display - show time to next phase
        let timeStr = '';
        if (timeUntil.days > 0) {
            timeStr += `${timeUntil.days}d `;
        }
        timeStr += `${timeUntil.hours}h ${timeUntil.minutes}m`;
        timeRemaining.dom.innerHTML = `→ ${nextPhase.shortName}<br><span class="time-value">${timeStr}</span>`;
        
        return { 
            moonAge: moonAge.toFixed(1), 
            phaseName: currentPhase.name,
            nextPhase: nextPhase.name,
            timeUntilNext: timeUntil,
            simulatedDate: now
        };
    }
    
    return { update: updateClock, container: clockContainer };
}

function createMoonriseClock(container  , {core, ops, services}) {
    const clockContainer = DrawUI.div();
    clockContainer.setClass('clock-container moon-clock moonrise-clock');
    
    // Create moon disc container (central moon visualization - same as phase clock)
    const moonDisc = DrawUI.div();
    moonDisc.setClass('moon-disc');
    
    const moonSphere = DrawUI.div();
    moonSphere.setClass('moon-sphere');
    
    const moonShadow = DrawUI.div();
    moonShadow.setClass('moon-shadow');
    moonSphere.add(moonShadow);
    
    moonDisc.add(moonSphere);
    clockContainer.add(moonDisc);
    
    // Synodic month for moon phase calculations (owned by data.js)
    const synodicMonth = staticData.moonPhaseClock.synodicMonthDays ?? 29.53059;
    
    // Create evenly spaced tick marks - 24 marks for hours
    for (let i = 0; i < 24; i++) {
        const angleDeg = (i / 24) * 360;
        const marker = DrawUI.div();
        // Major ticks at 0, 6, 12, 18 hours
        const isMajor = (i % 6 === 0);
        marker.setClass(`moon-marker${isMajor ? ' major' : ''}`);
        marker.dom.style.transform = `rotate(${angleDeg}deg)`;
        clockContainer.add(marker);
    }
    
    // Add hour labels around perimeter (24-hour format)
    const hourLabels = staticData.moonriseClock?.hourLabels ?? [
        { label: '00', angle: 0 },
        { label: '06', angle: 90 },
        { label: '12', angle: 180 },
        { label: '18', angle: 270 }
    ];
    
    hourLabels.forEach(({ label, angle }) => {
        const angleRad = (angle - 90) * Math.PI / 180;
        const labelRadius = 175;
        const x = 150 + labelRadius * Math.cos(angleRad);
        const y = 150 + labelRadius * Math.sin(angleRad);
        
        const hourLabel = DrawUI.div();
        hourLabel.setClass('moonrise-hour-label');
        hourLabel.dom.textContent = label;
        hourLabel.dom.style.left = `${x}px`;
        hourLabel.dom.style.top = `${y}px`;
        clockContainer.add(hourLabel);
    });
    
    // Add intermediate hour labels (3, 9, 15, 21)
    const minorHourLabels = staticData.moonriseClock?.minorHourLabels ?? [
        { label: '03', angle: 45 },
        { label: '09', angle: 135 },
        { label: '15', angle: 225 },
        { label: '21', angle: 315 }
    ];
    
    minorHourLabels.forEach(({ label, angle }) => {
        const angleRad = (angle - 90) * Math.PI / 180;
        const labelRadius = 175;
        const x = 150 + labelRadius * Math.cos(angleRad);
        const y = 150 + labelRadius * Math.sin(angleRad);
        
        const hourLabel = DrawUI.div();
        hourLabel.setClass('moonrise-hour-label minor');
        hourLabel.dom.textContent = label;
        hourLabel.dom.style.left = `${x}px`;
        hourLabel.dom.style.top = `${y}px`;
        clockContainer.add(hourLabel);
    });
    
    // Moonrise marker (arrow pointing up)
    const riseMarker = DrawUI.div();
    riseMarker.setClass('moonrise-marker rise');
    riseMarker.dom.innerHTML = '☽↑';
    clockContainer.add(riseMarker);
    
    // Moonset marker (arrow pointing down)
    const setMarker = DrawUI.div();
    setMarker.setClass('moonrise-marker set');
    setMarker.dom.innerHTML = '☽↓';
    clockContainer.add(setMarker);
    
    // Current time hand
    const timeHand = DrawUI.div();
    timeHand.setClass('hand moon-hand');
    clockContainer.add(timeHand);
    
    // Time display in center (below)
    const timeDisplay = DrawUI.div();
    timeDisplay.setClass('moon-time-remaining');
    clockContainer.add(timeDisplay);
    
    const centerDot = DrawUI.div();
    centerDot.setClass('clock-center moon-center');
    clockContainer.add(centerDot);
    
    container.add(clockContainer);
    

    
    function to24HourTime(hours, minutes) {
        const h = Math.floor(hours);
        const m = Math.floor(minutes);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    
    function formatTimeRemaining(totalHours) {
        const hours = Math.floor(totalHours);
        const minutes = Math.floor((totalHours - hours) * 60);
        
        if (hours >= 24) {
            const days = Math.floor(hours / 24);
            const remainHours = hours % 24;
            return `${days}d ${remainHours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
    
    function updateClock(simulatedDate) {
        const now = simulatedDate || services.TimeSimulator.getClockTime('moonrise');
        const moonAge = tools.astro.getMoonAge(now);
        
        // Update moon shadow to show current phase
        const illumination = moonAge / synodicMonth;
        let shadowPosition;
        
        if (illumination <= 0.5) {
            shadowPosition = -(illumination * 200);
        } else {
            shadowPosition = (1 - illumination) * 200;
        }
        
        moonShadow.dom.style.transform = `translateX(${shadowPosition}%)`;
        
        // Calculate moonrise/moonset
        const moonTimes = tools.astro.LunarCalculator.getMoonTimes(
            now,
            services.LocationService.latitude,
            services.LocationService.longitude
        );
        
        // Current time position on 24-hour dial
        const currentHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
        const currentDegrees = (currentHour / 24) * 360;
        timeHand.dom.style.transform = `rotate(${currentDegrees}deg)`;
        
        // Position moonrise marker
        const markerRadius = 160;
        if (moonTimes.moonrise !== null) {
            const riseAngle = (moonTimes.moonrise / 24) * 360 - 90;
            const riseX = 150 + markerRadius * Math.cos(riseAngle * Math.PI / 180);
            const riseY = 150 + markerRadius * Math.sin(riseAngle * Math.PI / 180);
            riseMarker.dom.style.left = `${riseX}px`;
            riseMarker.dom.style.top = `${riseY}px`;
            riseMarker.dom.style.display = '';
        } else {
            riseMarker.dom.style.display = 'none';
        }
        
        // Position moonset marker
        if (moonTimes.moonset !== null) {
            const setAngle = (moonTimes.moonset / 24) * 360 - 90;
            const setX = 150 + markerRadius * Math.cos(setAngle * Math.PI / 180);
            const setY = 150 + markerRadius * Math.sin(setAngle * Math.PI / 180);
            setMarker.dom.style.left = `${setX}px`;
            setMarker.dom.style.top = `${setY}px`;
            setMarker.dom.style.display = '';
        } else {
            setMarker.dom.style.display = 'none';
        }
        
        // Get next moonrise and calculate time until
        const nextRise = tools.astro.LunarCalculator.getNextMoonrise(
            now,
            services.LocationService.latitude,
            services.LocationService.longitude
        );
        
        let timeUntilRise = null;
        let timeRemainingStr = '';
        
        if (nextRise.time !== null) {
            if (nextRise.isToday) {
                timeUntilRise = nextRise.time - currentHour;
            } else {
                timeUntilRise = (24 - currentHour) + nextRise.time;
                if (nextRise.date.getDate() !== now.getDate() + 1) {
                    timeUntilRise += 24;
                }
            }
            
            timeRemainingStr = formatTimeRemaining(timeUntilRise);
        } else {
            timeRemainingStr = moonTimes.isAlwaysUp ? 'MOON UP' : 'NO RISE';
        }
        
        // Format times in 24-hour format
        let riseStr = '--:--';
        let setStr = '--:--';
        
        if (moonTimes.moonrise !== null) {
            const rH = Math.floor(moonTimes.moonrise);
            const rM = Math.floor((moonTimes.moonrise - rH) * 60);
            riseStr = to24HourTime(rH, rM);
        }
        
        if (moonTimes.moonset !== null) {
            const sH = Math.floor(moonTimes.moonset);
            const sM = Math.floor((moonTimes.moonset - sH) * 60);
            setStr = to24HourTime(sH, sM);
        }
        
        // Update display
        timeDisplay.dom.innerHTML = `↑${riseStr} ↓${setStr}<br><span class="time-value">Next ↑ ${timeRemainingStr}</span>`;
        
        return {
            moonrise: moonTimes.moonrise,
            moonset: moonTimes.moonset,
            riseStr: riseStr,
            setStr: setStr,
            timeUntilRise: timeUntilRise,
            simulatedDate: now
        };
    }
    
    return { update: updateClock, container: clockContainer };
}

export {
    createMoonPhaseClock,
    createMoonriseClock,
}