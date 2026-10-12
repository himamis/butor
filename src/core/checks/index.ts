import type { CatalogRegistry } from '../catalog/types';
import { rotateXZ } from '../geometry/footprint';
import { movePoint } from '../geometry/motion';
import { obbCorners, obbIntersects, type OBB } from '../geometry/obb';
import type { Motion } from '../geometry/part';
import type { SceneModel, ScenePart } from '../geometry/scene';
import type { Design } from '../schema/design';
import type { Entity } from '../schema/entities';
import type { Room } from '../schema/room';

/** A problem found in a design (docs/v2/01-features.md#f8). Clicking one in the UI frames its entities. */
export interface Check {
  id: string; // stable key, e.g. "overlap:a:b"
  kind:
    | 'invalid'
    | 'overlap'
    | 'obstacle'
    | 'outside-room'
    | 'ceiling'
    | 'door-swing'
    | 'pull-out'
    | 'opening'
    | 'material'
    | 'not-against-wall';
  severity: 'error' | 'warning';
  message: string;
  entities: string[];
}

const TOL = 0.5; // mm of overlap ignored (touching faces, rounding)

/* ───────────────────────── room geometry ───────────────────────── */

const WALL_GAP = 5; // mm between a unit's back and a wall that still counts as "against"

/** Whether the middle of the unit's back face is within WALL_GAP of a wall. */
function backAgainstWall(e: { position: { x: number; z: number }; rotation: number }, backZ: number, room: Room) {
  const p = rotateXZ({ x: e.position.x, z: e.position.z + backZ }, e.position, e.rotation);
  const cs = room.corners;
  return cs.some((a, i) => {
    const b = cs[(i + 1) % cs.length]!;
    const len2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / len2));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.z - (a.z + t * (b.z - a.z))) <= WALL_GAP;
  });
}

function pointInRoom(p: { x: number; z: number }, room: Room): boolean {
  const pts = room.corners;
  // On (or within 1 mm of) a wall counts as inside: units stand against walls.
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!,
      b = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len)));
    if (Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.z - (a.z + t * (b.z - a.z))) <= 1) return true;
  }
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!,
      b = pts[j]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

const outsideRoom = (o: OBB, room: Room) => obbCorners(o).some((c) => !pointInRoom(c, room));

const obstacleBox = (o: Room['obstacles'][number]): OBB => ({
  center: { x: (o.min.x + o.max.x) / 2, y: (o.min.y + o.max.y) / 2, z: (o.min.z + o.max.z) / 2 },
  half: { x: (o.max.x - o.min.x) / 2, y: (o.max.y - o.min.y) / 2, z: (o.max.z - o.min.z) / 2 },
  rotation: 0,
});

/* ───────────────────────── moving parts ───────────────────────── */

/** World box of a part opened to fraction t (hinges about y and slides keep it a y-rotated box). */
function movedBox(p: ScenePart, e: Entity, t: number): OBB {
  const m = p.motion!;
  const local = movePoint(p.center, m, t);
  const extra = m.kind === 'hinge' && m.axis === 'y' ? m.angle * t : 0;
  const w = rotateXZ({ x: local.x, z: local.z }, { x: 0, z: 0 }, e.rotation);
  return {
    center: { x: e.position.x + w.x, y: e.position.y + local.y, z: e.position.z + w.z },
    half: { x: p.size.x / 2, y: p.size.y / 2, z: p.size.z / 2 },
    rotation: e.rotation + extra,
  };
}

/** Highest point of a part opened fully (for flaps that lift up). */
function topWhenOpen(p: ScenePart, e: Entity): number {
  let top = -Infinity;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const c = {
          x: p.center.x + (sx * p.size.x) / 2,
          y: p.center.y + (sy * p.size.y) / 2,
          z: p.center.z + (sz * p.size.z) / 2,
        };
        top = Math.max(top, e.position.y + movePoint(c, p.motion!, 1).y);
      }
  return top;
}

