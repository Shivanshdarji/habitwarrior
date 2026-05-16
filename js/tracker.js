/* ==========================================================
 * Habit Warrior — Tracker Hub
 *
 * Owns "verified" habit completion. Each tracked habit gets a
 * Session subclass that pulls real measurements from the device:
 *
 *   - DistanceSession   – GPS + haversine
 *   - StepSession       – DeviceMotion accelerometer peak detection
 *   - FocusSession      – tab visibility + user-activity timer
 *   - StillnessSession  – DeviceMotion magnitude must stay below
 *                         a threshold for the full window
 *
 * When a session's `progress` reaches the goal it calls
 * `hub._complete(habit)`, which triggers a verified strike on
 * the store. The user CANNOT mark a tracked habit done manually.
 * ========================================================== */

const TICK_MS = 1000;          // shared session tick cadence

// -------------------------------------------- TrackerHub --------------------
export class TrackerHub {
  constructor({ store, onProgress, onComplete, onError, onStateChange }) {
    this.store = store;
    this.sessions = new Map();   // habitId -> Session instance
    this.cb = { onProgress, onComplete, onError, onStateChange };
  }

  isActive(habitId) { return this.sessions.has(habitId); }

  async start(habit) {
    if (this.sessions.has(habit.id)) return;       // already running
    const mode = habit.tracking?.mode;
    let session;
    try {
      switch (mode) {
        case 'distance':  session = new DistanceSession(habit);   break;
        case 'steps':     session = new StepSession(habit);       break;
        case 'focus':     session = new FocusSession(habit);      break;
        case 'stillness': session = new StillnessSession(habit);  break;
        default:
          throw new Error('Habit is not configured for device tracking.');
      }
      session.onProgress = (p) => this._handleProgress(habit, p);
      session.onError    = (err) => this._handleError(habit, err);
      await session.start();
      this.sessions.set(habit.id, session);
      this.cb.onStateChange?.(habit.id, 'started', session);

      // Seed with whatever progress is already saved for today so a
      // user can resume an in-progress walk across reloads.
      session.setExisting(habit.tracking.todayProgress || 0);
    } catch (err) {
      this._handleError(habit, err);
    }
  }

  stop(habitId) {
    const s = this.sessions.get(habitId);
    if (!s) return;
    try { s.stop(); } catch {}
    this.sessions.delete(habitId);
    this.cb.onStateChange?.(habitId, 'stopped', null);
  }

  stopAll() {
    for (const id of [...this.sessions.keys()]) this.stop(id);
  }

  getSession(habitId) { return this.sessions.get(habitId); }

  /* ----- private ----- */
  _handleProgress(habit, p) {
    this.store.setTrackingProgress(habit.id, p);
    this.cb.onProgress?.(habit.id, p);
    if (p >= (habit.tracking.goal || Infinity)) this._complete(habit);
  }

  _complete(habit) {
    if (!this.sessions.has(habit.id)) return;
    this.stop(habit.id);
    this.cb.onComplete?.(habit);
  }

  _handleError(habit, err) {
    console.error('[tracker]', habit.name, err);
    this.sessions.delete(habit.id);
    this.cb.onError?.(habit.id, err);
    this.cb.onStateChange?.(habit.id, 'error', err);
  }
}

// -------------------------------------------- base Session ------------------
class Session {
  constructor(habit) {
    this.habit = habit;
    this.progress = 0;
    this._existing = 0;
  }
  setExisting(p) { this._existing = p; this._emit(); }
  _emit() { this.onProgress?.(this.progress + this._existing); }
  async start() {}
  stop() {}
}

