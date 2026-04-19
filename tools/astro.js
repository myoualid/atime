import { staticData } from '../data.js';

const SolarCalculator = {
  toRad(deg) {
    return (deg * Math.PI) / 180;
  },
  toDeg(rad) {
    return (rad * 180) / Math.PI;
  },
  getJulianDay(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const A = Math.floor((14 - month) / 12);
    const Y = year + 4800 - A;
    const M = month + 12 * A - 3;

    return (
      day +
      Math.floor((153 * M + 2) / 5) +
      365 * Y +
      Math.floor(Y / 4) -
      Math.floor(Y / 100) +
      Math.floor(Y / 400) -
      32045
    );
  },
  getJulianCentury(julianDay) {
    return (julianDay - 2451545) / 36525;
  },
  getSolarDeclination(julianCentury) {
    const L0 =
      280.46646 +
      julianCentury * (36000.76983 + 0.0003032 * julianCentury);
    const M =
      357.52911 +
      julianCentury * (35999.05029 - 0.0001537 * julianCentury);
    const e =
      0.016708634 -
      julianCentury * (0.000042037 + 0.0000001267 * julianCentury);

    const C =
      Math.sin(this.toRad(M)) *
        (1.914602 - julianCentury * (0.004817 + 0.000014 * julianCentury)) +
      Math.sin(this.toRad(2 * M)) * (0.019993 - 0.000101 * julianCentury) +
      Math.sin(this.toRad(3 * M)) * 0.000289;

    const sunLon = L0 + C;
    const omega = 125.04 - 1934.136 * julianCentury;
    const lambda = sunLon - 0.00569 - 0.00478 * Math.sin(this.toRad(omega));
    const obliquity = 23.439291 - 0.0130042 * julianCentury;

    void e;
    return this.toDeg(
      Math.asin(
        Math.sin(this.toRad(obliquity)) * Math.sin(this.toRad(lambda))
      )
    );
  },
  getEquationOfTime(julianCentury) {
    const L0 =
      280.46646 +
      julianCentury * (36000.76983 + 0.0003032 * julianCentury);
    const M =
      357.52911 +
      julianCentury * (35999.05029 - 0.0001537 * julianCentury);
    const e =
      0.016708634 -
      julianCentury * (0.000042037 + 0.0000001267 * julianCentury);
    const obliquity = 23.439291 - 0.0130042 * julianCentury;

    const y = Math.tan(this.toRad(obliquity / 2)) ** 2;

    const EoT =
      y * Math.sin(2 * this.toRad(L0)) -
      2 * e * Math.sin(this.toRad(M)) +
      4 *
        e *
        y *
        Math.sin(this.toRad(M)) *
        Math.cos(2 * this.toRad(L0)) -
      0.5 * y * y * Math.sin(4 * this.toRad(L0)) -
      1.25 * e * e * Math.sin(2 * this.toRad(M));

    return this.toDeg(EoT) * 4;
  },
  getHourAngle(latitude, declination, zenith = 90.833) {
    const latRad = this.toRad(latitude);
    const decRad = this.toRad(declination);
    const zenRad = this.toRad(zenith);

    const cosHA =
      Math.cos(zenRad) / (Math.cos(latRad) * Math.cos(decRad)) -
      Math.tan(latRad) * Math.tan(decRad);

    if (cosHA > 1) return null;
    if (cosHA < -1) return null;

    return this.toDeg(Math.acos(cosHA));
  },
  getSunTimes(date, latitude, longitude) {
    const jd = this.getJulianDay(date);
    const jc = this.getJulianCentury(jd);

    const declination = this.getSolarDeclination(jc);
    const eqTime = this.getEquationOfTime(jc);
    const hourAngle = this.getHourAngle(latitude, declination);

    const tzOffset = -date.getTimezoneOffset() / 60;
    const solarNoon = (720 - 4 * longitude - eqTime + tzOffset * 60) / 60;

    if (hourAngle === null) {
      const isPolarDay = declination * (latitude > 0 ? 1 : -1) > 0;
      return {
        sunrise: isPolarDay ? 0 : null,
        sunset: isPolarDay ? 24 : null,
        solarNoon,
        dawn: isPolarDay ? 0 : null,
        dusk: isPolarDay ? 24 : null,
        daylightHours: isPolarDay ? 24 : 0,
        isPolarDay,
        isPolarNight: !isPolarDay,
      };
    }

    const sunrise = solarNoon - hourAngle / 15;
    const sunset = solarNoon + hourAngle / 15;

    const astroHA = this.getHourAngle(latitude, declination, 108);
    const dawn = astroHA ? solarNoon - astroHA / 15 : sunrise;
    const dusk = astroHA ? solarNoon + astroHA / 15 : sunset;

    const daylightHours = sunset - sunrise;

    return {
      sunrise,
      sunset,
      solarNoon,
      dawn,
      dusk,
      daylightHours,
      declination,
      isPolarDay: false,
      isPolarNight: false,
    };
  },
  getSunAltitude(date, latitude, longitude) {
    const jd = this.getJulianDay(date);
    const jc = this.getJulianCentury(jd);
    const declination = this.getSolarDeclination(jc);
    const eqTime = this.getEquationOfTime(jc);

    const tzOffset = -date.getTimezoneOffset() / 60;
    const solarNoon = (720 - 4 * longitude - eqTime + tzOffset * 60) / 60;

    const currentHour =
      date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const hourAngle = (currentHour - solarNoon) * 15;

    const latRad = this.toRad(latitude);
    const decRad = this.toRad(declination);
    const haRad = this.toRad(hourAngle);

    return this.toDeg(
      Math.asin(
        Math.sin(latRad) * Math.sin(decRad) +
          Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)
      )
    );
  },
};

