import { useState } from 'react';
import {
  FloorFinish,
  newId,
  reshapeRoom,
  ROOM_SHAPES,
  roomExtent,
  roomWalls,
  shapeCorners,
  type Obstacle,
  type Op,
  type Opening,
  type RoomShape,
} from '../core';
import { NumberField } from './NumberField';
import { useApp } from './store';

const FINISHES: Record<FloorFinish, string> = {
  color: 'Plain colour',
  planks: 'Wood planks',
  chevron: 'Chevron parquet',
  herringbone: 'Herringbone',
  tiles: 'Tiles',
  concrete: 'Concrete',
};
const OPENING_DEFAULTS: Record<Opening['kind'], { width: number; height: number; sill: number }> = {
  door: { width: 900, height: 2100, sill: 0 },
  window: { width: 1200, height: 1200, sill: 900 },
  passage: { width: 900, height: 2100, sill: 0 },
};
const OBSTACLE_NAMES: Record<Obstacle['kind'], string> = {
  column: 'Column',
  beam: 'Beam',
  radiator: 'Radiator',
  skirting: 'Skirting',
  box: 'Box',
};

/** Room settings by numbers, shown while the room edit tool is active (docs/v2/01-features.md#f2-room). */
export function RoomPanel() {
  const room = useApp((s) => s.design.room);
  const [message, setMessage] = useState<string | null>(null);
  const extent = roomExtent(room);
  const [shape, setShape] = useState<RoomShape>('rectangle');
  const [size, setSize] = useState(extent);
  const walls = roomWalls(room);
  const [wallFor, setWallFor] = useState<string>('');
  const target = walls.find((w) => w.key === wallFor) ?? walls[0]!;

  const run = (ops: Op[], label: string) => {
    const r = useApp.getState().apply(ops, label);
    setMessage(r.ok ? null : (r.results.find((x) => !x.ok)?.message ?? 'Not possible'));
    return r.ok;
  };

  const addOpening = (kind: Opening['kind']) => {
    const def = OPENING_DEFAULTS[kind];
    const width = Math.min(def.width, Math.floor(target.length));
    const offset = Math.max(0, Math.round((target.length - width) / 2 / 10) * 10);
    run(
      [
        {
          type: 'room.opening.add',
          opening: { wall: target.key, kind, offset, width, height: def.height, sill: def.sill },
        },
      ],
      `Add a ${kind}`,
    );
  };

  const addObstacle = (kind: Obstacle['kind']) => {
    const xs = room.corners.map((c) => c.x);
    const zs = room.corners.map((c) => c.z);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const mid = { x: Math.round((target.a.x + target.b.x) / 2), z: Math.round((target.a.z + target.b.z) / 2) };
    const along = Math.abs(target.b.x - target.a.x) >= Math.abs(target.b.z - target.a.z); // wall runs along x
    const against = (w: number, d: number) => {
      const c = { x: mid.x + target.inward.x * (d / 2), z: mid.z + target.inward.z * (d / 2) };
      const hx = along ? w / 2 : d / 2;
      const hz = along ? d / 2 : w / 2;
      return { min: { x: c.x - hx, z: c.z - hz }, max: { x: c.x + hx, z: c.z + hz } };
    };
    const box = (min: { x: number; z: number }, max: { x: number; z: number }, y0: number, y1: number) => ({
      min: { x: Math.round(min.x), y: y0, z: Math.round(min.z) },
      max: { x: Math.round(max.x), y: y1, z: Math.round(max.z) },
    });
    const cx = Math.round((x0 + x1) / 2),
      cz = Math.round((z0 + z1) / 2);
    const geo =
      kind === 'column'
        ? box({ x: x0, z: z0 }, { x: x0 + 300, z: z0 + 300 }, 0, room.height)
        : kind === 'beam'
          ? box({ x: x0, z: cz - 150 }, { x: x1, z: cz + 150 }, room.height - 250, room.height)
          : kind === 'radiator'
            ? (({ min, max }) => box(min, max, 150, 750))(against(800, 100))
            : kind === 'skirting'
              ? (({ min, max }) => box(min, max, 0, 80))(against(Math.floor(target.length), 15))
              : box({ x: cx - 250, z: cz - 250 }, { x: cx + 250, z: cz + 250 }, 0, 500);
    run([{ type: 'room.obstacle.add', obstacle: { kind, ...geo } }], `Add a ${kind}`);
  };

  const applyShape = () => {
    const { room: next, droppedOpenings } = reshapeRoom(room, shapeCorners(shape, size.w, size.d), newId);
    if (run([{ type: 'room.put', room: next }], 'Room shape') && droppedOpenings)
      setMessage(
        `${droppedOpenings} opening${droppedOpenings > 1 ? 's were' : ' was'} removed with the old walls (undo brings them back).`,
      );
  };

  return (
    <aside className="library room-panel" aria-label="Room">
      <h2>Room</h2>
      <p className="muted small">
        Drag corners, walls and openings in the view. Double-click a wall handle to add a corner, a corner to remove it.
        Esc or G to finish.
      </p>
      {message && (
        <p className="notice" role="alert">
          {message}
        </p>
      )}

      <h3>Shape</h3>
      <div className="row">
        <select aria-label="Room shape" value={shape} onChange={(e) => setShape(e.target.value as RoomShape)}>
          {ROOM_SHAPES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <NumberField label="Width" value={size.w} min={1000} onCommit={(w) => setSize({ ...size, w })} />
      <NumberField label="Depth" value={size.d} min={1000} onCommit={(d) => setSize({ ...size, d })} />
      <button type="button" onClick={applyShape}>
        Apply shape
      </button>

      <h3>Room</h3>
      <NumberField
        label="Ceiling height"
        value={room.height}
        min={1500}
        onCommit={(height) => run([{ type: 'room.update', height }], 'Ceiling height')}
      />
      <label className="field">
        <span>Floor</span>
        <select
          aria-label="Floor finish"
          value={room.floor.finish}
          onChange={(e) =>
            run([{ type: 'room.update', floor: { finish: e.target.value as FloorFinish } }], 'Floor finish')
          }
        >
          {FloorFinish.options.map((f) => (
            <option key={f} value={f}>
              {FINISHES[f]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Floor colour</span>
        <input
          type="color"
          aria-label="Floor colour"
          value={room.floor.color}
          onChange={(e) => run([{ type: 'room.update', floor: { color: e.target.value } }], 'Floor colour')}
        />
      </label>
      <label className="field">
        <span>Pattern</span>
        <select
          aria-label="Floor pattern rotation"
          value={room.floor.rotation}
          onChange={(e) =>
            run([{ type: 'room.update', floor: { rotation: Number(e.target.value) as 0 | 90 } }], 'Floor rotation')
          }
        >
          <option value={0}>0°</option>
          <option value={90}>90°</option>
        </select>
      </label>
      <label className="field">
        <span>Wall colour</span>
        <input
          type="color"
          aria-label="Wall colour"
          value={room.wallColor}
          onChange={(e) => run([{ type: 'room.update', wallColor: e.target.value }], 'Wall colour')}
        />
      </label>

      <h3>Walls</h3>
      {walls.map((w) => (
        <div key={w.key} className="wall-row">
          <span>
            Wall {w.index} <span className="muted">· {Math.round(w.length)} mm</span>
          </span>
          <NumberField
            label="Thickness"
            value={w.thickness}
            min={10}
            onCommit={(thickness) => run([{ type: 'room.wall.update', key: w.key, thickness }], 'Wall thickness')}
          />
        </div>
      ))}

      <h3>Openings</h3>
      <label className="field">
        <span>On</span>
        <select
          aria-label="Wall for new openings and obstacles"
          value={target.key}
          onChange={(e) => setWallFor(e.target.value)}
        >
          {walls.map((w) => (
            <option key={w.key} value={w.key}>
              Wall {w.index}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        {(['door', 'window', 'passage'] as const).map((k) => (
          <button key={k} type="button" onClick={() => addOpening(k)}>
            + {k[0]!.toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      {room.openings.map((o) => {
        const w = walls.find((x) => x.key === o.wall);
        const patch = (p: Partial<Opening>) =>
          run([{ type: 'room.opening.update', id: o.id, patch: p }], `Edit ${o.kind}`);
        return (
          <fieldset key={o.id} className="item-box" aria-label={`${o.kind} on wall ${w?.index ?? '?'}`}>
            <legend>
              {o.kind[0]!.toUpperCase() + o.kind.slice(1)} · wall {w?.index ?? '?'}
            </legend>
            <NumberField label="From corner" value={o.offset} min={0} onCommit={(offset) => patch({ offset })} />
            <NumberField label="Width" value={o.width} min={1} onCommit={(width) => patch({ width })} />
            <NumberField label="Height" value={o.height} min={1} onCommit={(height) => patch({ height })} />
            {o.kind === 'window' && (
              <NumberField label="Sill" value={o.sill} min={0} onCommit={(sill) => patch({ sill })} />
            )}
            <button type="button" onClick={() => run([{ type: 'room.opening.remove', id: o.id }], `Remove ${o.kind}`)}>
              Remove
            </button>
          </fieldset>
        );
      })}

      <h3>Obstacles</h3>
      <div className="row">
        {(Object.keys(OBSTACLE_NAMES) as Obstacle['kind'][]).map((k) => (
          <button key={k} type="button" onClick={() => addObstacle(k)}>
            + {OBSTACLE_NAMES[k]}
          </button>
        ))}
      </div>
      {room.obstacles.map((o, i) => {
        const set = (min: Obstacle['min'], max: Obstacle['max']) =>
          run([{ type: 'room.obstacle.update', id: o.id, patch: { min, max } }], `Edit ${o.kind}`);
        const c = { x: (o.min.x + o.max.x) / 2, z: (o.min.z + o.max.z) / 2 };
        const s = { w: o.max.x - o.min.x, d: o.max.z - o.min.z, h: o.max.y - o.min.y };
        const place = (cx: number, cz: number, w: number, d: number, y0: number, h: number) =>
          set(
            { x: Math.round(cx - w / 2), y: y0, z: Math.round(cz - d / 2) },
            { x: Math.round(cx + w / 2), y: y0 + h, z: Math.round(cz + d / 2) },
          );
        return (
          <fieldset key={o.id} className="item-box" aria-label={`${OBSTACLE_NAMES[o.kind]} ${i + 1}`}>
            <legend>
              {o.label ?? OBSTACLE_NAMES[o.kind]} {i + 1}
            </legend>
            <NumberField label="Centre x" value={c.x} onCommit={(x) => place(x, c.z, s.w, s.d, o.min.y, s.h)} />
            <NumberField label="Centre z" value={c.z} onCommit={(z) => place(c.x, z, s.w, s.d, o.min.y, s.h)} />
            <NumberField
              label="Width (x)"
              value={s.w}
              min={1}
              onCommit={(w) => place(c.x, c.z, w, s.d, o.min.y, s.h)}
            />
            <NumberField
              label="Depth (z)"
              value={s.d}
              min={1}
              onCommit={(d) => place(c.x, c.z, s.w, d, o.min.y, s.h)}
            />
            <NumberField label="Height" value={s.h} min={1} onCommit={(h) => place(c.x, c.z, s.w, s.d, o.min.y, h)} />
            <NumberField
              label="Above floor"
              value={o.min.y}
              min={0}
              onCommit={(y) => place(c.x, c.z, s.w, s.d, y, s.h)}
            />
            <button type="button" onClick={() => run([{ type: 'room.obstacle.remove', id: o.id }], `Remove ${o.kind}`)}>
              Remove
            </button>
          </fieldset>
        );
      })}
    </aside>
  );
}
