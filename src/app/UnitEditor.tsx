import { useEffect, useRef, useState } from 'react';
import {
  columnSpans,
  defaultsOf,
  freeFrontItems,
  freeFrontSpan,
  frontTakingItems,
  itemFrontSpan,
  freeSpot,
  unitLayout,
  type Design,
  type Front,
  type Item,
  type Op,
  type Unit,
  type UnitLayout,
  type UnitTemplate,
} from '../core';
import { catalog } from '../catalog';
import { NumberField } from './NumberField';
import { ParamFields } from './ParamFields';
import type { InnerSelection } from './store';

const nameOf = (id: string) => catalog.get(id)?.name ?? id;
const ITEM_TEMPLATES = catalog.all().filter((t) => t.kind === 'item');
const FRONT_TEMPLATES = catalog.all().filter((t) => t.kind === 'front');

function MaterialSelect(props: {
  label: string;
  value: string | undefined;
  design: Design;
  onChange(id: string): void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <select
        value={props.value ?? ''}
        disabled={props.disabled}
        onChange={(e) => e.target.value && props.onChange(e.target.value)}
      >
        {!props.value && <option value="">{props.placeholder}</option>}
        {Object.entries(props.design.materials).map(([id, m]) => (
          <option key={id} value={id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Columns, items and fronts of one unit (docs/v2/01-features.md#f4-units). */
export function UnitEditor(props: {
  unit: Unit;
  design: Design;
  inner: InnerSelection | null;
  run(ops: Op[], label: string): boolean;
  say(message: string): void;
  locked: boolean;
}) {
  const { unit: u, design, inner, run, locked } = props;
  const t = catalog.get(u.template.id) as UnitTemplate | undefined;
  const layout = t ? unitLayout(u, t, catalog) : { error: 'unknown template' };
  const [itemTemplate, setItemTemplate] = useState(ITEM_TEMPLATES[0]?.id ?? '');
  const [frontTemplate, setFrontTemplate] = useState(FRONT_TEMPLATES[0]?.id ?? '');
  const highlighted = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    highlighted.current?.scrollIntoView({ block: 'nearest' });
  }, [inner?.id]);

  if ('error' in layout) return <p className="notice">This unit cannot be laid out: {layout.error}</p>;

  const addItem = (ci: number) => {
    const it = catalog.get(itemTemplate);
    if (!it || it.kind !== 'item') return;
    const params = defaultsOf(it.params);
    const h = it.height(params, { layout, column: ci });
    const y = freeSpot(columnSpans(u, ci, layout, catalog), h, layout.inner.h);
    if (y === null) {
      props.say(`No free space for a ${it.name.toLowerCase()} in column ${ci + 1}`);
      return;
    }
    run(
      [{ type: 'unit.item.add', unit: u.id, column: u.columns[ci]!.id, template: { id: it.id }, y }],
      `Add ${it.name}`,
    );
  };

  const addFront = () => {
    const ft = catalog.get(frontTemplate);
    if (!ft || ft.kind !== 'front') return;
    if (ft.attachesToItem) {
      // The lowest item that takes a front and has none (the catalog says which items do).
      for (const slot of freeFrontItems(u, layout, catalog)) {
        const span = itemFrontSpan(u, slot.column, layout, slot);
        if (!span) continue;
        run(
          [
            {
              type: 'unit.front.add',
              unit: u.id,
              template: { id: ft.id },
              columns: [slot.column, slot.column],
              y: span,
              item: slot.item,
            },
          ],
          `Add ${ft.name}`,
        );
        return;
      }
      props.say(
        `A ${ft.name.toLowerCase()} goes on an item that takes one (${frontTakingItems(catalog).join(', ')}) — add one first.`,
      );
      return;
    }
    const span = freeFrontSpan(u, [0, u.columns.length - 1]);
    if (!span) {
      props.say('There is no free space for another front.');
      return;
    }
    run(
      [{ type: 'unit.front.add', unit: u.id, template: { id: ft.id }, columns: [0, u.columns.length - 1], y: span }],
      `Add ${ft.name}`,
    );
  };

  const isHl = (kind: 'item' | 'front', id: string) => inner?.kind === kind && inner.id === id;

  return (
    <fieldset className="unit-editor" disabled={locked}>
      <h3>Columns</h3>
      {u.columns.map((c, ci) => (
        <ColumnBox
          key={c.id}
          unit={u}
          layout={layout}
          ci={ci}
          design={design}
          run={run}
          isHl={isHl}
          hlRef={highlighted}
          onAddItem={() => addItem(ci)}
          itemTemplate={itemTemplate}
        />
      ))}
      <div className="row">
        <button
          type="button"
          onClick={() =>
            run([{ type: 'unit.column.add', unit: u.id, at: u.columns.length, width: 'auto' }], 'Add a column')
          }
        >
          + Column
        </button>
        <label className="field inline">
          <span>New item</span>
          <select aria-label="New item type" value={itemTemplate} onChange={(e) => setItemTemplate(e.target.value)}>
            {ITEM_TEMPLATES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3>Fronts</h3>
      {u.fronts.map((f) => (
        <FrontBox
          key={f.id}
          unit={u}
          front={f}
          design={design}
          run={run}
          hl={isHl('front', f.id)}
          hlRef={highlighted}
        />
      ))}
      <div className="row">
        <select aria-label="New front type" value={frontTemplate} onChange={(e) => setFrontTemplate(e.target.value)}>
          {FRONT_TEMPLATES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={addFront}>
          + Front
        </button>
      </div>
    </fieldset>
  );
}

function ColumnBox(props: {
  unit: Unit;
  layout: UnitLayout;
  ci: number;
  design: Design;
  run(ops: Op[], label: string): boolean;
  isHl(kind: 'item' | 'front', id: string): boolean;
  hlRef: React.RefObject<HTMLFieldSetElement | null>;
  onAddItem(): void;
  itemTemplate: string;
}) {
  const { unit: u, layout, ci, run } = props;
  const c = u.columns[ci]!;
  const n = u.columns.length;
  const items = [...c.items].sort((a, b) => b.y - a.y); // top first, as seen
  return (
    <fieldset className="item-box" aria-label={`Column ${ci + 1}`}>
      <legend>
        Column {ci + 1} <span className="muted">· {Math.round(layout.columns[ci]?.width ?? 0)} mm inside</span>
      </legend>
      <label className="field toggle">
        <span>Auto width</span>
        <input
          type="checkbox"
          checked={c.width === 'auto'}
          onChange={(e) =>
            run(
              [
                {
                  type: 'unit.column.update',
                  unit: u.id,
                  column: c.id,
                  width: e.target.checked ? 'auto' : Math.round(layout.columns[ci]?.width ?? 400),
                },
              ],
              'Column width',
            )
          }
        />
      </label>
      {c.width !== 'auto' && (
        <NumberField
          label="Width"
          value={c.width}
          min={1}
          onCommit={(w) => run([{ type: 'unit.column.update', unit: u.id, column: c.id, width: w }], 'Column width')}
        />
      )}
      {items.map((i) => (
        <ItemRow
          key={i.id}
          unit={u}
          item={i}
          design={props.design}
          run={run}
          hl={props.isHl('item', i.id)}
          hlRef={props.hlRef}
        />
      ))}
      <div className="row">
        <button
          type="button"
          onClick={props.onAddItem}
          title={`Add a ${nameOf(props.itemTemplate)} where it fits, lowest first`}
        >
          + {nameOf(props.itemTemplate)}
        </button>
        <button
          type="button"
          disabled={ci === 0}
          onClick={() => run([{ type: 'unit.column.move', unit: u.id, column: c.id, to: ci - 1 }], 'Move column')}
          aria-label={`Move column ${ci + 1} left`}
        >
          ◀
        </button>
        <button
          type="button"
          disabled={ci === n - 1}
          onClick={() => run([{ type: 'unit.column.move', unit: u.id, column: c.id, to: ci + 1 }], 'Move column')}
          aria-label={`Move column ${ci + 1} right`}
        >
          ▶
        </button>
        <button
          type="button"
          disabled={n === 1}
          onClick={() => run([{ type: 'unit.column.remove', unit: u.id, column: c.id }], 'Remove column')}
          aria-label={`Remove column ${ci + 1}`}
        >
          Remove
        </button>
      </div>
    </fieldset>
  );
}

function ItemRow(props: {
  unit: Unit;
  item: Item;
  design: Design;
  run(ops: Op[], label: string): boolean;
  hl: boolean;
  hlRef: React.RefObject<HTMLFieldSetElement | null>;
}) {
  const { unit: u, item: i, run } = props;
  const t = catalog.get(i.template.id);
  const [open, setOpen] = useState(props.hl);
  useEffect(() => {
    if (props.hl) setOpen(true);
  }, [props.hl]);
  return (
    <fieldset
      className={`sub-box${props.hl ? ' hl' : ''}`}
      ref={props.hl ? props.hlRef : undefined}
      aria-label={`${t?.name ?? 'Item'} at ${Math.round(i.y)} mm`}
    >
      <div className="sub-head">
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} {t?.name ?? i.template.id}
        </button>
        <span className="muted">{Math.round(i.y)} mm</span>
        <button
          type="button"
          aria-label="Remove"
          title="Remove"
          onClick={() => run([{ type: 'unit.item.remove', unit: u.id, item: i.id }], `Remove ${t?.name ?? 'item'}`)}
        >
          ✕
        </button>
      </div>
      {open && (
        <>
          <NumberField
            label="Height from floor"
            value={i.y}
            min={0}
            onCommit={(y) => run([{ type: 'unit.item.update', unit: u.id, item: i.id, y }], 'Move item')}
          />
          {t && (
            <ParamFields
              schema={t.params}
              values={i.params}
              onPatch={(p) => run([{ type: 'unit.item.update', unit: u.id, item: i.id, params: p }], `Edit ${t.name}`)}
            />
          )}
          <MaterialSelect
            label="Material"
            value={i.material}
            design={props.design}
            placeholder="As the unit"
            onChange={(m) => run([{ type: 'unit.item.update', unit: u.id, item: i.id, material: m }], 'Item material')}
          />
        </>
      )}
    </fieldset>
  );
}

function FrontBox(props: {
  unit: Unit;
  front: Front;
  design: Design;
  run(ops: Op[], label: string): boolean;
  hl: boolean;
  hlRef: React.RefObject<HTMLFieldSetElement | null>;
}) {
  const { unit: u, front: f, run } = props;
  const t = catalog.get(f.template.id);
  const [open, setOpen] = useState(props.hl);
  useEffect(() => {
    if (props.hl) setOpen(true);
  }, [props.hl]);
  const upd = (patch: Omit<Extract<Op, { type: 'unit.front.update' }>, 'type' | 'unit' | 'front'>, label: string) =>
    run([{ type: 'unit.front.update', unit: u.id, front: f.id, ...patch }], label);
  const n = u.columns.length;
  return (
    <fieldset
      className={`sub-box${props.hl ? ' hl' : ''}`}
      ref={props.hl ? props.hlRef : undefined}
      aria-label={`${t?.name ?? 'Front'} ${Math.round(f.y[0])}–${Math.round(f.y[1])} mm`}
    >
      <div className="sub-head">
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} {t?.name ?? f.template.id}
        </button>
        <span className="muted">
          {n > 1 ? `col ${f.columns[0] + 1}${f.columns[1] !== f.columns[0] ? `–${f.columns[1] + 1}` : ''} · ` : ''}
          {Math.round(f.y[0])}–{Math.round(f.y[1])}
        </span>
        <button
          type="button"
          aria-label="Remove"
          title="Remove"
          onClick={() => run([{ type: 'unit.front.remove', unit: u.id, front: f.id }], `Remove ${t?.name ?? 'front'}`)}
        >
          ✕
        </button>
      </div>
      {open && (
        <>
          {n > 1 && (
            <>
              <NumberField
                label="From column"
                value={f.columns[0] + 1}
                min={1}
                max={n}
                step={1}
                suffix=""
                onCommit={(c) => upd({ columns: [c - 1, Math.max(c - 1, f.columns[1])] }, 'Front columns')}
              />
              <NumberField
                label="To column"
                value={f.columns[1] + 1}
                min={1}
                max={n}
                step={1}
                suffix=""
                onCommit={(c) => upd({ columns: [Math.min(c - 1, f.columns[0]), c - 1] }, 'Front columns')}
              />
            </>
          )}
          <NumberField
            label="Bottom"
            value={f.y[0]}
            min={0}
            onCommit={(y) => upd({ y: [y, f.y[1]] }, 'Front height')}
          />
          <NumberField label="Top" value={f.y[1]} min={1} onCommit={(y) => upd({ y: [f.y[0], y] }, 'Front height')} />
          {t && (
            <ParamFields schema={t.params} values={f.params} onPatch={(p) => upd({ params: p }, `Edit ${t.name}`)} />
          )}
          <MaterialSelect
            label="Material"
            value={f.material}
            design={props.design}
            placeholder="As the unit's fronts"
            onChange={(m) => upd({ material: m }, 'Front material')}
          />
        </>
      )}
    </fieldset>
  );
}

export { MaterialSelect };
