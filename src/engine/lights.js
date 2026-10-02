import * as THREE from 'three';
import { canvasTex } from './util.js';

export const MOODS = {
  day:    { top: '#4a9be8', bottom: '#cfeaff', sun: 0xfff1d0, sunI: 2.6, hemiTop: 0xbfe0ff, hemiBot: 0x6a8a4a, hemiI: 1.15, fog: 0xcfeaff, sunPos: [30, 50, 20] },
  dusk:   { top: '#3b2a6b', bottom: '#ff9a5a', sun: 0xffa060, sunI: 2.0, hemiTop: 0xb09ad0, hemiBot: 0x6a4a3a, hemiI: 0.95, fog: 0xe89a7a, sunPos: [-40, 18, 20] },
  night:  { top: '#050818', bottom: '#1c2a55', sun: 0x8fa8ff, sunI: 0.9, hemiTop: 0x4a5a9a, hemiBot: 0x1a1a2a, hemiI: 0.75, fog: 0x141c3a, sunPos: [-20, 40, -10] },
  indoor: { top: '#2a1c14', bottom: '#4a3424', sun: 0xffd9a0, sunI: 1.4, hemiTop: 0xffe6c0, hemiBot: 0x6a4a30, hemiI: 1.2, fog: 0x2a1c14, sunPos: [10, 30, 10] },
  cave:   { top: '#07050f', bottom: '#1a1030', sun: 0xb090ff, sunI: 0.7, hemiTop: 0x7a60c0, hemiBot: 0x1a1030, hemiI: 0.9, fog: 0x0c0818, sunPos: [10, 30, 10] },
  ice:    { top: '#7ab8f0', bottom: '#e8f6ff', sun: 0xe8f4ff, sunI: 2.2, hemiTop: 0xd0e8ff, hemiBot: 0x8aa8c8, hemiI: 1.1, fog: 0xdcefff, sunPos: [20, 40, 20] },
  swamp:  { top: '#324a2a', bottom: '#9ab87a', sun: 0xe8ffc0, sunI: 1.6, hemiTop: 0xb0d890, hemiBot: 0x3a4a2a, hemiI: 0.95, fog: 0x8aa878, sunPos: [20, 30, 10] },
};

export function skyTexture(top, bottom) {
  const t = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(0.55, bottom); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  return t;
}

// Voegt zon + hemellicht + achtergrond + mist toe.  Retourneert { sun, hemi, mood }
export function setupLights(scene, mood = 'day', { shadow = 24, fog = true, fogNear = 40, fogFar = 140, shadows = true, center = [0, 0, 0] } = {}) {
  const m = MOODS[mood] || MOODS.day;
  scene.background = skyTexture(m.top, m.bottom);
  if (fog) scene.fog = new THREE.Fog(m.fog, fogNear, fogFar);
  const hemi = new THREE.HemisphereLight(m.hemiTop, m.hemiBot, m.hemiI); scene.add(hemi);
  const sun = new THREE.DirectionalLight(m.sun, m.sunI);
  sun.position.set(center[0] + m.sunPos[0], center[1] + m.sunPos[1], center[2] + m.sunPos[2]);
  sun.target.position.set(...center); scene.add(sun.target);
  if (shadows) {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera; c.left = -shadow; c.right = shadow; c.top = shadow; c.bottom = -shadow; c.near = 1; c.far = 160;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  }
  scene.add(sun);
  return { sun, hemi, mood: m };
}
