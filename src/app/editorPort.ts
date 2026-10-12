import { buildScene, type Design, type SceneModel } from '../core';
import { catalog } from '../catalog';
import type { EditorPort } from '../interaction/types';
import { useApp } from './store';
import { useUi } from './ui';

/** Scene of the committed design while a preview is showing (built once per committed design). */
let committed: { doc: Design; scene: SceneModel } | null = null;
function committedScene(d: Design): SceneModel {
  if (committed?.doc !== d) committed = { doc: d, scene: buildScene(d, catalog) };
  return committed.scene;
}

/** The store, seen through the interface tools use (tools never import the app). */
export const editorPort: EditorPort = {
  catalog,
  design: () => useApp.getState().design,
  scene: () => useApp.getState().scene,
  committedScene: () => {
    const s = useApp.getState();
    return s.previewDoc ? committedScene(s.design) : s.scene;
  },
  selection: () => useApp.getState().selection,
  select: (ids, mode) => useApp.getState().select(ids, mode),
  selectInner: (inner) => useApp.getState().selectInner(inner),
  setHover: (id) => useApp.getState().setHover(id),
  toggleOpen: (id) => useApp.getState().toggleOpen(id),
  apply: (ops, label) => useApp.getState().apply(ops, label),
  preview: (ops, label) => useApp.getState().preview(ops, label),
  commitPreview: () => useApp.getState().commitPreview(),
  cancelPreview: () => useApp.getState().cancelPreview(),
  grid: () => useApp.getState().grid,
  snapping: () => useApp.getState().snapping,
  setMarquee: (rect) => useUi.getState().set({ marquee: rect }),
  setStatus: (text) => useUi.getState().set({ status: text }),
  addMeasurement: (m) => {
    const v = useApp.getState().view;
    useApp.getState().setView({ measurements: [...v.measurements, m] });
  },
  previewMeasurement: (m) => useUi.getState().set({ measurePreview: m }),
};
