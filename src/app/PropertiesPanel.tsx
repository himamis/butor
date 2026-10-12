import { type Entity, type Op, type Unit } from '../core';
import { catalog } from '../catalog';
import { NumberField, TextField } from './NumberField';
import { ParamFields } from './ParamFields';
import { useApp } from './store';
import { MaterialSelect, UnitEditor } from './UnitEditor';
import { useRun } from './useRun';

const ROLES = [
  ['carcass', 'Carcass'],
  ['back', 'Back'],
  ['interior', 'Interior'],
  ['front', 'Fronts'],
] as const;

/** Properties of the selection, generated from template schemas (docs/v2/01-features.md#f5). */
export function PropertiesPanel() {
  const design = useApp((s) => s.design);
  const selection = useApp((s) => s.selection);
  const { run, message, setMessage } = useRun();
  const ids = selection.entities;
  const entity = ids.length === 1 ? design.entities[ids[0]!] : undefined;

  return (
    <div className="panel-body" aria-label="Properties">
      {message && (
        <p className="notice" role="alert">
          {message}
        </p>
      )}
      {ids.length === 0 && <DesignProps run={run} />}
      {ids.length > 1 && <MultiProps ids={ids} />}
      {entity && <EntityProps key={entity.id} entity={entity} run={run} say={setMessage} />}
    </div>
  );
}

function DesignProps({ run }: { run(ops: Op[], label: string): boolean }) {
  const design = useApp((s) => s.design);
  const counts = { unit: 0, part: 0, opaque: 0 };
  for (const e of Object.values(design.entities)) counts[e.kind]++;
  return (
    <>
      <h3>Design</h3>
      <TextField
        label="Name"
        value={design.name}
        onCommit={(name) => run([{ type: 'design.rename', name }], 'Rename design')}
      />
      <p className="muted small">
        {counts.unit} unit{counts.unit === 1 ? '' : 's'}, {counts.part} part{counts.part === 1 ? '' : 's'}
        {counts.opaque ? `, ${counts.opaque} unreadable (kept unchanged)` : ''}. Select something to edit it; press ?
        for shortcuts.
      </p>
    </>
  );
}

function MultiProps({ ids }: { ids: string[] }) {
  const s = useApp.getState;
  const grouped = useApp((st) =>
    Object.values(st.design.groups).some((g) => ids.every((id) => g.members.includes(id))),
  );
  return (
    <>
      <h3>{ids.length} selected</h3>
      <div className="row">
        {grouped ? (
          <button type="button" onClick={() => s().ungroupSelection()}>
            Ungroup
          </button>
        ) : (
          <button type="button" onClick={() => s().groupSelection()}>
            Group
          </button>
        )}
        <button type="button" onClick={() => s().apply([{ type: 'entity.rotate', ids, degrees: -90 }], 'Rotate')}>
          Rotate 90°
        </button>
        <button type="button" onClick={() => s().duplicate()}>
          Duplicate
        </button>
        <button type="button" onClick={() => s().removeSelection()}>
          Delete
        </button>
      </div>
      <p className="muted small">Materials can be applied to the whole selection in the Materials tab.</p>
    </>
  );
}

