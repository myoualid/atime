import * as tools from '../../shared/tools/index.js';
import { createData } from './data.js';

export function createCore({ signals: signalsGlobal = globalThis.signals } = {}) {
  const { state, signals } = createData({ signals: signalsGlobal });

  function now() {
    const realNow = new Date();
    const hours = state.time.offsetHours;
    if (hours === 0) return realNow;
    return new Date(realNow.getTime() + hours * 60 * 60 * 1000);
  }

  function getClockTime(clockId) {
    const realNow = new Date();
    const offset = state.time.clockOffsets[clockId] || 0;
    if (offset === 0) return realNow;
    return new Date(realNow.getTime() + offset * 60 * 60 * 1000);
  }

  function setClockOffset(clockId, hours) {
    state.time.clockOffsets[clockId] = hours;
    signals.onClockOffsetChanged.dispatch({ clockId, hours });
  }

  function resetClock(clockId) {
    state.time.clockOffsets[clockId] = 0;
    signals.onClockOffsetChanged.dispatch({ clockId, hours: 0 });
  }

  function resetAllClocks() {
    state.time.clockOffsets.moonPhase = 0;
    state.time.clockOffsets.moonrise = 0;
    state.time.clockOffsets.clock24 = 0;
    signals.onClockOffsetChanged.dispatch({ clockId: 'moonPhase', hours: 0 });
    signals.onClockOffsetChanged.dispatch({ clockId: 'moonrise', hours: 0 });
    signals.onClockOffsetChanged.dispatch({ clockId: 'clock24', hours: 0 });
  }

  function setOffset(hours) {
    state.time.offsetHours = hours;
    state.time.isSimulating = hours !== 0;
    signals.onTimeOffsetChanged.dispatch({ hours });
  }

  function reset() {
    state.time.offsetHours = 0;
    state.time.isSimulating = false;
    signals.onTimeOffsetChanged.dispatch({ hours: 0 });
  }

  function getMaxOffset() {
    return tools.time.getMaxOffsetHours();
  }

  function formatDate(date) {
    return tools.time.formatGregorianDate(date ?? now());
  }

  function formatOffset(hours) {
    const h = hours !== undefined ? hours : state.time.offsetHours;
    return tools.time.formatOffset(h);
  }

  async function requestLocation() {
    try {
      const ok = await new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve(false);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => resolve(position),
          () => resolve(false),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });

      if (!ok || ok === true) return false;

      state.location.latitude = ok.coords.latitude;
      state.location.longitude = ok.coords.longitude;
      state.location.isDefault = false;

      try {
        const { city, country } = await tools.geo.reverseGeocodeNominatim({
          latitude: state.location.latitude,
          longitude: state.location.longitude,
        });
        state.location.locationName = city
          ? `${city}, ${country}`
          : `${state.location.latitude.toFixed(2)}°, ${state.location.longitude.toFixed(2)}°`;
      } catch {
        state.location.locationName = `${state.location.latitude.toFixed(
          2
        )}°N, ${state.location.longitude.toFixed(2)}°E`;
      }

      signals.onLocationChanged.dispatch({ ...state.location });
      return true;
    } catch (error) {
      signals.onError.dispatch(error);
      return false;
    }
  }

  const api = {
    now,
    getClockTime,
    setClockOffset,
    resetClock,
    resetAllClocks,
    setOffset,
    reset,
    getMaxOffset,
    formatDate,
    formatOffset,
    requestLocation,
  };

  return { state, signals, api, tools };
}

