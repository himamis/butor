import * as THREE from 'three';
import type { FloorFinish } from '../core';
import { chevronTile, herringboneTile, plankTile, type Tile } from './floorPatterns';

/* Procedural textures drawn on canvases (no image assets). Browser-only. */

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Draws plank polygons with per-plank tone, light grain along each plank and dark seams. */
function drawTile(tile: Tile, color: string, px: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(tile.width * px);
  cv.height = Math.round(tile.height * px);
  const g = cv.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, cv.width, cv.height);
  for (const plank of tile.planks) {
    const pts = plank.points;
    const path = () => {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x * px, p.y * px) : g.moveTo(p.x * px, p.y * px)));
      g.closePath();
    };
    g.save();
    path();
    g.fillStyle = shade(color, plank.shade * 0.04);
    g.fill();
    g.clip();
    // grain: lines along the plank's longest edge
    const [a, b, , d] = pts as [THREE.Vector2Like, THREE.Vector2Like, THREE.Vector2Like, THREE.Vector2Like];
    const ab = Math.hypot(b.x - a.x, b.y - a.y);
    const ad = Math.hypot(d.x - a.x, d.y - a.y);
    const [u, v] =
      ab >= ad
        ? [
            { x: b.x - a.x, y: b.y - a.y },
            { x: d.x - a.x, y: d.y - a.y },
          ]
        : [
            { x: d.x - a.x, y: d.y - a.y },
            { x: b.x - a.x, y: b.y - a.y },
          ];
    const r = rng(Math.abs(Math.round(plank.shade * 1e6)) + 1);
    g.strokeStyle = shade(color, -0.15);
    g.lineWidth = Math.max(1, 0.6 * px);
    for (let i = 0; i < 8; i++) {
      const t = (i + r()) / 8;
      g.globalAlpha = 0.08 + r() * 0.12;
      g.beginPath();
      g.moveTo((a.x + v.x * t) * px, (a.y + v.y * t) * px);
      g.lineTo((a.x + u.x + v.x * t) * px, (a.y + u.y + v.y * t + (r() - 0.5) * 4) * px);
      g.stroke();
    }
    g.restore();
    path();
    g.globalAlpha = 0.8;
    g.strokeStyle = shade(color, -0.28);
    g.lineWidth = Math.max(1, 1.1 * px);
    g.stroke();
    g.globalAlpha = 1;
  }
  return cv;
}

function drawTiles(color: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512; // 2 × 2 tiles of 500 mm
  const g = cv.getContext('2d')!;
  const r = rng(7);
  for (let x = 0; x < 2; x++)
    for (let y = 0; y < 2; y++) {
      g.fillStyle = shade(color, (r() - 0.5) * 0.04);
      g.fillRect(x * 256, y * 256, 256, 256);
    }
  g.fillStyle = shade(color, -0.25);
  for (let i = 0; i < 2; i++) {
    g.fillRect(i * 256, 0, 3, 512);
    g.fillRect(0, i * 256, 512, 3);
  }
  return cv;
}

function drawConcrete(color: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  const r = rng(42);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 24;
    img.data[i]! += n;
    img.data[i + 1]! += n;
    img.data[i + 2]! += n;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

let current: { key: string; tex: THREE.Texture } | null = null;

/**
 * Floor texture with `repeat` set for UVs in mm (the floor geometry's UVs are its x/z in mm).
 * Only one floor texture exists at a time; the previous one is disposed.
 */
export function floorTexture(finish: Exclude<FloorFinish, 'color'>, color: string, rotation: 0 | 90): THREE.Texture {
  const key = `${finish}:${color}:${rotation}`;
  if (current?.key === key) return current.tex;
  let canvas: HTMLCanvasElement;
  let size: { w: number; h: number };
  if (finish === 'planks' || finish === 'chevron' || finish === 'herringbone') {
    const tile = finish === 'planks' ? plankTile() : finish === 'chevron' ? chevronTile() : herringboneTile();
    const px = Math.min(1, 1024 / Math.max(tile.width, tile.height));
    canvas = drawTile(tile, color, px);
    size = { w: tile.width, h: tile.height };
  } else {
    canvas = finish === 'tiles' ? drawTiles(color) : drawConcrete(color);
    size = { w: 1000, h: 1000 };
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(1 / size.w, 1 / size.h);
  tex.rotation = rotation === 90 ? Math.PI / 2 : 0;
  current?.tex.dispose();
  current = { key, tex };
  return tex;
}

const woodCache = new Map<string, THREE.Texture>();

/** Subtle wood grain for board materials with texture "woodgrain" (repeats every 600 × 600 mm). */
export function woodgrainTexture(color: string): THREE.Texture {
  const hit = woodCache.get(color);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  const r = rng(11);
  g.strokeStyle = shade(color, -0.12);
  for (let i = 0; i < 40; i++) {
    const x = r() * 256;
    g.globalAlpha = 0.1 + r() * 0.15;
    g.lineWidth = 0.5 + r();
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + (r() - 0.5) * 12, 85, x + (r() - 0.5) * 12, 170, x, 256);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  woodCache.set(color, tex);
  return tex;
}
