import { useEffect, useState } from 'react';

/** A number input (mm by default) that commits on Enter or blur; an invalid entry reverts. */
export function NumberField(props: {
  label: string;
  value: number;
  onCommit(v: number): void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number; // default 0 (whole mm)
  suffix?: string;
  disabled?: boolean;
}) {
  const k = 10 ** (props.decimals ?? 0);
  const fmt = (v: number) => String(Math.round(v * k) / k);
  const [draft, setDraft] = useState(fmt(props.value));
  useEffect(() => {
    setDraft(String(Math.round(props.value * k) / k));
  }, [props.value, k]);
  const commit = () => {
    const v = Math.round(Number(draft) * k) / k;
    const bad =
      draft.trim() === '' ||
      !Number.isFinite(v) ||
      (props.min !== undefined && v < props.min) ||
      (props.max !== undefined && v > props.max);
    if (bad) {
      setDraft(fmt(props.value));
      return;
    }
    if (v !== Math.round(props.value * k) / k) props.onCommit(v);
  };
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="number"
        aria-label={props.label}
        inputMode={props.decimals ? 'decimal' : 'numeric'}
        step={props.step ?? (props.decimals ? 1 / k : 10)}
        min={props.min}
        max={props.max}
        value={draft}
        disabled={props.disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(fmt(props.value));
            e.currentTarget.blur();
          }
        }}
      />
      <span className="unit">{props.suffix ?? 'mm'}</span>
    </label>
  );
}

/** A text input that commits on Enter or blur. */
export function TextField(props: { label: string; value: string; onCommit(v: string): void; disabled?: boolean }) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => {
    setDraft(props.value);
  }, [props.value]);
  return (
    <label className="field text">
      <span>{props.label}</span>
      <input
        type="text"
        aria-label={props.label}
        value={draft}
        disabled={props.disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = draft.trim();
          if (v && v !== props.value) props.onCommit(v);
          else setDraft(props.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
