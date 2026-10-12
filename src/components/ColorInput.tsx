import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';

/**
 * Native color picker that records one undo step per pick: changes while the picker
 * is open are live (inside a drag snapshot) and committed when it closes.
 */
export function ColorInput({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const active = useRef(false);

  useEffect(() => {
    const el = ref.current!;
    const end = () => {
      if (!active.current) return;
      active.current = false;
      useStore.getState().endDrag();
    };
    el.addEventListener('change', end); // native change = picker committed
    el.addEventListener('blur', end);
    return () => {
      el.removeEventListener('change', end);
      el.removeEventListener('blur', end);
      end();
    };
  }, []);

  return (
    <input
      ref={ref}
      type="color"
      value={value}
      onChange={(e) => {
        if (!active.current) {
          active.current = true;
          useStore.getState().beginDrag();
        }
        onChange(e.target.value);
      }}
    />
  );
}
