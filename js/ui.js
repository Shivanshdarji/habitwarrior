/* ==========================================================
 * Habit Warrior — UI module
 *
 * Renders the HUD/panels/modal and turns DOM events into
 * calls on the HabitStore + Game.
 * ========================================================== */

import { DIFFICULTY_CFG, TRACKING_MODES, achievementIcon } from './habits.js?v=8';
import { icon, hasIcon, HABIT_ICON_CHOICES } from './icons.js?v=8';

export class UI {
  constructor({ store, game, sound }) {
    this.store = store;
    this.game = game;
    this.sound = sound;

    // Local modal draft state — initialize FIRST so even if a later
    // step throws, _openModal() can still display the modal.
    this.modalDraft = {
      name: '', icon: HABIT_ICON_CHOICES[0], difficulty: 'easy',
      trackingMode: 'manual',
      trackingGoal: TRACKING_MODES.manual.goalDefault,
    };

    // Optional tracker hub – wired by main.js after construction.
    this.tracker = null;

    // Expose globals so the buttons' inline onclick failsafes work
    // regardless of whether addEventListener wiring succeeds.
    window.openHabitModal = () => this._openModal();
    window.closeHabitModal = () => this._closeModal();
    window.submitHabit = () => this._submitHabit();

    try {
      this._hydrateStaticIcons();
      this._cacheDom();
      this._buildIconPicker();
      this._wireEvents();
      this.store.subscribe((evt, state) => this._onStoreEvent(evt, state));
      this.renderAll();
      console.info('[Habit Warrior] UI ready');
    } catch (err) {
      console.error('[Habit Warrior] UI init failed:', err);
      throw err;
    }
  }

