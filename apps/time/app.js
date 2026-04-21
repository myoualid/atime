import { createCore } from './core.js';
import { createOps } from './ops.js';
import { start } from './ui.js';



const core = createCore();

const operators = createOps(core);

const TimeSimulator = {
  get offsetHours() {
    return core.state.time.offsetHours ?? 0;
  },
  get isSimulating() {
    return core.state.time.isSimulating ?? false;
  },
  get clockOffsets() {
    return core.state.time.clockOffsets ?? {};
  },

  now() {
    return core.api.now();
  },
  getClockTime(clockId) {
    return core.api.getClockTime(clockId);
  },
  setClockOffset(clockId, hours) {
    operators.setClockOffset(clockId, hours);
  },
  resetClock(clockId) {
    operators.resetClock(clockId);
  },
  resetAllClocks() {
    operators.resetAllClocks();
  },
  setOffset(hours) {
    operators.setOffset(hours);
  },
  reset() {
    operators.reset();
  },
  getMaxOffset() {
    return core.api.getMaxOffset();
  },
  formatDate(date) {
    return core.api.formatDate(date);
  },
  formatOffset(offsetHours) {
    return core.api.formatOffset(offsetHours);
  },
};

const LocationService = {
  get latitude() {
    return core.state.location.latitude;
  },
  get longitude() {
    return core.state.location.longitude;
  },
  get timezone() {
    return core.state.location.timezone;
  },
  get locationName() {
    return core.state.location.locationName;
  },
  get isDefault() {
    return core.state.location.isDefault;
  },
  async requestLocation() {
    return operators.requestLocation();
  },
};


const ui = await start({ core, ops: operators, services: { TimeSimulator, LocationService } });

document.body.appendChild(ui.root.dom);