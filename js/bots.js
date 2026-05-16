/* ==========================================================
 * Habit Warrior — AI Bot Rivals
 *
 * Each bot is a stylised warrior that wanders the outer ring
 * of the arena, occasionally swings their sword at a training
 * dummy, and accumulates "kills". They drive the live
 * leaderboard so the player feels they're competing.
 *
 * Bots intentionally do NOT touch habit state — they only
 * provide ambient activity and a competitive vibe.
 * ========================================================== */

import * as THREE from 'three';

const BOT_NAMES = ['Kael', 'Riven', 'Asha', 'Tor', 'Mira', 'Bran'];
const BOT_COLORS = [
  { armor: 0x6f4a93, cape: 0x2a1a4a },   // violet
  { armor: 0x5e8e6e, cape: 0x244a36 },   // green
  { armor: 0x9c5e3e, cape: 0x4a2614 },   // rust
  { armor: 0x4a7395, cape: 0x213d52 },   // teal
];

export class Bot {
  constructor({ name, color, position, scene }) {
    this.name = name;
    this.color = color;
    this.scene = scene;
    this.kills = 0;
    this.level = 1;
    this.streak = 0;
    this.attackTimer = 1 + Math.random() * 3;
    this.swingProgress = 0;
    this.target = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.dummyHits = 0;
    this._pickNextTarget(position);
    this.group = this._buildMesh(color);
    this.group.position.copy(position);
    this.group.position.y = 0.25;
    scene.add(this.group);
  }

  _buildMesh({ armor, cape }) {
    const root = new THREE.Group();

    const armorMat   = new THREE.MeshStandardMaterial({ color: armor, roughness: 0.55, metalness: 0.6 });
    const armorDark  = new THREE.MeshStandardMaterial({ color: armor & 0x999999, roughness: 0.65, metalness: 0.7 });
    const capeMat    = new THREE.MeshStandardMaterial({ color: cape,  roughness: 0.85, side: THREE.DoubleSide });
    const skin       = new THREE.MeshStandardMaterial({ color: 0xd6a682, roughness: 0.7 });
    const leather    = new THREE.MeshStandardMaterial({ color: 0x3a261c, roughness: 0.9 });
    const blade      = new THREE.MeshStandardMaterial({ color: 0xcfd1d8, roughness: 0.2, metalness: 1 });
    const hilt       = new THREE.MeshStandardMaterial({ color: 0xb88945, roughness: 0.5, metalness: 0.6 });

    // Legs.
    const legGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.85, 8);
    const lLeg = new THREE.Mesh(legGeo, armorDark);
    lLeg.position.set(-0.16, 0.43, 0);
    lLeg.castShadow = true;
    const rLeg = new THREE.Mesh(legGeo, armorDark);
    rLeg.position.set(0.16, 0.43, 0);
    rLeg.castShadow = true;
    root.add(lLeg, rLeg);
    this.legs = [lLeg, rLeg];

    // Boots.
    const bootGeo = new THREE.BoxGeometry(0.4, 0.2, 0.5);
    const lBoot = new THREE.Mesh(bootGeo, leather);
    lBoot.position.set(-0.16, 0.1, 0.05);
    const rBoot = new THREE.Mesh(bootGeo, leather);
    rBoot.position.set(0.16, 0.1, 0.05);
    root.add(lBoot, rBoot);

