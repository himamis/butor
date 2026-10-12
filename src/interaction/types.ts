import type { ApplyResult, CatalogRegistry, Design, Op, SceneModel, Vec3 } from '../core';
import type { Hit } from '../render/Renderer';
import type { GuideSpec, HandleSpec } from '../render/overlays';
import type { OBB } from '../core';

/** What tools can do to the canvas (implemented by the renderer). */
export interface ViewPort {
  pick(clientX: number, clientY: number): Hit | null;
  ray(clientX: number, clientY: number): { origin: Vec3; dir: Vec3 };
  toScreen(p: Vec3): { x: number; y: number };
  setControlsEnabled(on: boolean): void;
  setHandles(handles: HandleSpec[], ring: { center: Vec3; radius: number } | null): void;
  setGuides(lines: GuideSpec[]): void;
  setTarget(box: OBB | null): void;
}

export interface Inner {
  entity: string;
  kind: 'column' | 'item' | 'front';
  id: string;
}

/** What tools can do to the design (implemented by the app store). Tools never import the app. */
export interface EditorPort {
  catalog: CatalogRegistry;
  design(): Design; // committed
  scene(): SceneModel; // visible (preview during a drag)
  committedScene(): SceneModel;
  selection(): { entities: string[]; inner: Inner | null };
  select(ids: string[], mode?: 'replace' | 'add' | 'toggle'): void;
  selectInner(inner: Inner | null): void;
  setHover(id: string | null): void;
  toggleOpen(id: string): void;
  apply(ops: Op[], label: string): ApplyResult; // one undo step
  preview(ops: Op[], label: string): ApplyResult;
  commitPreview(): void;
  cancelPreview(): void;
  grid(): number;
  snapping(): boolean;
  setMarquee(rect: { x0: number; y0: number; x1: number; y1: number } | null): void;
  setStatus(text: string | null): void; // short hint near the cursor / status bar
}

export interface ToolPointer {
  x: number; // client px
  y: number;
  hit: Hit | null;
  shift: boolean;
  alt: boolean; // snapping off while held
  mod: boolean;
}

export interface Tool {
  id: string;
  /** Pointer pressed. Return true to capture the gesture (the camera stays still). */
  down?(e: ToolPointer): boolean;
  dragStart?(e: ToolPointer): void;
  drag?(e: ToolPointer): void;
  dragEnd?(e: ToolPointer | null, cancelled: boolean): void;
  click?(e: ToolPointer): void;
  doubleClick?(e: ToolPointer): void;
  hover?(e: ToolPointer): void;
  cursor?(e: ToolPointer): string;
}
