# Habit Warrior

A gamified habit builder where every habit you create is summoned as a monster in a 3D battle arena. Completing a habit = striking the monster. Slay it to earn XP, gold, and level up. Maintain daily streaks for a combo damage bonus and unlock achievements as you grow.

Built with vanilla HTML/CSS/JS and **Three.js** (loaded via CDN — no build step).

---

## Run it

Because the app uses native ES modules and an import map, it must be opened over `http://` (not `file://`). Any tiny static server works:

```bash
# Option A — Python (built-in on most machines)
python -m http.server 8000

# Option B — Node, no install
npx serve .

# Option C — VS Code "Live Server" extension, right-click index.html -> Open with Live Server
```

Then open `http://localhost:8000` in a modern browser (Chrome/Edge/Firefox/Safari).

> All progress saves to `localStorage` under the key `habit-warrior:v1`. The **Reset Save** button at the bottom wipes everything.

---

## How to play

1. **Forge a habit** — click *+ New Habit*, name it, pick an icon, and choose a difficulty:
   - **Easy** → Slime (30 HP, +20 XP, +5 gold)
   - **Medium** → Orc (60 HP, +50 XP, +12 gold)
   - **Hard** → Dragon (120 HP, +120 XP, +30 gold)
2. **Strike** — when you do the habit in real life, hit the ⚔ button on its card (or click the monster directly in the 3D arena). Your warrior swings, the monster takes damage, and floating combat text shows the hit.
3. **Slay** — reduce a monster to 0 HP to claim XP, gold, and a kill toward achievements. New monsters of the same habit respawn the next day.
4. **Build streaks** — completing at least one habit each day extends your global streak. Streaks add bonus **Power** to every strike (combo damage), plus higher crit chance and bigger XP/gold on kills. Miss a day and the streak resets.
5. **Level up** — XP fills the bar; each level grants +3 base Power.
6. **Earn trophies** — the Trophy Hall on the right unlocks badges as you cross milestones.

### Combat math (transparent)

- **Power** = base Power + `min(streak, 30) × 0.5`
- **Damage** = `round(Power × (crit ? 2.2 : 1) + rand(0..4))`
- **Crit chance** = `18% + min(streak, 20) × 0.5%`
- **XP to next level** = `floor(100 + (level − 1) × 80 + (level − 1)^1.4 × 10)`

### Controls

- **Drag** to orbit the camera, **scroll** to zoom.
- **Focus** button re-centers and resets the view.
- **New Day** simulates rolling to the next day (also runs automatically on date change).
- **Click monsters** in the 3D arena to strike them directly.

---

## Project layout

```
index.html         Entry, HUD overlay, modal, import map for Three.js
css/styles.css     Glass HUD, panels, modal, combat-text animations
js/main.js         Boots everything; seeds starter habits on first run
js/game.js         Three.js scene: arena, lights, player, enemies, FX
js/habits.js       Data model, streaks, XP/gold/levels, achievements, persistence
js/ui.js           DOM rendering: habit list, achievements, log, modal, floaters
js/sound.js        WebAudio-synthesized SFX (no audio assets)
```

The three layers (`HabitStore`, `Game`, `UI`) are decoupled:

- `HabitStore` owns *state* and emits events.
- `Game` owns the *3D scene* and exposes `spawnEnemy / hitEnemy / killEnemy / focusCamera`.
- `UI` listens to both and bridges them.

---

## Tech

- **Three.js 0.160** via `unpkg` import map (no build step, no `node_modules`).
- Pure ES modules — open `index.html` through any static server.
- Stylized low-poly visuals built from primitives, custom shader sky, hemisphere + directional + flickering point-light torches, additive-blended ember particles, and per-frame camera shake.
- WebAudio API for procedurally synthesized hits/crits/levelups (zero audio files).
- `localStorage` persistence with automatic day-rollover and streak break detection.

---

## Tips for sustained engagement

- Keep your daily list **short** (3–5 habits). The "combo" feel rewards consistency, not volume.
- Mix difficulties: one Dragon a day gives a big payoff, but easy Slimes keep the streak alive on rough days.
- Don't break the chain. The streak compounds — both Power and crit chance scale with it.
