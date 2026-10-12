import type { EditorPort, Tool, ToolPointer } from '../types';

/** The share-link viewer's tool: the camera owns every drag; double-click opens and closes a unit. */
export class ViewTool implements Tool {
  readonly id = 'view';

  constructor(private readonly editor: EditorPort) {}

  down() {
    return false;
  }

  doubleClick(e: ToolPointer) {
    if (e.hit?.kind === 'part' && e.hit.entityId) this.editor.toggleOpen(e.hit.entityId);
  }

  hover(e: ToolPointer) {
    this.editor.setHover(e.hit?.kind === 'part' ? (e.hit.entityId ?? null) : null);
  }

  cursor(e: ToolPointer) {
    return e.hit?.kind === 'part' ? 'pointer' : 'default';
  }
}