/**
 * Local wall-clock instant for a calendar day + fractional hour (from getSunTimes).
 * @param {Date} referenceDate
 * @param {number} hourDecimal
 */
function localWallTimeMs(referenceDate, hourDecimal) {
  const base = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    0,
    0,
    0,
    0,
  );
  const totalMinutes = hourDecimal * 60;
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  const s = Math.round((totalMinutes - Math.floor(totalMinutes)) * 60);
  base.setHours(h, m, s);
  return base.getTime();
}

/**
 * Progress through daylight (sunrise→sunset) or through night (sunset→next sunrise).
 * @param {number} latitude
 * @param {number} longitude
 * @param {Date} [now]
 * @returns {{ phase: 'day'|'night'|'polar-day'|'polar-night', pct: number, label: string }}
 */
function getDayNightProgress(latitude, longitude, now = new Date()) {
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const st = SolarCalculator.getSunTimes(today, latitude, longitude);
  if (st.isPolarDay) {
    return {
      phase: 'polar-day',
      pct: Math.min(100, Math.max(0, (now.getHours() / 24) * 100)),
      label: 'Polar day',
    };
  }
  if (st.isPolarNight) {
    return {
      phase: 'polar-night',
      pct: Math.min(100, Math.max(0, (now.getHours() / 24) * 100)),
      label: 'Polar night',
    };
  }

  const stY = SolarCalculator.getSunTimes(yesterday, latitude, longitude);
  const stN = SolarCalculator.getSunTimes(tomorrow, latitude, longitude);

  const sunriseTodayMs = localWallTimeMs(today, st.sunrise);
  const sunsetTodayMs = localWallTimeMs(today, st.sunset);
  const sunsetYesterdayMs = localWallTimeMs(yesterday, stY.sunset);
  const sunriseTomorrowMs = localWallTimeMs(tomorrow, stN.sunrise);

  const nowMs = now.getTime();

  if (nowMs >= sunriseTodayMs && nowMs < sunsetTodayMs) {
    const span = sunsetTodayMs - sunriseTodayMs;
    const pct = span > 0 ? ((nowMs - sunriseTodayMs) / span) * 100 : 0;
    return {
      phase: 'day',
      pct: Math.min(100, Math.max(0, pct)),
      label: 'Day',
    };
  }

  let nightStartMs;
  let nightEndMs;
  if (nowMs < sunriseTodayMs) {
    nightStartMs = sunsetYesterdayMs;
    nightEndMs = sunriseTodayMs;
  } else {
    nightStartMs = sunsetTodayMs;
    nightEndMs = sunriseTomorrowMs;
  }

  const span = nightEndMs - nightStartMs;
  const pct = span > 0 ? ((nowMs - nightStartMs) / span) * 100 : 0;
  return {
    phase: 'night',
    pct: Math.min(100, Math.max(0, pct)),
    label: 'Night',
  };
}

