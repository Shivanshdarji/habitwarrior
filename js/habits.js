/* ==========================================================
 * Habit Warrior — Gamification core
 *
 * Habit data model, XP/gold/level math, streak handling,
 * achievements, and localStorage persistence.
 * Emits events that the UI + 3D game subscribe to.
 * ========================================================== */

const STORAGE_KEY = 'habit-warrior:v1';

export const DIFFICULTY_CFG = {
  easy:   { label: 'Slime',  maxHP: 30,  xp: 20,  gold: 5,  attacksToKill: 1 },
  medium: { label: 'Orc',    maxHP: 60,  xp: 50,  gold: 12, attacksToKill: 1 },
  hard:   { label: 'Dragon', maxHP: 120, xp: 120, gold: 30, attacksToKill: 1 },
};

/* Verification modes. Anything other than `manual` means the device
 * must measure progress towards the goal before the habit auto-kills. */
export const TRACKING_MODES = {
  manual:    { label: 'Manual',           unit: '',       goalDefault: 0,    icon: 'check'    },
  distance:  { label: 'GPS distance',     unit: 'km',     goalDefault: 5,    icon: 'run'      },
  steps:     { label: 'Steps (motion)',   unit: 'steps',  goalDefault: 5000, icon: 'dumbbell' },
  focus:     { label: 'Focus time',       unit: 'min',    goalDefault: 25,   icon: 'brain'    },
  stillness: { label: 'Stillness (still phone)', unit: 'min', goalDefault: 10, icon: 'moon'   },
};

const ACHIEVEMENTS = [
  { id: 'first_blood', icon: 'target', name: 'First Strike',     test: s => s.totalKills >= 1 },
  { id: 'streak_3',    icon: 'flame',  name: '3-Day Streak',     test: s => s.bestStreak >= 3 },
  { id: 'streak_7',    icon: 'flame',  name: '7-Day Streak',     test: s => s.bestStreak >= 7 },
  { id: 'streak_30',   icon: 'flame',  name: '30-Day Streak',    test: s => s.bestStreak >= 30 },
  { id: 'level_5',     icon: 'star',   name: 'Apprentice',       test: s => s.level >= 5 },
  { id: 'level_10',    icon: 'shield', name: 'Champion',         test: s => s.level >= 10 },
  { id: 'gold_500',    icon: 'coins',  name: 'Treasury',         test: s => s.gold >= 500 },
  { id: 'kills_25',    icon: 'swords', name: 'Slayer',           test: s => s.totalKills >= 25 },
  { id: 'kills_100',   icon: 'crown',  name: 'Champion of All',  test: s => s.totalKills >= 100 },
];

export function achievementIcon(id) {
  const a = ACHIEVEMENTS.find(x => x.id === id);
  return a ? a.icon : 'award';
}

export class HabitStore {
  constructor() {
    this.listeners = new Set();
    this.state = this._load();
    this._ensureAnalyticsFields();
    this._checkDayRollover();
  }

  /* ------------------------------------------------- pub/sub */
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(evt) { this.listeners.forEach(fn => fn(evt, this.state)); }

