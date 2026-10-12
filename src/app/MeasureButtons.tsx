import { useApp } from './store';
import { setTool, useUi } from './ui';

/** Measure tool toggle, and clearing measurements (editor and viewer). */
export function MeasureButtons() {
  const tool = useUi((s) => s.tool);
  const count = useApp((s) => s.view.measurements.length);
  return (
    <>
      <button
        type="button"
        aria-pressed={tool === 'measure'}
        onClick={() => setTool(tool === 'measure' ? 'select' : 'measure')}
        title="Measure: click a surface, then a point (M)"
      >
        Measure
      </button>
      {count > 0 && (
        <button
          type="button"
          onClick={() => useApp.getState().setView({ measurements: [] })}
          title="Clear measurements"
        >
          Clear {count}
        </button>
      )}
    </>
  );
}
