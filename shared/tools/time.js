function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatTime(hours, minutes, seconds) {
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

export function formatGregorianDate(date) {
  if (!date || !(date instanceof Date)) return '--';
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function formatShortDate(date) {
  if (!date || !(date instanceof Date)) return '--';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${month} ${day}, ${hour}:${minute}`;
}

export function formatOffset(hours) {
  if (hours === 0) return 'NOW';

  const absHours = Math.abs(hours);
  const sign = hours > 0 ? '+' : '-';

  if (absHours < 24) return `${sign}${absHours}h`;

  const days = Math.floor(absHours / 24);
  const remainingHours = absHours % 24;
  return `${sign}${days}d ${remainingHours}h`;
}

export function getMaxOffsetHours() {
  return 24 * 31 * 2; // ~2 months in hours
}

export function getDaySuffix(day) {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

