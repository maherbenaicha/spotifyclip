// ─────────────────────────────────────────────────────────────
// visuals.js — Le "clip" animé, dessiné avec Three.js (WebGL)
//
// Deux couches :
//   1. un fond liquide en dégradé, aux couleurs de la pochette ;
//   2. un nuage de ~6000 particules qui respire avec la musique.
// Les calculs lourds tournent sur la carte graphique grâce à des
// "shaders" (petits programmes écrits en GLSL).
// ─────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { DEFAULT_PALETTE } from './palette.js';

const PARTICLES = 6000;

// ── Shaders du fond ──
const bgVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.999, 1.0); // toujours plein écran, tout au fond
  }
`;
const bgFragment = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  uniform float uBeat;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec2 uAspect;
  varying vec2 vUv;
  void main() {
    vec2 uv = (vUv - 0.5) * uAspect;
    float t = uTime * 0.08;
    float w = sin(uv.x * 2.2 + t * 2.0)
            + sin(uv.y * 2.8 - t * 3.0)
            + sin((uv.x + uv.y) * 1.8 + t * 1.3 + uLevel * 2.0);
    w = w / 6.0 + 0.5;
    vec3 col = mix(uColorA, uColorB, w) * (0.22 + uLevel * 0.18 + uBeat * 0.08);
    float vignette = smoothstep(1.2, 0.15, length(uv));
    col *= vignette;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ── Shaders des particules ──
const ptsVertex = /* glsl */ `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uBeat;
  uniform float uPixelRatio;
  attribute float aRandom;
  varying float vRandom;
  void main() {
    vec3 p = position;
    float n = sin(p.x * 1.7 + uTime * 0.6) * cos(p.y * 1.3 - uTime * 0.45) * sin(p.z * 1.1 + uTime * 0.5);
    float r = 1.0 + n * (0.18 + uMid * 0.45) + uBass * 0.32 * aRandom + uBeat * 0.12;
    p *= r;
    float a = uTime * (0.05 + aRandom * 0.08);
    p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.2 + aRandom * 3.0 + uBass * 4.0) * uPixelRatio * (6.0 / -mv.z);
    vRandom = aRandom;
  }
`;
const ptsFragment = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uTreble;
  varying float vRandom;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float glow = pow(1.0 - d * 2.0, 1.6);
    vec3 col = mix(uColorA, uColorB, vRandom);
    col = mix(col, uColorC, smoothstep(0.7, 1.0, vRandom) * (0.4 + uTreble * 0.6));
    gl_FragColor = vec4(col, glow * (0.12 + 0.38 * vRandom));
  }
`;

const toVec3 = (rgb) => new THREE.Vector3(...rgb);

export class Visuals {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 0, 4.2);

    // Couleurs actuelles (animées) et couleurs visées
    this.colors = DEFAULT_PALETTE.map(toVec3);
    this.targetColors = DEFAULT_PALETTE.map(toVec3);

    // ── Fond ──
    this.bgUniforms = {
      uTime: { value: 0 }, uLevel: { value: 0 }, uBeat: { value: 0 },
      uColorA: { value: this.colors[0] }, uColorB: { value: this.colors[1] },
      uAspect: { value: new THREE.Vector2(1, 1) },
    };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: bgVertex, fragmentShader: bgFragment,
        uniforms: this.bgUniforms, depthWrite: false, depthTest: false,
      }),
    );
    bg.frustumCulled = false;
    bg.renderOrder = -1;
    this.scene.add(bg);

    // ── Particules : réparties dans une sphère, plus denses au centre ──
    const positions = new Float32Array(PARTICLES * 3);
    const randoms = new Float32Array(PARTICLES);
    for (let i = 0; i < PARTICLES; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const radius = 0.6 + Math.pow(Math.random(), 0.6) * 1.1;
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      randoms[i] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

    this.ptsUniforms = {
      uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 },
      uTreble: { value: 0 }, uBeat: { value: 0 },
      uPixelRatio: { value: this.renderer.getPixelRatio() },
      uColorA: { value: this.colors[0] }, uColorB: { value: this.colors[1] },
      uColorC: { value: this.colors[2] },
    };
    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: ptsVertex, fragmentShader: ptsFragment, uniforms: this.ptsUniforms,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.points);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Sur un écran vertical (téléphone), on recule un peu la caméra
    this.camera.position.z = w < h ? 5.6 : 4.2;
    this.camera.updateProjectionMatrix();
    this.bgUniforms.uAspect.value.set(Math.max(1, w / h), Math.max(1, h / w));
  }

  // Nouvelle chanson → nouvelles couleurs (la transition se fait en douceur)
  setPalette(palette) {
    this.targetColors = palette.map(toVec3);
  }

  update(timeSec, dt, audio) {
    // Rapproche les couleurs actuelles des couleurs visées
    const k = 1 - Math.exp(-dt * 1.5);
    this.colors.forEach((c, i) => c.lerp(this.targetColors[i], k));

    this.bgUniforms.uTime.value = timeSec;
    this.bgUniforms.uLevel.value = audio.level;
    this.bgUniforms.uBeat.value = audio.beat;

    const u = this.ptsUniforms;
    u.uTime.value = timeSec;
    u.uBass.value = audio.bass;
    u.uMid.value = audio.mid;
    u.uTreble.value = audio.treble;
    u.uBeat.value = audio.beat;

    // Mouvement de caméra lent, avec une petite poussée sur les beats
    this.points.rotation.x = Math.sin(timeSec * 0.11) * 0.35;
    this.points.rotation.z = Math.cos(timeSec * 0.07) * 0.2;
    this.points.scale.setScalar(1 + audio.beat * 0.06);

    this.renderer.render(this.scene, this.camera);
  }
}
