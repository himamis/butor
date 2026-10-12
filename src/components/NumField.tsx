import { useEffect, useState } from 'react';

/** Number input that commits on blur / Enter. Non-numbers revert to the current value. */
export function NumField({ value, onCommit, step = 1, min, max }: {
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState(String(round(value)));
  const [rev, setRev] = useState(0); // bumps on every commit so the field resyncs even if the store clamps to the same value
  useEffect(() => setText(String(round(value))), [value, rev]);

  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v) && v !== round(value)) onCommit(v);
    setRev((r) => r + 1);
  };

  return (
    <input
      type="number"
      value={text}
      step={step}
      min={min}
      max={max}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(String(round(value)));
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

const round = (v: number) => Math.round(v * 10) / 10;
