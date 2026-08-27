/**
 * Date helpers used across planner views. All dates are treated as local.
 */

export function toIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function fromIsoDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

export function addMonths(date, n) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
}

export function startOfWeek(date, weekStartsOn = 1) {
    const d = startOfDay(date);
    const diff = (d.getDay() - weekStartsOn + 7) % 7;
    return addDays(d, -diff);
}

export function startOfMonth(date) {
    const d = startOfDay(date);
    d.setDate(1);
    return d;
}

export function endOfMonth(date) {
    const d = startOfMonth(date);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    return d;
}

export function eachDayOfRange(fromDate, toDate) {
    const out = [];
    let cur = startOfDay(fromDate);
    const end = startOfDay(toDate);
    while (cur <= end) {
        out.push(new Date(cur));
        cur = addDays(cur, 1);
    }
    return out;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatLongDate(date) {
    return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function formatShortDay(date) {
    return `${DAY_SHORT[date.getDay()]} ${date.getDate()}`;
}

export function formatMonthYear(date) {
    return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatWeekRange(fromDate, toDate) {
    if (fromDate.getMonth() === toDate.getMonth() && fromDate.getFullYear() === toDate.getFullYear()) {
        return `${MONTH_SHORT[fromDate.getMonth()]} ${fromDate.getDate()} – ${toDate.getDate()}, ${fromDate.getFullYear()}`;
    }
    return `${MONTH_SHORT[fromDate.getMonth()]} ${fromDate.getDate()} – ${MONTH_SHORT[toDate.getMonth()]} ${toDate.getDate()}, ${toDate.getFullYear()}`;
}

export function weekdayNames(weekStartsOn = 1) {
    const out = [];
    for (let i = 0; i < 7; i++) out.push(DAY_SHORT[(weekStartsOn + i) % 7]);
    return out;
}

export function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function daysBetweenIso(fromIso, toIso) {
    const ms = fromIsoDate(toIso).getTime() - fromIsoDate(fromIso).getTime();
    return Math.round(ms / 86400000);
}

export function addDaysIso(iso, n) {
    return toIsoDate(addDays(fromIsoDate(iso), n));
}
