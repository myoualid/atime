import { CACHE_TTL_15_MIN_MS, fetchJsonWithCache } from './httpCache.js'

export async function reverseGeocodeNominatim({ latitude, longitude }) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
  const data = await fetchJsonWithCache(url, {
    namespace: 'nominatim-reverse',
    ttlMs: CACHE_TTL_15_MIN_MS,
    timeoutMs: 8000,
  });
  const city =
    data.address?.city || data.address?.town || data.address?.village || '';
  const country = data.address?.country || '';
  return { city, country, raw: data };
}