function getSolarEvents(year) {
  return [
    {
      name: 'Winter Solstice',
      shortName: 'W.Sol',
      date: new Date(year, 11, 21, 10, 0),
      type: 'solstice',
      description: 'Shortest Day (N. Hemisphere)',
      symbol: '❄',
    },
    {
      name: 'Spring Equinox',
      shortName: 'Spr.Eq',
      date: new Date(year, 2, 20, 9, 0),
      type: 'equinox',
      description: 'Equal Day/Night',
      symbol: '◎',
    },
    {
      name: 'Summer Solstice',
      shortName: 'S.Sol',
      date: new Date(year, 5, 21, 4, 0),
      type: 'solstice',
      description: 'Longest Day (N. Hemisphere)',
      symbol: '☀',
    },
    {
      name: 'Autumn Equinox',
      shortName: 'Aut.Eq',
      date: new Date(year, 8, 22, 22, 0),
      type: 'equinox',
      description: 'Equal Day/Night',
      symbol: '◎',
    },
  ];
}

function getNextMoonPhases(fromDate = new Date()) {
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const synodicMonth = 29.53059;
  const phases = [
    { name: 'New Moon', symbol: '🌑', dayOffset: 0 },
    { name: 'First Quarter', symbol: '🌓', dayOffset: synodicMonth / 4 },
    { name: 'Full Moon', symbol: '🌕', dayOffset: synodicMonth / 2 },
    { name: 'Last Quarter', symbol: '🌗', dayOffset: (synodicMonth * 3) / 4 },
  ];

  const daysSinceKnown = (fromDate - knownNewMoon) / (24 * 60 * 60 * 1000);
  const currentAge =
    ((daysSinceKnown % synodicMonth) + synodicMonth) % synodicMonth;

  const nextPhases = [];
  for (const phase of phases) {
    let daysUntil = phase.dayOffset - currentAge;
    if (daysUntil < 0) daysUntil += synodicMonth;
    const phaseDate = new Date(
      fromDate.getTime() + daysUntil * 24 * 60 * 60 * 1000
    );
    nextPhases.push({ ...phase, date: phaseDate, daysUntil });
  }

  nextPhases.sort((a, b) => a.date - b.date);
  return nextPhases;
}