    // Torso.
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.4, 1, 10), armorMat);
    torso.position.y = 1.3;
    torso.castShadow = true;
    root.add(torso);

    // Belt.
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 16), leather);
    belt.position.y = 0.85;
    root.add(belt);

    // Cape.
    const capeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.3, 1, 1), capeMat);
    capeMesh.position.set(0, 1.2, -0.32);
    capeMesh.rotation.x = -0.1;
    root.add(capeMesh);

    // Shoulders.
    const pad = new THREE.SphereGeometry(0.22, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const lPad = new THREE.Mesh(pad, armorDark);
    lPad.position.set(-0.5, 1.72, 0);
    lPad.castShadow = true;
    const rPad = new THREE.Mesh(pad, armorDark);
    rPad.position.set(0.5, 1.72, 0);
    rPad.castShadow = true;
    root.add(lPad, rPad);

    // Head + helm.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 16), skin);
    head.position.y = 2.1;
    head.castShadow = true;
    root.add(head);

    const helm = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2.4),
      armorMat
    );
    helm.position.y = 2.13;
    root.add(helm);

    // Visor band.
    const visor = new THREE.Mesh(
      new THREE.TorusGeometry(0.31, 0.04, 8, 24, Math.PI),
      armorDark
    );
    visor.position.y = 2.1;
    visor.rotation.x = Math.PI / 2;
    visor.rotation.z = Math.PI;
    root.add(visor);

    // Arms.
    const armGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.65, 8);
    const lArm = new THREE.Mesh(armGeo, armorMat);
    lArm.position.set(-0.55, 1.35, 0.05);
    lArm.castShadow = true;
    const rArm = new THREE.Mesh(armGeo, armorMat);
    rArm.position.set(0.55, 1.35, 0.05);
    rArm.castShadow = true;
    root.add(lArm, rArm);
    this.armR = rArm;

    // Sword (pivot at hilt).
    const sword = new THREE.Group();
    sword.position.set(0.55, 1.05, 0.1);
    root.add(sword);
    this.sword = sword;

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8), hilt);
    handle.position.y = -0.04;
    sword.add(handle);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.1), hilt);
    guard.position.y = 0.09;
    sword.add(guard);
    const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.04), blade);
    bladeMesh.position.y = 0.6;
    bladeMesh.castShadow = true;
    sword.add(bladeMesh);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), blade);
    tip.position.y = 1.1;
    sword.add(tip);

    return root;
  }

  _pickNextTarget(from) {
    // Random point on a ring 5–7 units out from arena center.
    const angle = Math.random() * Math.PI * 2;
    const radius = 5 + Math.random() * 2.5;
    this.target.set(Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius);
    // Avoid sitting on top of the spawn point.
    if (from && this.target.distanceTo(from) < 1.5) {
      this.target.x += 2;
    }
  }

  update(dt, t, dummies) {
    const pos = this.group.position;

    // Move toward target.
    const dir = this.target.clone().sub(pos);
    dir.y = 0;
    const dist = dir.length();
    if (dist > 0.4) {
      dir.normalize();
      this.velocity.lerp(dir.multiplyScalar(1.8), 0.1);
      pos.x += this.velocity.x * dt;
      pos.z += this.velocity.z * dt;
      // Face direction of motion.
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.group.rotation.y = lerpAngle(this.group.rotation.y, targetYaw, 0.12);
      // Walk bob.
      pos.y = 0.25 + Math.sin(t * 7) * 0.04;
      if (this.legs) {
        this.legs[0].rotation.x = Math.sin(t * 7) * 0.5;
        this.legs[1].rotation.x = -Math.sin(t * 7) * 0.5;
      }
    } else {
      // Idle: pick a new target after a short pause.
      this.velocity.multiplyScalar(0.85);
      pos.y = 0.25 + Math.sin(t * 2) * 0.04;
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        // Swing at any nearby dummy.
        const target = dummies?.find(d => d && d.group.position.distanceTo(pos) < 2);
        if (target) {
          this._swingAt(target);
        }
        // Pick a new wander point after the swing.
        setTimeout(() => this._pickNextTarget(pos), 600);
        this.attackTimer = 2 + Math.random() * 3;
      }
    }

    // Sword swing animation.
    if (this.swingProgress > 0) {
      this.swingProgress += dt * 5;
      const p = this.swingProgress;
      let ang;
      if (p < 0.5)      ang = lerp(0, -2.2, p / 0.5);
      else if (p < 1.0) ang = lerp(-2.2, 1.3, (p - 0.5) / 0.5);
      else              ang = lerp(1.3, 0, Math.min((p - 1) / 0.5, 1));
      this.sword.rotation.x = ang;
      this.armR.rotation.x = ang * 0.7;
      if (p >= 1.5) {
        this.swingProgress = 0;
        this.sword.rotation.x = 0;
        this.armR.rotation.x = 0;
      }
    }
  }

  _swingAt(dummy) {
    this.swingProgress = 0.0001;
    this.dummyHits += 1;
    dummy.takeHit();
    if (this.dummyHits % 4 === 0) {
      this.kills += 1;
      // Level up every few kills.
      if (this.kills % 3 === 0) this.level += 1;
      this.streak = Math.min(30, this.streak + 1);
    }
  }
}

/** A neutral wooden training dummy that bots beat on. Just visual. */
export class Dummy {
  constructor({ position, scene }) {
    this.scene = scene;
    this.hp = 100;
    this.maxHp = 100;
    this.flash = 0;

    const group = new THREE.Group();
    group.position.copy(position);
    scene.add(group);

    // Wooden post.
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5e3a1f, roughness: 0.9 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.95 });

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.6, 10), woodMat);
    post.position.y = 0.8;
    post.castShadow = true;
    group.add(post);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), woodMat);
    head.position.y = 1.75;
    head.castShadow = true;
    group.add(head);
    this.head = head;
    this.headMat = woodMat;

    // Crossbar arms.
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), darkWood);
    arm.rotation.z = Math.PI / 2;
    arm.position.y = 1.2;
    group.add(arm);

    // Cloth strap.
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xb56a72, roughness: 0.9 })
    );
    strap.position.y = 1.4;
    group.add(strap);

    // Base.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.1, 8), darkWood);
    base.position.y = 0.05;
    base.receiveShadow = true;
    group.add(base);

    this.group = group;
  }

  takeHit() {
    this.flash = 0.3;
    this.hp = Math.max(0, this.hp - 15);
    if (this.hp <= 0) {
      // Regenerate after a beat so bots always have something to whack.
      this.hp = this.maxHp;
    }
    // Knock the head slightly.
    this.head.position.y = 1.85;
  }

  update(dt) {
    if (this.flash > 0) {
      this.flash -= dt;
      const k = Math.max(0, this.flash / 0.3);
      this.headMat.emissive = this.headMat.emissive || { setRGB() {} };
      this.headMat.emissiveIntensity = k * 0.8;
    } else {
      this.headMat.emissiveIntensity = 0;
    }
    // Recover head position.
    this.head.position.y += (1.75 - this.head.position.y) * 0.2;
  }
}

/* ------------------------------------------------- helpers */
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI)  d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Build a set of bots + their training dummies. Returns { bots, dummies }. */
export function spawnRivals(scene, count = 3) {
  const bots = [];
  const dummies = [];
  // Place bots evenly around the arena outer ring.
  const usedNames = new Set();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.PI / count;
    const radius = 6;
    const pos = new THREE.Vector3(Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius);

    // Unique name.
    let name;
    do { name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]; }
    while (usedNames.has(name));
    usedNames.add(name);

    const color = BOT_COLORS[i % BOT_COLORS.length];
    const bot = new Bot({ name, color, position: pos, scene });
    bots.push(bot);

    // Place a dummy near each bot's starting position.
    const dummyPos = pos.clone();
    dummyPos.x += Math.cos(angle) * 0.9;
    dummyPos.z += Math.sin(angle) * 0.9;
    dummyPos.y = 0;
    dummies.push(new Dummy({ position: dummyPos, scene }));
  }
  return { bots, dummies };
}