  /* ------------------------------------------------- persistence */
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn('Failed to load save', e); }
    return this._defaultState();
  }
  _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
    catch (e) { console.warn('Failed to save', e); }
  }
  _defaultState() {
    return {
      level: 1,
      xp: 0,
      gold: 0,
      power: 10,
      streak: 0,
      bestStreak: 0,
      totalKills: 0,
      totalCompletions: 0,
      totalDamage: 0,
      totalCrits: 0,
      killsByDifficulty: { easy: 0, medium: 0, hard: 0 },
      dailyHistory: {},            // 'YYYY-MM-DD' -> { completions, xp, gold, kills, damage }
      lastActiveDay: this._today(),
      lastCompletionDay: null,
      habits: [],
      achievements: [],
      log: [],
      createdAt: Date.now(),
    };
  }

  /* Migrate older saves that lack the new analytics fields. */
  _ensureAnalyticsFields() {
    const s = this.state;
    if (!s.dailyHistory)        s.dailyHistory = {};
    if (!s.killsByDifficulty)   s.killsByDifficulty = { easy: 0, medium: 0, hard: 0 };
    if (typeof s.totalDamage   !== 'number') s.totalDamage = 0;
    if (typeof s.totalCrits    !== 'number') s.totalCrits = 0;
    if (typeof s.createdAt     !== 'number') s.createdAt = Date.now();
    if (typeof s.verifiedCompletions !== 'number') s.verifiedCompletions = 0;
    for (const h of s.habits) {
      if (!Array.isArray(h.completionDays)) h.completionDays = [];
      if (typeof h.totalCompletions !== 'number') h.totalCompletions = h.streak || 0;
      // Default to manual tracking for legacy habits.
      if (!h.tracking) {
        h.tracking = { mode: 'manual', goal: 0, unit: '', todayProgress: 0 };
      }
    }
  }

  /* Record an entry in dailyHistory and per-habit history. */
  _recordDailyStat(field, amount) {
    const today = this._today();
    const slot = (this.state.dailyHistory[today] ||= {
      completions: 0, xp: 0, gold: 0, kills: 0, damage: 0, crits: 0,
    });
    slot[field] = (slot[field] || 0) + amount;
  }

  reset() {
    this.state = this._defaultState();
    this._save();
    this._emit({ type: 'reset' });
  }

  /* ------------------------------------------------- day handling */
  _today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  _daysBetween(a, b) {
    if (!a || !b) return 0;
    const da = new Date(a + 'T00:00:00');
    const db = new Date(b + 'T00:00:00');
    return Math.round((db - da) / 86400000);
  }
  _checkDayRollover() {
    const today = this._today();
    if (this.state.lastActiveDay !== today) {
      const gap = this._daysBetween(this.state.lastActiveDay, today);
      // If we missed a day (no completion yesterday), break the streak.
      if (this.state.lastCompletionDay && this._daysBetween(this.state.lastCompletionDay, today) > 1) {
        this.state.streak = 0;
      }
      // Reset daily completion + HP on all habits for the new day.
      for (const h of this.state.habits) {
        h.completedToday = false;
        h.hp = DIFFICULTY_CFG[h.difficulty].maxHP;
        if (h.tracking) h.tracking.todayProgress = 0;
      }
      this.state.lastActiveDay = today;
      this._save();
      this._emit({ type: 'day-rollover', gap });
    }
  }
  forceNewDay() {
    // Simulate moving to the next calendar day (for the "New Day" button).
    const next = new Date(this.state.lastActiveDay + 'T00:00:00');
    next.setDate(next.getDate() + 1);
    const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    if (this.state.lastCompletionDay !== this.state.lastActiveDay) {
      this.state.streak = 0;
    }
    this.state.lastActiveDay = iso;
    for (const h of this.state.habits) {
      h.completedToday = false;
      h.hp = DIFFICULTY_CFG[h.difficulty].maxHP;
      if (h.tracking) h.tracking.todayProgress = 0;
    }
    this._save();
    this._emit({ type: 'day-rollover', gap: 1 });
  }

  /* ------------------------------------------------- habit CRUD */
  addHabit({ name, icon, difficulty, tracking }) {
    const cfg = DIFFICULTY_CFG[difficulty] || DIFFICULTY_CFG.medium;
    // Sanitise tracking config.
    let trk = { mode: 'manual', goal: 0, unit: '', todayProgress: 0 };
    if (tracking && TRACKING_MODES[tracking.mode]) {
      const m = TRACKING_MODES[tracking.mode];
      trk = {
        mode: tracking.mode,
        goal: Number(tracking.goal) > 0 ? Number(tracking.goal) : m.goalDefault,
        unit: m.unit,
        todayProgress: 0,
      };
    }
    const habit = {
      id: 'h_' + Math.random().toString(36).slice(2, 10),
      name: name.trim(),
      icon: icon || 'target',
      difficulty,
      hp: cfg.maxHP,
      maxHP: cfg.maxHP,
      streak: 0,
      bestStreak: 0,
      totalCompletions: 0,
      verifiedCompletions: 0,
      completionDays: [],
      completedToday: false,
      tracking: trk,
      createdAt: Date.now(),
      lastCompletionDay: null,
    };
    this.state.habits.push(habit);
    this._save();
    this._emit({ type: 'habit-added', habit });
    return habit;
  }

  /** Push a real-time tracking progress update for a tracked habit.
   * Does NOT auto-complete here — the TrackerHub triggers completion. */
  setTrackingProgress(id, value) {
    const habit = this.state.habits.find(h => h.id === id);
    if (!habit || !habit.tracking || habit.tracking.mode === 'manual') return;
    habit.tracking.todayProgress = Math.max(0, Number(value) || 0);
    this._save();
    this._emit({ type: 'tracking-progress', habitId: id, progress: habit.tracking.todayProgress });
  }

  removeHabit(id) {
    this.state.habits = this.state.habits.filter(h => h.id !== id);
    this._save();
    this._emit({ type: 'habit-removed', id });
  }

  /* ------------------------------------------------- combat */
  attackPower() {
    // Base power scales with streak (combo) and level.
    const streakBonus = Math.min(this.state.streak, 30) * 0.5;
    return this.state.power + streakBonus;
  }

  /** Strike a habit (completing it for the day).
   * @param {object} [opts]
   * @param {boolean} [opts.verified] – true when the device measured the goal. */
  completeHabit(id, opts = {}) {
    this._checkDayRollover();
    const habit = this.state.habits.find(h => h.id === id);
    if (!habit) return null;
    if (habit.completedToday) return { alreadyDone: true, habit };

    // Anti-cheat: a habit configured with device tracking can ONLY be
    // marked complete via a verified call. Block manual strikes.
    const tracked = habit.tracking && habit.tracking.mode !== 'manual';
    if (tracked && !opts.verified) {
      return { blocked: true, reason: 'tracking-required', habit };
    }

    const today = this._today();
    const isCrit = Math.random() < 0.18 + Math.min(this.state.streak, 20) * 0.005;
    const base = this.attackPower();
    const damage = Math.round(base * (isCrit ? 2.2 : 1) + Math.random() * 4);

    habit.hp = Math.max(0, habit.hp - damage);
    habit.completedToday = true;
    habit.lastCompletionDay = today;
    habit.totalCompletions = (habit.totalCompletions || 0) + 1;
    habit.completionDays = habit.completionDays || [];
    if (habit.completionDays[habit.completionDays.length - 1] !== today) {
      habit.completionDays.push(today);
    }

    // Personal habit streak (per habit).
    habit.streak = (habit.streak || 0) + 1;
    if (habit.streak > (habit.bestStreak || 0)) habit.bestStreak = habit.streak;

    if (opts.verified) {
      habit.verifiedCompletions = (habit.verifiedCompletions || 0) + 1;
      this.state.verifiedCompletions = (this.state.verifiedCompletions || 0) + 1;
    }

    // Aggregate analytics.
    this.state.totalDamage = (this.state.totalDamage || 0) + damage;
    if (isCrit) this.state.totalCrits = (this.state.totalCrits || 0) + 1;
    this._recordDailyStat('completions', 1);
    this._recordDailyStat('damage', damage);
    if (isCrit) this._recordDailyStat('crits', 1);

    // Global streak: today must extend yesterday.
    if (this.state.lastCompletionDay) {
      const gap = this._daysBetween(this.state.lastCompletionDay, today);
      if (gap === 0) {
        // Already counted today; keep streak.
      } else if (gap === 1) {
        this.state.streak += 1;
      } else {
        this.state.streak = 1;
      }
    } else {
      this.state.streak = 1;
    }
    if (this.state.streak > this.state.bestStreak) this.state.bestStreak = this.state.streak;
    this.state.lastCompletionDay = today;

    this.state.totalCompletions += 1;
    const result = {
      habit, damage, isCrit, killed: false, rewards: null,
      verified: Boolean(opts.verified),
    };

    if (habit.hp <= 0) {
      result.killed = true;
      result.rewards = this._grantKillRewards(habit);
    }

    this._log({
      type: 'hit', habit: habit.name, damage, crit: isCrit,
      killed: result.killed, verified: result.verified,
    });
    this._checkAchievements();
    this._save();
    this._emit({ type: 'completion', result });
    return result;
  }

  _grantKillRewards(habit) {
    const cfg = DIFFICULTY_CFG[habit.difficulty];
    const xpGain = cfg.xp + Math.floor(this.state.streak * 1.5);
    const goldGain = cfg.gold + Math.floor(this.state.streak * 0.5);
    this.state.xp += xpGain;
    this.state.gold += goldGain;
    this.state.totalKills += 1;
    this.state.killsByDifficulty[habit.difficulty] =
      (this.state.killsByDifficulty[habit.difficulty] || 0) + 1;
    this._recordDailyStat('xp', xpGain);
    this._recordDailyStat('gold', goldGain);
    this._recordDailyStat('kills', 1);

    const leveledUp = [];
    while (this.state.xp >= this.xpForLevel(this.state.level)) {
      this.state.xp -= this.xpForLevel(this.state.level);
      this.state.level += 1;
      this.state.power += 3;
      leveledUp.push(this.state.level);
    }
    return { xp: xpGain, gold: goldGain, leveledUp };
  }

  xpForLevel(level) {
    // Gentle curve: L1->100, L2->180, L3->270 ...
    return Math.floor(100 + (level - 1) * 80 + Math.pow(level - 1, 1.4) * 10);
  }

  /* ------------------------------------------------- achievements */
  _checkAchievements() {
    const s = this.state;
    for (const a of ACHIEVEMENTS) {
      if (s.achievements.includes(a.id)) continue;
      if (a.test(s)) {
        s.achievements.push(a.id);
        this._log({ type: 'achievement', name: a.name });
        this._emit({ type: 'achievement-unlocked', achievement: a });
      }
    }
  }

  allAchievements() {
    return ACHIEVEMENTS.map(a => ({
      ...a,
      unlocked: this.state.achievements.includes(a.id),
    }));
  }

  /* ------------------------------------------------- log */
  _log(entry) {
    entry.time = Date.now();
    this.state.log.unshift(entry);
    this.state.log = this.state.log.slice(0, 60);
  }
}
