/* ==========================================================
 * Habit Warrior — Analytics UI controller
 *
 * Owns the open/close lifecycle of the analytics modal and
 * renders both the Personal and Arena tabs from current state.
 * ========================================================== */

import {
  personalSummary, combatStats, buildHeatmap,
  dailyCompletionSeries, topHabits,
} from './analytics.js?v=8';
import { drawBars, drawLines, drawDonut, drawHeatmap } from './charts.js?v=8';
import { icon } from './icons.js?v=8';

const DIFF_COLOR = {
  easy:   '#6b9b7e',
  medium: '#c89b5b',
  hard:   '#b56a72',
};

export class AnalyticsUI {
  constructor({ store, tracker }) {
    this.store = store;
    this.tracker = tracker;
    this.activeTab = 'personal';
    this._isOpen = false;

    this.modal = document.getElementById('analytics-modal');
    this.tabs  = this.modal.querySelectorAll('.tab-btn');
    this.panes = this.modal.querySelectorAll('.tab-pane');

    // Expose global so the inline onclick failsafe works.
    window.openAnalytics  = () => this.open();
    window.closeAnalytics = () => this.close();

    this._wire();
  }

  _wire() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btn-analytics')) this.open();
      if (e.target.closest('#btn-close-analytics')) this.close();
    });
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (this._isOpen && e.key === 'Escape') this.close();
    });

    // Tabs.
    for (const t of this.tabs) {
      t.addEventListener('click', () => this._setTab(t.dataset.tab));
    }
  }

  _setTab(tab) {
    this.activeTab = tab;
    for (const t of this.tabs)  t.classList.toggle('active', t.dataset.tab === tab);
    for (const p of this.panes) p.classList.toggle('active', p.dataset.pane === tab);
    this._refresh();
  }

  open() {
    this.modal.hidden = false;
    this._isOpen = true;
    this._setTab(this.activeTab);
    // Refresh again on next frame so the canvases have laid out.
    requestAnimationFrame(() => this._refresh());

    // Keep updating every 1.5s while open (mainly useful for the
    // Arena tab where bot kills tick over in real time).
    clearInterval(this._refreshTimer);
    this._refreshTimer = setInterval(() => this._refresh(), 1500);
  }

  close() {
    this.modal.hidden = true;
    this._isOpen = false;
    clearInterval(this._refreshTimer);
  }

  _refresh() {
    if (!this._isOpen) return;
    if (this.activeTab === 'personal') this._renderPersonal();
    else                                this._renderArena();
  }

  /* ============================================== Personal */
  _renderPersonal() {
    const state = this.store.state;
    const sum = personalSummary(state);
    sum.xpNeeded = this.store.xpForLevel(sum.level);
    const combat = combatStats(state);
    const heat = buildHeatmap(state, 8);
    const days = dailyCompletionSeries(state, 14);
    const tops = topHabits(state, 6);

    // ---- stat cards ----
    const grid = document.getElementById('ap-stat-grid');
    grid.innerHTML = '';
    const cards = [
      { label: 'Level',          value: sum.level,                    sub: `${sum.xp}/${sum.xpNeeded} XP`, cls: 'accent' },
      { label: 'Current Streak', value: `${sum.streak}d`,             sub: `Best ${sum.bestStreak}d`,       cls: 'good' },
      { label: 'Gold',           value: sum.gold,                     sub: `Power ${sum.power}`,             cls: '' },
      { label: 'Total Kills',    value: sum.totalKills,               sub: `${sum.totalHabits} habits`,     cls: '' },
      { label: 'Today',          value: `${sum.completionsToday}/${sum.totalHabits}`,
                                                                       sub: `${Math.round(sum.completionRateToday * 100)}% done`, cls: '' },
      { label: 'Active 7d',      value: `${sum.activeDays7}/7`,       sub: 'days with completions',         cls: 'xp' },
      { label: 'Total Damage',   value: shortNumber(combat.totalDamage), sub: `${combat.avgDamage.toFixed(1)} avg/hit`, cls: '' },
      { label: 'Crit Rate',      value: `${Math.round(combat.critRate * 100)}%`, sub: `${combat.crits} crits`, cls: 'xp' },
    ];
    for (const c of cards) {
      const el = document.createElement('div');
      el.className = `stat-card ${c.cls}`;
      el.innerHTML = `
        <div class="sc-label">${c.label}</div>
        <div class="sc-value">${c.value}</div>
        <div class="sc-sub">${c.sub}</div>`;
      grid.appendChild(el);
    }

    // ---- heatmap ----
    const heatHost = document.getElementById('ap-heatmap');
    drawHeatmap(heatHost, heat.weeks, heat.max);
    document.getElementById('ap-heatmap-sub').textContent =
      `${heat.total} completions · ${heat.activeDays} active days`;

    // ---- kills-by-difficulty donut ----
    const kbd = sum.killsByDifficulty;
    const totalK = (kbd.easy || 0) + (kbd.medium || 0) + (kbd.hard || 0);
    drawDonut(document.getElementById('ap-donut'), [
      { label: 'Easy',   value: kbd.easy   || 0, color: DIFF_COLOR.easy   },
      { label: 'Medium', value: kbd.medium || 0, color: DIFF_COLOR.medium },
      { label: 'Hard',   value: kbd.hard   || 0, color: DIFF_COLOR.hard   },
    ], { centerNumber: totalK, centerLabel: 'kills' });

    const lg = document.getElementById('ap-donut-legend');
    lg.innerHTML = `
      <li><i style="background:${DIFF_COLOR.easy}"></i>Easy · ${kbd.easy || 0}</li>
      <li><i style="background:${DIFF_COLOR.medium}"></i>Medium · ${kbd.medium || 0}</li>
      <li><i style="background:${DIFF_COLOR.hard}"></i>Hard · ${kbd.hard || 0}</li>`;
    document.getElementById('ap-kills-sub').textContent = `${totalK} total`;

    // ---- daily line chart ----
    drawLines(document.getElementById('ap-line'), [
      {
        label: 'Completions', color: '#c89b5b', fill: true,
        points: days.map(d => ({ label: d.date.slice(5), value: d.completions })),
      },
      {
        label: 'XP / 10', color: '#7a85a8', fill: false,
        points: days.map(d => ({ label: d.date.slice(5), value: Math.round(d.xp / 10) })),
      },
    ]);
    const totalRecent = days.reduce((s, d) => s + d.completions, 0);
    document.getElementById('ap-line-sub').textContent = `${totalRecent} in 14 days`;

    // ---- top habits bar chart ----
    drawBars(document.getElementById('ap-bars'),
      tops.map(h => ({
        label: short(h.name),
        value: h.completions,
        color: DIFF_COLOR[h.difficulty] || '#c89b5b',
      })),
      { showValue: true },
    );
    document.getElementById('ap-bars-sub').textContent =
      tops.length > 0 ? `Top ${tops.length}` : 'No habits yet';

    // ---- combat profile ----
    const cKv = document.getElementById('ap-combat');
    cKv.innerHTML = `
      <li><span>Avg damage / hit</span><span>${combat.avgDamage.toFixed(1)}</span></li>
      <li><span>Hits per kill</span><span>${combat.hitsPerKill.toFixed(2)}</span></li>
      <li><span>Critical strikes</span><span>${combat.crits}</span></li>
      <li><span>Crit rate</span><span>${(combat.critRate * 100).toFixed(1)}%</span></li>
      <li><span>Total damage</span><span>${combat.totalDamage}</span></li>`;
  }

  /* ============================================== Arena */
  _renderArena() {
    const tracker = this.tracker;
    const lb = tracker.leaderboard();
    const playerRank = tracker.rank();
    const totalPlayers = lb.length;

    const totals = lb.reduce((acc, e) => {
      acc.kills += e.kills;
      acc.levels += e.level;
      return acc;
    }, { kills: 0, levels: 0 });
    const player = lb.find(e => e.isPlayer);
    const top = lb[0];
    const killShare = totals.kills > 0 ? (player.kills / totals.kills) : 0;

    // ---- stat cards ----
    const grid = document.getElementById('aa-stat-grid');
    grid.innerHTML = '';
    const cards = [
      { label: 'Your Rank',  value: `#${playerRank}`, sub: `of ${totalPlayers}`, cls: 'accent' },
      { label: 'Your Kills', value: player.kills,      sub: `Level ${player.level}` },
      { label: 'Top Rival',  value: top.isPlayer ? '—' : top.name, sub: `${top.kills} kills` },
      { label: 'Gap to #1',  value: Math.max(0, top.kills - player.kills), sub: 'kills' },
      { label: 'Kill Share', value: `${Math.round(killShare * 100)}%`, sub: 'of arena' },
      { label: 'Session',    value: sessionDuration(tracker.startedAt), sub: 'live' },
    ];
    for (const c of cards) {
      const el = document.createElement('div');
      el.className = `stat-card ${c.cls || ''}`;
      el.innerHTML = `
        <div class="sc-label">${c.label}</div>
        <div class="sc-value">${c.value}</div>
        <div class="sc-sub">${c.sub}</div>`;
      grid.appendChild(el);
    }

    // ---- leaderboard table ----
    const t = document.getElementById('aa-leaderboard');
    t.innerHTML = `
      <thead><tr>
        <th>#</th><th>Player</th><th>Lv</th><th>Kills</th><th>Streak</th>
      </tr></thead>
      <tbody>
        ${lb.map((e, i) => `
          <tr class="${e.isPlayer ? 'you' : ''}">
            <td><span class="lb-rank ${rankClass(i)}">${i + 1}</span></td>
            <td>
              ${icon(e.isPlayer ? 'user' : 'bot', { size: 14, className: 'mr-2' })}
              <span class="lb-name">${escapeHtml(e.name)}</span>
              ${e.isPlayer ? '<span class="lb-tag">You</span>' : ''}
            </td>
            <td>${e.level}</td>
            <td>${e.kills}</td>
            <td>${e.streak || 0}</td>
          </tr>`).join('')}
      </tbody>`;
    document.getElementById('aa-lb-sub').textContent =
      `${totalPlayers} combatants`;

    // ---- kills-over-time line chart ----
    drawLines(document.getElementById('aa-line'), tracker.killSeries());

    // ---- arena bar chart of levels ----
    drawBars(document.getElementById('aa-bars'),
      lb.map(e => ({
        label: e.isPlayer ? 'You' : short(e.name, 6),
        value: e.level,
        color: e.isPlayer ? '#c89b5b' : '#7a85a8',
      })),
      { showValue: true },
    );

    // ---- your damage in arena ----
    const combat = combatStats(this.store.state);
    document.getElementById('aa-combat').innerHTML = `
      <li><span>Damage dealt</span><span>${shortNumber(combat.totalDamage)}</span></li>
      <li><span>Avg per swing</span><span>${combat.avgDamage.toFixed(1)}</span></li>
      <li><span>Hits per kill</span><span>${combat.hitsPerKill.toFixed(2)}</span></li>
      <li><span>Crit rate</span><span>${(combat.critRate * 100).toFixed(1)}%</span></li>
      <li><span>Total kills</span><span>${this.store.state.totalKills}</span></li>`;
  }
}

/* ---------- helpers ---------- */
function short(s, n = 12) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
function shortNumber(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
function rankClass(i) {
  return i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
}
function sessionDuration(startedAt) {
  const ms = Date.now() - startedAt;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return `${m}m${String(rest).padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}m`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
