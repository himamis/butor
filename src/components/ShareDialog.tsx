import { useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { encodeShare } from '../lib/share';

const isLocalHost = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]';

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const design = useStore((s) => s.design);
  const link = useMemo(() => `${location.origin}${location.pathname}${encodeShare(design)}`, [design]);
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard API needs a secure context (https or localhost); fall back to selecting the text.
      input.current?.select();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Share a read-only view</h2>
        <p>Anyone with this link can look around, open doors and drawers and see the cut list — but not change anything. The design is stored in the link itself, so share a new link after you make changes.</p>
        <input ref={input} type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
        {isLocalHost(location.hostname) && (
          <p className="note">
            This link points to <b>{location.hostname}</b>, so it only works on this computer. To share with other devices, open the app through your network address (shown as “Network” when you run <code>npm run dev</code>) and copy the link from there.
          </p>
        )}
        <div className="buttons">
          <button onClick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
          <a href={link} target="_blank" rel="noreferrer"><button>Preview</button></a>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