/* ───────────────────────── checks ───────────────────────── */

export function runChecks(design: Design, scene: SceneModel, _catalog: CatalogRegistry): Check[] {
  const out: Check[] = [];
  const room = design.room;
  const name = (id: string) => design.entities[id]?.name ?? id;
  const solid = (p: ScenePart) => p.role !== 'invalid';
  const ents = [...scene.entities.values()];
  const obstacles = room.obstacles.map((o) => ({ o, box: obstacleBox(o) }));

  for (const se of ents) {
    const e = design.entities[se.id];
    if (!e) continue;
    const bad = se.parts.find((p) => p.role === 'invalid');
    if (bad)
      out.push({
        id: `invalid:${se.id}`,
        kind: 'invalid',
        severity: 'error',
        message: `"${e.name}" cannot be built: ${bad.invalid}`,
        entities: [se.id],
      });

    // Room boundary, ceiling, obstacles (closed state)
    if (se.parts.some((p) => solid(p) && outsideRoom(p.obb, room))) {
      out.push({
        id: `outside:${se.id}`,
        kind: 'outside-room',
        severity: 'error',
        message: `"${e.name}" extends outside the room or into a wall`,
        entities: [se.id],
      });
    }
    // Units normally stand with their back against a wall (warning only: islands are allowed).
    if (e.kind === 'unit' && !bad && !backAgainstWall(e, se.localBounds.min.z, room))
      out.push({
        id: `wall:${se.id}`,
        kind: 'not-against-wall',
        severity: 'warning',
        message: `"${e.name}" does not stand against a wall`,
        entities: [se.id],
      });
    const top = se.bounds.center.y + se.bounds.half.y;
    if (top > room.height + TOL)
      out.push({
        id: `ceiling:${se.id}`,
        kind: 'ceiling',
        severity: 'error',
        message: `"${e.name}" is ${Math.round(top - room.height)} mm taller than the room`,
        entities: [se.id],
      });
    for (const { o, box } of obstacles) {
      if (obbIntersects(se.bounds, box, TOL) && se.parts.some((p) => solid(p) && obbIntersects(p.obb, box, TOL))) {
        out.push({
          id: `obstacle:${se.id}:${o.id}`,
          kind: 'obstacle',
          severity: 'error',
          message: `"${e.name}" collides with a ${o.label ?? o.kind}`,
          entities: [se.id],
        });
      }
    }

    // Materials: board thicknesses must exist for the material
    const seen = new Set<string>();
    for (const p of se.parts) {
      const mat = design.materials[p.material.id];
      const th = p.material.thickness;
      const key = `${p.material.id}:${th}`;
      if (mat?.kind === 'board' && th !== undefined && !mat.thicknesses.includes(th) && !seen.has(key)) {
        seen.add(key);
        out.push({
          id: `material:${se.id}:${key}`,
          kind: 'material',
          severity: 'warning',
          message: `${mat.name} is not available in ${th} mm (${mat.thicknesses.join(', ')} mm) — used by "${e.name}"`,
          entities: [se.id],
        });
      }
    }
  }

  // Overlaps between entities (closed state, part level)
  for (let i = 0; i < ents.length; i++) {
    for (let j = i + 1; j < ents.length; j++) {
      const a = ents[i]!,
        b = ents[j]!;
      if (!obbIntersects(a.bounds, b.bounds, TOL)) continue;
      const hit = a.parts.some(
        (pa) => solid(pa) && b.parts.some((pb) => solid(pb) && obbIntersects(pa.obb, pb.obb, TOL)),
      );
      if (hit)
        out.push({
          id: `overlap:${a.id}:${b.id}`,
          kind: 'overlap',
          severity: 'error',
          message: `"${name(a.id)}" and "${name(b.id)}" overlap`,
          entities: [a.id, b.id],
        });
    }
  }

  // Clearances: opening doors, flaps and pull-outs must not hit walls, obstacles or other entities
  for (const se of ents) {
    const e = design.entities[se.id];
    if (!e) continue;
    const groups = new Map<string, { motion: Motion; parts: ScenePart[] }>();
    for (const p of se.parts)
      if (p.motion && solid(p)) {
        const g = groups.get(p.motion.id) ?? { motion: p.motion, parts: [] };
        g.parts.push(p);
        groups.set(p.motion.id, g);
      }
    for (const { motion, parts } of groups.values()) {
      const lead = parts.find((p) => p.role === 'front') ?? parts[0]!;
      const what =
        motion.kind === 'slide'
          ? lead.role === 'front' || lead.role === 'drawer-box'
            ? 'drawer'
            : 'pull-out'
          : lead.label.toLowerCase();
      if (motion.kind === 'hinge' && motion.axis === 'x') {
        if (topWhenOpen(lead, e) > room.height + TOL)
          out.push({
            id: `swing:${se.id}:${motion.id}`,
            kind: 'door-swing',
            severity: 'warning',
            message: `The ${what} of "${e.name}" hits the ceiling when it opens`,
            entities: [se.id],
          });
        continue;
      }
      if (motion.kind === 'slide' && motion.offset.z === 0 && motion.offset.y === 0) continue; // sliding doors stay in the unit
      const samples = motion.kind === 'hinge' ? [0.25, 0.5, 0.75, 1] : [1];
      const movers = motion.kind === 'hinge' ? [lead] : parts;
      let blocker: string | null = null;
      for (const t of samples) {
        for (const p of movers) {
          const box = movedBox(p, e, t);
          if (outsideRoom(box, room)) blocker = 'a wall';
          else if (obstacles.some(({ box: ob }) => obbIntersects(box, ob, TOL))) blocker = 'an obstacle';
          else {
            const other = ents.find(
              (o) =>
                o.id !== se.id &&
                obbIntersects(o.bounds, box, TOL) &&
                o.parts.some((op) => solid(op) && obbIntersects(op.obb, box, TOL)),
            );
            if (other) blocker = `"${name(other.id)}"`;
          }
          if (blocker) break;
        }
        if (blocker) break;
      }
      if (blocker) {
        const kind = motion.kind === 'hinge' ? 'door-swing' : 'pull-out';
        out.push({
          id: `${kind}:${se.id}:${motion.id}`,
          kind,
          severity: 'warning',
          message: `The ${what} of "${e.name}" hits ${blocker} when it opens`,
          entities: [se.id],
        });
      }
    }
  }

  // Units standing in front of windows and doors
  const corners = room.corners;
  for (const o of room.openings) {
    const [ai, bi] = o.wall.split('>');
    const a = corners.find((c) => c.id === ai);
    const b = corners.find((c) => c.id === bi);
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
    const inward = { x: -dir.z, z: dir.x }; // room interior is to the left of each wall (positive-area winding)
    for (const se of ents) {
      const cs = obbCorners(se.bounds);
      const along = cs.map((c) => (c.x - a.x) * dir.x + (c.z - a.z) * dir.z);
      const dist = cs.map((c) => (c.x - a.x) * inward.x + (c.z - a.z) * inward.z);
      const y0 = se.bounds.center.y - se.bounds.half.y;
      const y1 = se.bounds.center.y + se.bounds.half.y;
      const alongOverlap = Math.min(...along) < o.offset + o.width - TOL && Math.max(...along) > o.offset + TOL;
      const nearWall = Math.min(...dist) < 300;
      const vertical = y0 < o.sill + o.height - TOL && y1 > o.sill + TOL;
      if (alongOverlap && nearWall && vertical) {
        out.push({
          id: `opening:${se.id}:${o.id}`,
          kind: 'opening',
          severity: 'warning',
          message: `"${name(se.id)}" blocks the ${o.kind}`,
          entities: [se.id],
        });
      }
    }
  }

  return out;
}
