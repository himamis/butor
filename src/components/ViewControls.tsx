import { useStore, type View } from '../state/store';

const VIEWS: { id: View; label: string }[] = [
  { id: '3d', label: '3D' },
  { id: 'front', label: 'Front' },
  { id: 'top', label: 'Top' },
  { id: 'side', label: 'Side' },
];

/** Camera views, open/close and explode — shared by the editor and the read-only viewer. */
export function ViewControls() {
  const view = useStore((s) => s.view);
  const openIds = useStore((s) => s.openIds);
  const exploded = useStore((s) => s.exploded);
  const explodeAmount = useStore((s) => s.explodeAmount);
  const setUi = useStore((s) => s.setUi);
  const setOpenAll = useStore((s) => s.setOpenAll);

  return (
    <>
      {VIEWS.map((v) => (
        <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => setUi({ view: v.id })}>{v.label}</button>
      ))}
      <div className="sep" />
      <button onClick={() => setOpenAll(openIds.length === 0)} title="Double-click a unit to open just that one">
        {openIds.length ? 'Close all' : 'Open all'}
      </button>
      <button className={exploded ? 'active' : ''} onClick={() => setUi({ exploded: !exploded })}>Explode</button>
      {exploded && (
        <input
          type="range" min={0.1} max={1} step={0.05} value={explodeAmount} style={{ width: 80 }}
          title="Explode amount"
          onChange={(e) => setUi({ explodeAmount: Number(e.target.value) })}
        />
      )}
    </>
  );
}
