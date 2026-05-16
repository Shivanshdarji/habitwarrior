/* ==========================================================
 * Habit Warrior — Arena tracker
 *
 * Samples player + bot stats periodically so the Analytics
 * "Arena" tab can show kill-progression charts over the
 * current session.
 * ========================================================== */

const SAMPLE_INTERVAL_MS = 5000;
const MAX_SAMPLES = 60;            // 5 minutes of history at 5s cadence

export class ArenaTracker {
  constructor({ store, bots }) {
    this.store = store;
    this.bots = bots;
    this.samples = [];             // [{ t, player:{kills,level}, bots:[{name,kills,level}] }]
    this.startedAt = Date.now();
    this._sample();                // seed t=0
    this._timer = setInterval(() => this._sample(), SAMPLE_INTERVAL_MS);
  }

  stop() { clearInterval(this._timer); }

  _sample() {
    const t = Date.now() - this.startedAt;
    this.samples.push({
      t,
      player: {
        kills: this.store.state.totalKills,
        level: this.store.state.level,
      },
      bots: this.bots.map(b => ({
        name: b.name, kills: b.kills, level: b.level,
      })),
    });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  /** Build series ready for charts.drawLines() for player + each bot. */
  killSeries() {
    if (this.samples.length === 0) return [];
    const labelFor = (ms) => {
      const s = Math.round(ms / 1000);
      if (s < 60) return `${s}s`;
      return `${Math.floor(s / 60)}m${(s % 60).toString().padStart(2, '0')}`;
    };
    const playerPoints = this.samples.map(s => ({ label: labelFor(s.t), value: s.player.kills }));

    const series = [
      { label: 'You', color: '#c89b5b', fill: true, points: playerPoints },
    ];

    // Find the union of bot names across samples (in case bots were added later).
    const names = new Set();
    for (const s of this.samples) for (const b of s.bots) names.add(b.name);

    const palette = ['#7a85a8', '#6b9b7e', '#b56a72', '#8d7ab5', '#9c5e3e'];
    let i = 0;
    for (const name of names) {
      const pts = this.samples.map(s => {
        const b = s.bots.find(x => x.name === name);
        return { label: labelFor(s.t), value: b ? b.kills : 0 };
      });
      series.push({ label: name, color: palette[i % palette.length], fill: false, points: pts });
      i++;
    }
    return series;
  }

  /** Current standings, sorted by kills. */
  leaderboard() {
    const entries = [
      { name: 'You', kills: this.store.state.totalKills, level: this.store.state.level, streak: this.store.state.streak, isPlayer: true },
      ...this.bots.map(b => ({ name: b.name, kills: b.kills, level: b.level, streak: b.streak || 0, isPlayer: false })),
    ];
    entries.sort((a, b) => b.kills - a.kills || b.level - a.level);
    return entries;
  }

  rank() {
    const lb = this.leaderboard();
    return lb.findIndex(e => e.isPlayer) + 1;
  }
}
