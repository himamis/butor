import { create } from 'zustand';
import type { PlaceEntry } from '../interaction/tools/place';

/** Transient UI state that is not part of the design. */
interface UiState {
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
  status: string | null;
  dragEntry: PlaceEntry | null; // what is being dragged from the library
  help: boolean;
  set(patch: Partial<Omit<UiState, 'set'>>): void;
}

export const useUi = create<UiState>()((set) => ({
  marquee: null,
  status: null,
  dragEntry: null,
  help: false,
  set: (patch) => set(patch),
}));
