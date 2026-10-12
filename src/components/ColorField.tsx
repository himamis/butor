import { COLOR_PRESETS } from '../state/defaults';
import { ColorInput } from './ColorInput';

export function ColorField({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div>
      <div className="swatches">
        <ColorInput value={value} onChange={onChange} />
        {COLOR_PRESETS.map((c) => (
          <button key={c.hex} className="swatch" title={c.name} style={{ background: c.hex }} onClick={() => onChange(c.hex)} />
        ))}
      </div>
    </div>
  );
}
