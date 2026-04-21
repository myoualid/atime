function requireSignals(signalsGlobal) {
  const Signal = signalsGlobal?.Signal;
  if (!Signal) {
    throw new Error(
      "JS Signals not found. Ensure `signals.min.js` is loaded and `window.signals.Signal` exists.",
    );
  }
  return { Signal };
}

export function createData({
  signals: signalsGlobal = globalThis.signals,
} = {}) {
  const { Signal } = requireSignals(signalsGlobal);

  const state = {
    time: {
      offsetHours: 0,
      isSimulating: false,
      clockOffsets: {
        moonPhase: 0,
        moonrise: 0,
        clock24: 0,
      },
    },
    location: {
      latitude: 51.5074,
      longitude: -0.1278,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locationName: "London, UK (default)",
      isDefault: true,
    },
  };

  const signals = {
    onLocationChanged: new Signal(),
    onTimeOffsetChanged: new Signal(),
    onClockOffsetChanged: new Signal(),
    onError: new Signal(),
  };

  return { state, signals };
}

export const staticData = {
  solarEvents: [
    {
      name: "Winter Solstice",
      shortName: "W.Sol",
      date: "Dec 21",
      dayOfYear: 355,
      type: "solstice",
      description: "Shortest Day",
    },
    {
      name: "Spring Equinox",
      shortName: "Spr.Eq",
      date: "Mar 20",
      dayOfYear: 79,
      type: "equinox",
      description: "Equal Day/Night",
    },
    {
      name: "Summer Solstice",
      shortName: "S.Sol",
      date: "Jun 21",
      dayOfYear: 172,
      type: "solstice",
      description: "Longest Day",
    },
    {
      name: "Autumn Equinox",
      shortName: "Aut.Eq",
      date: "Sep 22",
      dayOfYear: 265,
      type: "equinox",
      description: "Equal Day/Night",
    },
  ],

  solarSeasons: {
    seasons: [
      { name: "Winter", startDay: 355, endDay: 79, color: "#a8d5e5" },
      { name: "Spring", startDay: 79, endDay: 172, color: "#90ee90" },
      { name: "Summer", startDay: 172, endDay: 265, color: "#ffdb58" },
      { name: "Autumn", startDay: 265, endDay: 355, color: "#daa520" },
    ],
    months: [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],
    monthDays: [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334],
    seasonLabels: [
      { name: "WINTER", dayOfYear: 35, color: "#6aa" },
      { name: "SPRING", dayOfYear: 125, color: "#4a4" },
      { name: "SUMMER", dayOfYear: 218, color: "#c90" },
      { name: "AUTUMN", dayOfYear: 310, color: "#a63" },
    ],
  },

  clockFace: {
    romanNumerals: [
      "XII",
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
      "XI",
    ],
  },

  moonPhaseClock: {
    // Lunar cycle configuration (used by multiple moon-based clocks)
    synodicMonthDays: 29.53059,
    knownNewMoonISO: "2000-01-06T18:14:00Z",
    phaseLabels: [
      { name: "NEW", angle: 0 },
      { name: "1ST QTR", angle: 90 },
      { name: "FULL", angle: 180 },
      { name: "LAST QTR", angle: 270 },
    ],
    quarterPhases: [
      { phase: "new", symbol: "●", day: 0 },
      { phase: "first", symbol: "◐", dayFraction: 0.25 },
      { phase: "full", symbol: "○", dayFraction: 0.5 },
      { phase: "last", symbol: "◑", dayFraction: 0.75 },
    ],
    phaseBoundaries: [
      { name: "New Moon", start: 0, end: 1.85, symbol: "●", shortName: "NEW" },
      {
        name: "Waxing Crescent",
        start: 1.85,
        end: 7.38,
        symbol: "🌒",
        shortName: "WAXING CR.",
      },
      {
        name: "First Quarter",
        start: 7.38,
        end: 9.23,
        symbol: "◐",
        shortName: "1ST QTR",
      },
      {
        name: "Waxing Gibbous",
        start: 9.23,
        end: 14.77,
        symbol: "🌔",
        shortName: "WAXING GB.",
      },
      {
        name: "Full Moon",
        start: 14.77,
        end: 16.61,
        symbol: "○",
        shortName: "FULL",
      },
      {
        name: "Waning Gibbous",
        start: 16.61,
        end: 22.15,
        symbol: "🌖",
        shortName: "WANING GB.",
      },
      {
        name: "Last Quarter",
        start: 22.15,
        end: 23.99,
        symbol: "◑",
        shortName: "LAST QTR",
      },
      {
        name: "Waning Crescent",
        start: 23.99,
        end: 29.53,
        symbol: "🌘",
        shortName: "WANING CR.",
      },
    ],
  },

  moonriseClock: {
    hourLabels: [
      { label: "00", angle: 0 },
      { label: "06", angle: 90 },
      { label: "12", angle: 180 },
      { label: "18", angle: 270 },
    ],
    minorHourLabels: [
      { label: "03", angle: 45 },
      { label: "09", angle: 135 },
      { label: "15", angle: 225 },
      { label: "21", angle: 315 },
    ],
  },

  proportionalClock: {
    piMarkers: [
      { deg: 0, pi: "0" },
      { deg: 90, pi: "π/4" },
      { deg: 180, pi: "π/2" },
      { deg: 270, pi: "3π/4" },
    ],
  },

  timeSlider: {
    configs: [
      { id: "moonPhase", label: "Moon Phase", clockKey: "moonPhase" },
      { id: "moonrise", label: "Moonrise/Set", clockKey: "moonrise" },
      { id: "clock24", label: "24-Hour / Hijri", clockKey: "clock24" },
    ],
  },

  dayNightBar: {
    // Number of labels/ticks across the 24h span (inclusive endpoints)
    timelineLabelCount: 9,
  },
};
