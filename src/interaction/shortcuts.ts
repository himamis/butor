/** One shortcut table (docs/v2/06-interaction.md#keyboard). The `?` sheet is generated from it. */
export type ShortcutScope = 'editor' | 'viewer' | 'any';

export interface Shortcut {
  action: string;
  key: string; // KeyboardEvent.key, case-insensitive for letters
  mod?: boolean; // Ctrl or Cmd
  shift?: boolean;
  scope: ShortcutScope;
  label: string;
  display: string; // how the sheet shows it
}

export const SHORTCUTS: Shortcut[] = [
  { action: 'undo', key: 'z', mod: true, scope: 'editor', label: 'Undo', display: 'Ctrl/⌘ Z' },
  { action: 'redo', key: 'z', mod: true, shift: true, scope: 'editor', label: 'Redo', display: 'Ctrl/⌘ ⇧ Z' },
  { action: 'redo', key: 'y', mod: true, scope: 'editor', label: 'Redo', display: 'Ctrl/⌘ Y' },
  { action: 'copy', key: 'c', mod: true, scope: 'editor', label: 'Copy', display: 'Ctrl/⌘ C' },
  {
    action: 'paste',
    key: 'v',
    mod: true,
    scope: 'editor',
    label: 'Paste (copies line up beside the original)',
    display: 'Ctrl/⌘ V',
  },
  { action: 'duplicate', key: 'd', mod: true, scope: 'editor', label: 'Duplicate', display: 'Ctrl/⌘ D' },
  { action: 'group', key: 'g', mod: true, scope: 'editor', label: 'Group', display: 'Ctrl/⌘ G' },
  { action: 'ungroup', key: 'g', mod: true, shift: true, scope: 'editor', label: 'Ungroup', display: 'Ctrl/⌘ ⇧ G' },
  { action: 'select-all', key: 'a', mod: true, scope: 'editor', label: 'Select everything', display: 'Ctrl/⌘ A' },
  { action: 'delete', key: 'Delete', scope: 'editor', label: 'Delete the selection', display: 'Delete' },
  { action: 'delete', key: 'Backspace', scope: 'editor', label: 'Delete the selection', display: '⌫' },
  { action: 'rotate-cw', key: 'r', scope: 'editor', label: 'Rotate 90° clockwise', display: 'R' },
  {
    action: 'rotate-ccw',
    key: 'r',
    shift: true,
    scope: 'editor',
    label: 'Rotate 90° counter-clockwise',
    display: '⇧ R',
  },
  { action: 'room-edit', key: 'g', scope: 'editor', label: 'Room edit tool', display: 'G' },
  {
    action: 'open',
    key: 'o',
    scope: 'any',
    label: 'Open or close the selection (all when nothing is selected)',
    display: 'O',
  },
  { action: 'explode', key: 'e', scope: 'any', label: 'Exploded view', display: 'E' },
  { action: 'measure', key: 'm', scope: 'any', label: 'Measure tool', display: 'M' },
  { action: 'view-3d', key: '1', scope: 'any', label: '3D view', display: '1' },
  { action: 'view-front', key: '2', scope: 'any', label: 'Front view', display: '2' },
  { action: 'view-top', key: '3', scope: 'any', label: 'Top view', display: '3' },
  { action: 'view-side', key: '4', scope: 'any', label: 'Side view', display: '4' },
  { action: 'view-elevation', key: '5', scope: 'any', label: 'Wall elevation view', display: '5' },
  { action: 'frame', key: 'f', scope: 'any', label: 'Frame the selection', display: 'F' },
  { action: 'search', key: '/', scope: 'editor', label: 'Search the library', display: '/' },
  { action: 'escape', key: 'Escape', scope: 'any', label: 'Cancel, deselect or leave the tool', display: 'Esc' },
  { action: 'help', key: '?', shift: true, scope: 'any', label: 'Show these shortcuts', display: '?' },
];

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: unknown;
}

function typing(target: unknown): boolean {
  const t = target as { tagName?: string; isContentEditable?: boolean } | null;
  return !!t && (t.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(String(t.tagName)));
}

/** The action for a key event in a scope, or null. Keys typed into text fields are never shortcuts. */
export function matchShortcut(e: KeyLike, scope: 'editor' | 'viewer'): string | null {
  if (typing(e.target)) return null;
  const mod = e.ctrlKey || e.metaKey;
  for (const s of SHORTCUTS) {
    if (s.scope !== 'any' && s.scope !== scope) continue;
    const keyMatch = s.key.length === 1 ? s.key.toLowerCase() === e.key.toLowerCase() : s.key === e.key;
    // '?' is typed with shift; letters compare shift explicitly
    const shiftMatch = s.key === '?' ? true : !!s.shift === e.shiftKey;
    if (keyMatch && !!s.mod === mod && shiftMatch) return s.action;
  }
  return null;
}
