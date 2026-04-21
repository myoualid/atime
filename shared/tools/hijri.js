export const HijriCalculator = {
  monthNames: [
    "Muharram",
    "Safar",
    "Rabi' al-Awwal",
    "Rabi' al-Thani",
    "Jumada al-Awwal",
    "Jumada al-Thani",
    "Rajab",
    "Sha'ban",
    "Ramadan",
    "Shawwal",
    "Dhu al-Qi'dah",
    "Dhu al-Hijjah",
  ],

  monthNamesShort: [
    "Muh",
    "Saf",
    "Rab I",
    "Rab II",
    "Jum I",
    "Jum II",
    "Raj",
    "Sha",
    "Ram",
    "Shaw",
    "Dhu Q",
    "Dhu H",
  ],

  gregorianToJD(year, month, day) {
    if (month <= 2) {
      year -= 1;
      month += 12;
    }
    const A = Math.floor(year / 100);
    const B = 2 - A + Math.floor(A / 4);
    return (
      Math.floor(365.25 * (year + 4716)) +
      Math.floor(30.6001 * (month + 1)) +
      day +
      B -
      1524.5
    );
  },

  jdToHijri(jd) {
    const epochJD = 1948439.5;
    const days = Math.floor(jd - epochJD);

    const cycle30 = Math.floor(days / 10631);
    let remainingDays = days % 10631;

    let yearInCycle = 0;
    const daysInYear = [
      354, 355, 354, 354, 355, 354, 355, 354, 354, 355, 354, 354, 355, 354, 354,
      355, 354, 355, 354, 354, 355, 354, 354, 355, 354, 355, 354, 354, 355, 354,
    ];

    while (yearInCycle < 30 && remainingDays >= daysInYear[yearInCycle]) {
      remainingDays -= daysInYear[yearInCycle];
      yearInCycle++;
    }

    const hYear = cycle30 * 30 + yearInCycle + 1;

    let hMonth = 1;
    const leapYearsInCycle = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];
    const isLeap = leapYearsInCycle.includes(((hYear - 1) % 30) + 1);

    while (hMonth <= 12) {
      let daysInMonth;
      if (hMonth % 2 === 1) daysInMonth = 30;
      else if (hMonth === 12 && isLeap) daysInMonth = 30;
      else daysInMonth = 29;

      if (remainingDays < daysInMonth) break;
      remainingDays -= daysInMonth;
      hMonth++;
    }

    const hDay = Math.floor(remainingDays) + 1;
    return { year: hYear, month: hMonth, day: hDay };
  },

  gregorianToHijri(date) {
    const gYear = date.getFullYear();
    const gMonth = date.getMonth() + 1;
    const gDay = date.getDate();

    const jd = this.gregorianToJD(gYear, gMonth, gDay);
    const hijri = this.jdToHijri(jd);

    return {
      year: hijri.year,
      month: hijri.month,
      day: hijri.day,
      monthName: this.monthNames[hijri.month - 1],
      monthNameShort: this.monthNamesShort[hijri.month - 1],
    };
  },

  isHijriLeapYear(year) {
    const leapYears = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];
    return leapYears.includes(((year - 1) % 30) + 1);
  },

  getDaysInMonth(year, month) {
    if (month % 2 === 1) return 30;
    if (month === 12 && this.isHijriLeapYear(year)) return 30;
    return 29;
  },

  getDaysInYear(year) {
    return this.isHijriLeapYear(year) ? 355 : 354;
  },

  formatDate(hijriDate) {
    return `${hijriDate.day} ${hijriDate.monthName} ${hijriDate.year} AH`;
  },

  formatDateShort(hijriDate) {
    const day = hijriDate.day.toString().padStart(2, "0");
    const month = hijriDate.month.toString().padStart(2, "0");
    return `${day}/${month}/${hijriDate.year}`;
  },
};

// Calculate Asr time (standard method, shadow factor = 1)
export function calculateAsr(latitude, solarNoon, declination) {
  const latRad = (Math.PI * latitude) / 180;
  const decRad = (Math.PI * declination) / 180;

  const noonAltitude = 90 - Math.abs(latitude - declination);
  const noonAltRad = (Math.PI * noonAltitude) / 180;

  const shadowFactor = 1;

  const cotNoon = 1 / Math.tan(noonAltRad);
  const cotAsr = shadowFactor + cotNoon;
  const asrAltitude = (Math.atan(1 / cotAsr) * 180) / Math.PI;

  const asrAltRad = (Math.PI * asrAltitude) / 180;
  const cosHA =
    (Math.sin(asrAltRad) - Math.sin(latRad) * Math.sin(decRad)) /
    (Math.cos(latRad) * Math.cos(decRad));

  if (cosHA < -1 || cosHA > 1) return null;

  const hourAngle = (Math.acos(cosHA) * 180) / Math.PI;
  return solarNoon + hourAngle / 15;
}