function EntityProps({
  entity: e,
  run,
  say,
}: {
  entity: Entity;
  run(ops: Op[], label: string): boolean;
  say(m: string): void;
}) {
  const design = useApp((s) => s.design);
  const inner = useApp((s) => s.selection.inner);
  const locked = e.locked;
  const rot = ((Math.round(e.rotation) % 360) + 360) % 360;
  const move = (d: { x?: number; y?: number; z?: number }) =>
    run([{ type: 'entity.move', ids: [e.id], delta: { x: d.x ?? 0, y: d.y ?? 0, z: d.z ?? 0 } }], 'Move');
  const t = e.kind === 'opaque' ? undefined : catalog.get(e.template.id);
  const invalid = useApp((s) => s.checks.find((c) => c.kind === 'invalid' && c.entities[0] === e.id));

  return (
    <>
      <h3>{t?.name ?? 'Unreadable entity'}</h3>
      <TextField
        label="Name"
        value={e.name}
        disabled={locked}
        onCommit={(name) => run([{ type: 'entity.update', id: e.id, name }], 'Rename')}
      />
      <label className="field toggle">
        <span>Locked</span>
        <input
          type="checkbox"
          checked={locked}
          onChange={(ev) =>
            run([{ type: 'entity.update', id: e.id, locked: ev.target.checked }], ev.target.checked ? 'Lock' : 'Unlock')
          }
        />
      </label>
      {invalid && (
        <p className="notice" role="alert">
          This {e.kind === 'unit' ? 'unit' : 'part'} cannot be built:{' '}
          {invalid.message.replace(/^.*cannot be built: /, '')}. It shows as a red box; undo the last change or fix the
          values below.
        </p>
      )}
      {e.kind === 'opaque' ? (
        <p className="notice">
          This entity could not be read ({e.reason}). It is kept unchanged in the file and can only be moved or deleted.
        </p>
      ) : null}
      <fieldset className="plain" disabled={locked}>
        <NumberField label="Position x" value={e.position.x} onCommit={(x) => move({ x: x - e.position.x })} />
        <NumberField label="Position z" value={e.position.z} onCommit={(z) => move({ z: z - e.position.z })} />
        {e.kind === 'part' && (
          <NumberField
            label="Above floor"
            value={e.position.y}
            min={0}
            onCommit={(y) => move({ y: y - e.position.y })}
          />
        )}
        <NumberField
          label="Rotation"
          value={rot}
          step={15}
          suffix="°"
          onCommit={(r) => run([{ type: 'entity.rotate', ids: [e.id], degrees: r - rot }], 'Rotate')}
        />
        {e.kind === 'unit' && <UnitProps unit={e} run={run} />}
        {e.kind === 'part' && t && (
          <>
            <ParamFields
              schema={t.params}
              values={e.params}
              onPatch={(params) => run([{ type: 'entity.update', id: e.id, params }], `Edit ${t.name}`)}
            />
            <MaterialSelect
              label="Material"
              value={e.material}
              design={design}
              placeholder="Default"
              onChange={(material) => run([{ type: 'entity.update', id: e.id, material }], 'Material')}
            />
          </>
        )}
      </fieldset>
      {e.kind === 'unit' && (
        <UnitEditor
          unit={e}
          design={design}
          inner={inner?.entity === e.id ? inner : null}
          run={run}
          say={say}
          locked={locked}
        />
      )}
    </>
  );
}

function UnitProps({ unit: u, run }: { unit: Unit; run(ops: Op[], label: string): boolean }) {
  const design = useApp((s) => s.design);
  const t = catalog.get(u.template.id);
  if (!t || t.kind !== 'unit') return null;
  const [w, h, d] = [t.sizeLimits.w, t.sizeLimits.h, t.sizeLimits.d];
  const resize = (size: { w?: number; h?: number; d?: number }) =>
    run([{ type: 'unit.resize', id: u.id, size }], 'Resize');
  return (
    <>
      <h3>Size</h3>
      <NumberField label="Width" value={u.size.w} min={w[0]} max={w[1]} onCommit={(v) => resize({ w: v })} />
      <NumberField label="Height" value={u.size.h} min={h[0]} max={h[1]} onCommit={(v) => resize({ h: v })} />
      <NumberField label="Depth" value={u.size.d} min={d[0]} max={d[1]} onCommit={(v) => resize({ d: v })} />
      <h3>Construction</h3>
      <ParamFields
        schema={t.params}
        values={u.params}
        onPatch={(params) => run([{ type: 'entity.update', id: u.id, params }], 'Construction')}
      />
      <h3>Materials</h3>
      {ROLES.map(([role, label]) => (
        <MaterialSelect
          key={role}
          label={label}
          value={u.materials[role] ?? design.defaults[role]}
          design={design}
          placeholder="Default"
          onChange={(m) => run([{ type: 'entity.update', id: u.id, materials: { [role]: m } }], `${label} material`)}
        />
      ))}
    </>
  );
}
