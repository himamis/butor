import { measureAlong, snapToBox, type Vec3 } from '../../core';
import { pxToMm } from '../geom';
import type { EditorPort, Tool, ToolPointer, ViewPort } from '../types';

export interface Measurement {
  a: Vec3;
  b: Vec3; // a + n × distance
  distance: number; // mm, ≥ 0
}

const clean = (n: Vec3): Vec3 => {
  const r = (v: number) => (Math.abs(v) < 1e-6 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-6 ? Math.sign(v) : v);
  const v = { x: r(n.x), y: r(n.y), z: r(n.z) };
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};

/**
 * Measure (docs/v2/06-interaction.md#tools): the first click picks a surface (its normal is the direction),
 * the second click a point; the distance is along that normal, so face-to-face measures are exact.
 * Points snap to the corners and edges of the part under the cursor. Dragging still orbits the camera.
 */
export class MeasureTool implements Tool {
  readonly id = 'measure';
  private first: { a: Vec3; n: Vec3 } | null = null;

  constructor(
    private readonly editor: EditorPort,
    private readonly view: ViewPort,
  ) {
    this.editor.setStatus('Measure: click a surface');
  }

  down() {
    return false;
  }

  click(e: ToolPointer) {
    const s = this.snap(e);
    if (!s) return;
    if (!this.first) {
      this.first = { a: s.point, n: s.normal };
      this.editor.setStatus(`From ${s.kind === 'face' ? 'this surface' : `this ${s.kind}`}: click the second point`);
      return;
    }
    const m = measureAlong(this.first.a, this.first.n, s.point);
    this.editor.addMeasurement({ a: this.first.a, b: m.end, distance: Math.abs(m.distance) });
    this.editor.previewMeasurement(null);
    this.first = null;
    this.editor.setStatus('Measure: click a surface');
  }

  hover(e: ToolPointer) {
    if (!this.first) return;
    const s = this.snap(e);
    if (!s) return;
    const m = measureAlong(this.first.a, this.first.n, s.point);
    this.editor.previewMeasurement({ a: this.first.a, b: m.end, distance: Math.abs(m.distance) });
  }

  cursor() {
    return 'crosshair';
  }

  private snap(e: ToolPointer): { point: Vec3; normal: Vec3; kind: 'corner' | 'edge' | 'face' } | null {
    const hit = e.hit;
    if (!hit || hit.kind === 'handle') return null;
    const normal = clean(hit.normal);
    if (hit.kind === 'part' && hit.partId && !e.alt) {
      const part = this.editor.scene().parts.get(hit.partId);
      if (part) {
        const s = snapToBox(hit.point, part.obb, pxToMm(this.view, hit.point));
        return { point: s.point, normal, kind: s.kind };
      }
    }
    return { point: hit.point, normal, kind: 'face' };
  }
}
