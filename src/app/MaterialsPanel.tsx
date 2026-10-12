import { useState } from 'react';
import { newId, type Board, type Finish, type Material, type Op } from '../core';
import { NumberField, TextField } from './NumberField';
import { useApp } from './store';
import { useRun } from './useRun';

const ROLES = [
  ['carcass', 'Carcass'],
  ['back', 'Back'],
  ['interior', 'Interior'],
  ['front', 'Fronts'],
] as const;
type Role = (typeof ROLES)[number][0];

const NEW_BOARD: Board = {
  kind: 'board',
  name: 'New board',
  thicknesses: [18],
  appearance: { color: '#c8b49a', texture: 'plain', roughness: 0.7 },
  grain: 'none',
  price: { perM2: 30, currency: 'EUR' },
  edgeBanding: { name: 'ABS 1 mm', perM: 1.5 },
};
const NEW_FINISH: Finish = {
  kind: 'finish',
  name: 'New finish',
  appearance: { color: '#a0a0a0', metalness: 0.8, roughness: 0.3 },
};

/** The design's material library, and applying a material to the selection or every unit (docs/v2/01-features.md#f9). */
export function MaterialsPanel() {
  const materials = useApp((s) => s.design.materials);
  const { run, message } = useRun();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="panel-body">
      {message && (
        <p className="notice" role="alert">
          {message}
        </p>
      )}
      <ApplyMaterial run={run} />
      <h3>Library</h3>
      {Object.entries(materials).map(([id, m]) => (
        <div key={id} className="material">
          <button
            type="button"
            className="disclosure"
            aria-expanded={open === id}
            onClick={() => setOpen(open === id ? null : id)}
          >
            <span className="swatch" style={{ background: m.appearance.color }} aria-hidden="true" />
            {m.name}
            <span className="muted small"> · {m.kind === 'board' ? `${m.thicknesses.join('/')} mm` : 'finish'}</span>
          </button>
          {open === id && <MaterialEditor id={id} material={m} run={run} />}
        </div>
      ))}
      <div className="row">
        <button
          type="button"
          onClick={() => {
            const id = newId();
            if (run([{ type: 'material.add', id, material: NEW_BOARD }], 'Add a board')) setOpen(id);
          }}
        >
          + Board
        </button>
        <button
          type="button"
          onClick={() => {
            const id = newId();
            if (run([{ type: 'material.add', id, material: NEW_FINISH }], 'Add a finish')) setOpen(id);
          }}
        >
          + Finish
        </button>
      </div>
    </div>
  );
}

function ApplyMaterial({ run }: { run(ops: Op[], label: string): boolean }) {
  const design = useApp((s) => s.design);
  const selection = useApp((s) => s.selection.entities);
  const [role, setRole] = useState<Role>('front');
  const boards = Object.entries(design.materials).filter(([, m]) => m.kind === 'board');
  const [material, setMaterial] = useState(boards[0]?.[0] ?? '');
  const units = (ids: string[]) =>
    ids.filter((id) => design.entities[id]?.kind === 'unit' && !design.entities[id]!.locked);
  const parts = (ids: string[]) =>
    ids.filter((id) => design.entities[id]?.kind === 'part' && !design.entities[id]!.locked);
  const apply = (ids: string[], label: string) =>
    run(
      [
        ...units(ids).map((id): Op => ({ type: 'entity.update', id, materials: { [role]: material } })),
        ...parts(ids).map((id): Op => ({ type: 'entity.update', id, material })),
      ],
      label,
    );
  const sel = units(selection).length + parts(selection).length;
  return (
    <>
      <h3>Apply</h3>
      <label className="field">
        <span>Material</span>
        <select aria-label="Material to apply" value={material} onChange={(e) => setMaterial(e.target.value)}>
          {boards.map(([id, m]) => (
            <option key={id} value={id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>On units' </span>
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map(([r, l]) => (
            <option key={r} value={r}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <button type="button" disabled={!sel} onClick={() => apply(selection, 'Material to selection')}>
          Apply to selection{sel ? ` (${sel})` : ''}
        </button>
        <button type="button" onClick={() => apply(design.order, 'Material to all')}>
          Apply to all
        </button>
      </div>
      <p className="muted small">Free parts take the material whole; locked entities are skipped.</p>
    </>
  );
}

function MaterialEditor({
  id,
  material: m,
  run,
}: {
  id: string;
  material: Material;
  run(ops: Op[], label: string): boolean;
}) {
  const save = (next: Material) => run([{ type: 'material.update', id, material: next }], `Edit ${m.name}`);
  return (
    <div className="material-editor">
      <TextField label="Name" value={m.name} onCommit={(name) => save({ ...m, name })} />
      <label className="field">
        <span>Colour</span>
        <input
          type="color"
          value={m.appearance.color}
          onChange={(e) => save({ ...m, appearance: { ...m.appearance, color: e.target.value } } as Material)}
        />
      </label>
      {m.kind === 'board' ? (
        <>
          <TextField
            label="Thicknesses"
            value={m.thicknesses.join(', ')}
            onCommit={(v) => {
              const list = v
                .split(/[,\s]+/)
                .map(Number)
                .filter((n) => n > 0 && n <= 100);
              if (list.length) save({ ...m, thicknesses: [...new Set(list)].sort((a, b) => a - b) });
            }}
          />
          <label className="field">
            <span>Texture</span>
            <select
              value={m.appearance.texture}
              onChange={(e) =>
                save({
                  ...m,
                  appearance: { ...m.appearance, texture: e.target.value as Board['appearance']['texture'] },
                })
              }
            >
              <option value="plain">Plain</option>
              <option value="woodgrain">Wood grain</option>
            </select>
          </label>
          <label className="field">
            <span>Grain</span>
            <select value={m.grain} onChange={(e) => save({ ...m, grain: e.target.value as Board['grain'] })}>
              <option value="none">None</option>
              <option value="length">Along the length</option>
            </select>
          </label>
          <NumberField
            label="Price per m²"
            value={m.price.perM2}
            min={0}
            decimals={2}
            suffix={m.price.currency}
            onCommit={(perM2) => save({ ...m, price: { ...m.price, perM2 } })}
          />
          <TextField
            label="Edge banding"
            value={m.edgeBanding?.name ?? ''}
            onCommit={(name) => save({ ...m, edgeBanding: { name, perM: m.edgeBanding?.perM ?? 0 } })}
          />
          <NumberField
            label="Banding per m"
            value={m.edgeBanding?.perM ?? 0}
            min={0}
            decimals={2}
            suffix={m.price.currency}
            onCommit={(perM) => save({ ...m, edgeBanding: { name: m.edgeBanding?.name ?? 'Edge banding', perM } })}
          />
        </>
      ) : (
        <>
          <NumberField
            label="Metalness"
            value={m.appearance.metalness}
            min={0}
            max={1}
            decimals={2}
            suffix=""
            onCommit={(metalness) => save({ ...m, appearance: { ...m.appearance, metalness } })}
          />
          <NumberField
            label="Roughness"
            value={m.appearance.roughness}
            min={0}
            max={1}
            decimals={2}
            suffix=""
            onCommit={(roughness) => save({ ...m, appearance: { ...m.appearance, roughness } })}
          />
        </>
      )}
    </div>
  );
}
