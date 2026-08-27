/**
 * Default sports seeded on first open if the sportDefinitions store is empty.
 * Mirrors the food library's seed pattern.
 */
export const DEFAULT_SPORTS = [
    { name: 'Running',      icon: '🏃', defaultDurationMin: 30 },
    { name: 'Cycling',      icon: '🚴', defaultDurationMin: 45 },
    { name: 'Swimming',     icon: '🏊', defaultDurationMin: 30 },
    { name: 'Yoga',         icon: '🧘', defaultDurationMin: 30 },
    { name: 'Weightlifting', icon: '🏋', defaultDurationMin: 45 },
    { name: 'Walking',      icon: '🚶', defaultDurationMin: 30 },
];
