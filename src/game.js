import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { CHARACTERS, KEY_MAPS } from "./moves.js";
import { SoundCandy } from "./audio.js";
import { OnlineSession } from "./net.js";

const ROUND_SECONDS = 60;
const ROUNDS_TO_WIN = 2;
const ARENA_MIN_X = -4.25;
const ARENA_MAX_X = 4.25;
const START_X = 2.55;
const SHOWCASE_POSITIONS = [-3.15, -0.55];
const MODEL_YAW = 0.92;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (current, target, speed, dt) => lerp(current, target, 1 - Math.exp(-speed * dt));
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOutSine = (t) => -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
const dampAngle = (current, target, speed, dt) => {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-speed * dt));
};

function canvasTexture(size, painter) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  painter(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function roundedLabelTexture(text, background, foreground) {
  return canvasTexture(512, (context, size) => {
    context.clearRect(0, 0, size, size);
    context.fillStyle = background;
    context.beginPath();
    context.roundRect(28, 122, size - 56, 268, 90);
    context.fill();
    context.fillStyle = foreground;
    context.font = "900 148px 'Microsoft YaHei', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, size / 2, 257);
  });
}

class EffectSystem {
  constructor(scene, camera, layer) {
    this.scene = scene;
    this.camera = camera;
    this.layer = layer;
    this.effects = [];
    this.textures = {
      spark: canvasTexture(128, (context, size) => {
        const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.2, "rgba(255,247,210,1)");
        gradient.addColorStop(0.5, "rgba(255,192,111,.8)");
        gradient.addColorStop(1, "rgba(255,140,160,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);
      }),
      heart: canvasTexture(128, (context, size) => {
        context.translate(size / 2, size / 2 + 4);
        context.fillStyle = "#ff668c";
        context.strokeStyle = "rgba(255,255,255,.9)";
        context.lineWidth = 7;
        context.beginPath();
        context.moveTo(0, 33);
        context.bezierCurveTo(-55, -10, -44, -47, -8, -27);
        context.bezierCurveTo(0, -22, 0, -22, 8, -27);
        context.bezierCurveTo(44, -47, 55, -10, 0, 33);
        context.fill();
        context.stroke();
      }),
      star: canvasTexture(128, (context, size) => {
        context.translate(size / 2, size / 2);
        context.rotate(-0.2);
        context.fillStyle = "#ffd56d";
        context.strokeStyle = "#fff8dd";
        context.lineWidth = 7;
        context.beginPath();
        for (let i = 0; i < 10; i += 1) {
          const radius = i % 2 === 0 ? 47 : 19;
          const angle = -Math.PI / 2 + (i * Math.PI) / 5;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        context.fill();
        context.stroke();
      }),
      dust: canvasTexture(128, (context, size) => {
        const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, "rgba(255,247,231,.92)");
        gradient.addColorStop(0.55, "rgba(220,188,166,.6)");
        gradient.addColorStop(1, "rgba(174,132,112,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);
      }),
      afterimage: canvasTexture(128, (context, size) => {
        const gradient = context.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, "rgba(255,255,255,.76)");
        gradient.addColorStop(0.5, "rgba(255,225,224,.34)");
        gradient.addColorStop(1, "rgba(255,180,195,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);
      }),
      slash: canvasTexture(256, (context, size) => {
        context.translate(size / 2, size / 2);
        const gradient = context.createLinearGradient(-110, 0, 110, 0);
        gradient.addColorStop(0, "rgba(255,255,255,0)");
        gradient.addColorStop(0.32, "rgba(255,255,255,.95)");
        gradient.addColorStop(0.58, "rgba(255,235,197,1)");
        gradient.addColorStop(1, "rgba(255,150,175,0)");
        context.strokeStyle = gradient;
        context.lineWidth = 18;
        context.lineCap = "round";
        context.beginPath();
        context.arc(0, 15, 94, -1.18, 1.05);
        context.stroke();
        context.strokeStyle = "rgba(255,255,255,.65)";
        context.lineWidth = 5;
        context.beginPath();
        context.arc(0, 15, 77, -1.1, 0.92);
        context.stroke();
      }),
      aura: canvasTexture(256, (context, size) => {
        const radial = context.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
        radial.addColorStop(0, "rgba(255,255,255,.88)");
        radial.addColorStop(0.22, "rgba(255,207,174,.55)");
        radial.addColorStop(0.6, "rgba(255,132,164,.18)");
        radial.addColorStop(1, "rgba(255,110,145,0)");
        context.fillStyle = radial;
        context.fillRect(0, 0, size, size);
        context.strokeStyle = "rgba(255,255,255,.65)";
        context.lineWidth = 3;
        for (let index = 0; index < 16; index += 1) {
          const angle = (index / 16) * Math.PI * 2;
          context.beginPath();
          context.moveTo(size / 2 + Math.cos(angle) * 22, size / 2 + Math.sin(angle) * 22);
          context.lineTo(size / 2 + Math.cos(angle) * (58 + (index % 3) * 18), size / 2 + Math.sin(angle) * (58 + (index % 3) * 18));
          context.stroke();
        }
      }),
      burstRing: canvasTexture(128, (context, size) => {
        const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.22, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, "rgba(255,255,255,0)");
        gradient.addColorStop(0.72, "rgba(255,255,255,.05)");
        gradient.addColorStop(0.84, "rgba(255,246,218,.92)");
        gradient.addColorStop(0.93, "rgba(255,164,185,.4)");
        gradient.addColorStop(1, "rgba(255,130,165,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);
      }),
      bolt: canvasTexture(256, (context, size) => {
        context.translate(size / 2, size / 2);
        context.lineJoin = "round";
        context.lineCap = "round";
        context.shadowBlur = 20;
        context.shadowColor = "#ff5a92";
        const paths = [
          [[-116, 56], [-76, 42], [-50, 15], [-18, 28], [11, -8], [43, 7], [74, -25], [116, -14]],
          [[-108, 39], [-66, 25], [-34, 48], [-7, 19], [24, 35], [58, 8], [110, 22]],
          [[-111, -24], [-68, -12], [-38, -37], [-6, -17], [32, -29], [69, 2], [112, -7]]
        ];
        for (const path of paths) {
          context.strokeStyle = "rgba(255,104,153,.65)";
          context.lineWidth = 12;
          context.beginPath();
          path.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
          context.stroke();
          context.strokeStyle = "rgba(255,248,229,.88)";
          context.lineWidth = 4;
          context.stroke();
        }
      }),
      flare: canvasTexture(256, (context, size) => {
        const center = size / 2;
        const glow = context.createRadialGradient(center, center, 2, center, center, center);
        glow.addColorStop(0, "rgba(255,255,255,1)");
        glow.addColorStop(0.16, "rgba(255,247,220,.96)");
        glow.addColorStop(0.42, "rgba(255,118,167,.42)");
        glow.addColorStop(1, "rgba(255,92,150,0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, size, size);

        context.translate(center, center);
        context.globalCompositeOperation = "lighter";
        for (let index = 0; index < 12; index += 1) {
          const angle = (index / 12) * Math.PI * 2;
          const length = index % 2 === 0 ? 112 : 72;
          context.save();
          context.rotate(angle);
          const ray = context.createLinearGradient(0, 0, length, 0);
          ray.addColorStop(0, "rgba(255,255,255,.96)");
          ray.addColorStop(0.64, "rgba(255,195,215,.48)");
          ray.addColorStop(1, "rgba(255,100,160,0)");
          context.fillStyle = ray;
          context.beginPath();
          context.moveTo(0, -5);
          context.lineTo(length, 0);
          context.lineTo(0, 5);
          context.closePath();
          context.fill();
          context.restore();
        }
      }),
      shard: canvasTexture(128, (context, size) => {
        context.translate(size / 2, size / 2);
        context.rotate(0.18);
        const shardFill = context.createLinearGradient(-28, -48, 32, 44);
        shardFill.addColorStop(0, "rgba(255,255,255,1)");
        shardFill.addColorStop(0.35, "rgba(255,226,242,.95)");
        shardFill.addColorStop(1, "rgba(255,88,156,.08)");
        context.fillStyle = shardFill;
        context.strokeStyle = "rgba(255,255,255,.95)";
        context.lineWidth = 4;
        context.shadowBlur = 18;
        context.shadowColor = "#ff75aa";
        context.beginPath();
        context.moveTo(0, -51);
        context.lineTo(28, -8);
        context.lineTo(15, 48);
        context.lineTo(-20, 22);
        context.lineTo(-31, -18);
        context.closePath();
        context.fill();
        context.stroke();
        context.fillStyle = "rgba(255,255,255,.72)";
        context.beginPath();
        context.moveTo(-2, -38);
        context.lineTo(12, -5);
        context.lineTo(1, 28);
        context.lineTo(-1, -9);
        context.closePath();
        context.fill();
      }),
      comet: canvasTexture(256, (context, size) => {
        context.translate(size / 2, size / 2);
        const streak = context.createLinearGradient(-118, 0, 112, 0);
        streak.addColorStop(0, "rgba(255,255,255,0)");
        streak.addColorStop(0.3, "rgba(255,184,214,.34)");
        streak.addColorStop(0.72, "rgba(255,242,249,.98)");
        streak.addColorStop(1, "rgba(255,118,164,0)");
        context.fillStyle = streak;
        context.beginPath();
        context.moveTo(-122, 0);
        context.quadraticCurveTo(0, -25, 116, -2);
        context.quadraticCurveTo(10, 14, -122, 0);
        context.fill();
        const core = context.createRadialGradient(42, 0, 0, 42, 0, 42);
        core.addColorStop(0, "rgba(255,255,255,1)");
        core.addColorStop(0.35, "rgba(255,231,242,.86)");
        core.addColorStop(1, "rgba(255,108,158,0)");
        context.fillStyle = core;
        context.fillRect(0, -52, 112, 104);
      })
    };
  }

  createSprite(type, position, color, scale) {
    const material = new THREE.SpriteMaterial({
      map: this.textures[type],
      color,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: ["spark", "aura", "slash", "burstRing", "bolt", "flare", "shard", "comet"].includes(type)
        ? THREE.AdditiveBlending
        : THREE.NormalBlending,
      opacity: 1
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(scale);
    this.scene.add(sprite);
    return sprite;
  }

  burst(x, y, type = "spark", count = 9, color = 0xffffff, power = 2.4) {
    if (type === "afterimage") {
      const sprite = this.createSprite("afterimage", new THREE.Vector3(x, y + 1.45, 0.15), color, 2.2);
      this.effects.push({ object: sprite, life: 0.3, maxLife: 0.3, vx: 0, vy: 0.1, spin: 0, grow: -0.4 });
      return;
    }
    for (let i = 0; i < count; i += 1) {
      const sprite = this.createSprite(
        type,
        new THREE.Vector3(x + (Math.random() - 0.5) * 0.35, y + 1.25 + (Math.random() - 0.5) * 0.25, 0.35),
        color,
        type === "dust" ? 0.38 + Math.random() * 0.32 : 0.18 + Math.random() * 0.26
      );
      const angle = Math.random() * Math.PI * 2;
      this.effects.push({
        object: sprite,
        life: 0.42 + Math.random() * 0.36,
        maxLife: 0.78,
        vx: Math.cos(angle) * power * (0.4 + Math.random() * 0.7),
        vy: Math.sin(angle) * power * (0.42 + Math.random() * 0.8) + 0.75,
        spin: (Math.random() - 0.5) * 7,
        grow: type === "dust" ? 0.8 : -0.05,
        gravity: type === "heart" ? -0.2 : 2.6,
        baseScale: sprite.scale.x
      });
    }
  }

  ring(x, y, color = 0xffd2dc, scale = 1.3) {
    const geometry = new THREE.RingGeometry(0.45, 0.58, 64);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.position.set(x, y + 1.05, 0.22);
    ring.scale.setScalar(0.3);
    this.scene.add(ring);
    this.effects.push({ object: ring, life: 0.4, maxLife: 0.4, ring: true, targetScale: scale });
  }

  slash(x, y, direction, color = 0xffffff, size = 1.5, rotation = -0.18) {
    const sprite = this.createSprite("slash", new THREE.Vector3(x, y, 0.48), color, size);
    sprite.material.rotation = rotation;
    sprite.scale.set(size * 1.55, size * 0.72, 1);
    this.effects.push({
      object: sprite,
      life: 0.24,
      maxLife: 0.24,
      vx: direction * 1.6,
      vy: 0.45,
      spin: 0,
      grow: 1.4,
      gravity: -0.6
    });
  }

  aura(x, y, color = 0xffc1ce, scale = 2.4) {
    const sprite = this.createSprite("aura", new THREE.Vector3(x, y + 1.35, 0.08), color, scale);
    this.effects.push({
      object: sprite,
      life: 0.45,
      maxLife: 0.45,
      vx: 0,
      vy: 0.35,
      spin: 0.9,
      grow: 0.3,
      gravity: 0
    });
  }

  bolt(x, y, direction, color = 0xff6c9d, scale = 2.2) {
    const sprite = this.createSprite("bolt", new THREE.Vector3(x, y, 0.5), color, scale);
    sprite.scale.set(scale * 2.2, scale * 0.68, 1);
    sprite.material.rotation = direction * 0.08;
    this.effects.push({
      object: sprite,
      life: 0.24,
      maxLife: 0.24,
      vx: direction * 2.2,
      vy: 0.18,
      spin: direction * 0.5,
      grow: 1.6,
      gravity: -0.4
    });
  }

  flare(x, y, color = 0xff8db3, scale = 1.8) {
    const sprite = this.createSprite("flare", new THREE.Vector3(x, y + 1.12, 0.6), color, scale);
    sprite.scale.set(scale * 1.45, scale * 1.45, 1);
    this.effects.push({
      object: sprite,
      life: 0.24,
      maxLife: 0.24,
      vx: 0,
      vy: 0.08,
      spin: 0.7,
      grow: 2.4,
      gravity: 0
    });
  }

  comet(x, y, direction, color = 0xffc1d5, scale = 1.2) {
    const sprite = this.createSprite("comet", new THREE.Vector3(x, y + 1.05, 0.52), color, scale);
    sprite.scale.set(scale * 2.7, scale * 0.72, 1);
    sprite.material.rotation = direction < 0 ? Math.PI : 0;
    this.effects.push({
      object: sprite,
      life: 0.28,
      maxLife: 0.28,
      vx: direction * 2.8,
      vy: 0.22,
      spin: direction * 0.35,
      grow: 1.2,
      gravity: -0.35
    });
  }

  shockwave(x, color = 0xffefcf, scale = 3.6) {
    const sprite = this.createSprite("burstRing", new THREE.Vector3(x, 0.18, 0.32), color, 0.8);
    sprite.scale.set(0.8, 0.25, 1);
    this.effects.push({
      object: sprite,
      life: 0.38,
      maxLife: 0.38,
      vx: 0,
      vy: 0,
      spin: 0,
      grow: 0,
      shock: true,
      targetScale: scale
    });
  }

  ghost(group, color = 0xffaec2, opacity = 0.24) {
    const ghost = group.clone(true);
    ghost.position.copy(group.position);
    ghost.quaternion.copy(group.quaternion);
    ghost.scale.copy(group.scale);
    ghost.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const faded = materials.map((material) => {
        const clone = material.clone();
        clone.transparent = true;
        clone.opacity = opacity;
        clone.depthWrite = false;
        if (clone.color) clone.color.lerp(new THREE.Color(color), 0.32);
        return clone;
      });
      object.material = Array.isArray(object.material) ? faded : faded[0];
      object.castShadow = false;
      object.receiveShadow = false;
      object.renderOrder = 3;
    });
    this.scene.add(ghost);
    this.effects.push({
      object: ghost,
      life: 0.28,
      maxLife: 0.28,
      ghost: true,
      vx: 0,
      vy: 0,
      spin: 0,
      grow: 0
    });
  }

  floatText(x, y, text, className = "") {
    const screen = this.toScreen(x, y + 1.85);
    const element = document.createElement("span");
    element.className = `floating-number ${className}`.trim();
    element.textContent = text;
    element.style.left = `${screen.x}px`;
    element.style.top = `${screen.y}px`;
    this.layer.appendChild(element);
    window.setTimeout(() => element.remove(), 900);
  }

  floatWord(x, y, text) {
    const screen = this.toScreen(x, y + 2.15);
    const element = document.createElement("span");
    element.className = "floating-word";
    element.textContent = text;
    element.style.left = `${screen.x}px`;
    element.style.top = `${screen.y}px`;
    this.layer.appendChild(element);
    window.setTimeout(() => element.remove(), 950);
  }

  toScreen(x, y, z = 0) {
    const vector = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.layer.getBoundingClientRect();
    return {
      x: (vector.x * 0.5 + 0.5) * rect.width,
      y: (-vector.y * 0.5 + 0.5) * rect.height
    };
  }

  update(dt) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      effect.life -= dt;
      const progress = 1 - effect.life / effect.maxLife;
      if (effect.ring) {
        effect.object.scale.setScalar(lerp(0.3, effect.targetScale, easeOutCubic(progress)));
        effect.object.material.opacity = (1 - progress) * 0.78;
      } else if (effect.shock) {
        const spread = lerp(0.8, effect.targetScale, easeOutCubic(progress));
        effect.object.scale.set(spread, spread * 0.28, 1);
        effect.object.material.opacity = (1 - progress) * 0.82;
      } else if (effect.ghost) {
        effect.object.traverse((object) => {
          if (!object.isMesh) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.opacity = (1 - progress) * 0.24;
        });
      } else {
        effect.object.position.x += effect.vx * dt;
        effect.object.position.y += effect.vy * dt;
        effect.vy -= (effect.gravity ?? 0) * dt;
        effect.vx *= Math.exp(-2.2 * dt);
        effect.object.material.rotation += effect.spin * dt;
        const scale = Math.max(0.01, effect.object.scale.x + effect.grow * dt);
        effect.object.scale.setScalar(scale);
        effect.object.material.opacity = Math.pow(1 - progress, 1.3);
      }
      if (effect.life <= 0) {
        this.scene.remove(effect.object);
        this.disposeEffect(effect.object, !effect.ghost);
        this.effects.splice(i, 1);
      }
    }
  }

  disposeEffect(object, disposeGeometry = true) {
    object.traverse?.((child) => {
      if (disposeGeometry) child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      for (const material of materials) material.dispose?.();
    });
    if (disposeGeometry) object.geometry?.dispose?.();
    object.material?.dispose?.();
  }

  clear() {
    for (const effect of this.effects) {
      this.scene.remove(effect.object);
      this.disposeEffect(effect.object, !effect.ghost);
    }
    this.effects.length = 0;
  }
}

class ArenaScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#15101d");
    this.scene.fog = new THREE.Fog("#15101d", 13, 25);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    this.camera.position.set(0, 3.2, 11.2);
    this.camera.lookAt(0, 1.75, 0);
    this.baseCameraPosition = this.camera.position.clone();
    this.shake = 0;
    this.zoom = 0;
    this.focusTarget = 0;
    this.clock = 0;
    this.petals = [];
    this.ambientOrbs = [];
    this.ambientRings = [];
    this.neonLights = [];

    this.setupLights();
    this.setupRoom();
    this.effects = new EffectSystem(this.scene, this.camera, document.querySelector("#vfx-layer"));
    this.resize();
  }

  setupLights() {
    const hemisphere = new THREE.HemisphereLight(0xaab7ff, 0x241522, 1.65);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xffe7e6, 4.4);
    key.position.set(-4.5, 8.5, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -3;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 25;
    key.shadow.bias = -0.0003;
    this.scene.add(key);

    const fill = new THREE.PointLight(0xff3d8e, 38, 14, 2);
    fill.position.set(4.8, 4.8, 3.5);
    this.scene.add(fill);

    const rim = new THREE.SpotLight(0x58e8ff, 30, 18, 0.52, 0.6, 1.3);
    rim.position.set(-5.5, 7.5, 0);
    rim.target.position.set(0, 1.3, 0);
    this.scene.add(rim, rim.target);

    const backGlow = new THREE.PointLight(0xff8c48, 26, 9, 2);
    backGlow.position.set(0, 2.2, -2.4);
    this.scene.add(backGlow);
  }

  material(color, roughness = 0.75, metalness = 0) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  neon(color, intensity = 2.2) {
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.35,
      metalness: 0.18
    });
  }

  box(name, size, position, material, radius = 0.08) {
    const geometry =
      radius > 0
        ? new RoundedBoxGeometry(size[0], size[1], size[2], 5, radius)
        : new THREE.BoxGeometry(size[0], size[1], size[2]);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  makeWallSign(text, x, color, foreground) {
    const texture = roundedLabelTexture(text, color, foreground);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.55), material);
    sign.position.set(x, 5.2, -3.27);
    sign.rotation.z = text === "一二" ? -0.055 : 0.055;
    this.scene.add(sign);
  }

  setupRoom() {
    const wallpaper = this.material("#281d30", 0.92);
    const floor = new THREE.MeshPhysicalMaterial({
      color: "#19131f",
      roughness: 0.42,
      metalness: 0.24,
      clearcoat: 0.9,
      clearcoatRoughness: 0.18
    });
    const floorLight = new THREE.MeshPhysicalMaterial({
      color: "#39233b",
      roughness: 0.35,
      metalness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.14
    });
    const cream = this.material("#d6becb", 0.58);
    const pink = this.neon("#ff3f82", 1.65);
    const cocoa = this.material("#15101b", 0.5);
    const gold = this.neon("#ffb64e", 1.25);
    const leaf = this.material("#36584f", 0.82);

    this.box("午夜拳台墙面", [19, 9.4, 0.3], [0, 3.75, -4], wallpaper, 0);
    this.box("墙面霓虹腰线", [19, 0.08, 0.36], [0, 1.02, -3.78], this.neon("#ff427e", 2.4), 0.04);
    this.box("暗色木地板", [22, 0.2, 13], [0, -0.15, 0.4], floor, 0.03);
    this.box("拳台边台", [11.6, 0.07, 4.95], [0, -0.025, 0.35], floorLight, 0.22);

    for (let index = -10; index <= 10; index += 1) {
      const line = this.box("木地板拼缝", [0.016, 0.004, 12], [index * 0.72, -0.018, 0.2], this.material("#3f2940", 1), 0);
      line.receiveShadow = false;
    }

    const mat = new THREE.Mesh(
      new THREE.CircleGeometry(3.7, 96),
      new THREE.MeshPhysicalMaterial({
        color: "#56283f",
        roughness: 0.52,
        metalness: 0.18,
        clearcoat: 0.85,
        clearcoatRoughness: 0.22,
        transparent: true,
        opacity: 0.96
      })
    );
    mat.name = "软糖拳台软垫";
    mat.rotation.x = -Math.PI / 2;
    mat.scale.set(1.55, 0.72, 1);
    mat.position.set(0, 0.012, 0.25);
    mat.receiveShadow = true;
    this.scene.add(mat);

    const matBorder = new THREE.Mesh(
      new THREE.RingGeometry(3.62, 3.82, 96),
      this.neon("#ff4d83", 2.1)
    );
    matBorder.rotation.x = -Math.PI / 2;
    matBorder.scale.set(1.55, 0.72, 1);
    matBorder.position.set(0, 0.018, 0.25);
    this.scene.add(matBorder);

    const matInlay = new THREE.Mesh(
      new THREE.RingGeometry(2.72, 2.78, 96),
      new THREE.MeshBasicMaterial({
        color: "#ff9abb",
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    matInlay.rotation.x = -Math.PI / 2;
    matInlay.scale.set(1.55, 0.72, 1);
    matInlay.position.set(0, 0.022, 0.25);
    this.scene.add(matInlay);

    for (const [x, color] of [[-6.15, "#55e7ff"], [6.15, "#ff477f"]]) {
      this.box("拳台霓虹立柱", [0.075, 3.8, 0.075], [x, 1.9, -2.45], this.neon(color, 2.6), 0.025);
      this.box("拳台横向灯条", [1.7, 0.055, 0.06], [x + Math.sign(-x) * 0.82, 3.68, -2.45], this.neon(color, 2.1), 0.02);
    }
    for (const [height, color] of [[0.55, "#ff7da9"], [1.22, "#ffb8d1"], [1.9, "#ff6598"]]) {
      const ropeMaterial = new THREE.MeshPhysicalMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.42,
        roughness: 0.34,
        metalness: 0.15,
        transparent: true,
        opacity: 0.72
      });
      this.box("拳台弹力围绳", [11.6, 0.035, 0.035], [0, height, -2.32], ropeMaterial, 0.018);
    }
    this.box("前景灯带", [4.7, 0.04, 0.06], [-3.9, 0.03, 1.7], this.neon("#ff4f82", 1.9), 0.018);
    this.box("前景灯带", [4.7, 0.04, 0.06], [3.9, 0.03, 1.7], this.neon("#59e9ff", 1.9), 0.018);

    // Central cloud window keeps the characters readable while hinting at the cozy room.
    const windowGroup = new THREE.Group();
    windowGroup.position.set(0, 4.45, -3.78);
    this.scene.add(windowGroup);
    const windowGlass = new THREE.Mesh(new THREE.CircleGeometry(1.38, 64), new THREE.MeshStandardMaterial({
      color: "#101b31",
      emissive: "#1b2f63",
      emissiveIntensity: 0.42,
      roughness: 0.22,
      metalness: 0.05
    }));
    windowGroup.add(windowGlass);
    const archFrame = new THREE.Mesh(new THREE.RingGeometry(1.36, 1.52, 64), cream);
    archFrame.position.z = 0.04;
    windowGroup.add(archFrame);
    const horizon = this.box("窗外城市", [2.5, 0.8, 0.04], [0, -0.42, -3.73], this.material("#202745", 0.9), 0.25);
    horizon.material.transparent = true;
    horizon.material.opacity = 0.7;
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 40),
      new THREE.MeshBasicMaterial({ color: "#ff7faf" })
    );
    sun.position.set(0.45, 4.88, -3.69);
    this.scene.add(sun);

    const haloMap = canvasTexture(256, (context, size) => {
      const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, "rgba(255,82,136,.36)");
      gradient.addColorStop(0.38, "rgba(116,62,156,.14)");
      gradient.addColorStop(1, "rgba(12,7,20,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    });
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloMap,
        color: "#ff7ca1",
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    halo.scale.set(8.5, 8.5, 1);
    halo.position.set(0, 3.9, -3.58);
    this.scene.add(halo);

    for (const [radius, color, z] of [[2.65, "#ff4c87", -3.1], [2.27, "#54e7ff", -3.04]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 10, 120), this.neon(color, 2.6));
      ring.position.set(0, 3.1, z);
      this.scene.add(ring);
      this.ambientRings.push({ mesh: ring, base: ring.material.emissiveIntensity, speed: radius > 2.4 ? 0.08 : -0.11 });
    }

    let cityX = -1.45;
    for (let index = 0; index < 9; index += 1) {
      const width = 0.22 + (index % 3) * 0.08;
      const height = 0.48 + ((index * 7) % 5) * 0.16;
      this.box(
        "窗外霓虹楼群",
        [width, height, 0.05],
        [cityX, 3.05 + height * 0.5, -3.74],
        this.material(index % 2 ? "#141b2f" : "#1d1830", 0.5, 0.2),
        0.015
      );
      for (let row = 0; row < 3; row += 1) {
        const windowLight = this.box(
          "楼宇灯火",
          [width * 0.18, 0.025, 0.012],
          [cityX + (row - 1) * width * 0.25, 3.15 + row * 0.14, -3.70],
          new THREE.MeshBasicMaterial({ color: index % 2 ? "#65e8ff" : "#ff658e" }),
          0
        );
        windowLight.castShadow = false;
      }
      cityX += width + 0.09;
    }

    const floorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(4.65, 96),
      new THREE.MeshPhysicalMaterial({
        color: "#35152d",
        emissive: "#240c20",
        emissiveIntensity: 0.4,
        metalness: 0.42,
        roughness: 0.17,
        clearcoat: 1,
        transparent: true,
        opacity: 0.3
      })
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.scale.set(1.35, 0.76, 1);
    floorGlow.position.set(0, 0.035, 0.2);
    this.scene.add(floorGlow);

    for (const [x, color] of [[-3.7, "#58e7ff"], [3.7, "#ff477f"]]) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 5.6, 40, 1, true),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.055,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      cone.position.set(x, 5.0, -0.8);
      cone.rotation.z = x < 0 ? -0.13 : 0.13;
      this.scene.add(cone);
    }

    // Suspended stage rig and spotlights add a readable simulated depth without
    // increasing the render cost of the character models.
    const rigMaterial = this.material("#16111d", 0.36, 0.5);
    this.box("顶部桁架", [12.8, 0.1, 0.1], [0, 6.15, -1.35], rigMaterial, 0.035);
    this.box("后侧桁架", [12.8, 0.075, 0.075], [0, 6.0, -2.75], rigMaterial, 0.03);
    for (let index = 0; index < 8; index += 1) {
      const x = -5.25 + index * 1.5;
      const lightColor = index % 2 ? "#63efff" : "#ff6c9b";
      this.box("灯架吊杆", [0.025, 0.52, 0.025], [x, 5.86, -1.35], rigMaterial, 0);
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.21, 0.34, 20),
        this.neon(lightColor, 1.7)
      );
      housing.position.set(x, 5.53, -1.35);
      housing.rotation.z = index % 2 ? -0.16 : 0.16;
      this.scene.add(housing);
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(0.85, 4.2, 28, 1, true),
        new THREE.MeshBasicMaterial({
          color: lightColor,
          transparent: true,
          opacity: 0.018,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      beam.position.set(x, 3.45, -1.15);
      beam.rotation.z = index % 2 ? 0.1 : -0.1;
      this.scene.add(beam);
      this.neonLights.push({ mesh: housing, base: housing.material.emissiveIntensity, phase: index * 0.63 });
    }

    // Instanced silhouettes keep the audience lively while using only two draw calls.
    const audienceBodies = new THREE.InstancedMesh(
      new RoundedBoxGeometry(0.44, 0.52, 0.3, 3, 0.14),
      new THREE.MeshStandardMaterial({ color: "#110b19", roughness: 0.92, transparent: true, opacity: 0.8 }),
      30
    );
    const audienceHeads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.17, 14, 10),
      new THREE.MeshStandardMaterial({ color: "#24162c", roughness: 0.9, transparent: true, opacity: 0.78 }),
      30
    );
    const dummy = new THREE.Object3D();
    for (let index = 0; index < 30; index += 1) {
      const row = index % 2;
      const column = Math.floor(index / 2);
      const x = -6.55 + column * 0.93 + (row ? 0.3 : 0);
      const y = 0.68 + row * 0.3;
      dummy.position.set(x, y, -2.72 - row * 0.32);
      dummy.rotation.set(0, row ? -0.16 : 0.16, 0);
      dummy.updateMatrix();
      audienceBodies.setMatrixAt(index, dummy.matrix);
      dummy.position.y += 0.42;
      dummy.updateMatrix();
      audienceHeads.setMatrixAt(index, dummy.matrix);
    }
    audienceBodies.instanceMatrix.needsUpdate = true;
    audienceHeads.instanceMatrix.needsUpdate = true;
    audienceBodies.frustumCulled = false;
    audienceHeads.frustumCulled = false;
    this.scene.add(audienceBodies, audienceHeads);

    const fairyMaterials = [new THREE.MeshBasicMaterial({ color: "#ff8eb1" }), new THREE.MeshBasicMaterial({ color: "#78eaff" })];
    for (let row = 0; row < 2; row += 1) {
      const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), fairyMaterials[row], 18);
      for (let index = 0; index < 18; index += 1) {
        dummy.position.set(-6.8 + index * 0.8, 4.88 + row * 0.2, -3.22 + row * 0.03);
        dummy.scale.setScalar(index % 3 === 0 ? 1.5 : 1);
        dummy.updateMatrix();
        bulbs.setMatrixAt(index, dummy.matrix);
      }
      bulbs.instanceMatrix.needsUpdate = true;
      this.scene.add(bulbs);
    }

    for (const [x, color] of [[-6.7, "#ff4f84"], [6.7, "#5cecff"]]) {
      const speaker = this.box("音响箱体", [0.38, 1.2, 0.32], [x, 0.59, -1.75], this.material("#16111f", 0.53, 0.18), 0.08);
      speaker.rotation.y = x < 0 ? 0.16 : -0.16;
      const speakerRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.027, 12, 32), this.neon(color, 1.8));
      speakerRing.position.set(x, 0.68, -1.57);
      this.scene.add(speakerRing);
    }

    this.makeWallSign("一二", -4.55, "#7d214a", "#ffd5e4");
    this.makeWallSign("布布", 4.55, "#604321", "#ffe0a0");

    // Small shelves and pom-pom lamps make the stage feel lived in without stealing focus.
    this.box("左侧发光搁板", [2.15, 0.13, 0.48], [-5.4, 2.55, -3.45], gold, 0.06);
    this.box("右侧发光搁板", [2.15, 0.13, 0.48], [5.4, 2.55, -3.45], gold, 0.06);
    for (const x of [-5.95, -5.35, 5.35, 5.95]) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.19 + Math.random() * 0.04, 24, 18),
        this.material(x < 0 ? "#822c52" : "#6a482a", 0.58)
      );
      orb.position.set(x, 2.78, -3.35);
      orb.castShadow = true;
      this.scene.add(orb);
    }

    const plantPot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.55, 32), this.material("#63324b", 0.65));
    plantPot.position.set(6.8, 0.28, -1.25);
    plantPot.castShadow = true;
    this.scene.add(plantPot);
    for (let index = 0; index < 10; index += 1) {
      const leafMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), leaf);
      const angle = (index / 10) * Math.PI * 2;
      leafMesh.scale.set(0.74, 1.67, 0.42);
      leafMesh.position.set(6.8 + Math.cos(angle) * 0.38, 0.95 + (index % 3) * 0.15, -1.25 + Math.sin(angle) * 0.3);
      leafMesh.rotation.z = Math.cos(angle) * 0.7;
      leafMesh.castShadow = true;
      this.scene.add(leafMesh);
    }

    const lamp = new THREE.Group();
    lamp.position.set(-6.9, 0, -1.2);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.7, 16), cocoa);
    pole.position.y = 1.85;
    lamp.add(pole);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.8, 40, 1, true), this.neon("#ef3f7b", 1.25));
    shade.position.y = 3.5;
    shade.castShadow = true;
    lamp.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), new THREE.MeshBasicMaterial({ color: "#ffb35b" }));
    bulb.position.y = 3.18;
    lamp.add(bulb);
    const lampLight = new THREE.PointLight("#ff6a9a", 22, 8, 2);
    lampLight.position.y = 3.18;
    lamp.add(lampLight);
    this.scene.add(lamp);

    // Floating paper confetti and soft dust add depth to the fixed side-view stage.
    for (let index = 0; index < 35; index += 1) {
      const colors = [0xff4e8d, 0x56e6ff, 0xffbe5c, 0xd9c5ff];
      const particle = new THREE.Mesh(
        new THREE.CircleGeometry(0.025 + Math.random() * 0.035, 8),
        new THREE.MeshBasicMaterial({
          color: colors[index % colors.length],
          transparent: true,
          opacity: 0.2 + Math.random() * 0.38,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      particle.position.set(-7 + Math.random() * 14, 2 + Math.random() * 5.5, -2.7 + Math.random() * 2.2);
      particle.rotation.z = Math.random() * Math.PI;
      particle.userData = {
        baseX: particle.position.x,
        speed: 0.08 + Math.random() * 0.18,
        phase: Math.random() * Math.PI * 2
      };
      this.petals.push(particle);
      this.scene.add(particle);
    }

    for (let index = 0; index < 8; index += 1) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 + Math.random() * 0.07, 16, 12),
        new THREE.MeshBasicMaterial({
          color: index % 2 ? "#5fe7ff" : "#ff4f8d",
          transparent: true,
          opacity: 0.23,
          depthWrite: false
        })
      );
      orb.position.set(-5 + Math.random() * 10, 2.8 + Math.random() * 3.3, -1.5 + Math.random());
      orb.userData = { phase: Math.random() * Math.PI * 2, baseY: orb.position.y };
      this.ambientOrbs.push(orb);
      this.scene.add(orb);
    }
  }

  async loadCharacters() {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("./vendor/three/examples/jsm/libs/draco/gltf/");
    loader.setDRACOLoader(dracoLoader);
    const gltf = await loader.loadAsync("./assets/characters_v2.glb");
    const characters = {};
    const roots = [
      ["yiyi", "ROOT_一二"],
      ["bubu", "ROOT_布布"]
    ];

    for (const [id, rootName] of roots) {
      const root = gltf.scene.getObjectByName(rootName);
      if (!root) throw new Error(`GLB 中找不到 ${rootName}`);
      root.removeFromParent();
      root.position.x = 0;
      root.updateMatrixWorld(true);

      const bounds = new THREE.Box3().setFromObject(root);
      root.position.y -= bounds.min.y;

      root.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = false;
        if (Array.isArray(object.material)) object.material = object.material.map((material) => material.clone());
        else object.material = object.material.clone();

        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material.emissive) material.userData.baseEmissive = material.emissive.clone();
          if (material.color) material.userData.baseColor = material.color.clone();
        }
      });

      const group = new THREE.Group();
      group.name = `FIGHTER_${id}`;
      group.add(root);
      this.scene.add(group);

      // The source GLB intentionally keeps the rounded body parts as editable
      // meshes rather than deforming one skin. Build real hinge groups around
      // the shoulders, hips, and neck so the short limbs can move without
      // flattening the soft silhouette.
      const pivotSpecs = {
        head: { parent: null, position: [0, 1.48, 0], meshes: [] },
        armL: { parent: null, position: [-0.56, 1.43, 0], meshes: [] },
        handL: { parent: "armL", position: [-0.14, -0.41, -0.02], meshes: [] },
        armR: { parent: null, position: [0.56, 1.43, 0], meshes: [] },
        handR: { parent: "armR", position: [0.14, -0.41, -0.02], meshes: [] },
        legL: { parent: null, position: [-0.285, 0.62, 0], meshes: [] },
        footL: { parent: "legL", position: [0, -0.40, -0.01], meshes: [] },
        legR: { parent: null, position: [0.285, 0.62, 0], meshes: [] },
        footR: { parent: "legR", position: [0, -0.40, -0.01], meshes: [] },
        tail: { parent: null, position: [0, 0.94, -0.22], meshes: [] }
      };
      const meshes = [];
      root.traverse((object) => {
        if (object.isMesh) meshes.push(object);
      });
      for (const mesh of meshes) {
        const name = mesh.name;
        if (/_10_短手臂_L/.test(name)) pivotSpecs.armL.meshes.push(mesh);
        else if (/_10_短手臂_R/.test(name)) pivotSpecs.armR.meshes.push(mesh);
        else if (/_11_圆手掌_L/.test(name)) pivotSpecs.handL.meshes.push(mesh);
        else if (/_11_圆手掌_R/.test(name)) pivotSpecs.handR.meshes.push(mesh);
        else if (/_12_短腿_L/.test(name)) pivotSpecs.legL.meshes.push(mesh);
        else if (/_12_短腿_R/.test(name)) pivotSpecs.legR.meshes.push(mesh);
        else if (/(_13_黑色脚掌_L|_14_脚趾缝_L)/.test(name)) pivotSpecs.footL.meshes.push(mesh);
        else if (/(_13_黑色脚掌_R|_14_脚趾缝_R)/.test(name)) pivotSpecs.footR.meshes.push(mesh);
        else if (/(_17_背面尾巴|_18_侧面小尾巴|_18_背面尾巴)/.test(name)) pivotSpecs.tail.meshes.push(mesh);
        else if (/(_02_|_03_|_04_|_05_|_06_|_07_|_08_|_09_)/.test(name)) pivotSpecs.head.meshes.push(mesh);
      }

      const pivots = {};
      for (const [key, spec] of Object.entries(pivotSpecs)) {
        const pivot = new THREE.Group();
        pivot.name = `PIVOT_${id}_${key}`;
        pivot.position.set(...spec.position);
        const parent = spec.parent ? pivots[spec.parent].object : root;
        parent.add(pivot);
        parent.updateMatrixWorld(true);
        pivot.updateMatrixWorld(true);
        for (const mesh of spec.meshes) pivot.attach(mesh);
        pivots[key] = { object: pivot, base: pivot.quaternion.clone() };
      }

      const shadowTexture = this.effects.textures.afterimage;
      const shadow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: shadowTexture,
          color: "#7f594f",
          transparent: true,
          opacity: 0.28,
          depthWrite: false
        })
      );
      shadow.scale.set(2.2, 0.65, 1);
      shadow.position.set(0, 0.03, 0.1);
      this.scene.add(shadow);

      characters[id] = { root, group, pivots, shadow, visualYaw: 0 };
    }

    return characters;
  }

  addShake(amount) {
    this.shake = Math.max(this.shake, amount);
  }

  addZoom(amount) {
    this.zoom = Math.max(this.zoom, amount);
  }

  setCombatFocus(x) {
    this.focusTarget = clamp(x * 0.22, -0.7, 0.7);
  }

  updateAmbient(dt, elapsed) {
    this.clock = elapsed;
    this.baseCameraPosition.x = damp(this.baseCameraPosition.x, this.focusTarget, 2.8, dt);
    for (const petal of this.petals) {
      petal.position.y -= petal.userData.speed * dt;
      petal.position.x = petal.userData.baseX + Math.sin(elapsed * 0.5 + petal.userData.phase) * 0.22;
      petal.rotation.z += dt * 0.45;
      if (petal.position.y < 1.5) petal.position.y = 7.5;
    }
    for (const orb of this.ambientOrbs) {
      orb.position.y = orb.userData.baseY + Math.sin(elapsed * 0.72 + orb.userData.phase) * 0.12;
    }
    for (const ring of this.ambientRings) {
      ring.mesh.rotation.z += dt * ring.speed;
      ring.mesh.material.emissiveIntensity = ring.base + Math.sin(elapsed * 1.15) * 0.28;
    }
    for (const light of this.neonLights) {
      light.mesh.material.emissiveIntensity = light.base + Math.sin(elapsed * 2.1 + light.phase) * 0.24;
    }
    if (this.shake > 0.001) {
      this.camera.position.x = this.baseCameraPosition.x + (Math.random() - 0.5) * this.shake;
      this.camera.position.y = this.baseCameraPosition.y + (Math.random() - 0.5) * this.shake * 0.55;
      this.shake *= Math.exp(-9 * dt);
      this.camera.lookAt(this.focusTarget * 0.22, 1.75, 0);
    } else {
      this.camera.position.lerp(this.baseCameraPosition, 1 - Math.exp(-7 * dt));
      this.camera.lookAt(this.focusTarget * 0.22, 1.75, 0);
    }
    this.zoom *= Math.exp(-5.6 * dt);
    this.camera.position.z = this.baseCameraPosition.z - this.zoom;
    this.camera.lookAt(this.focusTarget * 0.22, 1.75, 0);
    this.effects.update(dt);
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

class Fighter {
  constructor(game, config, model, index) {
    this.game = game;
    this.config = config;
    this.model = model;
    this.index = index;
    this.id = config.id;
    this.control = index === 0 ? "p1" : "p2";
    this.maxHp = config.maxHp;
    this.hp = config.maxHp;
    this.heart = 0;
    this.x = SHOWCASE_POSITIONS[index];
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = index === 0 ? 1 : -1;
    this.grounded = true;
    this.blocking = false;
    this.blockElapsed = 0;
    this.action = null;
    this.hitstun = 0;
    this.knockdown = 0;
    this.downed = false;
    this.invulnerable = 0;
    this.cooldowns = {};
    this.flash = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.starTimer = 0;
    this.poseTime = Math.random() * 3;
    this.queuedAttack = null;
    this.lastLightTime = -10;
    this.lightStage = 0;
    this.stepTimer = 0;
    this.landImpact = 0;
  }

  reset(position, facing) {
    this.hp = this.maxHp;
    this.heart = 0;
    this.x = position;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.grounded = true;
    this.blocking = false;
    this.blockElapsed = 0;
    this.action = null;
    this.hitstun = 0;
    this.knockdown = 0;
    this.downed = false;
    this.invulnerable = 0.18;
    this.cooldowns = {};
    this.flash = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.queuedAttack = null;
    this.lastLightTime = -10;
    this.lightStage = 0;
    this.stepTimer = 0;
    this.landImpact = 0;
  }

  get move() {
    return this.action?.move || null;
  }

  get canAct() {
    return (
      this.game.phase === "fight" &&
      !this.action &&
      this.hitstun <= 0 &&
      this.knockdown <= 0 &&
      !this.downed
    );
  }

  startMove(key) {
    const move = this.config[key];
    if (!move || !this.canAct) return false;
    if (key === "super" && this.heart < 100) {
      this.game.arenaScene.effects.floatWord(this.x, this.y + 0.45, "心动槽还没满");
      this.game.sound.ui();
      return false;
    }
    if ((this.cooldowns[key] || 0) > 0) return false;
    if (key === "light") {
      this.lightStage = this.game.time - this.lastLightTime < 0.62 ? Math.min(3, this.lightStage + 1) : 1;
      this.lastLightTime = this.game.time;
    }
    this.action = {
      key,
      move,
      elapsed: key === "super" ? -0.68 : 0,
      hitDone: move.hits.map(() => false),
      connected: false,
      whiffPlayed: false,
      fxSeen: new Set(),
      ghostTimer: 0,
      target: null
    };
    this.blocking = false;
    this.cooldowns[key] = move.cooldown || 0.22;
    if (key === "super") {
      this.heart = 0;
      this.invulnerable = 2.5;
      this.game.cinematic = 0.7;
      this.game.showSuper(this, move.name);
    }
    this.game.showMove(this, move.name);
    this.game.onMoveStart(this, key, move);
    return true;
  }

  step(dt, intent, opponent) {
    this.poseTime += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.hitstun = Math.max(0, this.hitstun - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.knockdown = Math.max(0, this.knockdown - dt);
    this.landImpact = Math.max(0, this.landImpact - dt * 5.4);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.combo = 0;
    for (const key of Object.keys(this.cooldowns)) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);

    if (this.downed || this.hitstun > 0 || this.knockdown > 0) {
      this.blocking = false;
    } else if (this.action) {
      for (const attack of ["super", "throw", "special2", "special", "heavy", "light"]) {
        if (intent.pressed?.[attack]) {
          this.queueAttack(attack);
          break;
        }
      }
      this.updateAction(dt, opponent);
    } else {
      this.updateFreeMovement(dt, intent, opponent);
    }

    if (!this.grounded || this.vy !== 0) {
      this.vy -= 15.5 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.landImpact = 1;
        this.game.arenaScene.effects.burst(this.x, 0.02, "dust", 5, "#d8c3b5", 1.25);
        if (!this.grounded && this.hitstun > 0 && this.hp > 0) {
          this.knockdown = 0.72;
          this.hitstun = 0;
          this.game.arenaScene.effects.burst(this.x, 0.05, "dust", 9, "#cdb6a4", 1.8);
          this.game.sound.noise(0.09, 0.12);
        }
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }

    this.x += this.vx * dt;
    if (this.grounded) this.vx *= Math.exp(-8.5 * dt);
    else this.vx *= Math.exp(-1.25 * dt);
    this.x = clamp(this.x, ARENA_MIN_X, ARENA_MAX_X);
    if (this.action?.move.kind !== "super") {
      this.facing = opponent.x >= this.x ? 1 : -1;
    }
  }

  updateFreeMovement(dt, intent, opponent) {
    this.blocking = Boolean(intent.held.block && this.grounded);
    if (this.blocking) {
      this.blockElapsed += dt;
      this.vx *= Math.exp(-10 * dt);
      return;
    }
    this.blockElapsed = 0;

    for (const action of ["super", "throw", "special2", "special", "heavy", "light"]) {
      if (intent.pressed[action]) {
        this.startMove(action);
        if (this.action) return;
      }
    }

    if (intent.pressed.jump && this.grounded) {
      this.vy = this.config.jump;
      this.grounded = false;
      this.game.arenaScene.effects.burst(this.x, 0.02, "dust", 6, "#d8c0b0", 1.4);
      this.game.sound.whiff();
    }

    const direction = (intent.held.right ? 1 : 0) - (intent.held.left ? 1 : 0);
    if (direction !== 0) {
      const speedMultiplier = this.grounded ? 1 : 0.74;
      this.vx = damp(this.vx, direction * this.config.speed * speedMultiplier, 14, dt);
      this.facing = direction;
      if (this.grounded) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = 0.14 + Math.random() * 0.06;
          this.game.arenaScene.effects.burst(
            this.x - direction * 0.16,
            0.015,
            "dust",
            2,
            "#d8c4b8",
            0.72
          );
        }
      }
    } else {
      this.vx = damp(this.vx, 0, 13, dt);
    }
  }

  updateAction(dt, opponent) {
    const action = this.action;
    action.elapsed += dt;
    if (action.elapsed < 0) return;
    const kind = action.move.kind;

    if (kind === "dash" && action.elapsed < 0.5) {
      this.vx = this.facing * action.move.dash;
      if (Math.floor(action.elapsed * 18) % 2 === 0) {
        this.game.arenaScene.effects.burst(
          this.x - this.facing * 0.35,
          this.y + 0.1,
          "afterimage",
          1,
          this.id === "yiyi" ? "#ffc5cf" : "#e4b69d",
          0
        );
      }
    }

    if (kind === "bodySlam") {
      if (action.elapsed > 0.24 && action.elapsed < 0.42 && this.grounded) {
        this.vy = 5.8;
        this.grounded = false;
        this.vx = this.facing * 2.45;
      }
      if (action.elapsed >= 0.58 && !this.grounded) {
        this.vy = Math.min(this.vy, -10);
      }
    }

    if (kind === "super") {
      const distance = opponent.x - this.x;
      if (Math.abs(distance) > 1.45 && action.elapsed < 0.98) {
        this.x += Math.sign(distance) * 3.4 * dt;
        if (Math.random() < dt * 14) {
          this.game.arenaScene.effects.burst(this.x, this.y, "afterimage", 1, this.id === "yiyi" ? "#ffc4cf" : "#e0b092", 0);
        }
      }
    }

    if (kind === "throw") {
      if (!action.target && action.elapsed < 0.25) {
        const dx = (opponent.x - this.x) * this.facing;
        if (dx > -0.1 && dx < action.move.range && Math.abs(opponent.y - this.y) < 0.55) {
          action.target = opponent;
        }
      }
      if (action.target && action.elapsed < 0.46) {
        const side = this.facing;
        action.target.x = this.x + side * 0.55;
        action.target.y = Math.max(action.target.y, 0.18);
      }
    }

    if (action.elapsed >= action.move.duration) {
      const queued = this.queuedAttack;
      this.action = null;
      this.queuedAttack = null;
      if (queued) this.startMove(queued);
    }
  }

  queueAttack(key) {
    if (this.action && this.action.elapsed > this.action.move.duration * 0.42) this.queuedAttack = key;
  }

  setFlash(amount = 0.4) {
    this.flash = Math.max(this.flash, amount);
  }

  animate(time, dt) {
    const model = this.model;
    const action = this.action;
    const actionKind = action?.move.kind || null;
    const moving = Math.abs(this.vx) > 0.35 && this.grounded && !this.action && !this.blocking;
    const runAmount = clamp(Math.abs(this.vx) / this.config.speed, 0, 1);
    const breath = Math.sin(time * 3.1 + this.poseTime);
    const gait = Math.sin(time * 10.5 + this.poseTime);
    let bob = breath * 0.035;
    let bodyRoll = 0;
    let bodyPitch = 0;
    let squashX = 1;
    let squashY = 1;
    let spinOffset = 0;
    const head = { x: 0, y: 0, z: breath * 0.018 };
    const armL = { x: -0.34 + breath * 0.045, y: 0, z: -0.12 };
    const armR = { x: -0.22 - breath * 0.045, y: 0, z: 0.12 };
    const legL = { x: -0.08, y: 0, z: 0 };
    const legR = { x: 0.12, y: 0, z: 0 };
    const handL = { x: 0.62, y: 0, z: 0 };
    const handR = { x: 0.54, y: 0, z: 0 };
    const footL = { x: 0.02, y: 0, z: 0 };
    const footR = { x: 0.02, y: 0, z: 0 };
    const tail = { x: 0, y: 0, z: breath * 0.035 };

    if (moving) {
      bob = Math.abs(gait) * (0.045 + runAmount * 0.05);
      bodyRoll = -this.facing * (0.025 + runAmount * 0.045);
      armL.x = -gait * (0.32 + runAmount * 0.42);
      armR.x = gait * (0.32 + runAmount * 0.42);
      armL.z = -0.12;
      armR.z = 0.12;
      legL.x = gait * (0.36 + runAmount * 0.46);
      legR.x = -gait * (0.36 + runAmount * 0.46);
      head.z -= bodyRoll * 0.55;
      handL.x = 0.12;
      handR.x = 0.12;
    }

    if (this.blocking) {
      armL.x = -1.25;
      armR.x = -1.25;
      armL.z = -0.44;
      armR.z = 0.44;
      legL.x = -0.28;
      legR.x = 0.28;
      bodyRoll = -this.facing * 0.07;
      head.x = 0.11;
      squashX = 1.04;
      squashY = 0.94;
      handL.x = 0.42;
      handR.x = 0.42;
    }

    if (!this.grounded) {
      squashX = 0.95;
      squashY = 1.06;
      armL.x = 0.58;
      armR.x = 0.58;
      armL.z = -0.22;
      armR.z = 0.22;
      legL.x = -0.48;
      legR.x = 0.4;
      bodyPitch = -0.05;
      handL.x = 0.28;
      handR.x = 0.28;
    }

    if (this.hitstun > 0 && !this.downed) {
      bodyRoll = -this.facing * 0.16;
      head.z = -this.facing * 0.19;
      armL.x = 0.75;
      armR.x = 1.02;
      armL.z = -0.24;
      armR.z = 0.35;
      legL.x = -0.2;
      legR.x = 0.34;
      squashX = 1.1;
      squashY = 0.9;
    }

    if (this.knockdown > 0 && this.hp > 0) {
      squashY = 0.72;
      bob -= 0.2;
      bodyRoll = -this.facing * 0.24;
      armL.x = 0.28;
      armR.x = 0.48;
      legL.x = -0.45;
      legR.x = 0.55;
    }

    if (action) {
      const elapsed = Math.max(0, action.elapsed);
      const move = action.move;
      const progress = clamp(elapsed / move.duration, 0, 1);
      const impact =
        move.hits.length > 0
          ? Math.max(...move.hits.map((hit) => 1 - Math.abs(elapsed - hit.time) / 0.13))
          : 0;
      const activeImpact = clamp(impact, 0, 1);

      if (move.kind === "light") {
        const cycle = Math.floor((elapsed + 0.02) / 0.085);
        const cyclePhase = ((elapsed + 0.02) % 0.085) / 0.085;
        const strike = Math.pow(Math.sin(cyclePhase * Math.PI), 0.58);
        if (cycle % 2 === 0) {
          armR.x = -1.5 * strike;
          armL.x = 0.48 * strike;
        } else {
          armL.x = -1.5 * strike;
          armR.x = 0.48 * strike;
        }
        bodyRoll = this.facing * 0.07 * strike;
        legL.x = -0.16;
        legR.x = 0.22;
        head.z = this.facing * 0.04 * strike;
      } else if (move.kind === "heavy") {
        const wind = easeInOutSine(clamp(elapsed / 0.18, 0, 1));
        const release = easeOutCubic(clamp((elapsed - 0.16) / 0.17, 0, 1));
        armL.x = lerp(0.48, -1.22, release) + wind * 0.2;
        armR.x = armL.x;
        armL.z = -0.26;
        armR.z = 0.26;
        bodyRoll = this.facing * (0.08 + 0.16 * release);
        legL.x = -0.34 * release;
        legR.x = 0.46 * release;
        head.x = 0.14 * release;
        squashX = 1 + release * 0.08;
        squashY = 1 - release * 0.06;
      } else if (move.kind === "dash") {
        bodyRoll = this.facing * 0.19;
        armR.x = -1.32;
        armL.x = 0.92;
        armL.z = -0.28;
        armR.z = 0.2;
        legL.x = -0.82;
        legR.x = 0.72;
        head.x = 0.16;
        squashX = 1.09;
        squashY = 0.92;
      } else if (move.kind === "spin") {
        spinOffset = progress * Math.PI * 2;
        armL.x = Math.sin(progress * Math.PI * 4) * 1.15;
        armR.x = -armL.x;
        armL.z = -0.55;
        armR.z = 0.55;
        legL.x = 0.22;
        legR.x = -0.22;
        bodyRoll = Math.sin(progress * Math.PI * 2) * 0.08;
        bob += Math.sin(progress * Math.PI) * 0.13;
      } else if (move.kind === "slam") {
        const raise = easeInOutSine(clamp(elapsed / 0.42, 0, 1));
        const land = clamp((elapsed - 0.46) / 0.12, 0, 1);
        const slam = easeOutCubic(land);
        armL.x = lerp(0.2, 1.32, raise) - slam * 2.6;
        armR.x = armL.x;
        armL.z = -0.32;
        armR.z = 0.32;
        bob += raise * 0.16 - slam * 0.14;
        squashY = 1 - land * 0.18;
        squashX = 1 + land * 0.16;
        bodyRoll = -this.facing * 0.15 * slam;
        head.x = -0.13 * slam;
        legL.x = -0.32 * land;
        legR.x = 0.38 * land;
      } else if (move.kind === "bodySlam") {
        if (elapsed > 0.25 && elapsed < 0.58) {
          spinOffset = clamp((elapsed - 0.25) / 0.33, 0, 1) * Math.PI * 2;
          squashX = 1.13;
          squashY = 0.82;
          legL.x = -0.62;
          legR.x = 0.62;
        }
        armL.x = -1.22;
        armR.x = -1.22;
        armL.z = -0.55;
        armR.z = 0.55;
        head.x = 0.14;
      } else if (move.kind === "throw") {
        const hug = Math.sin(clamp(elapsed / 0.36, 0, 1) * Math.PI);
        armL.x = -1.32 * hug;
        armR.x = -1.32 * hug;
        armL.z = -0.48 * hug;
        armR.z = 0.48 * hug;
        bodyRoll = this.facing * 0.1 * hug;
        legL.x = -0.3 * hug;
        legR.x = 0.42 * hug;
      } else if (move.kind === "super") {
        const rhythm = Math.sin(elapsed * 22) * 0.5 + 0.5;
        if (this.id === "yiyi") {
          armR.x = -0.48 - rhythm * 1.08;
          armL.x = 0.34 + (1 - rhythm) * 0.82;
          if (Math.floor(elapsed * 12) % 2 === 0) [armL.x, armR.x] = [armR.x, armL.x];
        } else {
          armL.x = -0.88 - rhythm * 0.52;
          armR.x = -0.88 - (1 - rhythm) * 0.52;
          armL.z = -0.48;
          armR.z = 0.48;
        }
        bodyRoll = Math.sin(elapsed * 9) * 0.075;
        bob = Math.abs(Math.sin(elapsed * 8.5)) * 0.09;
        legL.x = -0.2;
        legR.x = 0.28;
      }

      bob += activeImpact * 0.025;
      squashX += activeImpact * 0.035;
      squashY -= activeImpact * 0.035;
    }

    if (this.downed) {
      squashY = 0.66;
      squashX = 1.1;
      bob = -0.26 + Math.sin(time * 2.2) * 0.018;
      bodyRoll = -this.facing * 0.13;
      head.z = this.facing * 0.2;
      armL.x = 0.22;
      armR.x = 0.42;
      armL.z = -0.28;
      armR.z = 0.28;
      legL.x = -0.38;
      legR.x = 0.45;
      spinOffset = 0;
    }

    bob -= this.landImpact * 0.055;
    squashY -= this.landImpact * 0.14;
    squashX += this.landImpact * 0.1;
    handL.x = clamp(handL.x + armL.x * 0.12, -0.24, 0.48);
    handR.x = clamp(handR.x + armR.x * 0.12, -0.24, 0.48);
    footL.x = clamp(footL.x - legL.x * 0.62, -0.5, 0.5);
    footR.x = clamp(footR.x - legR.x * 0.62, -0.5, 0.5);

    const group = model.group;
    group.position.x = this.x;
    group.position.y = this.y + bob;
    group.position.z = 0.2;
    group.scale.set(
      damp(group.scale.x, squashX, 18, dt),
      damp(group.scale.y, squashY, 18, dt),
      damp(group.scale.z, 1, 18, dt)
    );

    model.root.rotation.order = "YXZ";
    const yawTarget = this.facing * MODEL_YAW + spinOffset;
    model.visualYaw =
      actionKind === "spin"
        ? yawTarget
        : dampAngle(model.visualYaw, yawTarget, actionKind === "bodySlam" ? 24 : 10.5, dt);
    model.root.rotation.y = model.visualYaw;
    model.root.rotation.z = damp(model.root.rotation.z, bodyRoll, 17, dt);
    model.root.rotation.x = damp(model.root.rotation.x, bodyPitch, 14, dt);

    const applyPivot = (key, target, speed = 22) => {
      const pivot = model.pivots[key]?.object;
      if (!pivot) return;
      pivot.rotation.order = "YXZ";
      pivot.rotation.x = damp(pivot.rotation.x, target.x || 0, speed, dt);
      pivot.rotation.y = damp(pivot.rotation.y, target.y || 0, speed, dt);
      pivot.rotation.z = damp(pivot.rotation.z, target.z || 0, speed, dt);
    };
    applyPivot("head", head, 18);
    applyPivot("armL", armL, 28);
    applyPivot("handL", handL, 26);
    applyPivot("armR", armR, 28);
    applyPivot("handR", handR, 26);
    applyPivot("legL", legL, 26);
    applyPivot("footL", footL, 22);
    applyPivot("legR", legR, 26);
    applyPivot("footR", footR, 22);
    applyPivot("tail", tail, 15);

    model.shadow.position.x = this.x;
    model.shadow.position.y = 0.025 + this.y * 0.03;
    model.shadow.material.opacity = clamp(0.27 - this.y * 0.035, 0.08, 0.27);
    const shadowScale = 1 + this.y * 0.09;
    model.shadow.scale.set(2.1 * shadowScale, 0.6 * shadowScale, 1);

    const flashMix = this.flash / 0.4;
    model.root.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material.emissive) continue;
        material.emissive.copy(material.userData.baseEmissive || new THREE.Color(0));
        if (flashMix > 0) material.emissive.lerp(new THREE.Color("#fff5d8"), flashMix * 0.68);
      }
    });
  }
}

