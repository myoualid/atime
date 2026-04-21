export function createOps(core) {
  const api = core.api;

  return {
    requestLocation: () => api.requestLocation(),

    setClockOffset: (clockId, hours) => api.setClockOffset(clockId, hours),
    resetClock: (clockId) => api.resetClock(clockId),
    resetAllClocks: () => api.resetAllClocks(),

    setOffset: (hours) => api.setOffset(hours),
    reset: () => api.reset(),
  };
}

