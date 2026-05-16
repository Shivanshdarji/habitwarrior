/* ==========================================================
 * Habit Warrior — 3D Game module
 *
 * Owns the Three.js scene: arena, lighting, post-processing,
 * player (with direct WASD control), AI bot rivals, training
 * dummies, enemies, combat, day-night cycle, and the render
 * loop.
 * ========================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';

const COLORS = {
  skyTop: 0x05050a,
  skyMid: 0x2a1a36,
  skyBot: 0xb07a4a,
  fog:    0x130d1c,
  ground: 0x1a1428,
  arena:  0x2a2444,
  rune:   0xd09a5a,
  torch:  0xd07a3a,
};

const DIFFICULTY = {
  easy:   { color: 0x66e09a, scale: 0.9,  hpScale: 0.6 },
  medium: { color: 0xff9b3d, scale: 1.15, hpScale: 1.0 },
  hard:   { color: 0xe33b5b, scale: 1.5,  hpScale: 1.6 },
};

const ARENA_RADIUS = 6.8;

export class Game {
  constructor(canvas, { input } = {}) {
    this.canvas = canvas;
    this.input = input || null;
    this.clock = new THREE.Clock();
    this.enemies = new Map();           // habitId -> EnemyRecord
    this.enemySlots = new Array(7).fill(null);
    this.particles = [];
    this.cameraShake = { intensity: 0, decay: 0 };
    this.callbacks = {};

    // Player runtime state.
    this.player = null;
    this.playerVel = new THREE.Vector3();
    this.playerYaw = Math.PI;   // start facing -Z (toward the enemy spawn arc)
    this.playerAttack = 0;
    this.attackCooldown = 0;
    this.combo = 0;
    this.lastComboTime = 0;

    // Camera state.
    this.cameraMode = 'orbit';          // 'orbit' | 'follow'
    this._followOffset = new THREE.Vector3(0, 4, 7);
    this._followTarget = new THREE.Vector3();

    // Day/night cycle (0..1 spans a full day; we start near sunset).
    this.dayTime = 0.62;
    this.daySpeed = 1 / 240;            // 1 cycle every 4 minutes

    // Bots + dummies (populated by main.js).
    this.bots = [];
    this.dummies = [];

    this._initRenderer();
    this._initScene();
    this._initLights();
    this._initSky();
    this._buildArena();
    this._buildPlayer();
    this._initParticles();
    this._initComposer();
    this._initInput();

    window.addEventListener('resize', () => this._onResize());
    this.animate = this.animate.bind(this);
    this.animate();
  }

  /* ------------------------------------------------- public API */
  on(event, fn) { this.callbacks[event] = fn; }

  setBots(bots, dummies) {
    this.bots = bots;
    this.dummies = dummies;
  }

  /** Snap camera back to the centred orbit framing. */
  focusCamera() {
    this.controls.target.set(0, 1.5, 0);
    this.camera.position.set(0, 6, 14);
  }

  toggleCameraMode() {
    this.cameraMode = this.cameraMode === 'orbit' ? 'follow' : 'orbit';
    this.controls.enabled = this.cameraMode === 'orbit';
    if (this.cameraMode === 'orbit') this.focusCamera();
    return this.cameraMode;
  }

  /** Camera-relative world position of the player. Used by floating UI. */
  getPlayerObject() { return this.player; }
  getBotObjects()   { return this.bots.map(b => b.group); }
  getEnemyObjects() {
    const out = new Map();
    for (const [id, e] of this.enemies) out.set(id, { object: e.mesh, hp: e.hp, maxHp: e.maxHp, name: e.name });
    return out;
  }

  /** Project a world point to screen-space pixel coords. */
  worldToScreen(vec3) {
    const v = vec3.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  /* ------------------------------------------------- renderer + composer */
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initComposer() {
    const w = window.innerWidth, h = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.composer.setSize(w, h);

    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // (strength, radius, threshold) — kept restrained so we get tasteful
    // glow on torches/swords without the rune ring becoming a yellow blob.
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.25, 0.92);
    this.composer.addPass(bloom);
    this.bloom = bloom;

    this.composer.addPass(new OutputPass());
  }

  /* ------------------------------------------------- scene */
  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(COLORS.fog, 0.018);

    this.camera = new THREE.PerspectiveCamera(
      55, window.innerWidth / window.innerHeight, 0.1, 400
    );
    this.camera.position.set(0, 6, 14);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 1.5, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 28;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.25;
  }

  _initLights() {
    this.hemi = new THREE.HemisphereLight(0xd6b08a, 0x1a1228, 0.5);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xd49a78, 1.25);
    this.sun.position.set(-14, 18, 10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const d = 20;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 80;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);

    this.rim = new THREE.DirectionalLight(0x5a6f9c, 0.55);
    this.rim.position.set(8, 10, -12);
    this.scene.add(this.rim);
  }

  _initSky() {
    const geo = new THREE.SphereGeometry(180, 32, 32);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top:    { value: new THREE.Color(COLORS.skyTop) },
        middle: { value: new THREE.Color(COLORS.skyMid) },
        bottom: { value: new THREE.Color(COLORS.skyBot) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 middle;
        uniform vec3 bottom;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y;
          vec3 col;
          if (h > 0.0) col = mix(middle, top, smoothstep(0.0, 0.7, h));
          else         col = mix(middle, bottom, smoothstep(0.0, -0.4, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(geo, this.skyMat));
  }

  /* ------------------------------------------------- arena */
  _buildArena() {
    const root = new THREE.Group();
    this.scene.add(root);

    // Procedural cobblestone-ish ground texture.
    const groundTex = this._makeGroundTexture();
    const groundNorm = this._makeNormalMap(groundTex);

    // Outer ground plane.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(120, 64),
      new THREE.MeshStandardMaterial({
        color: 0x4d3a5f,
        map: groundTex,
        normalMap: groundNorm,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughness: 0.95,
        metalness: 0.05,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.4;
    ground.receiveShadow = true;
    root.add(ground);

    // Hex arena platform.
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS + 0.7, ARENA_RADIUS + 0.9, 0.6, 6),
      new THREE.MeshStandardMaterial({
        color: COLORS.arena,
        map: this._makeGroundTexture(0.6),
        normalMap: groundNorm,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 0.8,
        metalness: 0.15,
      })
    );
    platform.position.y = -0.1;
    platform.receiveShadow = true;
    platform.castShadow = true;
    root.add(platform);

    // Hex inlay.
    const inlay = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS + 0.3, ARENA_RADIUS + 0.3, 0.06, 6),
      new THREE.MeshStandardMaterial({
        color: 0x4a3f7a, roughness: 0.7, metalness: 0.25,
      })
    );
    inlay.position.y = 0.22;
    inlay.receiveShadow = true;
    root.add(inlay);

    // Rune circle (subtle floor decal — not too bright so bloom doesn't
    // smear it across the screen at close camera angles).
    const rune = new THREE.Mesh(
      new THREE.RingGeometry(4.4, 4.7, 96),
      new THREE.MeshBasicMaterial({
        color: 0x6a4a26, side: THREE.DoubleSide,
        transparent: true, opacity: 0.55, depthWrite: false,
      })
    );
    rune.rotation.x = -Math.PI / 2;
    rune.position.y = 0.24;
    rune.renderOrder = 1;
    root.add(rune);
    this.runeRing = rune;

    // Inner glyph (cool counterpoint, also kept low-key).
    const glyph = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 2.9, 12),
      new THREE.MeshBasicMaterial({
        color: 0x3a4a78, side: THREE.DoubleSide,
        transparent: true, opacity: 0.35, depthWrite: false,
      })
    );
    glyph.rotation.x = -Math.PI / 2;
    glyph.position.y = 0.25;
    glyph.renderOrder = 1;
    root.add(glyph);
    this.runeGlyph = glyph;

    // Stone pillars + torches.
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x2c2541, roughness: 0.9, metalness: 0.05,
    });
    const torchMat = new THREE.MeshBasicMaterial({ color: COLORS.torch });
    this.torches = [];

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const r = 9.5;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;

      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.85, 5.2, 8),
        pillarMat
      );
      pillar.position.set(x, 2.4, z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      root.add(pillar);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 1.7), pillarMat);
      cap.position.set(x, 5.1, z);
      cap.castShadow = true;
      root.add(cap);

      const brazier = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.55, 0.35, 12),
        new THREE.MeshStandardMaterial({ color: 0x1a1422, roughness: 0.5, metalness: 0.6 })
      );
      brazier.position.set(x, 5.45, z);
      root.add(brazier);

      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), torchMat);
      flame.position.set(x, 5.85, z);
      root.add(flame);

      const torchLight = new THREE.PointLight(COLORS.torch, 1.6, 16, 1.8);
      torchLight.position.set(x, 5.95, z);
      root.add(torchLight);

      this.torches.push({ flame, light: torchLight, base: 1.6, phase: Math.random() * Math.PI * 2 });
    }

    // Distant jagged mountain ring.
    const mtnMat = new THREE.MeshStandardMaterial({
      color: 0x100c20, roughness: 1, metalness: 0,
    });
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const r = 55 + Math.random() * 22;
      const h = 16 + Math.random() * 26;
      const m = new THREE.Mesh(new THREE.ConeGeometry(6 + Math.random() * 5, h, 6), mtnMat);
      m.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
      m.rotation.y = Math.random() * Math.PI;
      root.add(m);
    }

    // Scattered rocks.
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x251f3a, roughness: 0.95, metalness: 0.05,
    });
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 32;
      const s = 0.4 + Math.random() * 1.4;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      rock.position.set(Math.cos(a) * r, -0.2, Math.sin(a) * r);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      rock.receiveShadow = true;
      root.add(rock);
    }

    // Banners on alternating pillars.
    const bannerColors = [0x8c4938, 0x5e6f8e, 0x6b9b7e];
    for (let i = 0; i < 6; i += 2) {
      const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const r = 9.5;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 2.2),
        new THREE.MeshStandardMaterial({
          color: bannerColors[(i / 2) % bannerColors.length],
          roughness: 0.9, side: THREE.DoubleSide,
        })
      );
      banner.position.set(x * 0.78, 3.4, z * 0.78);
      banner.lookAt(0, 3.4, 0);
      root.add(banner);
    }
  }

  /* ------------------------------------------------- player */
  _buildPlayer() {
    const player = new THREE.Group();
    player.position.set(0, 0.25, 2.5);
    player.rotation.y = Math.PI;
    this.scene.add(player);

    const skin    = new THREE.MeshStandardMaterial({ color: 0xe0bb95, roughness: 0.7 });
    const armor   = new THREE.MeshStandardMaterial({ color: 0x6c87b0, roughness: 0.45, metalness: 0.7 });
    const armor2  = new THREE.MeshStandardMaterial({ color: 0x33405e, roughness: 0.6,  metalness: 0.8 });
    const cape    = new THREE.MeshStandardMaterial({ color: 0xa44232, roughness: 0.85, side: THREE.DoubleSide });
    const blade   = new THREE.MeshStandardMaterial({ color: 0xe5e8f0, roughness: 0.18, metalness: 1 });
    const hilt    = new THREE.MeshStandardMaterial({ color: 0xd09a5a, roughness: 0.4,  metalness: 0.75 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x3a2218, roughness: 0.9 });

    // Legs.
    const legGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.9, 10);
    const lLeg = new THREE.Mesh(legGeo, armor2);
    lLeg.position.set(-0.18, 0.45, 0);
    lLeg.castShadow = true;
    const rLeg = new THREE.Mesh(legGeo, armor2);
    rLeg.position.set(0.18, 0.45, 0);
    rLeg.castShadow = true;
    player.add(lLeg, rLeg);
    this.playerLegs = [lLeg, rLeg];

    // Boots.
    const bootGeo = new THREE.BoxGeometry(0.44, 0.22, 0.58);
    const lBoot = new THREE.Mesh(bootGeo, leather);
    lBoot.position.set(-0.18, 0.11, 0.05);
    lBoot.castShadow = true;
    const rBoot = new THREE.Mesh(bootGeo, leather);
    rBoot.position.set(0.18, 0.11, 0.05);
    rBoot.castShadow = true;
    player.add(lBoot, rBoot);

    // Torso.
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.54, 0.42, 1.15, 10),
      armor
    );
    torso.position.y = 1.42;
    torso.castShadow = true;
    player.add(torso);

    // Chest plate accent.
    const chestPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.6, 0.06),
      armor2
    );
    chestPlate.position.set(0, 1.55, 0.36);
    player.add(chestPlate);

    // Belt.
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.18, 18),
      leather
    );
    belt.position.y = 0.92;
    player.add(belt);

    // Belt buckle.
    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.16, 0.05),
      hilt
    );
    buckle.position.set(0, 0.92, 0.45);
    player.add(buckle);

    // Cape.
    const capeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.45, 8, 8),
      cape
    );
    capeMesh.position.set(0, 1.25, -0.36);
    capeMesh.rotation.x = -0.08;
    player.add(capeMesh);
    this.playerCape = capeMesh;

    // Shoulder pads.
    const pad = new THREE.SphereGeometry(0.27, 14, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const lPad = new THREE.Mesh(pad, armor2);
    lPad.position.set(-0.58, 1.88, 0);
    lPad.castShadow = true;
    const rPad = new THREE.Mesh(pad, armor2);
    rPad.position.set(0.58, 1.88, 0);
    rPad.castShadow = true;
    player.add(lPad, rPad);

    // Head.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 18), skin);
    head.position.y = 2.27;
    head.castShadow = true;
    player.add(head);

    // Helm with full face guard.
    const helm = new THREE.Mesh(
      new THREE.SphereGeometry(0.37, 18, 18, 0, Math.PI * 2, 0, Math.PI / 2.3),
      armor
    );
    helm.position.y = 2.29;
    helm.castShadow = true;
    player.add(helm);

    // Visor T-slit cap.
    const visor = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.05, 8, 28, Math.PI),
      armor2
    );
    visor.position.y = 2.24;
    visor.rotation.x = Math.PI / 2;
    visor.rotation.z = Math.PI;
    player.add(visor);

    // Plume.
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.55), cape);
    crest.position.set(0, 2.58, 0);
    player.add(crest);

    // Arms.
    const armGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.72, 10);
    const rArm = new THREE.Mesh(armGeo, armor);
    rArm.position.set(0.6, 1.45, 0.05);
    rArm.castShadow = true;
    const lArm = new THREE.Mesh(armGeo, armor);
    lArm.position.set(-0.6, 1.45, 0.05);
    lArm.castShadow = true;
    player.add(rArm, lArm);
    this.playerArmR = rArm;
    this.playerArmL = lArm;

    // Sword.
    const sword = new THREE.Group();
    sword.position.set(0.6, 1.1, 0.1);
    player.add(sword);
    this.playerSword = sword;

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 10), hilt);
    handle.position.y = -0.05;
    sword.add(handle);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.12), hilt);
    guard.position.y = 0.1;
    sword.add(guard);
    const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.15, 0.04), blade);
    bladeMesh.position.y = 0.72;
    bladeMesh.castShadow = true;
    sword.add(bladeMesh);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.22, 4), blade);
    tip.position.y = 1.36;
    sword.add(tip);

    // Sword glow (gets bloomed).
    const bladeGlow = new THREE.PointLight(0x9ab0d8, 0.45, 4, 2);
    bladeGlow.position.y = 0.8;
    sword.add(bladeGlow);
    this.swordGlow = bladeGlow;

    // Subtle ground halo under the player (sells presence on the floor).
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.7, 32),
      new THREE.MeshBasicMaterial({
        color: 0x9ab0d8, side: THREE.DoubleSide,
        transparent: true, opacity: 0.35, depthWrite: false,
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.2;
    player.add(halo);

    this.player = player;
  }

  /* ------------------------------------------------- particles */
  _initParticles() {
    const count = 240;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      speeds[i] = 0.4 + Math.random() * 0.9;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const tex = this._makeEmberTexture();
    const mat = new THREE.PointsMaterial({
      size: 0.45,
      map: tex,
      color: 0xffb070,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geom, mat);
    this.scene.add(pts);
    this.embers = { pts, speeds };
  }

  _makeEmberTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0.0, 'rgba(255, 230, 180, 1)');
    g.addColorStop(0.4, 'rgba(255, 150, 80, 0.7)');
    g.addColorStop(1.0, 'rgba(255, 100, 40, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ------------------------------------------------- procedural textures */
  _makeGroundTexture(brightnessScale = 1) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');

    // Base.
    ctx.fillStyle = '#1e1830';
    ctx.fillRect(0, 0, 512, 512);

    // Cracked-tile look: stochastic polygons.
    for (let i = 0; i < 80; i++) {
      const cx = Math.random() * 512;
      const cy = Math.random() * 512;
      const sides = 5 + Math.floor(Math.random() * 3);
      const size = 24 + Math.random() * 60;
      const v = 30 + Math.random() * 50;
      ctx.fillStyle = `rgba(${v},${v - 6},${v + 8},${0.6 * brightnessScale})`;
      ctx.beginPath();
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2 + Math.random() * 0.2;
        const r = size * (0.7 + Math.random() * 0.5);
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Soft noise speckle.
    const img = ctx.getImageData(0, 0, 512, 512);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 22;
      data[i + 0] = Math.max(0, Math.min(255, data[i + 0] + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeNormalMap(srcTex) {
    // Generate a normal map by sobel-style edge detection on the source.
    const src = srcTex.image;
    const w = src.width, h = src.height;
    const a = document.createElement('canvas');
    a.width = w; a.height = h;
    const actx = a.getContext('2d');
    actx.drawImage(src, 0, 0);
    const data = actx.getImageData(0, 0, w, h).data;

    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const octx = out.getContext('2d');
    const outImg = octx.createImageData(w, h);
    const od = outImg.data;

    const idx = (x, y) => ((y * w + x) << 2);
    const lum = (i) => (data[i] + data[i + 1] + data[i + 2]) / 3;
    const strength = 4;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const tl = lum(idx(x - 1, y - 1));
        const t  = lum(idx(x,     y - 1));
        const tr = lum(idx(x + 1, y - 1));
        const l  = lum(idx(x - 1, y));
        const r  = lum(idx(x + 1, y));
        const bl = lum(idx(x - 1, y + 1));
        const b  = lum(idx(x,     y + 1));
        const br = lum(idx(x + 1, y + 1));
        const dX = ((tr + 2 * r + br) - (tl + 2 * l + bl)) / 1024 * strength;
        const dY = ((bl + 2 * b + br) - (tl + 2 * t + tr)) / 1024 * strength;
        const nz = Math.sqrt(Math.max(0, 1 - dX * dX - dY * dY));
        const oi = idx(x, y);
        od[oi + 0] = ((dX + 1) * 0.5) * 255;
        od[oi + 1] = ((dY + 1) * 0.5) * 255;
        od[oi + 2] = nz * 255;
        od[oi + 3] = 255;
      }
    }
    octx.putImageData(outImg, 0, 0);

    const tex = new THREE.CanvasTexture(out);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    return tex;
  }

  /* ------------------------------------------------- enemies */
  spawnEnemy(habit) {
    if (this.enemies.has(habit.id)) return;
    const slotIndex = this._claimSlot();
    if (slotIndex < 0) return;
    const angle = this._slotAngle(slotIndex);
    const radius = 4.8;
    const pos = new THREE.Vector3(Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius);

    const enemy = this._makeEnemyMesh(habit.difficulty);
    enemy.group.position.copy(pos);
    enemy.group.position.y = -1.5;
    enemy.group.lookAt(0, enemy.group.position.y, 0);
    enemy.group.rotation.y += Math.PI;
    this.scene.add(enemy.group);

    const record = {
      id: habit.id,
      slot: slotIndex,
      mesh: enemy.group,
      body: enemy.body,
      bodyMat: enemy.bodyMat,
      glow: enemy.glow,
      basePos: pos.clone(),
      bobPhase: Math.random() * Math.PI * 2,
      flashTimer: 0,
      spawnAnim: 0,
      dying: false,
      dyingTimer: 0,
      difficulty: habit.difficulty,
      name: habit.name,
      hp: habit.hp,
      maxHp: habit.maxHP,
    };
    this.enemies.set(habit.id, record);
    this._spawnBurst(pos, 0xffb070, 16);
  }

  /** Push HP updates from the store so floating bars reflect reality. */
  updateEnemyStats(habitId, hp, maxHp) {
    const e = this.enemies.get(habitId);
    if (!e) return;
    if (typeof hp === 'number')   e.hp = hp;
    if (typeof maxHp === 'number') e.maxHp = maxHp;
  }

  removeEnemy(habitId) {
    const e = this.enemies.get(habitId);
    if (!e) return;
    this.scene.remove(e.mesh);
    this.enemySlots[e.slot] = null;
    this.enemies.delete(habitId);
  }

  hitEnemy(habitId, damage) {
    const e = this.enemies.get(habitId);
    if (!e) return null;
    e.flashTimer = 0.35;
    e.mesh.position.y = e.basePos.y + 0.4;
    e.hp = Math.max(0, e.hp - damage);
    this._spawnBurst(e.mesh.position.clone().setY(e.basePos.y + 1), 0xff5470, 18);
    this._cameraShake(0.18, 0.9);
    this._swingPlayerSword();
    this.combo += 1;
    this.lastComboTime = this.clock.elapsedTime;
    if (this.callbacks.onCombo) this.callbacks.onCombo(this.combo);
    return e.mesh.position.clone().setY(e.basePos.y + 1.2);
  }

  killEnemy(habitId) {
    const e = this.enemies.get(habitId);
    if (!e) return null;
    e.dying = true;
    e.dyingTimer = 0;
    this._spawnBurst(e.mesh.position.clone().setY(e.basePos.y + 1), 0xd09a5a, 40, 4);
    this._cameraShake(0.45, 1.2);
    return e.mesh.position.clone().setY(e.basePos.y + 1.5);
  }

  _claimSlot() {
    for (let i = 0; i < this.enemySlots.length; i++) {
      if (!this.enemySlots[i]) { this.enemySlots[i] = true; return i; }
    }
    return -1;
  }
  _slotAngle(i) {
    const total = this.enemySlots.length;
    const t = total === 1 ? 0.5 : i / (total - 1);
    const start = -Math.PI * 0.9;
    const end   = -Math.PI * 0.1;
    return start + (end - start) * t;
  }

  _makeEnemyMesh(difficulty) {
    const cfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: cfg.color, roughness: 0.7, metalness: 0.05,
      emissive: cfg.color, emissiveIntensity: 0.04,
    });

    let body;
    if (difficulty === 'easy') {
      body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 14), bodyMat);
      body.scale.y = 0.7;
      body.position.y = 0.55;
      body.castShadow = true;
      group.add(body);

      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
      const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
      e1.position.set(-0.18, 0.72, 0.58);
      e2.position.set(0.18, 0.72, 0.58);
      group.add(e1, e2);
      const pupil = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const p1 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), pupil);
      const p2 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), pupil);
      p1.position.set(-0.18, 0.72, 0.65);
      p2.position.set(0.18, 0.72, 0.65);
      group.add(p1, p2);
    } else if (difficulty === 'medium') {
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.45, 1.3, 10), bodyMat);
      body.position.y = 0.9;
      body.castShadow = true;
      group.add(body);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0x9bd773, roughness: 0.7 })
      );
      head.position.y = 1.85;
      head.castShadow = true;
      group.add(head);

      const tuskMat = new THREE.MeshStandardMaterial({ color: 0xfaf3d8 });
      const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 6), tuskMat);
      const t2 = t1.clone();
      t1.position.set(-0.1, 1.7, 0.4);
      t2.position.set(0.1, 1.7, 0.4);
      t1.rotation.x = t2.rotation.x = Math.PI;
      group.add(t1, t2);

      const eye = new THREE.MeshBasicMaterial({ color: 0xff3030 });
      const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eye);
      const e2 = e1.clone();
      e1.position.set(-0.13, 1.92, 0.41);
      e2.position.set(0.13, 1.92, 0.41);
      group.add(e1, e2);

      const axe = new THREE.Group();
      const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.25, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a2f1a }));
      axe.add(haft);
      const axeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.45, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xa1a4b3, metalness: 0.9, roughness: 0.3 }));
      axeBlade.position.set(0.22, 0.4, 0);
      axe.add(axeBlade);
      axe.position.set(0.55, 1.15, 0.1);
      axe.rotation.z = -0.4;
      group.add(axe);
    } else {
      body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 18, 14), bodyMat);
      body.scale.set(1, 0.85, 1.3);
      body.position.y = 1.05;
      body.castShadow = true;
      group.add(body);

      // Scale plates along the back.
      const plateMat = new THREE.MeshStandardMaterial({
        color: cfg.color, roughness: 0.5, metalness: 0.2,
        emissive: cfg.color, emissiveIntensity: 0.08,
      });
      for (let i = 0; i < 5; i++) {
        const plate = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 4), plateMat);
        plate.position.set(0, 1.55 - i * 0.08, -0.4 + i * 0.25);
        plate.rotation.x = -0.3;
        group.add(plate);
      }

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.4, 0.75, 10), bodyMat);
      neck.position.set(0, 1.7, 0.75);
      neck.rotation.x = -0.6;
      group.add(neck);

      const head = new THREE.Mesh(new THREE.ConeGeometry(0.37, 0.75, 10), bodyMat);
      head.rotation.x = Math.PI / 2;
      head.position.set(0, 2.0, 1.18);
      group.add(head);

      const hornMat = new THREE.MeshStandardMaterial({ color: 0x1a1020, roughness: 0.6 });
      const h1 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 6), hornMat);
      const h2 = h1.clone();
      h1.position.set(-0.2, 2.18, 1.0);
      h2.position.set(0.2, 2.18, 1.0);
      h1.rotation.set(-0.4, 0, -0.3);
      h2.rotation.set(-0.4, 0, 0.3);
      group.add(h1, h2);

      const eye = new THREE.MeshBasicMaterial({ color: 0xffcb3d });
      const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eye);
      const e2 = e1.clone();
      e1.position.set(-0.14, 2.05, 1.32);
      e2.position.set(0.14, 2.05, 1.32);
      group.add(e1, e2);

      const wingGeo = new THREE.PlaneGeometry(1.55, 1, 1, 1);
      const wingMat = new THREE.MeshStandardMaterial({
        color: 0x5a1530, side: THREE.DoubleSide, roughness: 0.8,
      });
      const w1 = new THREE.Mesh(wingGeo, wingMat);
      const w2 = new THREE.Mesh(wingGeo, wingMat);
      w1.position.set(-0.65, 1.45, -0.1);
      w2.position.set(0.65, 1.45, -0.1);
      w1.rotation.set(0, Math.PI / 2, 0.3);
      w2.rotation.set(0, -Math.PI / 2, -0.3);
      group.add(w1, w2);
      this._wings = this._wings || [];
      this._wings.push({ wings: [w1, w2] });

      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.3, 6), bodyMat);
      tail.position.set(0, 0.95, -1.0);
      tail.rotation.x = -1.4;
      group.add(tail);
    }

    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.6 * cfg.scale, 1.0 * cfg.scale, 28),
      new THREE.MeshBasicMaterial({
        color: cfg.color, side: THREE.DoubleSide,
        transparent: true, opacity: 0.22, depthWrite: false,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.31;
    glow.renderOrder = 1;
    group.add(glow);

    group.scale.setScalar(cfg.scale);
    return { group, body, bodyMat, glow };
  }

  /* ------------------------------------------------- combat helpers */
  _swingPlayerSword() { this.playerAttack = 0.0001; }

  /** Attack the closest enemy in a forward cone. Returns habitId or null. */
  attackNearest() {
    if (this.attackCooldown > 0) return null;
    if (!this.player) return null;

    const pPos = this.player.position;
    // Compute forward direction from player yaw.
    const forward = new THREE.Vector3(Math.sin(this.playerYaw), 0, Math.cos(this.playerYaw));
    let bestId = null;
    let bestScore = -Infinity;

    for (const [id, e] of this.enemies) {
      if (e.dying) continue;
      const v = e.mesh.position.clone().sub(pPos);
      v.y = 0;
      const dist = v.length();
      if (dist > 5.5) continue;                 // out of range
      v.normalize();
      const dot = v.dot(forward);
      if (dot < 0.2) continue;                  // behind/way side
      const score = dot * 2 - dist * 0.2;
      if (score > bestScore) { bestScore = score; bestId = id; }
    }

    if (bestId) {
      this.attackCooldown = 0.4;
      this._swingPlayerSword();
      if (this.callbacks.onEnemyClick) this.callbacks.onEnemyClick(bestId);
      return bestId;
    }
    // No target — still swing for feel.
    this._swingPlayerSword();
    this.attackCooldown = 0.25;
    return null;
  }

  _spawnBurst(pos, color, count = 18, size = 1) {
    const tex = this._makeEmberTexture();
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      vel.push(new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2.6 + 1,
        (Math.random() - 0.5) * 3,
      ));
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.42 * size, map: tex, color,
      transparent: true, opacity: 1, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geom, mat);
    this.scene.add(pts);
    this.particles.push({ pts, vel, life: 0, max: 1.1 });
  }

  _cameraShake(intensity, decay) {
    this.cameraShake.intensity = Math.max(this.cameraShake.intensity, intensity);
    this.cameraShake.decay = decay;
  }

  /* ------------------------------------------------- input */
  _initInput() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.canvas.addEventListener('pointerdown', (ev) => {
      // If the canvas was clicked directly on a monster mesh, attack THAT one.
      this.pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      for (const [id, e] of this.enemies) {
        const intersects = this.raycaster.intersectObject(e.mesh, true);
        if (intersects.length > 0) {
          if (this.callbacks.onEnemyClick) this.callbacks.onEnemyClick(id);
          this._swingPlayerSword();
          return;
        }
      }
      // Otherwise treat as a forward-attack.
      this.attackNearest();
    });
  }

  /* ------------------------------------------------- update systems */
  _updatePlayer(dt) {
    if (!this.input || !this.player) return;
    const mv = this.input.movement();
    const speed = 4.5;

    // Movement relative to camera yaw (so W = forward into the screen).
    let camAngle = 0;
    if (this.cameraMode === 'orbit') {
      const cp = this.camera.position;
      camAngle = Math.atan2(cp.x - this.controls.target.x, cp.z - this.controls.target.z);
    } else {
      camAngle = this.playerYaw;
    }

    const sin = Math.sin(camAngle), cos = Math.cos(camAngle);
    const wx = mv.x * cos + mv.z * sin;
    const wz = -mv.x * sin + mv.z * cos;

    this.playerVel.x = THREE.MathUtils.lerp(this.playerVel.x, wx * speed, 0.18);
    this.playerVel.z = THREE.MathUtils.lerp(this.playerVel.z, wz * speed, 0.18);

    this.player.position.x += this.playerVel.x * dt;
    this.player.position.z += this.playerVel.z * dt;

    // Constrain to arena.
    const dx = this.player.position.x;
    const dz = this.player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > ARENA_RADIUS) {
      this.player.position.x = (dx / dist) * ARENA_RADIUS;
      this.player.position.z = (dz / dist) * ARENA_RADIUS;
    }

    // Face direction of motion (smooth).
    if (mv.x !== 0 || mv.z !== 0) {
      const targetYaw = Math.atan2(this.playerVel.x, this.playerVel.z);
      this.playerYaw = lerpAngle(this.playerYaw, targetYaw, 0.18);
    }
    this.player.rotation.y = this.playerYaw;

    // Walk animation.
    const moving = Math.hypot(this.playerVel.x, this.playerVel.z) > 0.5;
    const t = this.clock.elapsedTime;
    if (moving) {
      const stride = Math.sin(t * 10) * 0.5;
      if (this.playerLegs) {
        this.playerLegs[0].rotation.x = stride;
        this.playerLegs[1].rotation.x = -stride;
      }
      this.player.position.y = 0.25 + Math.abs(Math.sin(t * 10)) * 0.04;
    } else {
      if (this.playerLegs) {
        this.playerLegs[0].rotation.x = lerp(this.playerLegs[0].rotation.x, 0, 0.2);
        this.playerLegs[1].rotation.x = lerp(this.playerLegs[1].rotation.x, 0, 0.2);
      }
      this.player.position.y = 0.25 + Math.sin(t * 1.8) * 0.05;
    }

    // Attack input (F key or space).
    if (this.input.wasPressed('f') || this.input.wasPressed(' ')) {
      this.attackNearest();
    }
    // Camera toggle.
    if (this.input.wasPressed('c') || this.input.wasPressed('v')) {
      this.toggleCameraMode();
    }
    // Focus.
    if (this.input.wasPressed('r')) this.focusCamera();
  }

  _updateCamera(dt) {
    if (this.cameraMode === 'follow' && this.player) {
      // Camera trails behind/above the player.
      const yawCos = Math.cos(this.playerYaw);
      const yawSin = Math.sin(this.playerYaw);
      const back = 5.5;
      const up   = 3.6;
      const target = this._followTarget;
      target.set(
        this.player.position.x - yawSin * back,
        this.player.position.y + up,
        this.player.position.z - yawCos * back,
      );
      this.camera.position.lerp(target, Math.min(1, dt * 4));
      const look = this.player.position.clone();
      look.y += 1.4;
      this.camera.lookAt(look);
    }
    if (this.cameraShake.intensity > 0) {
      const s = this.cameraShake.intensity;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.cameraShake.intensity *= Math.max(0, 1 - dt * (this.cameraShake.decay * 6));
      if (this.cameraShake.intensity < 0.005) this.cameraShake.intensity = 0;
    }
  }

  _updateDayNight(dt) {
    this.dayTime = (this.dayTime + this.daySpeed * dt) % 1;
    // Map dayTime to a sun angle: dawn at 0.25, noon 0.5, dusk 0.75, night 0/1.
    const sunAngle = this.dayTime * Math.PI * 2 - Math.PI / 2;
    const sx = Math.cos(sunAngle) * 18;
    const sy = Math.sin(sunAngle) * 18;
    this.sun.position.set(sx, Math.max(2, sy), 10);

    // Color & intensity by altitude (sy).
    const altitude = Math.max(0, Math.min(1, (sy + 18) / 36)); // 0 (night) ... 1 (high sun)
    const sunWarm = new THREE.Color(0xffd29a);
    const sunMid  = new THREE.Color(0xd49a78);
    const sunCool = new THREE.Color(0x445c8a);
    const sunCol = new THREE.Color().copy(sunCool).lerp(sunMid, altitude).lerp(sunWarm, Math.max(0, altitude - 0.4) * 1.6);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 0.4 + altitude * 1.4;

    this.hemi.intensity = 0.25 + altitude * 0.5;

    // Sky colors lerp slowly with time.
    const skyTopDay = new THREE.Color(0x4a6b9a);
    const skyTopNight = new THREE.Color(COLORS.skyTop);
    const skyMidDay = new THREE.Color(0xa97c5a);
    const skyMidNight = new THREE.Color(COLORS.skyMid);
    this.skyMat.uniforms.top.value.copy(skyTopNight).lerp(skyTopDay, altitude);
    this.skyMat.uniforms.middle.value.copy(skyMidNight).lerp(skyMidDay, altitude);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ------------------------------------------------- main loop */
  animate() {
    requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    this._updatePlayer(dt);

    // Player attack animation.
    if (this.playerAttack > 0) {
      this.playerAttack += dt * 5;
      const p = this.playerAttack;
      let ang;
      if (p < 0.5)      ang = THREE.MathUtils.lerp(0, -2.4, p / 0.5);
      else if (p < 1.0) ang = THREE.MathUtils.lerp(-2.4, 1.4, (p - 0.5) / 0.5);
      else              ang = THREE.MathUtils.lerp(1.4, 0, Math.min((p - 1) / 0.5, 1));
      this.playerSword.rotation.x = ang;
      this.playerArmR.rotation.x = ang * 0.7;
      if (p >= 1.5) {
        this.playerAttack = 0;
        this.playerSword.rotation.x = 0;
        this.playerArmR.rotation.x = 0;
      }
    }

    if (this.playerCape) this.playerCape.rotation.z = Math.sin(t * 1.2) * 0.05;

    // Cape sway with velocity.
    if (this.playerCape) {
      const v = this.playerVel.length();
      this.playerCape.rotation.x = -0.08 - v * 0.06;
    }

    // Bots + dummies.
    for (const bot of this.bots) bot.update(dt, t, this.dummies);
    for (const d of this.dummies) d.update(dt);

    // Combo decay.
    if (this.combo > 0 && (t - this.lastComboTime) > 3.5) {
      this.combo = 0;
      if (this.callbacks.onCombo) this.callbacks.onCombo(0);
    }

    // Torch flicker.
    for (const torch of this.torches) {
      const flick = 1 + Math.sin(t * 8 + torch.phase) * 0.25 + Math.random() * 0.08;
      torch.light.intensity = torch.base * flick;
      torch.flame.scale.setScalar(0.9 + flick * 0.15);
    }

    // Rune ring + glyph.
    if (this.runeRing)  this.runeRing.rotation.z += dt * 0.18;
    if (this.runeGlyph) this.runeGlyph.rotation.z -= dt * 0.36;

    // Enemies.
    for (const [id, e] of this.enemies) {
      if (e.spawnAnim < 1) {
        e.spawnAnim = Math.min(1, e.spawnAnim + dt * 1.6);
        const ease = 1 - Math.pow(1 - e.spawnAnim, 3);
        e.mesh.position.y = THREE.MathUtils.lerp(-1.5, e.basePos.y, ease);
      } else {
        const bob = Math.sin(t * 2 + e.bobPhase) * 0.12;
        e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.position.y, e.basePos.y + bob, 0.2);
      }
      if (e.difficulty === 'easy' && e.body) {
        e.body.scale.y = 0.7 + Math.sin(t * 3 + e.bobPhase) * 0.08;
        e.body.scale.x = 1 + Math.sin(t * 3 + e.bobPhase + Math.PI) * 0.06;
        e.body.scale.z = e.body.scale.x;
      }
      if (e.flashTimer > 0) {
        e.flashTimer -= dt;
        const k = Math.max(0, e.flashTimer / 0.35);
        e.bodyMat.emissive.setRGB(1 * k, 1 * k, 1 * k);
        e.bodyMat.emissiveIntensity = 0.15 + k * 1.5;
      }
      if (e.dying) {
        e.dyingTimer += dt;
        const k = Math.min(1, e.dyingTimer / 0.9);
        e.mesh.scale.setScalar((1 - k) * (DIFFICULTY[e.difficulty]?.scale || 1));
        e.mesh.rotation.y += dt * 6;
        e.mesh.position.y += dt * 1.5;
        if (k >= 1) this.removeEnemy(id);
      }
    }

    // Dragon wings.
    if (this._wings) {
      for (const w of this._wings) {
        const flap = Math.sin(t * 4) * 0.4;
        w.wings[0].rotation.z = 0.3 + flap;
        w.wings[1].rotation.z = -0.3 - flap;
      }
    }

    // Embers.
    if (this.embers) {
      const pos = this.embers.pts.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.array[i * 3 + 1] + this.embers.speeds[i] * dt;
        if (y > 18) {
          y = -2;
          pos.array[i * 3 + 0] = (Math.random() - 0.5) * 60;
          pos.array[i * 3 + 2] = (Math.random() - 0.5) * 60;
        }
        pos.array[i * 3 + 1] = y;
        pos.array[i * 3 + 0] += Math.sin(t * 0.5 + i) * dt * 0.05;
      }
      pos.needsUpdate = true;
    }

    // Burst particles.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const pos = p.pts.geometry.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        pos.array[j * 3 + 0] += p.vel[j].x * dt;
        pos.array[j * 3 + 1] += p.vel[j].y * dt;
        pos.array[j * 3 + 2] += p.vel[j].z * dt;
        p.vel[j].y -= 4 * dt;
      }
      pos.needsUpdate = true;
      p.pts.material.opacity = Math.max(0, 1 - p.life / p.max);
      if (p.life >= p.max) {
        this.scene.remove(p.pts);
        p.pts.geometry.dispose();
        p.pts.material.dispose();
        this.particles.splice(i, 1);
      }
    }

    this._updateDayNight(dt);
    this._updateCamera(dt);

    if (this.cameraMode === 'orbit') this.controls.update();
    this.composer.render();
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
