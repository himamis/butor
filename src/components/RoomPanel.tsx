import { useState } from 'react';
import { useStore } from '../state/store';
import { ROOM_PRESETS, DEFAULT_COLOR } from '../state/defaults';
import type { Column, FloorKind } from '../types';
import { uid } from '../lib/uid';
import { NumField } from './NumField';
import { ColorField } from './ColorField';
import { ColorInput } from './ColorInput';

const PRESET_LABELS: Record<keyof typeof ROOM_PRESETS, string> = {
  rectangle: 'Rectangle',
  'l-shape': 'L-shape',
  'cut-corner': 'Cut corner',
};

export function RoomPanel() {
  const room = useStore((s) => s.design.room);
  const setRoom = useStore((s) => s.setRoom);
  const applyColorToAll = useStore((s) => s.applyColorToAll);
  const doorsHidden = useStore((s) => s.doorsHidden);
  const setUi = useStore((s) => s.setUi);
  const [allColor, setAllColor] = useState(DEFAULT_COLOR);

  const setPoint = (i: number, key: 'x' | 'z', v: number) =>
    setRoom((r) => ({ ...r, points: r.points.map((p, j) => (j === i ? { ...p, [key]: v } : p)) }));
  const addAfter = (i: number) =>
    setRoom((r) => {
      const a = r.points[i];
      const b = r.points[(i + 1) % r.points.length];
      const mid = { x: Math.round((a.x + b.x) / 2), z: Math.round((a.z + b.z) / 2) };
      return { ...r, points: [...r.points.slice(0, i + 1), mid, ...r.points.slice(i + 1)] };
    });
  const setColumn = (id: string, patch: Partial<Column>) =>
    setRoom((r) => ({ ...r, columns: r.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const addColumn = () =>
    setRoom((r) => {
      // Start in the corner nearest the origin; the user then types the real position and size.
      const x = Math.min(...r.points.map((p) => p.x));
      const z = Math.min(...r.points.map((p) => p.z));
      return { ...r, columns: [...r.columns, { id: uid(), x: x + 200, z: z + 200, w: 400, d: 400 }] };
    });
  const removeColumn = (id: string) => setRoom((r) => ({ ...r, columns: r.columns.filter((c) => c.id !== id) }));
  const positive = (v: number) => Math.min(5000, Math.max(10, v));

  const remove = (i: number) => setRoom((r) => (r.points.length <= 3 ? r : { ...r, points: r.points.filter((_, j) => j !== i) }));

  return (
    <>
      <h3>Room shape</h3>
      <div className="buttons">
        {(Object.keys(ROOM_PRESETS) as (keyof typeof ROOM_PRESETS)[]).map((k) => (
          <button key={k} onClick={() => setRoom((r) => ({ ...r, points: ROOM_PRESETS[k] }))}>{PRESET_LABELS[k]}</button>
        ))}
      </div>
      <div className="points">
        <label style={{ color: 'var(--muted)' }}>X (mm)</label>
        <label style={{ color: 'var(--muted)' }}>Z (mm)</label>
        <span />
        {room.points.map((p, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <NumField value={p.x} onCommit={(v) => setPoint(i, 'x', v)} />
            <NumField value={p.z} onCommit={(v) => setPoint(i, 'z', v)} />
            <span style={{ display: 'flex', gap: 2 }}>
              <button title="Add corner after this one" onClick={() => addAfter(i)}>+</button>
              <button title="Remove corner" onClick={() => remove(i)} disabled={room.points.length <= 3}>−</button>
            </span>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <label>Height</label>
        <NumField value={room.height} min={1500} max={6000} onCommit={(v) => setRoom((r) => ({ ...r, height: Math.min(6000, Math.max(1500, v)) }))} />
      </div>

      <h3>Columns</h3>
      {room.columns.map((c, i) => (
        <div key={c.id} className="column-row">
          <div className="row3">
            <div><label>X center</label><NumField value={c.x} onCommit={(v) => setColumn(c.id, { x: v })} /></div>
            <div><label>Z center</label><NumField value={c.z} onCommit={(v) => setColumn(c.id, { z: v })} /></div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button title={`Remove column ${i + 1}`} onClick={() => removeColumn(c.id)} style={{ width: '100%' }}>Remove</button>
            </div>
          </div>
          <div className="row3">
            <div><label>Width (x)</label><NumField value={c.w} onCommit={(v) => setColumn(c.id, { w: positive(v) })} /></div>
            <div><label>Depth (z)</label><NumField value={c.d} onCommit={(v) => setColumn(c.id, { d: positive(v) })} /></div>
          </div>
        </div>
      ))}
      <div className="buttons">
        <button onClick={addColumn}>+ Add column</button>
      </div>
      <small style={{ color: 'var(--muted)' }}>Floor-to-ceiling, in mm. Units snap against columns and turn red if they overlap one.</small>

      <h3>Floor</h3>
      <div className="row">
        <label>Finish</label>
        <select value={room.floorKind} onChange={(e) => setRoom((r) => ({ ...r, floorKind: e.target.value as FloorKind }))}>
          <option value="wood">Wood planks</option>
          <option value="tiles">Tiles</option>
          <option value="concrete">Concrete</option>
          <option value="color">Plain color</option>
        </select>
      </div>
      <div className="swatches">
        <ColorInput value={room.floorColor} onChange={(c) => setRoom((r) => ({ ...r, floorColor: c }))} />
        {['#b8895a', '#d8c3a0', '#8a6a4a', '#bdbdbd', '#ece8df'].map((c) => (
          <button key={c} className="swatch" style={{ background: c }} onClick={() => setRoom((r) => ({ ...r, floorColor: c }))} />
        ))}
      </div>

      <h3>Walls</h3>
      <div className="swatches">
        <ColorInput value={room.wallColor} onChange={(c) => setRoom((r) => ({ ...r, wallColor: c }))} />
        {['#eceae4', '#ffffff', '#dfe6e4', '#e9dfd3', '#c9ccd1'].map((c) => (
          <button key={c} className="swatch" style={{ background: c }} onClick={() => setRoom((r) => ({ ...r, wallColor: c }))} />
        ))}
      </div>

      <h3>Wardrobe</h3>
      <ColorField value={allColor} onChange={setAllColor} />
      <div className="buttons">
        <button onClick={() => applyColorToAll(allColor)}>Apply color to all objects</button>
      </div>
      <label className="check">
        <input type="checkbox" checked={doorsHidden} onChange={(e) => setUi({ doorsHidden: e.target.checked })} />
        Hide doors &amp; drawer fronts
      </label>
    </>
  );
}
