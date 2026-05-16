/* ==========================================================
 * Habit Warrior — entry point
 *
 * Boots the store, 3D game, sound, input, UI, and the floating
 * world-space label layer. Seeds starter quests + bot rivals
 * for first-time visitors.
 * ========================================================== */

import { Game } from './game.js?v=8';
import { HabitStore } from './habits.js?v=8';
import { Sound } from './sound.js?v=8';
import { UI } from './ui.js?v=8';
import { Input } from './input.js?v=8';
import { FloatingLayer } from './floating.js?v=8';
import { spawnRivals } from './bots.js?v=8';
import { ArenaTracker } from './arena-tracker.js?v=8';
import { AnalyticsUI } from './analytics-ui.js?v=8';
import { TrackerHub } from './tracker.js?v=8';

const canvas = document.getElementById('scene');

const store = new HabitStore();
const input = new Input();
const game  = new Game(canvas, { input });
const sound = new Sound();
const ui    = new UI({ store, game, sound });

// --- floating world-space overlay layer (health bars + name tags) ---
const floatContainer = document.getElementById('world-labels');
const floats = new FloatingLayer(floatContainer, game.camera, game.renderer);

// --- spawn AI bot rivals + their dummies ---
const { bots, dummies } = spawnRivals(game.scene, 3);
game.setBots(bots, dummies);

// --- live multiplayer-style telemetry for the analytics arena tab ---
const arenaTracker = new ArenaTracker({ store, bots });
const analyticsUI  = new AnalyticsUI({ store, tracker: arenaTracker });

// --- device verification: TrackerHub watches GPS / motion / focus ---
const trackerHub = new TrackerHub({
  store,
  onProgress:    (habitId, p) => ui.onTrackingProgress(habitId, p),
  onComplete:    (habit)      => ui.onTrackingComplete(habit),
  onError:       (habitId, e) => ui.onTrackingError(habitId, e),
  onStateChange: (habitId, s) => ui.onTrackingState(habitId, s),
});
ui.setTracker(trackerHub);

// Pin a name tag above each bot.
for (const b of bots) {
  const id = 'bot:' + b.name;
  floats.add(id, { kind: 'tag', name: b.name, role: 'rival' });
}
// Player tag.
floats.add('player', { kind: 'tag', name: 'You', role: 'player' });

// Push enemy health bars whenever the list changes.
function syncEnemyOverlays() {
  // Remove any overlays for enemies that no longer exist.
  for (const id of [...floats.entries.keys()]) {
    if (id.startsWith('enemy:') && !game.enemies.has(id.slice(6))) floats.remove(id);
  }
  // Add overlays for current enemies.
  for (const [habitId] of game.enemies) {
    const oid = 'enemy:' + habitId;
    if (!floats.entries.has(oid)) {
      const e = game.enemies.get(habitId);
      floats.add(oid, { kind: 'health', name: e.name, role: 'enemy' });
    }
  }
}

// --- frame loop driver for floating overlays + leaderboard ---
function frame() {
  // Build target map for the floating layer.
  syncEnemyOverlays();
  const targets = new Map();
  targets.set('player', game.getPlayerObject());
  for (const b of bots) targets.set('bot:' + b.name, b.group);
  for (const [habitId, e] of game.enemies) {
    targets.set('enemy:' + habitId, e.mesh);
    // Push live HP percentage onto the floating bar.
    floats.setHealth('enemy:' + habitId, e.maxHp ? (e.hp / e.maxHp) : 0, e.name);
  }
  // Update player tag with combo info.
  const comboTxt = game.combo > 1 ? `${game.combo}× combo` : '';
  floats.setTag('player', 'You', comboTxt);
  for (const b of bots) {
    floats.setTag('bot:' + b.name, b.name, `Lv ${b.level} · ${b.kills} kills`);
  }
  floats.update(targets);

  // Re-render the leaderboard every ~10 frames (cheap throttle).
  ui.renderLeaderboard(bots, store.state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- emit habit-stat updates to the game so HP bars are live ---
store.subscribe((evt /*, state */) => {
  if (evt.type === 'completion' && evt.result?.habit) {
    const h = evt.result.habit;
    game.updateEnemyStats?.(h.id, h.hp, h.maxHP);
  }
});

// --- migrate old emoji icons from previous saves ---
const EMOJI_MIGRATION = {
  '💧': 'droplet', '📚': 'book', '🏋️': 'dumbbell', '🏃': 'run',
  '🧘': 'brain', '🥗': 'salad', '✍️': 'pencil', '🎨': 'palette',
  '🎸': 'music', '💻': 'code', '🌙': 'moon', '🦷': 'bed', '🎯': 'target',
};
let migrated = false;
for (const h of store.state.habits) {
  if (EMOJI_MIGRATION[h.icon]) { h.icon = EMOJI_MIGRATION[h.icon]; migrated = true; }
}
if (migrated) store._save();

// --- seed starter habits on first run ---
if (store.state.habits.length === 0) {
  const seed = [
    { name: 'Drink 2L of water',  icon: 'droplet',  difficulty: 'easy'   },
    { name: 'Read 20 pages',      icon: 'book',     difficulty: 'medium' },
    { name: 'Workout 30 minutes', icon: 'dumbbell', difficulty: 'hard'   },
  ];
  for (const s of seed) store.addHabit(s);
}

ui.syncInitialEnemies();
setInterval(() => store._checkDayRollover(), 60_000);

console.info('[Habit Warrior] ready — WASD to move, F/Space to attack, V to toggle camera, R to focus.');
