import { DrawUI } from '../../../shared/drawUI/index.js';
import * as tools from '../../../shared/tools/index.js';
import { staticData } from '../data.js';



export function createHijriCalendarClock(container, {core, ops, services}) {
    const clockContainer = DrawUI.div();
    clockContainer.setClass('clock-container clock-24h hijri-clock');
    
    // SVG for day/night arc segments (same as 24h clock)
    const arcSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arcSvg.setAttribute('class', 'daynight-arc-svg');
    arcSvg.setAttribute('viewBox', '0 0 300 300');
    
    // Background circle with Islamic-themed color
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', '150');
    bgCircle.setAttribute('cy', '150');
    bgCircle.setAttribute('r', '140');
    bgCircle.setAttribute('fill', '#0a1628');
    arcSvg.appendChild(bgCircle);
    
    // Night arc
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
    
    // Night arc 2
    const nightArc2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    nightArc2.setAttribute('class', 'night-arc');
    arcSvg.appendChild(nightArc2);
    
    clockContainer.dom.appendChild(arcSvg);
    
    // Clock face overlay
    const clockFace = DrawUI.div();
    clockFace.setClass('clock-face-24h hijri-face');
    
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
    
    // Tick marks for hours (48 ticks)
    for (let i = 0; i < 48; i++) {
        const tick = DrawUI.div();
        tick.setClass(i % 2 === 0 ? 'tick-24h major' : 'tick-24h');
        tick.dom.style.transform = `rotate(${i * 7.5}deg)`;
        clockFace.add(tick);
    }
    
    clockContainer.add(clockFace);
    
    // Sun event markers
    const dawnMarker = DrawUI.div();
    dawnMarker.setClass('sun-marker dawn');
    dawnMarker.dom.innerHTML = '✶';
    dawnMarker.dom.title = 'Dawn (Fajr)';
    clockContainer.add(dawnMarker);
    
    const dawnTime = DrawUI.div();
    dawnTime.setClass('sun-time dawn-time');
    clockContainer.add(dawnTime);
    
    const dawnLabel = DrawUI.div();
    dawnLabel.setClass('prayer-label fajr');
    dawnLabel.dom.innerHTML = 'الفجر';
    clockContainer.add(dawnLabel);
    
    const sunriseMarker = DrawUI.div();
    sunriseMarker.setClass('sun-marker sunrise');
    sunriseMarker.dom.innerHTML = '☀';
    sunriseMarker.dom.title = 'Sunrise (Shurooq)';
    clockContainer.add(sunriseMarker);
    
    const sunriseTime = DrawUI.div();
    sunriseTime.setClass('sun-time sunrise-time');
    clockContainer.add(sunriseTime);
    
    const sunriseLabel = DrawUI.div();
    sunriseLabel.setClass('prayer-label shurooq');
    sunriseLabel.dom.innerHTML = 'الشروق';
    clockContainer.add(sunriseLabel);
    
    const noonMarker = DrawUI.div();
    noonMarker.setClass('sun-marker noon');
    noonMarker.dom.innerHTML = '☀';
    noonMarker.dom.title = 'Solar Noon (Dhuhr)';
    clockContainer.add(noonMarker);
    
    const noonTime = DrawUI.div();
    noonTime.setClass('sun-time noon-time');
    clockContainer.add(noonTime);
    
    const noonLabel = DrawUI.div();
    noonLabel.setClass('prayer-label dhuhr');
    noonLabel.dom.innerHTML = 'الظهر';
    clockContainer.add(noonLabel);
    
    const asrMarker = DrawUI.div();
    asrMarker.setClass('sun-marker asr');
    asrMarker.dom.innerHTML = '☀';
    asrMarker.dom.title = 'Asr (Afternoon)';
    clockContainer.add(asrMarker);
    
    const asrTime = DrawUI.div();
    asrTime.setClass('sun-time asr-time');
    clockContainer.add(asrTime);
    
    const asrLabel = DrawUI.div();
    asrLabel.setClass('prayer-label asr');
    asrLabel.dom.innerHTML = 'العصر';
    clockContainer.add(asrLabel);
    
    const sunsetMarker = DrawUI.div();
    sunsetMarker.setClass('sun-marker sunset');
    sunsetMarker.dom.innerHTML = '☀';
    sunsetMarker.dom.title = 'Sunset (Maghrib)';
    clockContainer.add(sunsetMarker);
    
    const sunsetTime = DrawUI.div();
    sunsetTime.setClass('sun-time sunset-time');
    clockContainer.add(sunsetTime);
    
    const sunsetLabel = DrawUI.div();
    sunsetLabel.setClass('prayer-label maghrib');
    sunsetLabel.dom.innerHTML = 'المغرب';
    clockContainer.add(sunsetLabel);
    
    const duskMarker = DrawUI.div();
    duskMarker.setClass('sun-marker dusk');
    duskMarker.dom.innerHTML = '✶';
    duskMarker.dom.title = 'Dusk (Isha)';
    clockContainer.add(duskMarker);
    
    const duskTime = DrawUI.div();
    duskTime.setClass('sun-time dusk-time');
    clockContainer.add(duskTime);
    
    const duskLabel = DrawUI.div();
    duskLabel.setClass('prayer-label isha');
    duskLabel.dom.innerHTML = 'العشاء';
    clockContainer.add(duskLabel);
    
    const midnightMarker = DrawUI.div();
    midnightMarker.setClass('sun-marker midnight');
    midnightMarker.dom.innerHTML = '☽';
    midnightMarker.dom.title = 'Solar Midnight';
    clockContainer.add(midnightMarker);
    
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
    
    // Central Hijri date display
    const hijriCenter = DrawUI.div();
    hijriCenter.setClass('hijri-center');
    
    const hijriDay = DrawUI.div();
    hijriDay.setClass('hijri-day');
    hijriDay.dom.textContent = '1';
    hijriCenter.add(hijriDay);
    
    const hijriMonth = DrawUI.div();
    hijriMonth.setClass('hijri-month');
    hijriMonth.dom.textContent = 'Muharram';
    hijriCenter.add(hijriMonth);
    
    const hijriYear = DrawUI.div();
    hijriYear.setClass('hijri-year');
    hijriYear.dom.textContent = '1447 AH';
    hijriCenter.add(hijriYear);
    
    clockContainer.add(hijriCenter);
    
    // Moon phase indicator (small, in corner)
    const moonIndicator = DrawUI.div();
    moonIndicator.setClass('hijri-moon-indicator');
    
    const moonSphere = DrawUI.div();
    moonSphere.setClass('hijri-moon-sphere');
    
    const moonShadow = DrawUI.div();
    moonShadow.setClass('hijri-moon-shadow');
    moonSphere.add(moonShadow);
    moonIndicator.add(moonSphere);
    clockContainer.add(moonIndicator);
    
    // Hands
    const hourHand = DrawUI.div();
    hourHand.setClass('hand hour-hand-24');
    clockContainer.add(hourHand);
    
    const minuteHand = DrawUI.div();
    minuteHand.setClass('hand minute-hand-24');
    clockContainer.add(minuteHand);
    
    const centerDot = DrawUI.div();
    centerDot.setClass('clock-center');
    clockContainer.add(centerDot);
    
    container.add(clockContainer);
    
    const synodicMonth = staticData.moonPhaseClock.synodicMonthDays ?? 29.53059;
    
    
    // Arc drawing helper
    function describeArc(cx, cy, r, startAngle, endAngle) {
        const start = {
            x: cx + r * Math.cos(Math.PI * startAngle / 180),
            y: cy + r * Math.sin(Math.PI * startAngle / 180)
        };
        const end = {
            x: cx + r * Math.cos(Math.PI * endAngle / 180),
            y: cy + r * Math.sin(Math.PI * endAngle / 180)
        };
        const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
        return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
    }
    
    function hourToAngle(hour) {
        return (hour / 24) * 360 - 90;
    }
    
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
        
        const hijri = tools.hijri.HijriCalculator.gregorianToHijri(now);
        hijriDay.dom.textContent = hijri.day;
        hijriMonth.dom.textContent = hijri.monthName;
        hijriYear.dom.textContent = `${hijri.year} AH`;
        
        // Moon phase indicator
        const moonAge = tools.astro.getMoonAge(now);
        const illumination = moonAge / synodicMonth;
        const shadowPosition = illumination <= 0.5 ? -(illumination * 200) : (1 - illumination) * 200;
        moonShadow.dom.style.transform = `translateX(${shadowPosition}%)`;
        
        // Sun times for arcs
        const sunTimes = tools.astro.SolarCalculator.getSunTimes(
            now,
            services.LocationService.latitude,
            services.LocationService.longitude
        );
        
        if (!sunTimes.isPolarDay && !sunTimes.isPolarNight) {
            const dawn = sunTimes.dawn;
            const sunrise = sunTimes.sunrise;
            const sunset = sunTimes.sunset;
            const dusk = sunTimes.dusk;
            const solarNoon = sunTimes.solarNoon;
            const solarMidnight = (solarNoon + 12) % 24;
            
            nightArc1.setAttribute('d', describeArc(150, 150, 140, hourToAngle(0), hourToAngle(dawn)));
            nightArc1.setAttribute('fill', '#0a1628');
            
            dawnArc.setAttribute('d', describeArc(150, 150, 140, hourToAngle(dawn), hourToAngle(sunrise)));
            dawnArc.setAttribute('fill', '#ff7f50');
            
            dayArc.setAttribute('d', describeArc(150, 150, 140, hourToAngle(sunrise), hourToAngle(sunset)));
            dayArc.setAttribute('fill', '#87ceeb');
            
            duskArc.setAttribute('d', describeArc(150, 150, 140, hourToAngle(sunset), hourToAngle(dusk)));
            duskArc.setAttribute('fill', '#ff7f50');
            
            nightArc2.setAttribute('d', describeArc(150, 150, 140, hourToAngle(dusk), hourToAngle(24)));
            nightArc2.setAttribute('fill', '#0a1628');
            
            const markerRadius = 160;
            const timeRadius = 180;
            const labelRadius = 105;
            
            const asr = tools.hijri.calculateAsr(services.LocationService.latitude, solarNoon, sunTimes.declination);
            
            const placeMarker = (marker, hour) => {
                const a = hourToAngle(hour);
                marker.dom.style.left = `${150 + markerRadius * Math.cos(a * Math.PI / 180)}px`;
                marker.dom.style.top = `${150 + markerRadius * Math.sin(a * Math.PI / 180)}px`;
                marker.dom.style.display = '';
                return a;
            };
            
            const placeTime = (timeEl, angle, hour) => {
                timeEl.dom.style.left = `${150 + timeRadius * Math.cos(angle * Math.PI / 180)}px`;
                timeEl.dom.style.top = `${150 + timeRadius * Math.sin(angle * Math.PI / 180)}px`;
                timeEl.dom.textContent = formatHourMin(hour);
                timeEl.dom.style.display = '';
            };
            
            const placeLabel = (labelEl, angle) => {
                labelEl.dom.style.left = `${150 + labelRadius * Math.cos(angle * Math.PI / 180)}px`;
                labelEl.dom.style.top = `${150 + labelRadius * Math.sin(angle * Math.PI / 180)}px`;
                labelEl.dom.style.display = '';
            };
            
            const dawnAngle = placeMarker(dawnMarker, dawn);
            placeTime(dawnTime, dawnAngle, dawn);
            placeLabel(dawnLabel, dawnAngle);
            
            const sunriseAngle = placeMarker(sunriseMarker, sunrise);
            placeTime(sunriseTime, sunriseAngle, sunrise);
            placeLabel(sunriseLabel, sunriseAngle);
            
            const noonAngle = placeMarker(noonMarker, solarNoon);
            placeTime(noonTime, noonAngle, solarNoon);
            placeLabel(noonLabel, noonAngle);
            
            if (asr !== null) {
                const asrAngle = placeMarker(asrMarker, asr);
                placeTime(asrTime, asrAngle, asr);
                placeLabel(asrLabel, asrAngle);
            } else {
                asrMarker.dom.style.display = 'none';
                asrTime.dom.style.display = 'none';
                asrLabel.dom.style.display = 'none';
            }
            
            const sunsetAngle = placeMarker(sunsetMarker, sunset);
            placeTime(sunsetTime, sunsetAngle, sunset);
            placeLabel(sunsetLabel, sunsetAngle);
            
            const duskAngle = placeMarker(duskMarker, dusk);
            placeTime(duskTime, duskAngle, dusk);
            placeLabel(duskLabel, duskAngle);
            
            placeMarker(midnightMarker, solarMidnight);
            
            // Get moonrise/moonset times
            const moonTimes = tools.astro.LunarCalculator.getMoonTimes(
                now,
                services.LocationService.latitude,
                services.LocationService.longitude
            );
            
            // Position moonrise marker
            if (moonTimes.moonrise !== null) {
                const moonriseAngle = placeMarker(moonriseMarker, moonTimes.moonrise);
                placeTime(moonriseTime, moonriseAngle, moonTimes.moonrise);
            } else {
                moonriseMarker.dom.style.display = 'none';
                moonriseTime.dom.style.display = 'none';
            }
            
            // Position moonset marker
            if (moonTimes.moonset !== null) {
                const moonsetAngle = placeMarker(moonsetMarker, moonTimes.moonset);
                placeTime(moonsetTime, moonsetAngle, moonTimes.moonset);
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
            dawnLabel.dom.style.display = 'none';
            sunriseMarker.dom.style.display = 'none';
            sunriseTime.dom.style.display = 'none';
            sunriseLabel.dom.style.display = 'none';
            noonMarker.dom.style.display = 'none';
            noonTime.dom.style.display = 'none';
            noonLabel.dom.style.display = 'none';
            asrMarker.dom.style.display = 'none';
            asrTime.dom.style.display = 'none';
            asrLabel.dom.style.display = 'none';
            sunsetMarker.dom.style.display = 'none';
            sunsetTime.dom.style.display = 'none';
            sunsetLabel.dom.style.display = 'none';
            duskMarker.dom.style.display = 'none';
            duskTime.dom.style.display = 'none';
            duskLabel.dom.style.display = 'none';
            midnightMarker.dom.style.display = 'none';
            moonriseMarker.dom.style.display = 'none';
            moonriseTime.dom.style.display = 'none';
            moonsetMarker.dom.style.display = 'none';
            moonsetTime.dom.style.display = 'none';
        }
        
        // Hands (24-hour)
        const hourDegrees = ((hours + minutes / 60) / 24) * 360;
        const minuteDegrees = (minutes) * 6;
        hourHand.dom.style.transform = `rotate(${hourDegrees}deg)`;
        minuteHand.dom.style.transform = `rotate(${minuteDegrees}deg)`;
        
        return { hours, minutes, hijriDate: hijri, simulatedDate: now };
    }
    
    return { update: updateClock, container: clockContainer };
}