const LunarCalculator = {
  toRad(deg) {
    return (deg * Math.PI) / 180;
  },
  toDeg(rad) {
    return (rad * 180) / Math.PI;
  },
  normalize(angle) {
    while (angle < 0) angle += 360;
    while (angle >= 360) angle -= 360;
    return angle;
  },
  getJulianDay(date) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day =
      date.getUTCDate() +
      date.getUTCHours() / 24 +
      date.getUTCMinutes() / 1440 +
      date.getUTCSeconds() / 86400;

    let y = year,
      m = month;
    if (m <= 2) {
      y--;
      m += 12;
    }

    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);

    return (
      Math.floor(365.25 * (y + 4716)) +
      Math.floor(30.6001 * (m + 1)) +
      day +
      B -
      1524.5
    );
  },
  getMoonPosition(jd) {
    const T = (jd - 2451545.0) / 36525;
    const Lp = this.normalize(
      218.3164477 +
        481267.88123421 * T -
        0.0015786 * T * T +
        (T * T * T) / 538841 -
        (T * T * T * T) / 65194000
    );
    const Mp = this.normalize(
      134.9633964 +
        477198.8675055 * T +
        0.0087414 * T * T +
        (T * T * T) / 69699 -
        (T * T * T * T) / 14712000
    );
    const M = this.normalize(
      357.5291092 +
        35999.0502909 * T -
        0.0001536 * T * T +
        (T * T * T) / 24490000
    );
    const F = this.normalize(
      93.272095 +
        483202.0175233 * T -
        0.0036539 * T * T -
        (T * T * T) / 3526000 +
        (T * T * T * T) / 863310000
    );
    const D = this.normalize(
      297.8501921 +
        445267.1114034 * T -
        0.0018819 * T * T +
        (T * T * T) / 545868 -
        (T * T * T * T) / 113065000
    );

    const LpR = this.toRad(Lp);
    const MpR = this.toRad(Mp);
    const MR = this.toRad(M);
    const FR = this.toRad(F);
    const DR = this.toRad(D);

    let longitude = Lp;
    longitude += 6.289 * Math.sin(MpR);
    longitude += 1.274 * Math.sin(2 * DR - MpR);
    longitude += 0.658 * Math.sin(2 * DR);
    longitude += 0.214 * Math.sin(2 * MpR);
    longitude -= 0.186 * Math.sin(MR);
    longitude -= 0.114 * Math.sin(2 * FR);

    let latitude = 5.128 * Math.sin(FR);
    latitude += 0.281 * Math.sin(MpR + FR);
    latitude += 0.278 * Math.sin(MpR - FR);

    let distance = 385001 - 20905 * Math.cos(MpR);
    distance -= 3699 * Math.cos(2 * DR - MpR);
    distance -= 2956 * Math.cos(2 * DR);

    const parallax = this.toDeg(Math.asin(6378.14 / distance));

    return {
      longitude: this.normalize(longitude),
      latitude,
      distance,
      parallax,
    };
  },
  eclipticToEquatorial(longitude, latitude, jd) {
    const T = (jd - 2451545.0) / 36525;
    const epsilon = 23.439291 - 0.0130042 * T;

    const lonR = this.toRad(longitude);
    const latR = this.toRad(latitude);
    const epsR = this.toRad(epsilon);

    const ra = this.toDeg(
      Math.atan2(
        Math.sin(lonR) * Math.cos(epsR) - Math.tan(latR) * Math.sin(epsR),
        Math.cos(lonR)
      )
    );

    const dec = this.toDeg(
      Math.asin(
        Math.sin(latR) * Math.cos(epsR) +
          Math.cos(latR) * Math.sin(epsR) * Math.sin(lonR)
      )
    );

    return { ra: this.normalize(ra), dec };
  },
  getGMST(jd) {
    const T = (jd - 2451545.0) / 36525;
    const gmst =
      280.46061837 +
      360.98564736629 * (jd - 2451545.0) +
      0.000387933 * T * T -
      (T * T * T) / 38710000;
    return this.normalize(gmst);
  },
  getMoonTimes(date, latitude, longitude) {
    const localMidnight = new Date(date);
    localMidnight.setHours(0, 0, 0, 0);

    const targetAltitude = -0.833;
    let moonrise = null;
    let moonset = null;
    let lastAlt = null;

    for (let minutes = 0; minutes <= 24 * 60; minutes += 10) {
      const checkTime = new Date(localMidnight.getTime() + minutes * 60000);
      const jd = this.getJulianDay(checkTime);

      const moonPos = this.getMoonPosition(jd);
      const eq = this.eclipticToEquatorial(
        moonPos.longitude,
        moonPos.latitude,
        jd
      );

      const gmst = this.getGMST(jd);
      const lst = this.normalize(gmst + longitude);

      const ha = lst - eq.ra;
      const haR = this.toRad(ha);
      const decR = this.toRad(eq.dec);
      const latR = this.toRad(latitude);

      const altitude = this.toDeg(
        Math.asin(
          Math.sin(latR) * Math.sin(decR) +
            Math.cos(latR) * Math.cos(decR) * Math.cos(haR)
        )
      );

      const adjustedAlt = altitude - moonPos.parallax + 0.5;

      if (lastAlt !== null) {
        if (
          lastAlt < targetAltitude &&
          adjustedAlt >= targetAltitude &&
          moonrise === null
        ) {
          const fraction = (targetAltitude - lastAlt) / (adjustedAlt - lastAlt);
          moonrise = (minutes - 10 + fraction * 10) / 60;
        }
        if (
          lastAlt >= targetAltitude &&
          adjustedAlt < targetAltitude &&
          moonset === null
        ) {
          const fraction = (lastAlt - targetAltitude) / (lastAlt - adjustedAlt);
          moonset = (minutes - 10 + fraction * 10) / 60;
        }
      }

      lastAlt = adjustedAlt;
    }

    return {
      moonrise,
      moonset,
      isAlwaysUp:
        moonrise === null && moonset === null && lastAlt > targetAltitude,
      isAlwaysDown:
        moonrise === null && moonset === null && lastAlt < targetAltitude,
    };
  },
  getNextMoonrise(date, latitude, longitude) {
    const now = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const todayTimes = this.getMoonTimes(date, latitude, longitude);
    if (todayTimes.moonrise !== null && todayTimes.moonrise > now) {
      return { time: todayTimes.moonrise, isToday: true, date };
    }

    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTimes = this.getMoonTimes(tomorrow, latitude, longitude);
    if (tomorrowTimes.moonrise !== null) {
      return { time: tomorrowTimes.moonrise, isToday: false, date: tomorrow };
    }

    const dayAfter = new Date(date);
    dayAfter.setDate(dayAfter.getDate() + 2);
    const dayAfterTimes = this.getMoonTimes(dayAfter, latitude, longitude);
    return { time: dayAfterTimes.moonrise, isToday: false, date: dayAfter };
  },
};