class AIController {
  constructor(config) {
    this.config = config;
    this.attackCooldown = 0.7;
    this.blockCooldown = 0.5;
    this.blocking = false;
    this.moveDirection = 0;
    this.pulse = null;
    this.pulseTimer = 0;
  }

  reset() {
    this.attackCooldown = 0.7;
    this.blockCooldown = 0.35;
    this.blocking = false;
    this.moveDirection = 0;
    this.pulse = null;
    this.pulseTimer = 0;
  }

  update(dt, fighter, opponent) {
    this.attackCooldown -= dt;
    this.blockCooldown -= dt;
    this.pulseTimer -= dt;
    if (this.pulseTimer <= 0) this.pulse = null;
    if (fighter.downed || fighter.hitstun > 0 || fighter.knockdown > 0) {
      this.blocking = false;
      this.moveDirection = 0;
      return this.intent(fighter);
    }

    const distance = Math.abs(opponent.x - fighter.x);
    const opponentThreat =
      opponent.action &&
      opponent.action.elapsed > -0.05 &&
      opponent.action.elapsed < 0.3 &&
      distance < 2.5;

    if (opponentThreat && this.blockCooldown <= 0 && fighter.grounded && Math.random() < 0.08) {
      this.blocking = true;
      this.blockCooldown = 0.65 + Math.random() * 0.35;
    }
    if (this.blocking && (!opponentThreat || Math.random() < dt * 2.2)) this.blocking = false;

      if (distance > 1.45) {
      this.moveDirection = Math.sign(opponent.x - fighter.x);
      if (fighter.id === "bubu" && distance < 2.3 && this.attackCooldown <= 0 && Math.random() < 0.025) {
        this.queue("special");
      }
    } else if (distance < 0.85) {
      this.moveDirection = Math.random() < 0.18 ? -Math.sign(opponent.x - fighter.x) : 0;
    } else {
      this.moveDirection = 0;
    }

    if (this.attackCooldown <= 0 && !this.blocking && fighter.canAct) {
      if (fighter.heart >= 100 && distance < 2.3) {
        this.queue("super");
      } else if (distance < 1.2) {
        const choices = ["throw", "light", "heavy", "special2", "light"];
        this.queue(choices[Math.floor(Math.random() * choices.length)]);
      } else if (distance < 1.68) {
        const choices = ["light", "heavy", "special2", "light"];
        this.queue(choices[Math.floor(Math.random() * choices.length)]);
      } else if (distance < 2.3) {
        this.queue("special");
      }
    }

    return this.intent(fighter);
  }

