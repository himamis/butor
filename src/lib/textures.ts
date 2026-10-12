import * as THREE from 'three';
import type { FloorKind } from '../types';
import { chevronPlanks } from './chevron';

let current: { key: string; tex: THREE.Texture } | null = null;
const SIZE = 512;

/** Deterministic pseudo-random so textures look the same on every load. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return `#${c.getHexString()}`;
}

/** Chevron parquet: per-plank tone, grain along each plank, fine seams. Tile = 1 m. */
function drawChevron(g: CanvasRenderingContext2D, size: number, color: string) {
  const s = size / 1000; // px per mm
  for (const plank of chevronPlanks(1000)) {
    const [a, b, , d] = plank.points;
    const path = () => {
      g.beginPath();
      plank.points.forEach((p, i) => (i ? g.lineTo(p.x * s, p.y * s) : g.moveTo(p.x * s, p.y * s)));
      g.closePath();
    };
    g.save();
    path();
    const r = rng(plank.seed * 7919); // per-plank grain, identical for planks that wrap across the tile edge
    g.fillStyle = shade(color, plank.shade * 0.04);
    g.fill();
    g.clip();
    // Grain: wavy lines along the plank (from edge a→b), spread across its width (a→d).
    const ux = b.x - a.x, uy = b.y - a.y;
    const vx = d.x - a.x, vy = d.y - a.y;
    g.strokeStyle = shade(color, -0.16);
    g.lineWidth = Math.max(1, 0.6 * s);
    for (let i = 0; i < 9; i++) {
      const t = (i + r()) / 9;
      const wob = (r() - 0.5) * 6;
      g.globalAlpha = 0.1 + r() * 0.14;
      g.beginPath();
      g.moveTo((a.x + vx * t) * s, (a.y + vy * t) * s);
      g.bezierCurveTo(
        (a.x + ux * 0.33 + vx * t) * s, (a.y + uy * 0.33 + vy * t + wob) * s,
        (a.x + ux * 0.66 + vx * t) * s, (a.y + uy * 0.66 + vy * t - wob) * s,
        (b.x + vx * t) * s, (b.y + vy * t) * s,
      );
      g.stroke();
    }
    g.restore();
    // Seam
    path();
    g.globalAlpha = 0.85;
    g.strokeStyle = shade(color, -0.3);
    g.lineWidth = Math.max(1, 1.1 * s);
    g.stroke();
    g.globalAlpha = 1;
  }
}

/** Canvas texture for the floor. Each texture tile covers 1 m × 1 m. */
export function floorTexture(kind: Exclude<FloorKind, 'color'>, color: string): THREE.Texture {
  const key = `${kind}:${color}`;
  if (current?.key === key) return current.tex;

  const size = kind === 'chevron' ? 1024 : SIZE; // chevron has finer detail
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const r = rng(42);
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);

  if (kind === 'chevron') {
    drawChevron(g, size, color);
  } else if (kind === 'wood') {
    const plank = SIZE / 5; // 200 mm planks
    for (let i = 0; i < 5; i++) {
      const y = i * plank;
      const offset = r() * SIZE;
      g.fillStyle = shade(color, (r() - 0.5) * 0.08);
      g.fillRect(0, y, SIZE, plank);
      g.strokeStyle = shade(color, -0.06);
      g.globalAlpha = 0.35;
      for (let k = 0; k < 14; k++) {
        const gy = y + r() * plank;
        g.beginPath();
        g.moveTo(0, gy);
        g.bezierCurveTo(SIZE * 0.3, gy + (r() - 0.5) * 6, SIZE * 0.7, gy + (r() - 0.5) * 6, SIZE, gy);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = shade(color, -0.2);
      g.fillRect(0, y, SIZE, 2);
      g.fillRect(offset % SIZE, y, 2, plank);
    }
  } else if (kind === 'tiles') {
    const tile = SIZE / 2; // 500 mm tiles
    for (let x = 0; x < 2; x++)
      for (let y = 0; y < 2; y++) {
        g.fillStyle = shade(color, (r() - 0.5) * 0.04);
        g.fillRect(x * tile, y * tile, tile, tile);
      }
    g.fillStyle = shade(color, -0.25);
    for (let i = 0; i < 2; i++) {
      g.fillRect(i * tile, 0, 3, SIZE);
      g.fillRect(0, i * tile, SIZE, 3);
    }
  } else {
    const img = g.getImageData(0, 0, SIZE, SIZE);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 28;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  current?.tex.dispose(); // only the floor uses these; drop the previous one
  current = { key, tex };
  return tex;
}