function getMoonTimesForDate(date, latitude, longitude) {
  const times = LunarCalculator.getMoonTimes(date, latitude, longitude);

  const formatHourToDate = (hours, baseDate) => {
    if (hours === null) return null;
    const d = new Date(baseDate);
    d.setHours(0, 0, 0, 0);
    d.setMinutes(Math.round(hours * 60));
    return d;
  };

  return {
    moonrise:
      times.moonrise !== null ? formatHourToDate(times.moonrise, date) : null,
    moonset: times.moonset !== null ? formatHourToDate(times.moonset, date) : null,
    isAlwaysUp: times.isAlwaysUp,
    isAlwaysDown: times.isAlwaysDown,
  };
}

function getSeasonDurations(latitude, year) {
  const events = getSolarEvents(year);
  const nextYearEvents = getSolarEvents(year + 1);

  const winterSolstice = events[0].date;
  const springEquinox = events[1].date;
  const summerSolstice = events[2].date;
  const autumnEquinox = events[3].date;
  void nextYearEvents;

  const isNorthernHemisphere = latitude >= 0;
  const daysBetween = (d1, d2) =>
    Math.round((d2 - d1) / (24 * 60 * 60 * 1000));

  const prevYearEvents = getSolarEvents(year - 1);
  const prevWinterSolstice = prevYearEvents[0].date;

  const seasons = isNorthernHemisphere
    ? {
        winter: {
          name: 'Winter',
          symbol: '❄️',
          start: prevWinterSolstice,
          end: springEquinox,
          days: daysBetween(prevWinterSolstice, springEquinox),
        },
        spring: {
          name: 'Spring',
          symbol: '🌸',
          start: springEquinox,
          end: summerSolstice,
          days: daysBetween(springEquinox, summerSolstice),
        },
        summer: {
          name: 'Summer',
          symbol: '☀️',
          start: summerSolstice,
          end: autumnEquinox,
          days: daysBetween(summerSolstice, autumnEquinox),
        },
        autumn: {
          name: 'Autumn',
          symbol: '🍂',
          start: autumnEquinox,
          end: winterSolstice,
          days: daysBetween(autumnEquinox, winterSolstice),
        },
      }
    : {
        summer: {
          name: 'Summer',
          symbol: '☀️',
          start: prevWinterSolstice,
          end: springEquinox,
          days: daysBetween(prevWinterSolstice, springEquinox),
        },
        autumn: {
          name: 'Autumn',
          symbol: '🍂',
          start: springEquinox,
          end: summerSolstice,
          days: daysBetween(springEquinox, summerSolstice),
        },
        winter: {
          name: 'Winter',
          symbol: '❄️',
          start: summerSolstice,
          end: autumnEquinox,
          days: daysBetween(summerSolstice, autumnEquinox),
        },
        spring: {
          name: 'Spring',
          symbol: '🌸',
          start: autumnEquinox,
          end: winterSolstice,
          days: daysBetween(autumnEquinox, winterSolstice),
        },
      };

  const totalDays = Object.values(seasons).reduce((sum, s) => sum + s.days, 0);
  for (const key in seasons) {
    seasons[key].percentage = ((seasons[key].days / totalDays) * 100).toFixed(1);
  }

  return { seasons, totalDays, isNorthernHemisphere };
}