// -------------------------------------------- DistanceSession ---------------
/** GPS-based distance tracking (km). Uses navigator.geolocation. */
class DistanceSession extends Session {
  async start() {
    if (!('geolocation' in navigator)) {
      throw new Error('Geolocation API not available.');
    }
    this._lastFix = null;
    this._kmDelta = 0;
    this._watchId = navigator.geolocation.watchPosition(
      (pos) => this._onFix(pos),
      (err) => this.onError?.(new Error('GPS error: ' + err.message)),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  }
  stop() {
    if (this._watchId != null) navigator.geolocation.clearWatch(this._watchId);
    this._watchId = null;
  }
  _onFix(pos) {
    const { latitude, longitude, accuracy, speed } = pos.coords;
    // Reject implausibly bad fixes.
    if (accuracy != null && accuracy > 50) return;
    if (this._lastFix) {
      const km = haversineKm(
        this._lastFix.lat, this._lastFix.lon, latitude, longitude,
      );
      // Reject teleport-like jumps faster than 25 m/s (~90 km/h).
      const dt = (pos.timestamp - this._lastFix.t) / 1000;
      if (dt > 0 && (km * 1000) / dt < 25) {
        this._kmDelta += km;
        this.progress = this._kmDelta;
        this._emit();
      }
    }
    this._lastFix = { lat: latitude, lon: longitude, t: pos.timestamp };
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// -------------------------------------------- StepSession -------------------
/** Pedometer based on accelerometer peak detection.
 * Designed for phones held / pocketed; rough but plausible. */
class StepSession extends Session {
  async start() {
    await maybeRequestMotionPermission();
    if (!('DeviceMotionEvent' in window)) {
      throw new Error('DeviceMotion not available — open on a phone.');
    }
    this._steps = 0;
    this._lastPeakAt = 0;
    this._buf = [];
    this._handler = (e) => this._onMotion(e);
    window.addEventListener('devicemotion', this._handler, { passive: true });
  }
  stop() {
    if (this._handler) window.removeEventListener('devicemotion', this._handler);
    this._handler = null;
  }
  _onMotion(e) {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a) return;
    const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
    this._buf.push(mag);
    if (this._buf.length > 8) this._buf.shift();
    // Simple high-pass + peak detection.
    const avg = this._buf.reduce((s, v) => s + v, 0) / this._buf.length;
    const dev = mag - avg;
    const now = performance.now();
    if (dev > 1.6 && now - this._lastPeakAt > 280) {
      this._steps += 1;
      this._lastPeakAt = now;
      this.progress = this._steps;
      this._emit();
    }
  }
}

async function maybeRequestMotionPermission() {
  // iOS Safari 13+ requires a user-gesture-initiated permission prompt.
  const Cls = window.DeviceMotionEvent;
  if (Cls && typeof Cls.requestPermission === 'function') {
    const res = await Cls.requestPermission();
    if (res !== 'granted') throw new Error('Motion permission denied.');
  }
}

// -------------------------------------------- FocusSession ------------------
/** Pure focus time. Counts seconds where the page is VISIBLE and
 * the user has interacted within the last 45 s. */
class FocusSession extends Session {
  async start() {
    this._seconds = 0;
    this._lastActivity = Date.now();
    this._onAct = () => { this._lastActivity = Date.now(); };
    for (const ev of ['mousemove', 'keydown', 'touchstart', 'pointermove']) {
      window.addEventListener(ev, this._onAct, { passive: true });
    }
    this._timer = setInterval(() => this._tick(), TICK_MS);
  }
  stop() {
    clearInterval(this._timer);
    for (const ev of ['mousemove', 'keydown', 'touchstart', 'pointermove']) {
      window.removeEventListener(ev, this._onAct);
    }
  }
  _tick() {
    const idle = Date.now() - this._lastActivity;
    if (document.visibilityState === 'visible' && idle < 45_000) {
      this._seconds += 1;
      this.progress = this._seconds / 60;     // convert to minutes
      this._emit();
    }
  }
}

// -------------------------------------------- StillnessSession --------------
/** Phone must remain still for the entire window. Any spike of
 * acceleration > THRESHOLD restarts the timer.
 * Falls back to a vibration / pointermove watcher on desktop. */
class StillnessSession extends Session {
  async start() {
    await maybeRequestMotionPermission();
    this._seconds = 0;
    this._lastDisturbAt = performance.now();
    this._minutes = 0;

    if ('DeviceMotionEvent' in window) {
      this._handler = (e) => {
        const a = e.acceleration || e.accelerationIncludingGravity;
        if (!a) return;
        const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
        // accelerationIncludingGravity sits around 9.8 at rest; treat
        // anything > +/-1.2 from that as a disturbance.
        const dev = Math.abs(mag - 9.8);
        if (dev > 1.2) this._disturb();
      };
      window.addEventListener('devicemotion', this._handler, { passive: true });
    }

    // Any user interaction also counts as a disturbance — meditation
    // means not touching the device.
    this._onAct = () => this._disturb();
    for (const ev of ['mousemove', 'keydown', 'touchstart', 'pointerdown']) {
      window.addEventListener(ev, this._onAct, { passive: true });
    }

    this._timer = setInterval(() => this._tick(), TICK_MS);
  }
  stop() {
    clearInterval(this._timer);
    if (this._handler) window.removeEventListener('devicemotion', this._handler);
    for (const ev of ['mousemove', 'keydown', 'touchstart', 'pointerdown']) {
      window.removeEventListener(ev, this._onAct);
    }
  }
  _disturb() {
    // Reset only the current run; saved progress stays.
    this._seconds = 0;
    this._lastDisturbAt = performance.now();
    this.progress = 0;
    this._emit();
  }
  _tick() {
    this._seconds += 1;
    // Add accumulated minutes as we cross the boundary.
    this.progress = this._seconds / 60;
    this._emit();
  }
}
