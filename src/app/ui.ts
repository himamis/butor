import { create } from 'zustand';
import type { PlaceEntry } from '../interaction/tools/place';
import type { Vec3 } from '../core';
import type { ViewMode } from '../render/Renderer';
import { useApp } from './store';

export type ToolId = 'select' | 'room' | 'measure';

/** Transient UI state that is not part of the design. */
interface UiState {
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
  status: string | null;
  dragEntry: PlaceEntry | null; // what is being dragged from the library
  help: boolean;
  tool: ToolId;
  saveError: string | null; // the last autosave failed (retrying)
  notice: string | null; // a message shown above the editor (e.g. import warnings)
  measurePreview: { a: Vec3; b: Vec3; distance: number } | null;
  viewBeforeRoom: ViewMode | null; // the view to go back to when leaving room edit
  set(patch: Partial<Omit<UiState, 'set'>>): void;
}

export const useUi = create<UiState>()((set) => ({
  marquee: null,
  status: null,
  dragEntry: null,
  help: false,
  tool: 'select',
  saveError: null,
  notice: null,
  measurePreview: null,
  viewBeforeRoom: null,
  set: (patch) => set(patch),
}));

/** Switches the tool. Room edit is top-down: it switches to the top view and back again when it ends. */
export function setTool(tool: ToolId) {
  const ui = useUi.getState();
  if (ui.tool === tool) return;
  const app = useApp.getState();
  if (tool === 'room') {
    app.select([]);
    useUi.setState({ tool, viewBeforeRoom: app.view.mode, status: null });
    app.setView({ mode: 'top', exploded: false });
  } else {
    useUi.setState({ tool, viewBeforeRoom: null, status: null, measurePreview: null });
    if (ui.viewBeforeRoom && app.view.mode === 'top') app.setView({ mode: ui.viewBeforeRoom });
  }
}
