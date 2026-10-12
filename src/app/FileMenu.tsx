import { useState } from 'react';
import { newId } from '../core';
import { catalog } from '../catalog';
import { fileNameFor, parseDesignFile, serializeDesign } from '../persistence/files';
import { downloadText, pickTextFile } from './download';
import { getRepository } from './repo';
import { navigate } from './router';
import { ShareDialog } from './ShareDialog';
import { useApp } from './store';
import { useUi } from './ui';

/** Designs, file import/export, share and print. */
export function FileMenu() {
  const [share, setShare] = useState(false);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const importFile = async () => {
    close();
    const text = await pickTextFile('.json,application/json');
    if (text === null) return;
    const r = parseDesignFile(text, catalog);
    if (!r.ok) {
      useUi.getState().set({ notice: r.error });
      return;
    }
    const d = { ...r.design, id: newId() };
    await (await getRepository()).save(d);
    useUi.getState().set({ notice: r.warnings.length ? `Imported with warnings: ${r.warnings.join('; ')}` : null });
    navigate(`/design/${d.id}`);
  };
  const print = async () => {
    close();
    const d = useApp.getState().design;
    await (await getRepository()).save(d); // the print sheet reads the saved design
    window.open(`/print/${d.id}`, '_blank');
  };

  return (
    <div className="menu">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        File ▾
      </button>
      {open && (
        <div className="menu-list" role="menu" onMouseLeave={close}>
          <button type="button" role="menuitem" onClick={() => navigate('/')}>
            All designs
          </button>
          <button type="button" role="menuitem" onClick={() => navigate('/new')}>
            New design
          </button>
          <hr />
          <button type="button" role="menuitem" onClick={() => void importFile()}>
            Import file…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              const d = useApp.getState().design;
              downloadText(fileNameFor(d), serializeDesign(d), 'application/json');
            }}
          >
            Export file
          </button>
          <hr />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              setShare(true);
            }}
          >
            Share link…
          </button>
          <button type="button" role="menuitem" onClick={() => void print()}>
            Print sheet
          </button>
        </div>
      )}
      {share && <ShareDialog onClose={() => setShare(false)} />}
    </div>
  );
}
