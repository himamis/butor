import { useState } from 'react';
import { useStore } from '../state/store';
import { ROOM_PRESETS, DEFAULT_COLOR } from '../state/defaults';
import type { FloorKind } from '../types';
import { NumField } from './NumField';
import { ColorField } from './ColorField';

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
        <input type="color" value={room.floorColor} onChange={(e) => setRoom((r) => ({ ...r, floorColor: e.target.value }))} />
        {['#b8895a', '#d8c3a0', '#8a6a4a', '#bdbdbd', '#ece8df'].map((c) => (
          <button key={c} className="swatch" style={{ background: c }} onClick={() => setRoom((r) => ({ ...r, floorColor: c }))} />
        ))}
      </div>

      <h3>Walls</h3>
      <div className="swatches">
        <input type="color" value={room.wallColor} onChange={(e) => setRoom((r) => ({ ...r, wallColor: e.target.value }))} />
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
