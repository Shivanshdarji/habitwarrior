/* ==========================================================
 * Habit Warrior — Floating world-space HTML overlays
 *
 * Cheap "billboard" UI: HTML elements that the game pins to
 * world-space positions each frame using the camera. Used for
 * health bars, name tags, and the player's combo banner.
 * ========================================================== */

import * as THREE from 'three';

export class FloatingLayer {
  constructor(container, camera, renderer) {
    this.container = container;
    this.camera = camera;
    this.renderer = renderer;
    this.entries = new Map();
    this._tmpVec = new THREE.Vector3();
  }

  /**
   * Add or replace an overlay entry.
   * @param {string} id stable identifier
   * @param {{ kind:'health'|'tag'|'combo', name?:string, role?:string }} opts
   */
  add(id, opts) {
    if (this.entries.has(id)) this.remove(id);
    const el = document.createElement('div');
    el.className = `worldlabel ${opts.kind} ${opts.role || ''}`.trim();

    if (opts.kind === 'health') {
      el.innerHTML = `
        <div class="wl-name"></div>
        <div class="wl-bar"><div class="wl-fill"></div></div>
      `;
    } else if (opts.kind === 'tag') {
      el.innerHTML = `<div class="wl-name"></div><div class="wl-sub"></div>`;
    }

    this.container.appendChild(el);
    this.entries.set(id, { el, opts, offset: 1.7, hp: 1, name: opts.name || '', sub: '' });
    return el;
  }

  remove(id) {
    const entry = this.entries.get(id);
    if (entry) {
      entry.el.remove();
      this.entries.delete(id);
    }
  }

  setHealth(id, ratio, name) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.hp = Math.max(0, Math.min(1, ratio));
    entry.name = name ?? entry.name;
  }

  setTag(id, name, sub) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.name = name ?? entry.name;
    entry.sub = sub ?? entry.sub;
  }

  /** Reposition all overlays for a frame. `targets` maps id -> THREE.Object3D. */
  update(targets) {
    const { width, height } = this.renderer.domElement;
    const w = window.innerWidth;
    const h = window.innerHeight;
    void width; void height;

    for (const [id, entry] of this.entries) {
      const target = targets.get(id);
      if (!target) {
        entry.el.style.opacity = '0';
        continue;
      }
      this._tmpVec.copy(target.position);
      this._tmpVec.y += entry.offset;
      const projected = this._tmpVec.clone().project(this.camera);
      // Behind the camera? hide.
      if (projected.z > 1) {
        entry.el.style.opacity = '0';
        continue;
      }
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-projected.y * 0.5 + 0.5) * h;
      entry.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      entry.el.style.opacity = '1';

      // Fill content.
      if (entry.opts.kind === 'health') {
        const name = entry.el.querySelector('.wl-name');
        if (name && name.textContent !== entry.name) name.textContent = entry.name;
        const fill = entry.el.querySelector('.wl-fill');
        if (fill) fill.style.width = `${(entry.hp * 100).toFixed(1)}%`;
      } else if (entry.opts.kind === 'tag') {
        const name = entry.el.querySelector('.wl-name');
        const sub  = entry.el.querySelector('.wl-sub');
        if (name && name.textContent !== entry.name) name.textContent = entry.name;
        if (sub  && sub.textContent  !== entry.sub)  sub.textContent  = entry.sub;
      }
    }
  }
}
