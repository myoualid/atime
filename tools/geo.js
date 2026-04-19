export async function reverseGeocodeNominatim({ latitude, longitude }) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Reverse geocode failed: ${response.status}`);
  const data = await response.json();
  const city =
    data.address?.city || data.address?.town || data.address?.village || '';
  const country = data.address?.country || '';
  return { city, country, raw: data };
}

