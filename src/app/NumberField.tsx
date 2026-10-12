import { useEffect, useState } from 'react';

/** A millimetre input that commits on Enter or blur; an invalid entry reverts. */
export function NumberField(props: {
  label: string;
  value: number;
  onCommit(v: number): void;
  min?: number;
  step?: number;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(Math.round(props.value)));
  useEffect(() => {
    setDraft(String(Math.round(props.value)));
  }, [props.value]);
  const commit = () => {
    const v = Number(draft);
    if (!Number.isFinite(v) || draft.trim() === '' || (props.min !== undefined && v < props.min)) {
      setDraft(String(Math.round(props.value)));
      return;
    }
    if (Math.round(v) !== Math.round(props.value)) props.onCommit(Math.round(v));
  };
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="number"
        inputMode="numeric"
        step={props.step ?? 10}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(String(Math.round(props.value)));
            e.currentTarget.blur();
          }
        }}
      />
      <span className="unit">{props.suffix ?? 'mm'}</span>
    </label>
  );
}
