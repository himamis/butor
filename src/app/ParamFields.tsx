import { describeParams, type ParamsSchema } from '../core';
import { NumberField } from './NumberField';

/** A form generated from a template's parameter schema (docs/v2/04-catalog.md): no per-template UI code. */
export function ParamFields(props: {
  schema: ParamsSchema;
  values: Record<string, unknown>;
  onPatch(patch: Record<string, unknown>): void;
  disabled?: boolean;
}) {
  const { values, onPatch, disabled } = props;
  return (
    <>
      {describeParams(props.schema).map((d) => {
        const v = values[d.key] ?? d.default;
        switch (d.kind) {
          case 'mm':
            return (
              <NumberField
                key={d.key}
                label={d.label}
                value={Number(v)}
                min={d.min}
                max={d.max}
                step={d.step ?? 1}
                disabled={disabled}
                onCommit={(n) => onPatch({ [d.key]: n })}
              />
            );
          case 'count':
            return (
              <NumberField
                key={d.key}
                label={d.label}
                value={Number(v)}
                min={d.min}
                max={d.max}
                step={1}
                suffix=""
                disabled={disabled}
                onCommit={(n) => onPatch({ [d.key]: n })}
              />
            );
          case 'choice':
            return (
              <label key={d.key} className="field">
                <span>{d.label}</span>
                <select
                  aria-label={d.label}
                  value={String(v)}
                  disabled={disabled}
                  onChange={(e) => onPatch({ [d.key]: e.target.value })}
                >
                  {Object.entries(d.options).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            );
          case 'toggle':
            return (
              <label key={d.key} className="field toggle">
                <span>{d.label}</span>
                <input
                  type="checkbox"
                  aria-label={d.label}
                  checked={Boolean(v)}
                  disabled={disabled}
                  onChange={(e) => onPatch({ [d.key]: e.target.checked })}
                />
              </label>
            );
          case 'color':
            return (
              <label key={d.key} className="field">
                <span>{d.label}</span>
                <input
                  type="color"
                  aria-label={d.label}
                  value={String(v)}
                  disabled={disabled}
                  onChange={(e) => onPatch({ [d.key]: e.target.value })}
                />
              </label>
            );
        }
      })}
    </>
  );
}