  queue(action) {
    this.pulse = action;
    this.pulseTimer = 0.055;
    this.attackCooldown = 0.32 + Math.random() * 0.34;
  }

  intent(fighter) {
    const pressed = {
      jump: false,
      light: false,
      heavy: false,
      special: false,
      special2: false,
      throw: false,
      super: false
    };
    if (this.pulseTimer > 0 && this.pulse) pressed[this.pulse] = true;
    if (!this.blocking && this.attackCooldown > 0.8 && fighter.grounded && Math.random() < 0.0015) pressed.jump = true;
    return {
      held: {
        left: this.moveDirection < 0,
        right: this.moveDirection > 0,
        block: this.blocking
      },
      pressed
    };
  }
}

export class SoftCandyArena {
  constructor() {
    this.canvas = document.querySelector("#game-canvas");
    this.arenaScene = new ArenaScene(this.canvas);
    this.sound = new SoundCandy();
    this.keys = new Set();
    this.justPressed = new Set();
    this.fighters = [];
    this.mode = "solo";
    this.selectedCharacter = this.readSelectedCharacter();
    this.guideCharacter = this.selectedCharacter;
    this.characterModels = null;
    this.onlineCharacters = { p1: null, p2: null };
    this.phase = "idle";
    this.time = 0;
    this.timer = ROUND_SECONDS;
    this.round = 1;
    this.roundWins = [0, 0];
    this.hitstop = 0;
    this.cinematic = 0;
    this.introTimer = 0;
    this.roundEndTimer = 0;
    this.pendingResult = null;
    this.ai = null;
    this.online = new OnlineSession((message) => this.handleOnlineMessage(message));
    this.onlineRole = null;
    this.onlinePeerReady = false;
    this.remoteIntent = { held: {}, pressed: {} };
    this.netInputBuffer = { held: {}, pressed: {} };
    this.netInputTimer = 0;
    this.snapshotTimer = 0;
    this.lastSnapshotRound = 0;
    this.lastSnapshotPhase = "";
    this.onlineName = "一二";
    this.loaded = false;
    this.loadFailed = false;
    this.mobileMode = false;
    this.touchHeld = {};
    this.touchPressed = {};
    this.activeTouchPointers = new Map();
    this.portraitDismissed = false;
    this.lastFrame = performance.now();
    this.pauseLocked = false;
    this.ui = this.cacheUI();
    this.bindUI();
    this.resize();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
    this.load();
  }

