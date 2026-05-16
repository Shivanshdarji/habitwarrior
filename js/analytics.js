/* ==========================================================
 * Habit Warrior — Analytics
 *
 * Pure helpers that transform raw store state into shapes the
 * Analytics modal can render directly.
 * ========================================================== */

const DAY_MS = 86400000;

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Build a fixed-length array of recent days (most recent last). */
function lastNDays(n) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    out.push(isoDay(new Date(today.getTime() - i * DAY_MS)));
  }
  return out;
}

/** GitHub-style heatmap for the last 8 weeks. Returns { weeks, max }. */
export function buildHeatmap(state, weeks = 8) {
  const totalDays = weeks * 7;
  const days = lastNDays(totalDays);
  const cells = days.map(date => ({
    date,
    count: state.dailyHistory?.[date]?.completions || 0,
  }));
  // Column-major weeks (each week = 7 days top->bottom Mon..Sun).
  // For simplicity here we just chunk into 7-day blocks chronologically.
  const weeksOut = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeksOut.push(cells.slice(i, i + 7));
  }
  const max = cells.reduce((m, c) => Math.max(m, c.count), 0);
  const total = cells.reduce((s, c) => s + c.count, 0);
  const activeDays = cells.filter(c => c.count > 0).length;
  return { weeks: weeksOut, max, total, activeDays };
}

/** Last 14 days of daily completions for the line/bar series. */
export function dailyCompletionSeries(state, days = 14) {
  const out = lastNDays(days).map(date => ({
    date,
    completions: state.dailyHistory?.[date]?.completions || 0,
    xp:          state.dailyHistory?.[date]?.xp || 0,
    kills:       state.dailyHistory?.[date]?.kills || 0,
    damage:      state.dailyHistory?.[date]?.damage || 0,
  }));
  return out;
}

/** Top habits by total completions. */
export function topHabits(state, limit = 5) {
  return [...state.habits]
    .map(h => ({
      id: h.id,
      name: h.name,
      icon: h.icon,
      difficulty: h.difficulty,
      completions: h.totalCompletions || 0,
      bestStreak: h.bestStreak || 0,
      streak: h.streak || 0,
    }))
    .sort((a, b) => b.completions - a.completions)
    .slice(0, limit);
}

/** High-level numbers for the personal-stats cards. */
export function personalSummary(state) {
  const totalHabits = state.habits.length;
  const totalCompletions = state.totalCompletions || 0;
  const totalKills = state.totalKills || 0;
  const totalDamage = state.totalDamage || 0;
  const totalCrits = state.totalCrits || 0;
  const critRate = totalCompletions > 0 ? (totalCrits / totalCompletions) : 0;
  const completionsToday = state.habits.filter(h => h.completedToday).length;
  const completionRateToday = totalHabits > 0 ? completionsToday / totalHabits : 0;

  // 7-day active rate.
  const last7 = lastNDays(7);
  const activeDays7 = last7.filter(d => (state.dailyHistory?.[d]?.completions || 0) > 0).length;

  return {
    level: state.level,
    xp: state.xp,
    xpNeeded: 0,                  // filled by caller via store.xpForLevel(level)
    gold: state.gold,
    power: state.power,
    streak: state.streak,
    bestStreak: state.bestStreak,
    totalHabits,
    totalCompletions,
    totalKills,
    totalDamage,
    totalCrits,
    critRate,
    completionsToday,
    completionRateToday,
    activeDays7,
    killsByDifficulty: state.killsByDifficulty || { easy: 0, medium: 0, hard: 0 },
    createdAt: state.createdAt || Date.now(),
  };
}

/** Combat efficiency: damage per hit, hits to kill, etc. */
export function combatStats(state) {
  const hits = state.totalCompletions || 0;
  const kills = state.totalKills || 0;
  const damage = state.totalDamage || 0;
  return {
    avgDamage: hits > 0 ? damage / hits : 0,
    hitsPerKill: kills > 0 ? hits / kills : 0,
    totalDamage: damage,
    crits: state.totalCrits || 0,
    critRate: hits > 0 ? (state.totalCrits || 0) / hits : 0,
  };
}
