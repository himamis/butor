import { useEffect, useMemo, useState } from 'react';
import { serializeDesign, fileNameFor } from '../persistence/files';
import { SHARE_LIMIT, shareUrl } from '../persistence/share';
import { copyText, downloadText } from './download';
import { useApp } from './store';

/** The read-only share link (docs/v2/09-persistence.md#share-links). */
export function ShareDialog({ onClose }: { onClose(): void }) {
  const design = useApp((s) => s.design);
  const url = useMemo(() => shareUrl(window.location.origin, design), [design]);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [lan, setLan] = useState<string[]>([]);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const tooLong = url.length > SHARE_LIMIT;

  useEffect(() => {
    if (!local) return;
    fetch('/api/host')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { urls?: string[] } | null) => setLan(j?.urls ?? []))
      .catch(() => setLan([]));
  }, [local]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Share" onClick={(e) => e.stopPropagation()}>
        <h2>Share a read-only link</h2>
        <p className="muted small">
          Anyone with the link can look at this design, open doors, measure and see the cut list — but not change it.
          The design travels inside the link; nothing is uploaded.
        </p>
        {tooLong ? (
          <p className="notice">
            This design is too large for a reliable link ({Math.round(url.length / 1000)} KB). Send it as a file
            instead.
          </p>
        ) : (
          <>
            <input
              className="link"
              readOnly
              value={url}
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="row">
              <button type="button" className="primary" onClick={() => void copyText(url).then(setCopied)}>
                Copy link
              </button>
              <a className="button" href={url} target="_blank" rel="noreferrer">
                Open
              </a>
              {copied === true && <span role="status">Copied.</span>}
              {copied === false && <span role="status">Select the link and copy it.</span>}
            </div>
          </>
        )}
        {local && (
          <p className="muted small">
            This link points at <code>{window.location.host}</code>, so it only works on this computer.
          </p>
        )}
        {local && lan.length > 0 && !tooLong && (
          <>
            <p className="muted small">For other devices on your network:</p>
            <input
              className="link"
              readOnly
              value={shareUrl(lan[0]!, design)}
              aria-label="Share link for your network"
              onFocus={(e) => e.currentTarget.select()}
            />
          </>
        )}
        <div className="row">
          <button
            type="button"
            onClick={() => downloadText(fileNameFor(design), serializeDesign(design), 'application/json')}
          >
            Download as file
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
