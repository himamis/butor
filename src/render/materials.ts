import * as THREE from 'three';
import type { Material } from '../core';
import { woodgrainTexture } from './textures';

/** One three.js material per design material (and appearance), shared by all batches. */
export class MaterialCache {
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly invalid = new THREE.MeshStandardMaterial({ color: '#e5484d', wireframe: true });

  get(id: string, m: Material | undefined): THREE.MeshStandardMaterial {
    if (id === '__invalid') return this.invalid;
    const key = `${id}:${JSON.stringify(m ?? null)}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const mat = new THREE.MeshStandardMaterial({
      color: '#cccccc',
      roughness: 0.7,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    if (m?.kind === 'board') {
      mat.color.set(m.appearance.color);
      mat.roughness = m.appearance.roughness;
      if (m.appearance.texture === 'woodgrain') {
        mat.map = woodgrainTexture(m.appearance.color);
        mat.color.set('#ffffff');
      }
    } else if (m?.kind === 'finish') {
      mat.color.set(m.appearance.color);
      mat.metalness = m.appearance.metalness;
      mat.roughness = m.appearance.roughness;
      if (m.name.toLowerCase().includes('glass')) {
        mat.transparent = true;
        mat.opacity = 0.35;
        mat.depthWrite = false;
      }
    }
    this.cache.set(key, mat);
    return mat;
  }

  dispose() {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
    this.invalid.dispose();
  }
}

/** Shared material for instanced outlines: per-instance matrix (aMatrix) and colour (aColor). */
export function outlineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute mat4 aMatrix;
      attribute vec3 aColor;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        gl_Position = projectionMatrix * modelViewMatrix * aMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, 1.0); }`,
  });
}
