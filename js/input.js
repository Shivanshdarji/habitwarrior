/* ==========================================================
 * Habit Warrior — Input
 *
 * Centralised keyboard + mouse / pointer-lock state. The game
 * loop polls `keys` / consumes `wasPressed` each frame.
 * ========================================================== */

export class Input {
  constructor() {
    this.keys = new Set();          // currently-held keys (lowercased)
    this._pressedThisFrame = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, leftDown: false };
    this._pendingClick = false;     // a click happened since last poll
    this.enabled = true;

    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup',   (e) => this._onKeyUp(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));
    window.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mouseup',   (e) => this._onMouseUp(e));
    window.addEventListener('blur', () => { this.keys.clear(); });
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    // Ignore typing in form fields.
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

    const k = e.key.toLowerCase();
    if (!this.keys.has(k)) this._pressedThisFrame.add(k);
    this.keys.add(k);

    // Prevent default scroll for movement keys.
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
  }

  _onMouseMove(e) {
    this.mouse.dx = e.clientX - this.mouse.x;
    this.mouse.dy = e.clientY - this.mouse.y;
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
  }

  _onMouseDown(e) {
    if (e.button === 0) {
      this.mouse.leftDown = true;
      this._pendingClick = true;
    }
  }

  _onMouseUp(e) {
    if (e.button === 0) this.mouse.leftDown = false;
  }

  /* ------------------------------------------------- query helpers */
  isDown(k)   { return this.keys.has(k.toLowerCase()); }

  /** Returns true once per key-press (consumed). */
  wasPressed(k) {
    const key = k.toLowerCase();
    if (this._pressedThisFrame.has(key)) {
      this._pressedThisFrame.delete(key);
      return true;
    }
    return false;
  }

  /** Consume any pending left-click. */
  consumeClick() {
    if (this._pendingClick) {
      this._pendingClick = false;
      return true;
    }
    return false;
  }

  /** Movement input vector in screen-XY-as-game-XZ. */
  movement() {
    let x = 0, z = 0;
    if (this.isDown('w') || this.isDown('arrowup'))    z -= 1;
    if (this.isDown('s') || this.isDown('arrowdown'))  z += 1;
    if (this.isDown('a') || this.isDown('arrowleft'))  x -= 1;
    if (this.isDown('d') || this.isDown('arrowright')) x += 1;
    const len = Math.hypot(x, z);
    if (len > 0) { x /= len; z /= len; }
    return { x, z };
  }
}
