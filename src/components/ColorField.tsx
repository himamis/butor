import { COLOR_PRESETS } from '../state/defaults';

export function ColorField({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div>
      <div className="swatches">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        {COLOR_PRESETS.map((c) => (
          <button key={c.hex} className="swatch" title={c.name} style={{ background: c.hex }} onClick={() => onChange(c.hex)} />
        ))}
      </div>
    </div>
  );
}