  /* ------------------------------------------------- icon hydration */
  // Walk the DOM once and replace any [data-icon] slots with SVG markup.
  _hydrateStaticIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.getAttribute('data-icon');
      if (!name || !hasIcon(name)) return;
      el.innerHTML = icon(name);
      el.removeAttribute('data-icon');
    });
  }

  /* ------------------------------------------------- dom refs */
  _cacheDom() {
    const $ = (sel) => document.querySelector(sel);
    this.el = {
      level: $('#stat-level'),
      xp: $('#stat-xp'),
      xpNeeded: $('#stat-xp-needed'),
      xpFill: $('#xp-fill'),
      gold: $('#stat-gold'),
      streak: $('#stat-streak'),
      power: $('#stat-power'),

      habitList: $('#habit-list'),
      emptyState: $('#empty-state'),
      achievementList: $('#achievement-list'),
      battleLog: $('#battle-log'),

      btnAdd: $('#btn-add-habit'),
      btnCamera: $('#btn-camera'),
      btnFocus: $('#btn-focus'),
      btnNewDay: $('#btn-reset-day'),
      btnResetAll: $('#btn-reset-all'),
      cameraLabel: $('#camera-label'),
      leaderboard: $('#leaderboard'),

      modal: $('#habit-modal'),
      modalTitle: $('#modal-title'),
      form: $('#habit-form'),
      fieldName: $('#field-name'),
      iconPicker: $('#icon-picker'),
      diffPicker: $('#difficulty-picker'),
      trackPicker: $('#tracking-picker'),
      goalField: $('#tracking-goal-field'),
      goalInput: $('#field-goal'),
      goalUnit: $('#goal-unit'),
      btnCancel: $('#btn-cancel-modal'),
      btnCloseModal: $('#btn-close-modal'),

      floaters: $('#floaters'),
      levelup: $('#levelup'),
      levelupNum: $('#levelup-num'),
    };
  }

  _buildIconPicker() {
    this.el.iconPicker.innerHTML = HABIT_ICON_CHOICES.map(
      (name) => `<button type="button" class="icon-pill" data-name="${name}" title="${name}">${icon(name)}</button>`
    ).join('');
  }

  /* ------------------------------------------------- events */
  _wireEvents() {
    // Use event delegation on document so clicks anywhere on the
    // "New Habit" button (including its inner SVG) are caught, even
    // if the cached DOM reference somehow becomes stale.
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btn-add-habit')) this._openModal();
      if (e.target.closest('#btn-cancel-modal')) this._closeModal();
      if (e.target.closest('#btn-close-modal')) this._closeModal();
    });
    this.el.modal.addEventListener('click', (e) => {
      if (e.target === this.el.modal) this._closeModal();
    });

    // Icon picker.
    this.el.iconPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.icon-pill');
      if (!btn) return;
      this.modalDraft.icon = btn.dataset.name;
      this._refreshIconPicker();
    });

    // Difficulty picker.
    this.el.diffPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-diff]');
      if (!btn) return;
      this.modalDraft.difficulty = btn.dataset.diff;
      this._refreshDiffPicker();
    });

    // Tracking mode picker.
    this.el.trackPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      const mode = btn.dataset.mode;
      this.modalDraft.trackingMode = mode;
      const cfg = TRACKING_MODES[mode];
      this.modalDraft.trackingGoal = cfg.goalDefault;
      this._refreshTrackPicker();
    });
    this.el.goalInput.addEventListener('input', () => {
      const v = Number(this.el.goalInput.value);
      if (v > 0) this.modalDraft.trackingGoal = v;
    });

    // Both: explicit button click AND form-submit (Enter key) route
    // through the same method so we don't rely on form semantics.
    const btnSubmit = document.getElementById('btn-submit-habit');
    if (btnSubmit) btnSubmit.addEventListener('click', () => this._submitHabit());
    this.el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._submitHabit();
    });

    // Habit actions delegated.
    this.el.habitList.addEventListener('click', (e) => {
      const card = e.target.closest('[data-habit-id]');
      if (!card) return;
      const id = card.dataset.habitId;
      if (e.target.closest('.strike')) {
        this.completeHabit(id);
      } else if (e.target.closest('.delete')) {
        if (this.tracker?.isActive(id)) this.tracker.stop(id);
        this.store.removeHabit(id);
        this.game.removeEnemy(id);
        this.sound?.play('cancel');
      } else if (e.target.closest('.track-toggle')) {
        this._toggleTracking(id);
      }
    });

    // Bottom buttons.
    this.el.btnFocus.addEventListener('click', () => this.game.focusCamera());
    if (this.el.btnCamera) {
      this.el.btnCamera.addEventListener('click', () => {
        const mode = this.game.toggleCameraMode();
        if (this.el.cameraLabel) {
          this.el.cameraLabel.textContent = mode === 'follow' ? 'Follow' : 'Orbit';
        }
      });
    }
    this.el.btnNewDay.addEventListener('click', () => {
      this.store.forceNewDay();
      this._resyncEnemies();
      this.sound?.play('day');
    });
    this.el.btnResetAll.addEventListener('click', () => {
      if (!confirm('Wipe all habits, progress, and achievements?')) return;
      for (const h of this.store.state.habits) this.game.removeEnemy(h.id);
      this.store.reset();
      this.sound?.play('cancel');
    });

    // Combo banner: update the camera button label when game toggles.
    this.game.on('onCombo', (combo) => {
      if (!this._lastShownCombo) this._lastShownCombo = 0;
      // Floating combo banner at the centre when combo grows.
      if (combo > this._lastShownCombo && combo >= 2) {
        this._floater(`${combo}× COMBO`, window.innerWidth / 2, window.innerHeight * 0.32, 'kill');
      }
      this._lastShownCombo = combo;
    });

    // Click in 3D scene also completes habit.
    this.game.on('onEnemyClick', (habitId) => this.completeHabit(habitId));

    // Keyboard: ESC to close modal.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.modal.hidden) this._closeModal();
    });
  }

  /* ------------------------------------------------- gameplay action */
  completeHabit(id) {
    const habit = this.store.state.habits.find(h => h.id === id);
    if (!habit || habit.completedToday) {
      this.sound?.play('cancel');
      return;
    }

    const result = this.store.completeHabit(id);
    if (!result || result.alreadyDone) return;

    // Tracked habits cannot be manually struck — show feedback instead.
    if (result.blocked) {
      this.sound?.play('cancel');
      const mode = TRACKING_MODES[habit.tracking?.mode];
      const where = this.game.worldToScreen({ x: 0, y: 1, z: 0 });
      this._floater(`Need ${habit.tracking.goal} ${habit.tracking.unit || ''}`,
        where?.x || window.innerWidth / 2,
        where?.y || window.innerHeight / 2, 'kill');
      return;
    }

    const hitPos = this.game.hitEnemy(id, result.damage);
    this.sound?.play(result.isCrit ? 'crit' : 'hit');

    if (hitPos) {
      const screen = this.game.worldToScreen(hitPos);
      this._floater(`-${result.damage}`, screen.x, screen.y, result.isCrit ? 'crit' : 'dmg');
    }

    if (result.killed) {
      setTimeout(() => {
        const killPos = this.game.killEnemy(id);
        this.sound?.play('kill');
        if (killPos) {
          const s = this.game.worldToScreen(killPos);
          this._floater('Defeated', s.x, s.y - 20, 'kill');
          this._floater(`+${result.rewards.xp} XP`, s.x - 36, s.y + 18, 'xp');
          this._floater(`+${result.rewards.gold} G`, s.x + 36, s.y + 18, 'gold');
        }
        if (result.rewards.leveledUp.length) {
          for (const lvl of result.rewards.leveledUp) {
            setTimeout(() => this._showLevelUp(lvl), 280);
          }
          this.sound?.play('levelup');
        }
      }, 260);
    }

    this.renderHabitList();
    this.renderStats();
    this.renderLog();
  }

  /* ------------------------------------------------- store events */
  _onStoreEvent(evt) {
    switch (evt.type) {
      case 'reset':
      case 'day-rollover':
        this.renderAll();
        break;
      case 'habit-added':
      case 'habit-removed':
        this.renderHabitList();
        break;
      case 'achievement-unlocked':
        this.renderAchievements();
        this.sound?.play('achieve');
        break;
    }
  }

  /* ------------------------------------------------- spawn sync */
  _resyncEnemies() {
    for (const h of this.store.state.habits) {
      this.game.removeEnemy(h.id);
      if (!h.completedToday) this.game.spawnEnemy(h);
    }
  }

  syncInitialEnemies() {
    for (const h of this.store.state.habits) {
      if (!h.completedToday) this.game.spawnEnemy(h);
    }
  }

  /* ------------------------------------------------- submit */
  _submitHabit() {
    try {
      const name = (this.el.fieldName.value || '').trim();
      if (!name) {
        this.el.fieldName.focus();
        return;
      }
      const mode = this.modalDraft.trackingMode || 'manual';
      const habit = this.store.addHabit({
        name,
        icon: this.modalDraft.icon,
        difficulty: this.modalDraft.difficulty,
        tracking: mode === 'manual' ? null : {
          mode, goal: Number(this.modalDraft.trackingGoal) || TRACKING_MODES[mode].goalDefault,
        },
      });
      console.info('[Habit Warrior] habit added:', habit);
      try { this.game.spawnEnemy(habit); } catch (err) {
        console.error('[Habit Warrior] spawnEnemy failed (habit still saved):', err);
      }
      this.sound?.play('spawn');
      this._closeModal();
    } catch (err) {
      console.error('[Habit Warrior] submitHabit failed:', err);
      alert('Could not add habit — see console for details.');
    }
  }

  /* ------------------------------------------------- tracker hub wiring */
  setTracker(tracker) {
    this.tracker = tracker;
  }

  _toggleTracking(habitId) {
    if (!this.tracker) return;
    const habit = this.store.state.habits.find(h => h.id === habitId);
    if (!habit || habit.completedToday) return;
    if (this.tracker.isActive(habitId)) {
      this.tracker.stop(habitId);
    } else {
      this.tracker.start(habit);
      this.sound?.play('spawn');
    }
    this.renderHabitList();
  }

  /** Called by main.js when a tracked habit hits its goal. */
  onTrackingComplete(habit) {
    if (habit.completedToday) return;
    const result = this.store.completeHabit(habit.id, { verified: true });
    if (!result || result.alreadyDone || result.blocked) {
      this.renderHabitList();
      return;
    }
    const hitPos = this.game.hitEnemy(habit.id, result.damage);
    this.sound?.play(result.isCrit ? 'crit' : 'hit');
    if (hitPos) {
      const screen = this.game.worldToScreen(hitPos);
      this._floater(`VERIFIED -${result.damage}`, screen.x, screen.y, 'crit');
    }
    if (result.killed) {
      setTimeout(() => {
        const killPos = this.game.killEnemy(habit.id);
        this.sound?.play('kill');
        if (killPos) {
          const s = this.game.worldToScreen(killPos);
          this._floater('Goal reached', s.x, s.y - 20, 'kill');
          this._floater(`+${result.rewards.xp} XP`, s.x - 36, s.y + 18, 'xp');
          this._floater(`+${result.rewards.gold} G`, s.x + 36, s.y + 18, 'gold');
        }
        for (const lvl of result.rewards.leveledUp) {
          setTimeout(() => this._showLevelUp(lvl), 280);
        }
      }, 260);
    }
    this.renderHabitList();
    this.renderStats();
    this.renderLog();
  }

  onTrackingProgress(habitId /*, value */) {
    // Avoid thrashing the entire list — patch only the affected card.
    const card = this.el.habitList.querySelector(`[data-habit-id="${habitId}"]`);
    if (!card) return this.renderHabitList();
    const habit = this.store.state.habits.find(h => h.id === habitId);
    if (!habit) return;
    const t = habit.tracking;
    const pct = t.goal > 0 ? Math.min(100, (t.todayProgress / t.goal) * 100) : 0;
    const bar = card.querySelector('.track-fill');
    if (bar) bar.style.width = pct + '%';
    const label = card.querySelector('.track-value');
    if (label) label.textContent = formatProgress(t.todayProgress, t.goal, t.unit);
  }

  onTrackingError(habitId, err) {
    this.renderHabitList();
    alert('Could not start tracking: ' + (err?.message || err));
  }

  onTrackingState(habitId /*, state */) {
    this.renderHabitList();
  }

  /* ------------------------------------------------- modal */
  _openModal() {
    this.modalDraft = {
      name: '', icon: HABIT_ICON_CHOICES[0], difficulty: 'easy',
      trackingMode: 'manual', trackingGoal: TRACKING_MODES.manual.goalDefault,
    };
    this.el.fieldName.value = '';
    this.el.modalTitle.textContent = 'New Habit';
    this._refreshIconPicker();
    this._refreshDiffPicker();
    this._refreshTrackPicker();
    this.el.modal.hidden = false;
    setTimeout(() => this.el.fieldName.focus(), 50);
  }
  _closeModal() {
    this.el.modal.hidden = true;
  }
  _refreshIconPicker() {
    for (const btn of this.el.iconPicker.querySelectorAll('.icon-pill')) {
      btn.classList.toggle('active', btn.dataset.name === this.modalDraft.icon);
    }
  }
  _refreshDiffPicker() {
    for (const btn of this.el.diffPicker.querySelectorAll('button[data-diff]')) {
      btn.classList.toggle('active', btn.dataset.diff === this.modalDraft.difficulty);
    }
  }
  _refreshTrackPicker() {
    const mode = this.modalDraft.trackingMode;
    const cfg = TRACKING_MODES[mode];
    for (const btn of this.el.trackPicker.querySelectorAll('button[data-mode]')) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    }
    if (mode === 'manual') {
      this.el.goalField.hidden = true;
    } else {
      this.el.goalField.hidden = false;
      this.el.goalUnit.textContent = cfg.unit;
      this.el.goalInput.value = this.modalDraft.trackingGoal ?? cfg.goalDefault;
      // Tune step size for numeric niceness.
      this.el.goalInput.step = cfg.unit === 'km' ? '0.5' : (cfg.unit === 'min' ? '1' : '100');
      this.el.goalInput.min = cfg.unit === 'km' ? '0.5' : '1';
    }
  }

  /* ------------------------------------------------- renders */
  renderAll() {
    this.renderStats();
    this.renderHabitList();
    this.renderAchievements();
    this.renderLog();
  }

  renderStats() {
    const s = this.store.state;
    const need = this.store.xpForLevel(s.level);
    this.el.level.textContent = s.level;
    this.el.xp.textContent = s.xp;
    this.el.xpNeeded.textContent = need;
    this.el.xpFill.style.width = `${Math.min(100, (s.xp / need) * 100)}%`;
    this.el.gold.textContent = s.gold;
    this.el.streak.textContent = s.streak;
    this.el.power.textContent = Math.round(this.store.attackPower());
  }

  renderHabitList() {
    const list = this.el.habitList;
    const habits = this.store.state.habits;
    list.innerHTML = '';

    if (habits.length === 0) {
      list.appendChild(this.el.emptyState);
      this.el.emptyState.hidden = false;
      return;
    }
    this.el.emptyState.hidden = true;

    for (const h of habits) {
      const cfg = DIFFICULTY_CFG[h.difficulty];
      const hpPct = Math.max(0, (h.hp / cfg.maxHP) * 100);
      const iconSvg = hasIcon(h.icon) ? icon(h.icon) : icon('target');
      const li = document.createElement('li');
      li.className = 'habit-card' + (h.completedToday ? ' completed' : '');
      li.dataset.habitId = h.id;
      li.dataset.diff = h.difficulty;

      const t = h.tracking;
      const tracked = t && t.mode && t.mode !== 'manual';
      const tCfg = tracked ? TRACKING_MODES[t.mode] : null;
      const pct = tracked && t.goal > 0
        ? Math.min(100, (t.todayProgress / t.goal) * 100) : 0;
      const isActive = tracked && this.tracker?.isActive(h.id);

      // The verification chip in the meta row.
      const trackChip = tracked
        ? `<span class="pill track ${isActive ? 'live' : ''}">${icon(tCfg.icon, { size: 10 })}
             ${escapeHtml(tCfg.label)}
             ${isActive ? '<i class="dot"></i>' : ''}
           </span>`
        : '';

      // Tracked habits get a progress bar + Start/Stop button instead of strike.
      const trackBlock = tracked && !h.completedToday ? `
        <div class="track-block">
          <div class="track-bar"><div class="track-fill" style="width:${pct}%"></div></div>
          <div class="track-row">
            <span class="track-value">${formatProgress(t.todayProgress, t.goal, t.unit)}</span>
            <span class="track-hint">${isActive ? 'Tracking live' : 'Verified by device'}</span>
          </div>
        </div>` : '';

      const strikeBtn = tracked
        ? (h.completedToday
            ? `<button class="habit-action strike" disabled title="Completed">${icon('check')}</button>`
            : `<button class="habit-action track-toggle ${isActive ? 'live' : ''}"
                  title="${isActive ? 'Stop tracking' : 'Start tracking'}">
                  ${icon(isActive ? 'x' : 'target')}
               </button>`)
        : `<button class="habit-action strike"
              title="${h.completedToday ? 'Completed for today' : 'Complete'}"
              ${h.completedToday ? 'disabled' : ''}>${icon('check')}</button>`;

      li.innerHTML = `
        <div class="habit-icon">${iconSvg}</div>
        <div class="habit-body">
          <div class="habit-name">${escapeHtml(h.name)}</div>
          <div class="habit-meta">
            <span class="pill">${cfg.label}</span>
            <span class="pill mono">${h.hp}/${cfg.maxHP} HP</span>
            <span class="pill streak">${icon('flame', { size: 10 })} ${h.streak || 0}</span>
            ${trackChip}
          </div>
          <div class="hp-bar"><div class="hp-fill" style="width:${hpPct}%"></div></div>
          ${trackBlock}
        </div>
        <div class="habit-actions">
          ${strikeBtn}
          <button class="habit-action delete" title="Delete">${icon('trash')}</button>
        </div>
      `;
      list.appendChild(li);
    }
  }

  renderLeaderboard(bots, state) {
    if (!this.el.leaderboard) return;
    // Throttle: render at most every 350ms.
    const now = performance.now();
    if (this._lastLBRender && now - this._lastLBRender < 350) return;
    this._lastLBRender = now;

    const entries = [
      {
        name: 'You',
        kills: state.totalKills,
        level: state.level,
        streak: state.streak,
        isPlayer: true,
      },
      ...bots.map(b => ({
        name: b.name, kills: b.kills, level: b.level, streak: b.streak,
        isPlayer: false,
      })),
    ];
    entries.sort((a, b) => b.kills - a.kills || b.level - a.level);

    this.el.leaderboard.innerHTML = '';
    entries.forEach((e, i) => {
      const li = document.createElement('li');
      li.className = 'lb-row' + (e.isPlayer ? ' lb-you' : '');
      li.innerHTML = `
        <span class="lb-rank">#${i + 1}</span>
        <span class="lb-name">${escapeHtml(e.name)}${e.isPlayer ? ' <em>(you)</em>' : ''}</span>
        <span class="lb-meta">
          <span class="lb-pill" title="Level">Lv ${e.level}</span>
          <span class="lb-pill" title="Kills">${e.kills}</span>
        </span>
      `;
      this.el.leaderboard.appendChild(li);
    });
  }

  renderAchievements() {
    const list = this.el.achievementList;
    list.innerHTML = '';
    for (const a of this.store.allAchievements()) {
      const iconName = achievementIcon(a.id);
      const li = document.createElement('li');
      li.className = 'ach' + (a.unlocked ? ' unlocked' : '');
      li.title = a.unlocked ? a.name : 'Locked';
      li.innerHTML = `
        <div class="ach-icon">${icon(iconName, { size: 22 })}</div>
        <div class="ach-name">${escapeHtml(a.name)}</div>
      `;
      list.appendChild(li);
    }
  }

  renderLog() {
    const list = this.el.battleLog;
    list.innerHTML = '';
    const entries = this.store.state.log.slice(0, 12);
    for (const entry of entries) {
      const li = document.createElement('li');
      const time = formatTime(entry.time);
      if (entry.type === 'hit') {
        const cls = entry.killed ? 'kill' : (entry.crit ? 'crit' : '');
        li.className = cls;
        const verb = entry.killed
          ? `defeated (${entry.damage})`
          : entry.crit
            ? `critical ${entry.damage}`
            : `${entry.damage} dmg`;
        li.innerHTML = `<span class="when">${time}</span>${escapeHtml(entry.habit)} — ${verb}`;
      } else if (entry.type === 'achievement') {
        li.innerHTML = `<span class="when">${time}</span>Unlocked: ${escapeHtml(entry.name)}`;
      }
      list.appendChild(li);
    }
  }

  /* ------------------------------------------------- floaters & FX */
  _floater(text, x, y, cls) {
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.el.floaters.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  _showLevelUp(level) {
    this.el.levelupNum.textContent = level;
    this.el.levelup.hidden = false;
    const inner = this.el.levelup.querySelector('.levelup-inner');
    inner.style.animation = 'none';
    void inner.offsetHeight;
    inner.style.animation = '';
    setTimeout(() => { this.el.levelup.hidden = true; }, 2600);
  }
}

/* ------------------------------------------------- helpers */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function formatTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function formatProgress(value, goal, unit) {
  const fmt = (n) => unit === 'km'
    ? n.toFixed(2)
    : unit === 'min'
      ? n.toFixed(1)
      : String(Math.floor(n));
  return `${fmt(value)} / ${fmt(goal)} ${unit}`.trim();
}