function getEqual12hDates(latitude, year, longitudeForLocalDay = 0) {
  if (Math.abs(latitude) < 1) {
    return [
      {
        date: 'Year-round',
        description: 'Near equator - always ~12h daylight',
      },
    ];
  }

  const events = getSolarEvents(year);
  const springEquinox = events[1].date;
  const autumnEquinox = events[3].date;

  const equal12hDates = [];

  for (let offset = -5; offset <= 5; offset++) {
    const checkDate = new Date(springEquinox);
    checkDate.setDate(checkDate.getDate() + offset);
    const sunTimes = SolarCalculator.getSunTimes(
      checkDate,
      latitude,
      longitudeForLocalDay
    );
    if (sunTimes.daylightHours && Math.abs(sunTimes.daylightHours - 12) < 0.1) {
      equal12hDates.push({
        date: checkDate,
        description: 'Spring equal 12h/12h',
        daylightHours: sunTimes.daylightHours.toFixed(2),
      });
      break;
    }
  }

  for (let offset = -5; offset <= 5; offset++) {
    const checkDate = new Date(autumnEquinox);
    checkDate.setDate(checkDate.getDate() + offset);
    const sunTimes = SolarCalculator.getSunTimes(
      checkDate,
      latitude,
      longitudeForLocalDay
    );
    if (sunTimes.daylightHours && Math.abs(sunTimes.daylightHours - 12) < 0.1) {
      equal12hDates.push({
        date: checkDate,
        description: 'Autumn equal 12h/12h',
        daylightHours: sunTimes.daylightHours.toFixed(2),
      });
      break;
    }
  }

  if (equal12hDates.length === 0) {
    return [
      {
        date: springEquinox,
        description: 'Spring Equinox (~12h)',
        daylightHours: '~12',
      },
      {
        date: autumnEquinox,
        description: 'Autumn Equinox (~12h)',
        daylightHours: '~12',
      },
    ];
  }

  return equal12hDates;
}

function getMoonAge(date = new Date()) {
    const knownNewMoon = new Date(staticData.moonPhaseClock.knownNewMoonISO);
    const synodicMonth = staticData.moonPhaseClock.synodicMonthDays;
    const daysSince = (date - knownNewMoon) / (24 * 60 * 60 * 1000);
    return ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;
}

export {
  SolarCalculator,
  LunarCalculator,
  getMoonTimesForDate,
  getSeasonDurations,
  getEqual12hDates,
  getMoonAge,
  getNextMoonPhases,
  getSolarEvents,
  getDayNightProgress,
}