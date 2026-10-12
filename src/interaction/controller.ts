import type { Tool, ToolPointer, ViewPort } from './types';

const CLICK_SLOP = 4; // px of movement before a press becomes a drag

interface Press {
  x: number;
  y: number;
  pointerId: number;
  captured: boolean;
  dragging: boolean;
}

/**
 * Owns all pointer input on the canvas and routes it to the active tool (docs/v2/06-interaction.md#input-controller).
 * Listens in the capture phase on the container so it can lock the camera before the orbit controls see a press.
 */
export class InputController {
  private press: Press | null = null;
  private hoverFrame = 0;
  private lastHover: PointerEvent | null = null;
  private readonly listeners: [EventTarget, string, EventListener, AddEventListenerOptions | boolean][] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly view: ViewPort,
    private tool: Tool,
  ) {
    this.on(container, 'pointerdown', (e) => this.down(e as PointerEvent), true);
    this.on(container, 'pointermove', (e) => this.move(e as PointerEvent), true);
    this.on(container, 'pointerup', (e) => this.up(e as PointerEvent, false), true);
    this.on(container, 'pointercancel', (e) => this.up(e as PointerEvent, true), true);
    this.on(container, 'dblclick', (e) => this.tool.doubleClick?.(this.pointer(e as MouseEvent)), true);
    this.on(window, 'keydown', (e) => this.key(e as KeyboardEvent), true); // before the app's shortcuts
  }

  setTool(tool: Tool) {
    this.cancelDrag();
    this.tool = tool;
  }

  get activeTool(): Tool {
    return this.tool;
  }

  get dragging(): boolean {
    return !!this.press?.dragging;
  }

  dispose() {
    cancelAnimationFrame(this.hoverFrame);
    for (const [t, type, fn, opt] of this.listeners) t.removeEventListener(type, fn, opt);
  }

  /** Cancels a drag in progress (Esc, tool switch). */
  cancelDrag() {
    const p = this.press;
    if (!p) return;
    this.press = null;
    if (p.dragging) this.tool.dragEnd?.(null, true);
    this.release(p);
  }

  private on(t: EventTarget, type: string, fn: EventListener, capture: boolean) {
    const opt = { capture };
    t.addEventListener(type, fn, opt);
    this.listeners.push([t, type, fn, opt]);
  }

  private pointer(e: MouseEvent, withHit = true): ToolPointer {
    return {
      x: e.clientX,
      y: e.clientY,
      hit: withHit ? this.view.pick(e.clientX, e.clientY) : null,
      shift: e.shiftKey,
      alt: e.altKey,
      mod: e.ctrlKey || e.metaKey,
    };
  }

  private down(e: PointerEvent) {
    if (e.button !== 0 || this.press) return;
    const p = this.pointer(e);
    const captured = this.tool.down?.(p) ?? false;
    this.press = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, captured, dragging: false };
    if (captured) {
      this.view.setControlsEnabled(false); // before the orbit controls handle this press
      this.container.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }

  private move(e: PointerEvent) {
    const p = this.press;
    if (p && p.pointerId === e.pointerId) {
      if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_SLOP) {
        if (!p.captured) return; // the camera owns this drag
        p.dragging = true;
        this.tool.dragStart?.(this.pointer(e, false));
      }
      if (p.dragging) this.tool.drag?.(this.pointer(e, false));
      return;
    }
    // Hover, at most once per frame.
    this.lastHover = e;
    if (!this.hoverFrame) {
      this.hoverFrame = requestAnimationFrame(() => {
        this.hoverFrame = 0;
        const ev = this.lastHover;
        if (!ev) return;
        const tp = this.pointer(ev);
        this.tool.hover?.(tp);
        this.container.style.cursor = this.tool.cursor?.(tp) ?? 'default';
      });
    }
  }

  private up(e: PointerEvent, cancelled: boolean) {
    const p = this.press;
    if (!p || p.pointerId !== e.pointerId) return;
    this.press = null;
    if (p.dragging) this.tool.dragEnd?.(this.pointer(e, false), cancelled);
    else if (!cancelled && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= CLICK_SLOP)
      this.tool.click?.(this.pointer(e));
    this.release(p);
  }

  private release(p: Press) {
    if (p.captured) {
      if (this.container.hasPointerCapture(p.pointerId)) this.container.releasePointerCapture(p.pointerId);
      this.view.setControlsEnabled(true);
    }
  }

  private key(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.press?.dragging) {
      e.stopImmediatePropagation(); // Esc cancels the drag, it does not also deselect
      this.cancelDrag();
    }
  }
}
