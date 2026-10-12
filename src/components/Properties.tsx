import { useStore } from '../state/store';
import { getTemplate } from '../templates';
import { hasMovingParts } from '../lib/geometry';
import type { SceneObject } from '../types';
import { NumField } from './NumField';
import { ColorField } from './ColorField';
import { RoomPanel } from './RoomPanel';

function SingleObject({ o }: { o: SceneObject }) {
  const s = useStore();
  const t = getTemplate(o.templateId);
  const movable = hasMovingParts(o);
  const update = (fn: (o: SceneObject) => SceneObject) => s.updateObjects([o.id], fn);
  const setPos = (axis: 'x' | 'y' | 'z', v: number) => update((x) => ({ ...x, position: { ...x.position, [axis]: axis === 'y' ? Math.max(0, v) : v } }));

  return (
    <>
      <h3>{t.name}</h3>
      <div className="row">
        <label>Name</label>
        <input
          key={o.id}
          type="text"
          defaultValue={o.name}
          onBlur={(e) => e.target.value !== o.name && update((x) => ({ ...x, name: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>

      <h3>Size (mm)</h3>
      {t.params.filter((p) => !p.options).map((p) => (
        <div className="row" key={p.key}>
          <label>{p.label}</label>
          <NumField value={o.params[p.key]} min={p.min} max={p.max} step={p.step} onCommit={(v) => s.setParam(o.id, p.key, v)} />
        </div>
      ))}

      {t.params.some((p) => p.options) && <h3>Fronts &amp; hardware</h3>}
      {t.params.filter((p) => p.options).map((p) => (
        <div className="row" key={p.key}>
          <label>{p.label}</label>
          <select value={o.params[p.key]} onChange={(e) => s.setParam(o.id, p.key, Number(e.target.value))}>
            {p.options!.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      ))}
      {movable && (
        <label className="check">
          <input type="checkbox" checked={s.openIds.includes(o.id)} onChange={() => s.toggleOpen(o.id)} />
          Open (or double-click it)
        </label>
      )}

      <h3>Position (mm)</h3>
      <div className="row3">
        {(['x', 'y', 'z'] as const).map((a) => (
          <div key={a}>
            <label>{a.toUpperCase()}</label>
            <NumField value={o.position[a]} onCommit={(v) => setPos(a, v)} />
          </div>
        ))}
      </div>

      <h3>Rotation (°)</h3>
      <div className="row3">
        <NumField value={o.rotationY} onCommit={(v) => update((x) => ({ ...x, rotationY: ((v % 360) + 360) % 360 }))} />
        <button onClick={() => s.rotateSelected(90)}>⟳ 90°</button>
        <button onClick={() => s.rotateSelected(-90)}>⟲ 90°</button>
      </div>

      <h3>Color</h3>
      <ColorField value={o.color} onChange={(hex) => update((x) => ({ ...x, color: hex }))} />
      {t.build(o.params).some((p) => p.role === 'door') && (
        <>
          <label className="check">
            <input type="checkbox" checked={!o.doorColor} onChange={(e) => update((x) => ({ ...x, doorColor: e.target.checked ? undefined : x.color }))} />
            Front same as body
          </label>
          {o.doorColor && <ColorField value={o.doorColor} onChange={(hex) => update((x) => ({ ...x, doorColor: hex }))} />}
        </>
      )}

      <label className="check">
        <input type="checkbox" checked={!!o.locked} onChange={(e) => update((x) => ({ ...x, locked: e.target.checked }))} />
        Locked (can't move or delete)
      </label>
      <div className="buttons">
        <button onClick={s.duplicateSelected}>Duplicate</button>
        <button className="danger" onClick={s.deleteSelected} disabled={o.locked}>Delete</button>
      </div>
    </>
  );
}

function MultiObject({ objs }: { objs: SceneObject[] }) {
  const s = useStore();
  const ids = objs.map((o) => o.id);
  const grouped = objs.every((o) => o.groupId && o.groupId === objs[0].groupId);
  return (
    <>
      <h3>{grouped ? 'Group' : 'Selection'} · {objs.length} objects</h3>
      <div className="buttons">
        {grouped ? <button onClick={s.ungroupSelected}>Ungroup</button> : <button onClick={s.groupSelected}>Group</button>}
        <button onClick={() => s.rotateSelected(90)}>⟳ 90°</button>
        <button onClick={() => s.rotateSelected(-90)}>⟲ 90°</button>
      </div>
      <h3>Color for all selected</h3>
      <ColorField value={objs[0].color} onChange={(hex) => s.updateObjects(ids, (o) => ({ ...o, color: hex }))} />
      <div className="buttons">
        <button onClick={s.duplicateSelected}>Duplicate</button>
        <button className="danger" onClick={s.deleteSelected}>Delete</button>
      </div>
      <h3>Objects</h3>
      {objs.map((o) => <div key={o.id} style={{ padding: '2px 0' }}>{o.name}</div>)}
    </>
  );
}

export function Properties() {
  const objects = useStore((s) => s.design.objects);
  const selection = useStore((s) => s.selection);
  const sel = objects.filter((o) => selection.includes(o.id));

  return (
    <aside className="props">
      {sel.length === 0 && <RoomPanel />}
      {sel.length === 1 && <SingleObject o={sel[0]} />}
      {sel.length > 1 && <MultiObject objs={sel} />}
    </aside>
  );
}
