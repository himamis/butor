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
  useEffect(() => setText(String(round(value))), [value]);

  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v) && v !== round(value)) onCommit(v);
    // If the store clamps back to the same value, the effect won't fire — reset here.
    setText(String(round(value)));
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