  cacheUI() {
    return {
      start: document.querySelector("#start-screen"),
      startCard: document.querySelector(".start-card"),
      startButton: document.querySelector("#start-button"),
      startButtonLabel: document.querySelector("#start-button-label"),
      loadingNote: document.querySelector("#loading-note"),
      modeButtons: [...document.querySelectorAll(".mode-option")],
      characterOptions: [...document.querySelectorAll(".character-option")],
      characterPickerNote: document.querySelector("#character-picker-note"),
      characterGuideButton: document.querySelector("#character-guide-button"),
      characterGuideScreen: document.querySelector("#character-guide-screen"),
      characterGuideClose: document.querySelector("#character-guide-close"),
      characterGuideSelect: document.querySelector("#character-guide-select"),
      characterGuideName: document.querySelector("#character-guide-name"),
      characterGuideRole: document.querySelector("#character-guide-role"),
      characterGuideTagline: document.querySelector("#character-guide-tagline"),
      characterGuideTitle: document.querySelector("#character-guide-title"),
      characterGuideBio: document.querySelector("#character-guide-bio"),
      characterGuideNote: document.querySelector("#character-guide-note"),
      characterGuideBadge: document.querySelector("#character-guide-badge"),
      characterGuideStats: document.querySelector("#character-guide-stats"),
      characterGuideSkills: document.querySelector("#character-guide-skills"),
      onlinePanel: document.querySelector("#online-panel"),
      onlineName: document.querySelector("#online-name"),
      onlineMessage: document.querySelector("#online-message"),
      createRoomButton: document.querySelector("#create-room-button"),
      joinRoomButton: document.querySelector("#join-room-button"),
      roomCodeInput: document.querySelector("#room-code-input"),
      roomInvite: document.querySelector("#room-invite"),
      roomCodeView: document.querySelector("#room-code-view"),
      inviteLink: document.querySelector("#invite-link"),
      copyInviteButton: document.querySelector("#copy-invite-button"),
      mobileControls: document.querySelector("#mobile-controls"),
      touchCharacterName: document.querySelector("#touch-character-name"),
      mobileFullscreen: document.querySelector("#mobile-fullscreen"),
      rotateOverlay: document.querySelector("#rotate-overlay"),
      rotateFullscreen: document.querySelector("#rotate-fullscreen-button"),
      rotateDismiss: document.querySelector("#rotate-dismiss-button"),
      pause: document.querySelector("#pause-screen"),
      result: document.querySelector("#result-screen"),
      resultTitle: document.querySelector("#result-title"),
      resultCopy: document.querySelector("#result-copy"),
      scoreLine: document.querySelector("#score-line"),
      announcer: document.querySelector("#announcer"),
      speedLines: document.querySelector("#speed-lines"),
      flash: document.querySelector("#screen-flash"),
      superCutin: document.querySelector("#super-cutin"),
      superOwner: document.querySelector("#super-cutin-owner"),
      superName: document.querySelector("#super-cutin-name"),
      combo: document.querySelector("#combo-display"),
      comboNumber: document.querySelector("#combo-number"),
      moveplate: document.querySelector("#move-nameplate"),
      roundNumber: document.querySelector("#round-number"),
      roundTime: document.querySelector("#round-time"),
      roundState: document.querySelector("#round-state"),
      pauseButton: document.querySelector("#pause-button"),
      soundButton: document.querySelector("#sound-toggle"),
      sheets: [...document.querySelectorAll(".move-sheet")],
      p1Name: document.querySelector("#p1-name-label"),
      p2Name: document.querySelector("#p2-name-label"),
      p1: {
        hp: document.querySelector("#p1-hp"),
        hpLag: document.querySelector("#p1-hp-lag"),
        hpText: document.querySelector("#p1-hp-text"),
        heart: document.querySelector("#p1-heart"),
        heartText: document.querySelector("#p1-heart-text"),
        heartTrack: document.querySelector("#p1-heart").parentElement,
        rounds: document.querySelector("#p1-rounds"),
        card: document.querySelector("#p1-card")
      },
      p2: {
        hp: document.querySelector("#p2-hp"),
        hpLag: document.querySelector("#p2-hp-lag"),
        hpText: document.querySelector("#p2-hp-text"),
        heart: document.querySelector("#p2-heart"),
        heartText: document.querySelector("#p2-heart-text"),
        heartTrack: document.querySelector("#p2-heart").parentElement,
        rounds: document.querySelector("#p2-rounds"),
        card: document.querySelector("#p2-card")
      }
    };
  }

