/**
 * Pure helpers for goal periods.
 * A period is { id, label, startDate, endDate|null, <targetField>: number|null, ... }.
 * endDate === null means "open-ended" (continues indefinitely).
 * Periods may overlap; when multiple periods cover the same date, the most
 * recently-started one wins (then the most recently-updated as tiebreak).
 */

export const GOAL_TARGET_FIELDS = [
    'calorieTarget',
    'proteinTarget_g',
    'carbsTarget_g',
    'fatTarget_g',
    'fiberTarget_g',
    'sugarTargetMax_g',
    'sodiumTargetMax_mg',
    'saturatedFatTargetMax_g',
    'weightTargetKg',
];

export function periodCoversDate(period, isoDate) {
    if (!period || !isoDate) return false;
    if (period.startDate && isoDate < period.startDate) return false;
    if (period.endDate && isoDate > period.endDate) return false;
    return true;
}

/** Returns the most-specific period covering `isoDate`, or null. */
export function activePeriodFor(periods, isoDate) {
    if (!Array.isArray(periods) || !periods.length) return null;
    const candidates = periods.filter((p) => periodCoversDate(p, isoDate));
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
        // Later startDate first.
        const s = (b.startDate || '').localeCompare(a.startDate || '');
        if (s !== 0) return s;
        // Closed (bounded) beats open-ended when starts are equal.
        if (!!a.endDate !== !!b.endDate) return a.endDate ? -1 : 1;
        // Later updatedAt wins.
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    return candidates[0];
}

/** Returns all periods that overlap the [fromIso..toIso] range. */
export function periodsOverlappingRange(periods, fromIso, toIso) {
    if (!Array.isArray(periods)) return [];
    return periods.filter((p) => {
        const pStart = p.startDate || '0000-01-01';
        const pEnd = p.endDate || '9999-12-31';
        return pStart <= toIso && pEnd >= fromIso;
    });
}

/** Human-readable range: "Apr 1 – Jun 30, 2026" or "From Apr 1, 2026". */
export function formatPeriodRange(period) {
    if (!period) return '';
    const fmt = (iso) => {
        if (!iso) return null;
        const d = new Date(iso + 'T00:00:00');
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    };
    const a = fmt(period.startDate);
    const b = fmt(period.endDate);
    if (a && b) return `${a} – ${b}`;
    if (a && !b) return `From ${a}`;
    if (!a && b) return `Until ${b}`;
    return 'Any time';
}

/** Does a period currently have an active day (today within its bounds)? */
export function isCurrentlyActive(period, todayIso) {
    return periodCoversDate(period, todayIso);
}