  readSelectedCharacter() {
    try {
      const stored = localStorage.getItem("soft-candy-fighter");
      return stored === "bubu" ? "bubu" : "yiyi";
    } catch {
      return "yiyi";
    }
  }

  otherCharacter(id = this.selectedCharacter) {
    return id === "bubu" ? "yiyi" : "bubu";
  }

  prepareFighters(ids) {
    if (!this.characterModels) return false;
    const requested = ids.map((id) => (CHARACTERS[id] ? id : "yiyi"));
    if (requested[0] === requested[1]) requested[1] = this.otherCharacter(requested[0]);
    this.fighters = requested.map(
      (id, index) => new Fighter(this, CHARACTERS[id], this.characterModels[id], index)
    );
    this.ai = new AIController(this.fighters[1].config);
    this.updateFighterLabels();
    this.updateMoveSheets();
    return true;
  }

  updateFighterLabels() {
    for (const [index, fighter] of this.fighters.entries()) {
      const name = index === 0 ? this.ui.p1Name : this.ui.p2Name;
      const card = index === 0 ? this.ui.p1.card : this.ui.p2.card;
      const role = card.querySelector(".fighter-role");
      name.textContent = fighter.config.name;
      if (role) role.textContent = `${fighter.config.species} · ${fighter.config.role.replace(" · ", "")}`;
    }
  }

  updateMoveSheets() {
    const moveKeys = ["light", "heavy", "special", "special2", "throw", "super"];
    const keyLabels = [["J", "K", "L", "O", "U", "I"], ["1", "2", "3", "4", "5", "6"]];
    this.ui.sheets.forEach((sheet, index) => {
      const fighter = this.fighters[index];
      if (!fighter) return;
      const config = fighter.config;
      sheet.innerHTML = `
        <div class="move-sheet-title"><span>0${index + 1}</span><b>${config.name}</b><em>${config.role}</em></div>
        ${moveKeys.map((key, moveIndex) => `
          <div class="move-row ${key === "super" ? "super-move" : ""}">
            <kbd>${keyLabels[index][moveIndex]}</kbd><span>${config[key].name}</span>
          </div>
        `).join("")}
      `;
    });
  }

  updateCharacterSelectionUI() {
    const config = CHARACTERS[this.selectedCharacter];
    const rival = CHARACTERS[this.otherCharacter()];
    const locked = Boolean(this.onlineRole);
    for (const option of this.ui.characterOptions) {
      const selected = option.dataset.character === this.selectedCharacter;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-checked", selected ? "true" : "false");
      option.disabled = locked;
      const mark = option.querySelector(".character-choice-mark");
      if (mark) mark.textContent = selected ? "已选" : "选择";
    }
    this.ui.characterPickerNote.textContent = locked
      ? "角色已经随房间提交。若双方选择相同，对手会自动使用另一位角色。"
      : this.mode === "duo"
        ? `你操控${config.name}，玩家二使用${rival.name}。本机双人可各自看屏幕两侧技能栏。`
        : `你操控${config.name}，对手将使用${rival.name}。点击“角色图鉴”可查看完整技能说明。`;
    this.updateTouchSkillLabels(config);
  }

  setSelectedCharacter(id) {
    if (!CHARACTERS[id] || this.onlineRole || id === this.selectedCharacter) return;
    this.selectedCharacter = id;
    this.guideCharacter = id;
    try {
      localStorage.setItem("soft-candy-fighter", id);
    } catch {
      // Private browsing may block persistence; selection still works for this session.
    }
    this.updateCharacterSelectionUI();
  }

  updateTouchSkillLabels(config) {
    if (!config) return;
    const labels = config.id === "bubu"
      ? ["跺脚", "压顶", "熊抱", "拍拍", "肚撞", "超抱"]
      : ["突进", "回旋", "抱摔", "连拳", "飞拳", "风暴"];
    const moves = [config.special, config.special2, config.throw, config.light, config.heavy, config.super];
    ["special", "special2", "throw", "light", "heavy", "super"].forEach((action, index) => {
      const button = document.querySelector(`[data-touch="${action}"]`);
      if (!button) return;
      button.textContent = labels[index];
      button.dataset.moveName = moves[index].name;
      button.title = moves[index].name;
      button.setAttribute("aria-label", moves[index].name);
    });
    this.ui.touchCharacterName.textContent = config.name;
  }

  openCharacterGuide(id = this.selectedCharacter) {
    this.guideCharacter = CHARACTERS[id] ? id : this.selectedCharacter;
    this.renderCharacterGuide();
    this.ui.characterGuideScreen.classList.add("is-visible");
    this.ui.characterGuideScreen.setAttribute("aria-hidden", "false");
    this.ui.characterGuideClose.focus();
  }

  closeCharacterGuide() {
    this.ui.characterGuideScreen.classList.remove("is-visible");
    this.ui.characterGuideScreen.setAttribute("aria-hidden", "true");
    this.ui.characterGuideButton.focus();
  }

  renderCharacterGuide() {
    const config = CHARACTERS[this.guideCharacter];
    const skillKeys = ["J / 1", "K / 2", "L / 3", "O / 4", "U / 5", "I / 6"];
    const typeLabels = {
      light: "轻击",
      heavy: "重击",
      dash: "突进",
      spin: "回旋",
      slam: "震地",
      bodySlam: "压顶",
      throw: "投技",
      super: "心动必杀"
    };
    this.ui.characterGuideName.textContent = config.name;
    this.ui.characterGuideRole.textContent = `${config.species} · ${config.role}`;
    this.ui.characterGuideTagline.textContent = config.tagline;
    this.ui.characterGuideTitle.textContent = config.title;
    this.ui.characterGuideBio.textContent = config.bio;
    this.ui.characterGuideNote.textContent = config.guideNote;
    this.ui.characterGuideBadge.className = `fighter-badge guide-badge badge-${config.id}`;
    const stats = [
      ["速度", config.stats.speed],
      ["力量", config.stats.power],
      ["防御", config.stats.defense],
      ["连招", config.stats.combo]
    ];
    this.ui.characterGuideStats.innerHTML = stats
      .map(([label, score]) => `<div class="guide-stat"><span>${label}</span><i style="--score:${score}%"></i><b>${score}</b></div>`)
      .join("");
    const moveKeys = ["light", "heavy", "special", "special2", "throw", "super"];
    this.ui.characterGuideSkills.innerHTML = moveKeys
      .map((key, index) => {
        const move = config[key];
        const damage = move.hits.reduce((sum, hit) => sum + hit.damage, 0);
        const cooldown = move.cooldown ? ` · CD ${move.cooldown}s` : "";
        return `
          <article class="guide-skill ${key === "super" ? "is-super" : ""}">
            <div class="guide-skill-head">
              <kbd>${skillKeys[index]}</kbd>
              <strong>${move.name}</strong>
              <span class="guide-skill-meta">${typeLabels[move.kind] || "技能"} · ${damage}伤害${cooldown}</span>
            </div>
            <p>${move.description}</p>
            <span class="guide-skill-tip">实战建议：${move.tactic}</span>
          </article>
        `;
      })
      .join("");
    this.ui.characterGuideSelect.querySelector("span").textContent = `选择${config.name}出战`;
  }

  bindUI() {
    window.addEventListener("resize", () => {
      this.resize();
      this.detectMobileDevice();
    });
    window.addEventListener("orientationchange", () => {
      window.setTimeout(() => this.detectMobileDevice(), 180);
    });
    window.addEventListener("keydown", (event) => {
      if (event.code === "Escape") {
        event.preventDefault();
        if (this.ui.characterGuideScreen.classList.contains("is-visible")) {
          this.closeCharacterGuide();
          return;
        }
        if (this.phase === "fight" || this.phase === "roundEnd" || this.phase === "intro") this.togglePause();
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) event.preventDefault();
      if (!event.repeat) this.justPressed.add(event.code);
      this.keys.add(event.code);
      if (event.code === "Space" && this.phase === "matchEnd") this.restartMatch();
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("blur", () => {
      if (this.phase === "fight" && !this.pauseLocked) this.togglePause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.phase === "fight" && !this.pauseLocked) this.togglePause();
    });

    for (const button of this.ui.modeButtons) {
      button.addEventListener("click", () => {
        this.mode = button.dataset.mode;
        this.ui.startCard.classList.toggle("online-mode", this.mode === "online");
        for (const option of this.ui.modeButtons) {
          option.classList.toggle("is-selected", option === button);
          option.setAttribute("aria-checked", option === button ? "true" : "false");
        }
        this.updateCharacterSelectionUI();
        this.updateStartButton();
        this.sound.unlock();
        this.sound.ui();
      });
    }

    for (const option of this.ui.characterOptions) {
      option.addEventListener("click", () => {
        this.setSelectedCharacter(option.dataset.character);
        this.sound.unlock();
        this.sound.ui();
      });
    }
    this.ui.characterGuideButton.addEventListener("click", () => this.openCharacterGuide());
    this.ui.characterGuideClose.addEventListener("click", () => this.closeCharacterGuide());
    this.ui.characterGuideScreen.addEventListener("click", (event) => {
      if (event.target === this.ui.characterGuideScreen) this.closeCharacterGuide();
    });
    this.ui.characterGuideSelect.addEventListener("click", () => {
      this.setSelectedCharacter(this.guideCharacter);
      this.closeCharacterGuide();
      this.sound.unlock();
      this.sound.ui();
    });

    this.ui.roomCodeInput.addEventListener("input", () => {
      this.ui.roomCodeInput.value = this.ui.roomCodeInput.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
      this.updateStartButton();
    });
    this.ui.startButton.addEventListener("click", () => this.onPrimaryAction());
    this.ui.createRoomButton.addEventListener("click", () => this.createOnlineRoom());
    this.ui.joinRoomButton.addEventListener("click", () => this.joinOnlineRoom());
    this.ui.copyInviteButton.addEventListener("click", () => this.copyInviteLink());
    this.ui.mobileFullscreen.addEventListener("click", () => this.enterMobileFullscreen());
    this.ui.rotateFullscreen.addEventListener("click", () => this.enterMobileFullscreen());
    this.ui.rotateDismiss.addEventListener("click", () => {
      this.portraitDismissed = true;
      this.ui.rotateOverlay.classList.add("is-dismissed");
    });
    this.bindTouchControls();
    this.ui.resultHomeButton = document.querySelector("#result-home-button");
    document.querySelector("#pause-button").addEventListener("click", () => this.togglePause());
    document.querySelector("#resume-button").addEventListener("click", () => this.togglePause(false));
    document.querySelector("#quit-button").addEventListener("click", () => this.goHome());
    document.querySelector("#rematch-button").addEventListener("click", () => this.restartMatch());
    document.querySelector("#result-home-button").addEventListener("click", () => this.goHome());
    this.ui.soundButton.addEventListener("click", () => {
      this.sound.unlock();
      this.sound.setMuted(!this.sound.muted);
      this.ui.soundButton.classList.toggle("is-muted", this.sound.muted);
      if (!this.sound.muted) this.sound.ui();
    });
    this.detectMobileDevice();
  }

  bindTouchControls() {
    for (const button of document.querySelectorAll("[data-touch]")) {
      const action = button.dataset.touch;
      const release = (event) => {
        const active = this.activeTouchPointers.get(event.pointerId);
        if (active?.action === action) this.activeTouchPointers.delete(event.pointerId);
        const stillHeld = [...this.activeTouchPointers.values()].some((item) => item.action === action);
        this.touchHeld[action] = stillHeld;
        if (!stillHeld) button.classList.remove("is-held");
      };
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          button.setPointerCapture?.(event.pointerId);
        } catch {
          // Synthetic accessibility events may not have a capturable pointer.
        }
        if (!this.activeTouchPointers.has(event.pointerId)) {
          this.touchPressed[action] = true;
        }
        this.activeTouchPointers.set(event.pointerId, { action, button });
        this.touchHeld[action] = true;
        button.classList.add("is-held");
        if (navigator.vibrate) navigator.vibrate(9);
      });
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    }
  }

  detectMobileDevice() {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    const noHover = window.matchMedia?.("(hover: none)").matches;
    const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    this.mobileMode = Boolean((coarse || noHover) && (mobileUa || Math.min(innerWidth, innerHeight) < 820));
    document.body.classList.toggle("mobile-device", this.mobileMode);
    this.updateOrientationState();
  }

  updateOrientationState() {
    const portrait = innerHeight > innerWidth;
    this.canvas.closest("#arena")?.classList.toggle("is-portrait", portrait);
    if (!portrait) {
      this.portraitDismissed = false;
      this.ui.rotateOverlay.classList.remove("is-dismissed");
    }
  }

  async enterMobileFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      if (screen.orientation?.lock) await screen.orientation.lock("landscape");
    } catch {
      // Safari may only support manual rotation.
    }
    this.updateOrientationState();
  }

  async load() {
    try {
      const characters = await Promise.race([
        this.arenaScene.loadCharacters(),
        new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error("角色资源加载超时")), 25000);
        })
      ]);
      this.characterModels = characters;
      this.prepareFighters([this.selectedCharacter, this.otherCharacter()]);
      this.loaded = true;
      this.ui.loadingNote.textContent = "高精度圆润角色已就位";
      const invitedRoom = new URLSearchParams(location.search).get("room");
      if (invitedRoom) {
        this.mode = "online";
        this.ui.startCard.classList.add("online-mode");
        this.ui.roomCodeInput.value = invitedRoom.toUpperCase().slice(0, 6);
        for (const option of this.ui.modeButtons) {
          const selected = option.dataset.mode === "online";
          option.classList.toggle("is-selected", selected);
          option.setAttribute("aria-checked", selected ? "true" : "false");
        }
        this.ui.onlineMessage.textContent = `收到房间 ${this.ui.roomCodeInput.value} 的邀请，填好昵称后加入。`;
      }
      this.updateCharacterSelectionUI();
      this.updateStartButton();
      this.updateHUD();
    } catch (error) {
      console.error(error);
      this.loadFailed = true;
      this.ui.startButton.disabled = false;
      this.ui.startButtonLabel.textContent = "重新加载角色";
      this.ui.loadingNote.textContent = "资源加载失败，点击按钮重试；也可以稍后刷新页面。";
    }
  }

  updateStartButton() {
    if (!this.loaded) return;
    let label = "开始对战";
    let disabled = false;
    if (this.mode === "online") {
      if (this.onlineRole === "p2") {
        label = "等待房主开始…";
        disabled = true;
      } else if (this.onlineRole === "p1") {
        if (this.onlinePeerReady) {
          label = "开始跨设备对战";
        } else {
          label = "等待对方进入房间…";
          disabled = true;
        }
      } else if (this.ui.roomCodeInput.value.length === 6) {
        label = "加入联机房间";
      } else {
        label = "创建联机邀请";
      }
    } else if (this.mode === "duo") {
      label = "开始本机双人";
    } else {
      label = "开始单人对战";
    }
    this.ui.startButton.disabled = disabled;
    this.ui.startButtonLabel.textContent = label;
  }

  onPrimaryAction() {
    if (this.mobileMode) this.enterMobileFullscreen();
    if (this.loadFailed) {
      location.reload();
      return;
    }
    if (!this.loaded) return;
    if (this.mode !== "online") {
      this.startMatch();
      return;
    }
    if (this.onlineRole === "p1" && this.onlinePeerReady) {
      this.online.start();
      return;
    }
    if (this.onlineRole) return;
    if (this.ui.roomCodeInput.value.length === 6) this.joinOnlineRoom();
    else this.createOnlineRoom();
  }

  async createOnlineRoom() {
    if (!this.loaded || this.onlineRole) return;
    if (this.mobileMode) this.enterMobileFullscreen();
    this.onlineName = this.ui.onlineName.value.trim() || "一二";
    this.ui.onlineMessage.textContent = "正在连接拳台服务器…";
    this.sound.unlock();
    try {
      await this.online.createRoom(this.onlineName, this.selectedCharacter);
    } catch (error) {
      this.ui.onlineMessage.textContent = error.message;
    }
  }

  async joinOnlineRoom() {
    if (!this.loaded || this.onlineRole) return;
    if (this.mobileMode) this.enterMobileFullscreen();
    const room = this.ui.roomCodeInput.value.trim().toUpperCase();
    if (room.length !== 6) {
      this.ui.onlineMessage.textContent = "请输入完整的 6 位房间码。";
      return;
    }
    this.onlineName = this.ui.onlineName.value.trim() || "布布";
    this.ui.onlineMessage.textContent = "正在进入房间…";
    this.sound.unlock();
    try {
      await this.online.joinRoom(room, this.onlineName, this.selectedCharacter);
    } catch (error) {
      this.ui.onlineMessage.textContent = error.message;
    }
  }

  inviteLink() {
    if (!this.online.room) return "";
    const localHost = ["localhost", "127.0.0.1"].includes(location.hostname);
    const base = this.online.permanent && this.online.shareBase
      ? this.online.shareBase
      : localHost && this.online.shareBase
        ? this.online.shareBase
        : location.origin;
    return `${base.replace(/\/+$/, "")}/?room=${encodeURIComponent(this.online.room)}`;
  }

  showRoomInvite() {
    if (!this.online.room) return;
    this.ui.roomInvite.classList.add("is-visible");
    this.ui.roomCodeView.textContent = this.online.room;
    this.ui.inviteLink.value = this.inviteLink();
  }

  async copyInviteLink() {
    const link = this.inviteLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.ui.copyInviteButton.textContent = "已复制";
      window.setTimeout(() => {
        this.ui.copyInviteButton.textContent = "复制";
      }, 1300);
    } catch {
      this.ui.inviteLink.focus();
      this.ui.inviteLink.select();
      document.execCommand?.("copy");
    }
  }

  handleOnlineMessage(message) {
    switch (message.type) {
      case "welcome":
        this.online.shareBase = message.shareBase || this.online.shareBase;
        break;
      case "room-created":
        this.onlineRole = "p1";
        this.onlinePeerReady = false;
        this.onlineCharacters = {
          p1: message.characters?.p1 || this.selectedCharacter,
          p2: message.characters?.p2 || null
        };
        this.ui.onlineMessage.textContent = this.online.permanent
          ? "房间已创建，当前是长期部署地址。把邀请链接发给她即可。"
          : ["localhost", "127.0.0.1"].includes(location.hostname)
            ? "房间已创建。这个链接适合同一 Wi-Fi 下使用。"
            : "房间已创建。当前地址可能依赖临时分享服务，正式长期游玩请使用部署版地址。";
        this.showRoomInvite();
        this.updateCharacterSelectionUI();
        this.updateStartButton();
        break;
      case "peer-joined":
        this.onlinePeerReady = true;
        this.onlineCharacters = {
          p1: message.characters?.p1 || this.onlineCharacters.p1 || this.selectedCharacter,
          p2: message.characters?.p2 || this.otherCharacter(this.onlineCharacters.p1 || this.selectedCharacter)
        };
        this.ui.p2Name.textContent = message.players?.p2 || "布布";
        this.ui.onlineMessage.textContent = `${message.players?.p2 || "她"} 已进入房间，并使用${CHARACTERS[this.onlineCharacters.p2].name}，可以开始对战。`;
        this.updateStartButton();
        this.sound.perfect();
        break;
      case "room-joined":
        this.onlineRole = "p2";
        this.onlinePeerReady = true;
        this.onlineCharacters = {
          p1: message.characters?.p1 || this.otherCharacter(this.selectedCharacter),
          p2: message.characters?.p2 || this.selectedCharacter
        };
        this.ui.p1Name.textContent = message.players?.p1 || "一二";
        this.ui.p2Name.textContent = message.players?.p2 || "布布";
        this.ui.onlineMessage.textContent = `已进入 ${message.room} 房间。你使用${CHARACTERS[this.onlineCharacters.p2].name}，等待房主开战。`;
        this.showRoomInvite();
        this.updateCharacterSelectionUI();
        this.updateStartButton();
        break;
      case "start":
        this.beginOnlineMatch(this.online.role);
        break;
      case "remote-input":
        this.remoteIntent = {
          held: message.held || {},
          pressed: message.pressed || {}
        };
        break;
      case "snapshot":
        this.applyNetworkSnapshot(message);
        break;
      case "fx":
        this.applyNetworkFx(message);
        break;
      case "match-over":
        this.roundWins = message.roundWins || this.roundWins;
        this.finishMatch(false);
        break;
      case "rematch-request":
        if (this.onlineRole === "p1") this.online.start();
        else this.ui.resultCopy.textContent = "重新开战请求已发送，等她准备。";
        break;
      case "peer-left":
        this.onlinePeerReady = false;
        this.showAnnounce("CONNECTION", message.reason || "对方离开了房间");
        this.ui.onlineMessage.textContent = message.reason || "对方已离开房间";
        break;
      case "socket-closed": {
        this.showAnnounce("CONNECTION", "联机已断开");
        break;
      }
      case "error":
        this.ui.onlineMessage.textContent = message.message || "联机发生错误";
        break;
      default:
        break;
    }
  }

  beginOnlineMatch(role) {
    if (!this.loaded) return;
    this.onlineRole = role;
    this.mode = role === "p2" ? "online-guest" : "online-host";
    const p1Character = this.onlineCharacters.p1 || this.selectedCharacter;
    const p2Character = this.onlineCharacters.p2 || this.otherCharacter(p1Character);
    this.prepareFighters([p1Character, p2Character]);
    this.setGuestKeyboardLayout(role === "p2");
    this.sound.unlock();
    this.sound.round();
    this.phase = "intro";
    this.round = 1;
    this.roundWins = [0, 0];
    this.ui.start.classList.remove("is-visible");
    this.canvas.closest("#arena")?.classList.add("game-active");
    this.ui.startButton.blur();
    this.canvas.closest("#arena")?.scrollTo(0, 0);
    this.ui.result.classList.remove("is-visible");
    this.ui.pause.classList.remove("is-visible");
    this.ui.sheets.forEach((sheet) => sheet.classList.remove("is-hidden"));
    this.ai.reset();
    this.resetRound();
    this.lastSnapshotRound = 0;
    this.lastSnapshotPhase = "";
    if (role === "p1") {
      this.sendNetworkSnapshot();
    } else {
      this.ui.roundState.textContent = "连接中";
    }
  }

  sendNetworkSnapshot() {
    if (this.onlineRole !== "p1" || !this.fighters.length) return;
    this.online.snapshot({
      phase: this.phase,
      round: this.round,
      timer: this.timer,
      roundWins: this.roundWins,
      fighters: this.fighters.map((fighter) => ({
        id: fighter.id,
        x: +fighter.x.toFixed(3),
        y: +fighter.y.toFixed(3),
        vx: +fighter.vx.toFixed(2),
        facing: fighter.facing,
        hp: +fighter.hp.toFixed(2),
        heart: +fighter.heart.toFixed(2),
        blocking: fighter.blocking,
        downed: fighter.downed,
        hitstun: +fighter.hitstun.toFixed(2),
        knockdown: +fighter.knockdown.toFixed(2),
        flash: +fighter.flash.toFixed(2),
        combo: fighter.combo,
        action: fighter.action
          ? { key: fighter.action.key, elapsed: +Math.max(0, fighter.action.elapsed).toFixed(3) }
          : null
      }))
    });
  }

  applyNetworkSnapshot(message) {
    if (this.onlineRole !== "p2" || !this.fighters.length) return;
    const previousPhase = this.lastSnapshotPhase;
    this.phase = message.phase;
    this.round = message.round;
    this.timer = message.timer;
    this.roundWins = message.roundWins || this.roundWins;
    if (message.phase === "intro" && (previousPhase !== "intro" || message.round !== this.lastSnapshotRound)) {
      this.ui.roundNumber.textContent = String(message.round);
      this.showAnnounce(`ROUND ${message.round}`, "准备");
    }
    if (message.phase === "roundEnd" && previousPhase !== "roundEnd") {
      this.showAnnounce("SUGAR DOWN", "本回合结束");
      this.sound.ko();
    }
    this.lastSnapshotPhase = message.phase;
    this.lastSnapshotRound = message.round;

    message.fighters.forEach((data, index) => {
      const fighter = this.fighters[index];
      if (!fighter) return;
      fighter.networkX = data.x;
      fighter.networkY = data.y;
      if (Math.abs(fighter.x - data.x) > 2.4) fighter.x = data.x;
      if (Math.abs(fighter.y - data.y) > 1.5) fighter.y = data.y;
      fighter.vx = data.vx;
      fighter.facing = data.facing;
      fighter.hp = data.hp;
      fighter.heart = data.heart;
      fighter.blocking = data.blocking;
      fighter.downed = data.downed;
      fighter.hitstun = data.hitstun;
      fighter.knockdown = data.knockdown;
      fighter.flash = data.flash;
      fighter.combo = data.combo;
      if (!data.action) {
        fighter.action = null;
        return;
      }
      const fresh = !fighter.action || fighter.action.key !== data.action.key;
      if (fresh) {
        const move = fighter.config[data.action.key];
        fighter.action = {
          key: data.action.key,
          move,
          elapsed: data.action.elapsed,
          hitDone: move.hits.map(() => true),
          connected: true,
          whiffPlayed: true,
          fxSeen: new Set(),
          ghostTimer: 0,
          target: null
        };
        this.showMove(fighter, move.name);
        if (data.action.key === "super") this.showSuper(fighter, move.name);
      } else {
        fighter.action.elapsed = data.action.elapsed;
      }
    });
    this.ui.roundNumber.textContent = String(message.round);
    this.ui.roundTime.textContent = String(Math.ceil(message.timer));
    this.ui.roundState.textContent =
      message.phase === "intro" ? "准备" : message.phase === "roundEnd" ? "回合结束" : "联机中";
    this.updateHUD();
  }

  applyNetworkFx(message) {
    if (message.effect !== "hit") return;
    const { x = 0, y = 0, damage = 6, target = "bubu", kind = "light" } = message;
    const color = kind === "super" ? "#ff6e9f" : target === "bubu" ? "#fff0c8" : "#ffd8e2";
    this.arenaScene.effects.burst(x, y + 0.25, kind === "super" ? "heart" : "spark", 10, color, 2.2);
    this.arenaScene.effects.burst(x, y + 0.25, "shard", kind === "super" ? 12 : 5, color, 2.4);
    this.arenaScene.effects.flare(x, y + 0.22, color, kind === "super" ? 1.55 : 0.8);
    this.arenaScene.effects.ring(x, y, kind === "super" ? 0xff668f : 0xffe3bc, 1.5);
    this.arenaScene.effects.floatText(x, y + 0.2, `-${Math.round(damage)}`, target === "bubu" ? "is-bubu" : "");
    this.arenaScene.addShake(clamp(0.04 + damage * 0.009, 0.06, 0.25));
    if (damage >= 10) this.showSpeedLines(160);
    this.sound[damage >= 13 || kind === "super" ? "heavy" : "light"]();
  }

  resize() {
    this.arenaScene.resize();
  }

  startMatch() {
    if (!this.loaded) return;
    if (this.mobileMode) this.enterMobileFullscreen();
    this.onlineRole = null;
    this.onlinePeerReady = false;
    this.prepareFighters([this.selectedCharacter, this.otherCharacter()]);
    this.setGuestKeyboardLayout(false);
    this.sound.unlock();
    this.sound.ui();
    this.phase = "intro";
    this.round = 1;
    this.roundWins = [0, 0];
    this.ui.start.classList.remove("is-visible");
    this.canvas.closest("#arena")?.classList.add("game-active");
    this.ui.startButton.blur();
    this.canvas.closest("#arena")?.scrollTo(0, 0);
    this.ui.result.classList.remove("is-visible");
    this.ui.pause.classList.remove("is-visible");
    this.ui.sheets.forEach((sheet) => sheet.classList.remove("is-hidden"));
    this.ai.reset();
    this.resetRound();
  }

  restartMatch() {
    if (this.mode === "online-host") {
      this.online.start();
      return;
    }
    if (this.mode === "online-guest") {
      this.online.requestRematch();
      this.ui.resultCopy.textContent = "重新开战请求已发送，等她准备。";
      return;
    }
    this.phase = "intro";
    this.round = 1;
    this.roundWins = [0, 0];
    this.ui.result.classList.remove("is-visible");
    this.ui.pause.classList.remove("is-visible");
    this.ui.sheets.forEach((sheet) => sheet.classList.remove("is-hidden"));
    this.ai.reset();
    this.resetRound();
  }

  goHome() {
    this.canvas.closest("#arena")?.classList.remove("game-active", "is-portrait");
    if (this.onlineRole) {
      this.online.close();
      this.onlineRole = null;
      this.onlinePeerReady = false;
      this.online.room = null;
      this.online.role = null;
      this.mode = "solo";
      this.ui.roomInvite.classList.remove("is-visible");
      this.ui.onlineMessage.textContent = "让另一半打开邀请链接即可加入。";
      this.ui.p1Name.textContent = "一二";
      this.ui.p2Name.textContent = "布布";
      for (const option of this.ui.modeButtons) {
        const selected = option.dataset.mode === "solo";
        option.classList.toggle("is-selected", selected);
        option.setAttribute("aria-checked", selected ? "true" : "false");
      }
      this.ui.startCard.classList.remove("online-mode");
    }
    this.onlineCharacters = { p1: null, p2: null };
    this.prepareFighters([this.selectedCharacter, this.otherCharacter()]);
    this.setGuestKeyboardLayout(false);
    this.updateCharacterSelectionUI();
    this.phase = "idle";
    this.pauseLocked = false;
    this.hitstop = 0;
    this.cinematic = 0;
    this.ui.pause.classList.remove("is-visible");
    this.ui.result.classList.remove("is-visible");
    this.ui.start.classList.add("is-visible");
    this.ui.startButtonLabel.textContent = "开始软糖对战";
    this.ui.sheets.forEach((sheet) => sheet.classList.remove("is-hidden"));
    this.arenaScene.effects.clear();
    if (this.fighters.length) {
      this.fighters.forEach((fighter, index) => fighter.reset(SHOWCASE_POSITIONS[index], index === 0 ? 1 : -1));
    }
    this.updateStartButton();
    this.updateHUD();
  }

  resetRound() {
    this.phase = "intro";
    this.timer = ROUND_SECONDS;
    this.introTimer = 1.65;
    this.hitstop = 0;
    this.cinematic = 0;
    this.roundEndTimer = 0;
    this.pendingResult = null;
    this.justPressed.clear();
    this.fighters[0].reset(-START_X, 1);
    this.fighters[1].reset(START_X, -1);
    this.ai.reset();
    this.arenaScene.effects.clear();
    this.ui.roundNumber.textContent = String(this.round);
    this.ui.roundTime.textContent = String(ROUND_SECONDS);
    this.ui.roundState.textContent = "准备";
    this.ui.combo.classList.remove("is-showing");
    this.ui.speedLines.classList.remove("is-active");
    this.showAnnounce(`ROUND ${this.round}`, "准备");
    this.sound.round();
    this.updateHUD();
  }

  togglePause(forcePause) {
    if (this.phase === "matchEnd" || this.phase === "idle") return;
    const shouldPause = forcePause ?? !this.pauseLocked;
    if (shouldPause === this.pauseLocked) return;
    this.pauseLocked = shouldPause;
    this.ui.pause.classList.toggle("is-visible", shouldPause);
    this.keys.clear();
    this.justPressed.clear();
    if (shouldPause) this.sound.ui();
  }

  readIntent(control) {
    const map = KEY_MAPS[control];
    const held = {};
    const pressed = {};
    for (const [action, codes] of Object.entries(map)) {
      held[action] = codes.some((code) => this.keys.has(code));
      pressed[action] = codes.some((code) => this.justPressed.has(code));
    }
    if (this.mobileMode && control === "p1") {
      for (const action of Object.keys(held)) {
        held[action] = Boolean(held[action] || this.touchHeld[action]);
        pressed[action] = Boolean(pressed[action] || this.touchPressed[action]);
        this.touchPressed[action] = false;
      }
    }
    return { held, pressed };
  }

  intentFor(fighter, opponent) {
    if (fighter.index === 1 && this.mode === "solo") return this.ai.update(1 / 60, fighter, opponent);
    return this.readIntent(fighter.control);
  }

  clearRemotePressed() {
    for (const key of Object.keys(this.remoteIntent.pressed || {})) {
      this.remoteIntent.pressed[key] = false;
    }
  }

  captureGuestInput(dt) {
    if (this.mode !== "online-guest" || !this.online.connected) return;
    const intent = this.readIntent("p1");
    this.netInputBuffer.held = intent.held;
    for (const [key, value] of Object.entries(intent.pressed)) {
      this.netInputBuffer.pressed[key] = Boolean(this.netInputBuffer.pressed[key] || value);
    }
    this.netInputTimer -= dt;
    if (this.netInputTimer > 0) return;
    this.online.input(this.netInputBuffer.held, this.netInputBuffer.pressed);
    this.netInputBuffer.pressed = {};
    this.netInputTimer = this.online.transport === "poll" ? 1 / 20 : 1 / 30;
  }

  setGuestKeyboardLayout(active) {
    const keys = active ? ["J", "K", "L", "O", "U", "I"] : ["1", "2", "3", "4", "5", "6"];
    this.ui.sheets[1]?.querySelectorAll(".move-row kbd").forEach((key, index) => {
      if (keys[index]) key.textContent = keys[index];
    });
    const controlledFighter = active ? this.fighters[1] : this.fighters[0];
    this.updateTouchSkillLabels(controlledFighter?.config || CHARACTERS[this.selectedCharacter]);
    this.canvas.closest("#arena")?.classList.toggle("online-guest", active);
    this.ui.touchCharacterName.textContent = controlledFighter?.config.name || CHARACTERS[this.selectedCharacter].name;
  }

  onMoveStart(fighter, key, move) {
    const effects = this.arenaScene.effects;
    const primary = fighter.id === "yiyi" ? "#ffb3c5" : "#f1bd76";
    const secondary = fighter.id === "yiyi" ? "#fff0f3" : "#fff0c9";
    const strong = ["heavy", "dash", "spin", "slam", "bodySlam", "throw", "super"].includes(move.kind);
    effects.aura(fighter.x, fighter.y + 0.02, primary, key === "super" ? 3.5 : strong ? 1.55 : 1.0);
    effects.burst(fighter.x + fighter.facing * 0.35, fighter.y + 0.05, "dust", strong ? 8 : 4, secondary, strong ? 2.2 : 1.25);
    if (strong) {
      effects.comet(fighter.x + fighter.facing * 0.38, fighter.y + 0.05, fighter.facing, primary, key === "super" ? 1.65 : 0.92);
      this.showSpeedLines(key === "super" ? 1050 : 240);
      this.arenaScene.addZoom(key === "super" ? 0.42 : 0.11);
    }
    if (key === "super") {
      effects.flare(fighter.x, fighter.y + 0.2, "#ffd6e5", 2.2);
      effects.ring(fighter.x, fighter.y + 0.2, primary, 2.9);
      effects.ring(fighter.x, fighter.y + 0.2, secondary, 3.55);
      effects.bolt(fighter.x + fighter.facing * 0.45, fighter.y + 0.72, fighter.facing, primary, 2.6);
      effects.burst(fighter.x, fighter.y + 0.25, "heart", 12, "#ff86a3", 2.5);
      effects.burst(fighter.x, fighter.y + 0.18, "shard", 12, secondary, 3.0);
    }
  }

  updateAttackVfx(fighter, dt) {
    const action = fighter.action;
    if (!action || action.elapsed < 0) return;
    const effects = this.arenaScene.effects;
    const elapsed = action.elapsed;
    const kind = action.move.kind;
    const primary = fighter.id === "yiyi" ? 0xffabc0 : 0xf0b873;
    const pale = fighter.id === "yiyi" ? 0xffeff3 : 0xffedc7;
    const frontX = fighter.x + fighter.facing * 0.7;
    const trigger = (id, time, callback) => {
      if (elapsed < time || action.fxSeen.has(id)) return;
      action.fxSeen.add(id);
      callback();
    };

    action.ghostTimer -= dt;
    if (action.ghostTimer <= 0 && ["dash", "spin", "bodySlam", "super"].includes(kind)) {
      effects.ghost(fighter.model.group, primary, kind === "super" ? 0.19 : 0.16);
      action.ghostTimer = kind === "super" ? 0.09 : 0.075;
    }

    if (kind === "light") {
      action.move.hits.forEach((hit, index) => {
        trigger(`light-${index}`, Math.max(0, hit.time - 0.045), () => {
          effects.slash(
            fighter.x + fighter.facing * (0.78 + index * 0.1),
            fighter.y + 1.12 + (index % 2) * 0.12,
            fighter.facing,
            index % 2 ? pale : primary,
            0.82 + index * 0.12,
            -fighter.facing * (0.22 + index * 0.08)
          );
        });
      });
    } else if (kind === "heavy") {
      trigger("heavy-swing", 0.17, () => {
        effects.slash(frontX, fighter.y + 1.15, fighter.facing, pale, 2.05, -fighter.facing * 0.25);
        effects.flare(frontX, fighter.y + 0.28, primary, 0.95);
        effects.comet(frontX, fighter.y + 0.15, fighter.facing, pale, 1.05);
        effects.burst(frontX, fighter.y + 0.28, "shard", 8, primary, 2.2);
        effects.burst(frontX, fighter.y + 0.35, "dust", 7, pale, 1.8);
        this.arenaScene.addZoom(0.16);
        this.showSpeedLines(190);
      });
    } else if (kind === "dash") {
      trigger("dash-start", 0.04, () => {
        effects.slash(fighter.x + fighter.facing * 0.7, fighter.y + 1.22, fighter.facing, pale, 1.45);
        effects.comet(fighter.x + fighter.facing * 0.45, fighter.y + 0.18, fighter.facing, primary, 1.05);
      });
      trigger("dash-impact", 0.3, () => {
        effects.slash(frontX, fighter.y + 1.2, fighter.facing, primary, 1.85, -0.2);
        effects.flare(frontX, fighter.y + 0.22, pale, 1.35);
        effects.burst(frontX, fighter.y + 0.25, "shard", 10, primary, 2.7);
        effects.shockwave(fighter.x, pale, 2.2);
      });
    } else if (kind === "spin") {
      trigger("spin-ring-a", 0.12, () => {
        effects.ring(fighter.x, fighter.y + 0.85, primary, 2.25);
        effects.comet(fighter.x + fighter.facing * 0.5, fighter.y + 0.55, fighter.facing, pale, 0.8);
        effects.slash(frontX, fighter.y + 1.15, fighter.facing, pale, 1.85, 0.25);
      });
      trigger("spin-ring-b", 0.36, () => {
        effects.ring(fighter.x, fighter.y + 1.05, pale, 2.8);
        effects.flare(frontX, fighter.y + 0.3, primary, 1.25);
        effects.slash(fighter.x, fighter.y + 1.08, -fighter.facing, primary, 2.15, -0.25);
        effects.burst(fighter.x + fighter.facing * 0.5, fighter.y + 0.25, "shard", 12, pale, 2.9);
        this.arenaScene.addShake(0.1);
      });
    } else if (kind === "slam") {
      trigger("slam-lift", 0.15, () => {
        effects.aura(fighter.x, fighter.y + 0.18, pale, 1.8);
      });
      trigger("slam-ground", 0.46, () => {
        effects.shockwave(fighter.x + fighter.facing * 0.35, 0xff9857, 4.8);
        effects.shockwave(fighter.x + fighter.facing * 0.25, primary, 3.5);
        effects.ring(fighter.x + fighter.facing * 0.35, fighter.y + 0.22, primary, 3.1);
        effects.flare(fighter.x + fighter.facing * 0.35, fighter.y + 0.12, "#ffd0a0", 1.6);
        effects.bolt(fighter.x + fighter.facing * 0.7, 0.58, fighter.facing, "#ffba62", 2.4);
        effects.burst(fighter.x, 0.12, "shard", 16, pale, 3.4);
        effects.burst(fighter.x, 0.12, "dust", 18, "#d4b6a5", 3.2);
        this.arenaScene.addShake(0.2);
        this.arenaScene.addZoom(0.2);
        this.showFlash(0.22, "#ffb260");
      });
    } else if (kind === "bodySlam") {
      trigger("body-slam-drop", 0.54, () => {
        effects.shockwave(fighter.x + fighter.facing * 0.4, 0xff9f58, 4.5);
        effects.shockwave(fighter.x, primary, 3.3);
        effects.bolt(fighter.x + fighter.facing * 0.6, 0.52, fighter.facing, "#ffc563", 2.1);
        effects.flare(fighter.x + fighter.facing * 0.35, fighter.y + 0.16, pale, 1.45);
        effects.burst(fighter.x, 0.1, "shard", 14, pale, 3.0);
        effects.burst(fighter.x, 0.1, "dust", 16, "#d8bda8", 2.8);
        effects.ring(fighter.x, fighter.y + 0.35, primary, 2.4);
        this.arenaScene.addShake(0.18);
        this.showFlash(0.18, "#ffcb72");
      });
    } else if (kind === "throw") {
      trigger("throw-grab", 0.25, () => {
        effects.ring(fighter.x + fighter.facing * 0.45, fighter.y + 0.72, primary, 1.65);
        effects.burst(fighter.x + fighter.facing * 0.45, fighter.y + 0.25, "heart", 6, "#ff95ad", 1.7);
      });
      trigger("throw-slam", 0.4, () => {
        effects.slash(fighter.x + fighter.facing * 0.9, fighter.y + 0.7, fighter.facing, pale, 1.8, 0.42);
        effects.shockwave(fighter.x + fighter.facing * 1.15, pale, 2.8);
        effects.flare(fighter.x + fighter.facing * 0.75, fighter.y + 0.25, primary, 1.2);
        effects.bolt(fighter.x + fighter.facing * 0.8, fighter.y + 0.28, fighter.facing, primary, 1.65);
        effects.burst(fighter.x + fighter.facing * 0.7, fighter.y + 0.28, "shard", 9, pale, 2.4);
      });
    } else if (kind === "super") {
      action.move.hits.forEach((hit, index) => {
        trigger(`super-${index}`, Math.max(0, hit.time - 0.06), () => {
          effects.slash(
            fighter.x + fighter.facing * (0.78 + (index % 2) * 0.28),
            fighter.y + 1.1 + (index % 3) * 0.18,
            fighter.facing,
            index % 2 ? primary : pale,
            1.5 + index * 0.14,
            -fighter.facing * (0.12 + (index % 2) * 0.28)
          );
          effects.flare(frontX, fighter.y + 0.34 + index * 0.06, index % 2 ? primary : pale, 0.72);
          effects.burst(frontX, fighter.y + 0.28, "shard", 5, pale, 2.1);
          effects.aura(fighter.x, fighter.y + 0.05, primary, 1.25);
        });
      });
      trigger("super-final", 1.28, () => {
        effects.shockwave(fighter.x + fighter.facing * 0.45, pale, 5.0);
        effects.shockwave(fighter.x + fighter.facing * 0.25, primary, 4.25);
        effects.ring(fighter.x, fighter.y + 0.2, primary, 3.8);
        effects.ring(fighter.x, fighter.y + 0.2, pale, 4.7);
        effects.flare(fighter.x + fighter.facing * 0.4, fighter.y + 0.25, "#ffe2ee", 2.4);
        effects.bolt(fighter.x + fighter.facing * 0.55, fighter.y + 0.55, fighter.facing, primary, 3.1);
        effects.bolt(fighter.x - fighter.facing * 0.25, fighter.y + 0.65, -fighter.facing, pale, 2.2);
        effects.comet(fighter.x + fighter.facing * 0.45, fighter.y + 0.22, fighter.facing, pale, 1.8);
        effects.burst(fighter.x + fighter.facing * 0.4, fighter.y + 0.3, "heart", 18, "#ff7699", 3.5);
        effects.burst(fighter.x + fighter.facing * 0.35, fighter.y + 0.3, "shard", 22, pale, 4.2);
        this.arenaScene.addShake(0.28);
        this.arenaScene.addZoom(0.35);
      });
    }
  }

  update(dt) {
    if (this.phase === "idle" || this.phase === "matchEnd" || this.pauseLocked) {
      this.updatePoses(dt);
      return;
    }

    this.time += dt;
    if (this.mode === "online-guest") {
      for (const fighter of this.fighters) {
        if (Number.isFinite(fighter.networkX)) fighter.x = damp(fighter.x, fighter.networkX, 18, dt);
        if (Number.isFinite(fighter.networkY)) fighter.y = damp(fighter.y, fighter.networkY, 20, dt);
      }
      this.updatePoses(dt);
      if (this.phase === "fight" || this.phase === "roundEnd") {
        for (const fighter of this.fighters) this.updateAttackVfx(fighter, dt);
      }
      this.updateHUD();
      this.justPressed.clear();
      return;
    }

    if (this.phase === "intro") {
      this.introTimer -= dt;
      if (this.introTimer <= 0.6 && this.introTimer + dt > 0.6) this.showAnnounce("SUGAR FIGHT", "开打！");
      if (this.introTimer <= 0) {
        this.phase = "fight";
        this.ui.roundState.textContent = "对战中";
      }
      this.updatePoses(dt);
      this.justPressed.clear();
      return;
    }

    if (this.cinematic > 0) {
      this.cinematic = Math.max(0, this.cinematic - dt);
      this.updatePoses(dt);
      this.justPressed.clear();
      return;
    }

    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      this.updatePoses(dt);
      this.justPressed.clear();
      return;
    }

    if (this.phase === "fight") {
      const intents = [
        this.readIntent("p1"),
        this.mode === "solo"
          ? this.ai.update(dt, this.fighters[1], this.fighters[0])
          : this.mode === "online-host"
            ? this.remoteIntent
            : this.readIntent("p2")
      ];
      this.fighters[0].step(dt, intents[0], this.fighters[1]);
      this.fighters[1].step(dt, intents[1], this.fighters[0]);
      this.resolveAttacks();
      this.separateFighters();
      this.timer = Math.max(0, this.timer - dt);
      if (this.timer <= 0) this.finishByTime();
      this.updateStars(dt);
      this.clearRemotePressed();
    } else if (this.phase === "roundEnd") {
      this.fighters.forEach((fighter) => fighter.step(dt, { held: {}, pressed: {} }, fighter === this.fighters[0] ? this.fighters[1] : this.fighters[0]));
      this.roundEndTimer -= dt;
      if (this.roundEndTimer <= 0) this.advanceRound();
    }

    this.updatePoses(dt);
    if (this.phase === "fight" || this.phase === "roundEnd") {
      for (const fighter of this.fighters) this.updateAttackVfx(fighter, dt);
    }
    this.updateHUD();
    this.justPressed.clear();
  }

  updatePoses(dt) {
    for (const fighter of this.fighters) fighter.animate(this.time + performance.now() * 0.00001, dt);
  }

  updateStars(dt) {
    for (const fighter of this.fighters) {
      if (!fighter.downed) continue;
      fighter.starTimer -= dt;
      if (fighter.starTimer <= 0) {
        fighter.starTimer = 0.38 + Math.random() * 0.22;
        this.arenaScene.effects.burst(fighter.x, fighter.y + 0.2, "star", 2, "#ffd66f", 1.0);
        if (Math.random() < 0.3) this.arenaScene.effects.burst(fighter.x, fighter.y + 0.15, "heart", 2, "#ff7897", 0.8);
      }
    }
  }

  resolveAttacks() {
    for (const attacker of this.fighters) {
      if (!attacker.action || attacker.action.elapsed < 0) continue;
      const defender = attacker === this.fighters[0] ? this.fighters[1] : this.fighters[0];
      const action = attacker.action;
      const move = action.move;
      const dx = (defender.x - attacker.x) * attacker.facing;
      const vertical = Math.abs((defender.y + 1.25) - (attacker.y + 1.2));
      const inRange = dx > -0.22 && dx < move.range && vertical < move.height;

      move.hits.forEach((hit, index) => {
        if (action.hitDone[index] || action.elapsed < hit.time) return;
        action.hitDone[index] = true;
        if (!inRange || defender.downed || defender.invulnerable > 0) return;
        if (move.kind === "throw" && (!action.target || !defender.grounded)) return;
        this.resolveHit(attacker, defender, move, hit);
      });

      const lastHitTime = Math.max(...move.hits.map((hit) => hit.time));
      if (action.elapsed > lastHitTime + 0.14 && !action.whiffPlayed) {
        action.whiffPlayed = true;
        if (!action.connected) this.sound.whiff();
      }
    }
  }

  resolveHit(attacker, defender, move, hit) {
    if (attacker.action) attacker.action.connected = true;
    const throwMove = move.kind === "throw";
    const isBlocking = defender.blocking && defender.grounded && !throwMove;
    if (isBlocking && defender.blockElapsed < 0.14) {
      this.sound.perfect();
      this.showFlash(0.24);
      this.showSpeedLines(160);
      this.arenaScene.effects.ring(defender.x, defender.y, 0xfff0a8, 1.75);
      this.arenaScene.effects.burst(defender.x, defender.y + 0.15, "star", 9, "#ffe6a4", 2.2);
      this.arenaScene.effects.floatWord(defender.x, defender.y + 0.8, "完美防御！");
      defender.heart = Math.min(100, defender.heart + 17);
      defender.vx += -defender.facing * 0.65;
      attacker.hitstun = Math.max(attacker.hitstun, 0.34);
      attacker.action = null;
      this.hitstop = 0.07;
      this.arenaScene.addShake(0.12);
      return;
    }

    let damage = hit.damage;
    if (isBlocking) {
      damage *= move.kind === "super" ? 0.34 : 0.14;
      defender.heart = Math.min(100, defender.heart + 4);
      defender.vx += attacker.facing * (hit.push || 0.6) * 0.55;
      defender.hitstun = Math.max(defender.hitstun, 0.09);
      this.arenaScene.effects.burst(defender.x, defender.y + 0.35, "spark", 5, "#ffe6b6", 1.5);
      this.arenaScene.effects.floatWord(defender.x, defender.y + 1, "挡住啦");
      this.sound.block();
    } else {
      // Combo scaling rewards strings without making the opening hit feel weak.
      const scaling = Math.max(0.46, Math.pow(0.9, defender.combo));
      damage *= scaling;
      defender.combo += 1;
      defender.comboTimer = 1.35;
      attacker.heart = Math.min(100, attacker.heart + (hit.heart || 0));
      defender.heart = Math.min(100, defender.heart + Math.min(10, damage * 0.48));
      defender.hitstun = Math.max(defender.hitstun, 0.19 + damage * 0.011);
      defender.action = null;
      defender.vx += attacker.facing * ((hit.push || 0) / defender.config.weight);
      if (hit.launch) {
        defender.vy = Math.max(defender.vy, hit.launch / Math.sqrt(defender.config.weight));
        defender.grounded = false;
      }
      defender.knockdown = 0;
      defender.setFlash(0.42);
      this.sound[damage >= 13 || move.kind === "super" ? "heavy" : "light"]();
      if (this.onlineRole === "p1") {
        this.online.fx({
          effect: "hit",
          x: +defender.x.toFixed(3),
          y: +defender.y.toFixed(3),
          damage: +damage.toFixed(1),
          target: defender.id,
          kind: move.kind
        });
      }
      const sparkType = move.kind === "super" ? "heart" : "spark";
      const sparkCount = Math.round(6 + damage * 0.48);
      const impactColor = move.kind === "super" ? "#ff9bbd" : attacker.id === "yiyi" ? "#ffe7ef" : "#ffdda5";
      this.arenaScene.effects.burst(defender.x, defender.y + 0.2, sparkType, sparkCount, move.kind === "super" ? "#ff85a3" : "#fff2c3", 2 + damage * 0.06);
      this.arenaScene.effects.burst(defender.x, defender.y + 0.22, "shard", Math.round(5 + damage * 0.28), impactColor, 2.4 + damage * 0.045);
      this.arenaScene.effects.flare(defender.x, defender.y + 0.18, impactColor, damage >= 13 || move.kind === "super" ? 1.65 : 0.82);
      this.arenaScene.effects.ring(defender.x, defender.y, move.kind === "super" ? 0xff84a1 : 0xffe3bc, 1.2 + damage * 0.025);
      if (damage >= 11 || move.kind === "super") {
        this.arenaScene.effects.shockwave(defender.x, attacker.id === "yiyi" ? 0xff9fbd : 0xffbd77, 2.1 + damage * 0.075);
      }
      this.arenaScene.effects.floatText(defender.x, defender.y + 0.2, `-${Math.round(damage)}`, defender.id === "bubu" ? "is-bubu" : "");
      this.arenaScene.addShake(clamp(0.04 + damage * 0.009, 0.06, 0.25));
      this.arenaScene.addZoom(clamp(0.025 + damage * 0.006, 0.04, 0.2));
      this.showFlash(
        damage >= 12 || move.kind === "super" ? 0.3 : 0.12,
        attacker.id === "yiyi" ? "#ffb4d2" : "#ffd68d"
      );
      if (damage >= 10 || move.kind === "super") this.showSpeedLines(170);
      this.hitstop = Math.max(this.hitstop, hit.hitstop || 0.04);
      if (attacker.heart >= 100 && defender.heart < 100) this.sound.heart();
    }

    defender.hp = clamp(defender.hp - damage, 0, defender.maxHp);
    if (defender.hp <= 0) this.triggerKO(defender, attacker);
    if (!isBlocking) {
      if (attacker.combo < 2) attacker.combo = 1;
      else attacker.combo += 1;
      attacker.comboTimer = 1.35;
      if (attacker.combo >= 2) this.showCombo(attacker.combo);
    }
  }

  separateFighters() {
    const [a, b] = this.fighters;
    const overlap = 1.08 - Math.abs(a.x - b.x);
    if (overlap <= 0) return;
    const direction = Math.sign(a.x - b.x) || 1;
    const weightA = a.config.weight;
    const weightB = b.config.weight;
    const total = weightA + weightB;
    a.x += direction * overlap * (weightB / total);
    b.x -= direction * overlap * (weightA / total);
    a.x = clamp(a.x, ARENA_MIN_X, ARENA_MAX_X);
    b.x = clamp(b.x, ARENA_MIN_X, ARENA_MAX_X);
  }

  triggerKO(loser, winner) {
    if (this.phase !== "fight") return;
    loser.hp = 0;
    loser.downed = true;
    loser.action = null;
    loser.blocking = false;
    loser.vy = Math.max(loser.vy, 2.4);
    loser.grounded = false;
    winner.action = null;
    this.phase = "roundEnd";
    this.roundWins[winner.index] += 1;
    this.roundEndTimer = 3.65;
    this.pendingResult = { winner, loser, reason: "ko" };
    this.ui.roundState.textContent = "KO";
    this.sound.ko();
    this.showAnnounce("SUGAR DOWN", `${loser.config.name}晕乎乎`);
    this.showSpeedLines(350);
    this.arenaScene.addShake(0.32);
    this.arenaScene.effects.burst(winner.x, winner.y + 0.2, "heart", 14, "#ff7b9b", 2.3);
    this.arenaScene.effects.burst(loser.x, loser.y + 0.25, "star", 12, "#ffd35f", 2.7);
    this.updateHUD();
  }

  finishByTime() {
    if (this.phase !== "fight") return;
    const ratio0 = this.fighters[0].hp / this.fighters[0].maxHp;
    const ratio1 = this.fighters[1].hp / this.fighters[1].maxHp;
    let winner = null;
    if (ratio0 > ratio1) winner = this.fighters[0];
    if (ratio1 > ratio0) winner = this.fighters[1];
    this.phase = "roundEnd";
    this.roundEndTimer = 3.2;
    this.pendingResult = { winner, loser: null, reason: "time" };
    if (winner) this.roundWins[winner.index] += 1;
    this.showAnnounce("TIME UP", winner ? `${winner.config.name}胜出` : "平局");
    this.ui.roundState.textContent = "TIME";
    this.sound.round();
    if (winner) this.arenaScene.effects.burst(winner.x, winner.y + 0.2, "heart", 10, "#ff829d", 1.8);
  }

  advanceRound() {
    if (this.roundWins[0] >= ROUNDS_TO_WIN || this.roundWins[1] >= ROUNDS_TO_WIN) {
      this.finishMatch();
      return;
    }
    this.round += 1;
    this.resetRound();
  }

  finishMatch(sendNetwork = true) {
    this.phase = "matchEnd";
    this.ui.pause.classList.remove("is-visible");
    this.ui.sheets.forEach((sheet) => sheet.classList.add("is-hidden"));
    const winnerIndex = this.roundWins[0] >= ROUNDS_TO_WIN ? 0 : 1;
    const winner = this.fighters[winnerIndex];
    this.ui.resultTitle.textContent = `${winner.config.name}赢啦！`;
    this.ui.resultCopy.textContent =
      winner.id === "yiyi"
        ? "奶泡连拳亮晶晶，今天是最甜的那颗软糖。"
        : "超大的抱抱，也有超大的温柔。";
    this.ui.scoreLine.textContent = `${this.roundWins[0]} : ${this.roundWins[1]}`;
    this.ui.result.classList.add("is-visible");
    this.sound.round();
    if (sendNetwork && this.onlineRole === "p1") {
      this.online.matchOver({ roundWins: this.roundWins });
    }
    for (let index = 0; index < 3; index += 1) {
      window.setTimeout(() => {
        this.arenaScene.effects.burst(winner.x + (Math.random() - 0.5), winner.y, "heart", 8, "#ff83a0", 1.7);
      }, index * 180);
    }
  }

  showAnnounce(kicker, title) {
    const element = this.ui.announcer;
    element.innerHTML = `<span class="announcer-kicker">${kicker}</span><strong>${title}</strong>`;
    element.classList.remove("is-showing");
    void element.offsetWidth;
    element.classList.add("is-showing");
  }

  showSuper(fighter, moveName) {
    const cutin = this.ui.superCutin;
    this.ui.superOwner.textContent = `${fighter.config.name} · 心动必杀`;
    this.ui.superName.textContent = moveName;
    cutin.classList.remove("is-showing");
    void cutin.offsetWidth;
    cutin.classList.add("is-showing");
    this.sound.super();
    this.showFlash(0.44, fighter.id === "yiyi" ? "#ff4f90" : "#ffb657");
    this.showSpeedLines(950);
  }

  showMove(fighter, moveName) {
    const plate = this.ui.moveplate;
    plate.querySelector("span").textContent = fighter.config.name;
    plate.querySelector("strong").textContent = moveName;
    plate.classList.add("is-showing");
    window.clearTimeout(this.moveplateTimer);
    this.moveplateTimer = window.setTimeout(() => plate.classList.remove("is-showing"), 650);
  }

  showCombo(count) {
    this.ui.comboNumber.textContent = String(count);
    this.ui.combo.classList.remove("is-showing");
    void this.ui.combo.offsetWidth;
    this.ui.combo.classList.add("is-showing");
  }

  showFlash(strength = 0.2, color = "#fff4fb") {
    this.ui.flash.style.setProperty("--flash-color", color);
    this.ui.flash.style.setProperty("--flash-strength", String(strength));
    this.ui.flash.classList.remove("is-active");
    void this.ui.flash.offsetWidth;
    this.ui.flash.classList.add("is-active");
  }

  showSpeedLines(duration = 180) {
    this.ui.speedLines.classList.add("is-active");
    window.clearTimeout(this.speedLineTimer);
    this.speedLineTimer = window.setTimeout(() => this.ui.speedLines.classList.remove("is-active"), duration);
  }

  updateHUD() {
    if (!this.fighters.length) return;
    for (const [index, fighter] of this.fighters.entries()) {
      const key = index === 0 ? "p1" : "p2";
      const ui = this.ui[key];
      const healthPercent = clamp((fighter.hp / fighter.maxHp) * 100, 0, 100);
      ui.hp.style.width = `${healthPercent}%`;
      ui.hpLag.style.width = `${healthPercent}%`;
      ui.hpText.textContent = `${Math.ceil(fighter.hp)} / ${fighter.maxHp}`;
      ui.heart.style.width = `${fighter.heart}%`;
      ui.heartText.textContent = `${Math.floor(fighter.heart)}%`;
      ui.heartTrack.classList.toggle("is-ready", fighter.heart >= 100);
      ui.card.classList.toggle("is-danger", healthPercent < 24);
      const won = this.roundWins[index];
      ui.rounds.innerHTML = Array.from(
        { length: ROUNDS_TO_WIN },
        (_, roundIndex) => `<i class="round-pip ${roundIndex < won ? "is-won" : ""}"></i>`
      ).join("");
    }
    this.ui.roundTime.textContent = String(Math.ceil(this.timer));
    if (this.phase === "roundEnd") this.ui.roundState.textContent = this.pendingResult?.reason === "ko" ? "KO" : "TIME";
  }

  animate(now) {
    const rawDt = Math.min(0.033, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const dt = this.pauseLocked ? 0 : rawDt;
    if (this.mode === "online-guest") this.captureGuestInput(rawDt);
    this.arenaScene.updateAmbient(rawDt, now / 1000);
    this.update(dt);
    if (this.onlineRole === "p1" && (this.phase === "fight" || this.phase === "roundEnd")) {
      this.snapshotTimer -= rawDt;
      if (this.snapshotTimer <= 0) {
        this.snapshotTimer = this.online.transport === "poll" ? 0.08 : 0.05;
        this.sendNetworkSnapshot();
      }
    }
    if (this.fighters.length) {
      this.arenaScene.setCombatFocus((this.fighters[0].x + this.fighters[1].x) * 0.5);
    }
    if (this.pauseLocked) this.updatePoses(0);
    this.arenaScene.render();
    requestAnimationFrame(this.animate);
  }
}
