import type { Design, Room } from '../types';

export const ROOM_PRESETS: Record<'rectangle' | 'l-shape' | 'cut-corner', Room['points']> = {
  rectangle: [
    { x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 4000, z: 3500 }, { x: 0, z: 3500 },
  ],
  'l-shape': [
    { x: 0, z: 0 }, { x: 5000, z: 0 }, { x: 5000, z: 2000 },
    { x: 2500, z: 2000 }, { x: 2500, z: 4000 }, { x: 0, z: 4000 },
  ],
  'cut-corner': [
    { x: 0, z: 0 }, { x: 3000, z: 0 }, { x: 4000, z: 1000 }, { x: 4000, z: 3500 }, { x: 0, z: 3500 },
  ],
};

export const DEFAULT_ROOM: Room = {
  points: ROOM_PRESETS.rectangle,
  height: 2600,
  wallThickness: 100,
  floorKind: 'wood',
  floorColor: '#b8895a',
  wallColor: '#eceae4',
};

export const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'White', hex: '#f4f3ef' },
  { name: 'Oak', hex: '#c8a06a' },
  { name: 'Walnut', hex: '#6b4a2f' },
  { name: 'Anthracite', hex: '#3a3d40' },
  { name: 'Sand', hex: '#d9cbb0' },
];

export const DEFAULT_COLOR = COLOR_PRESETS[0].hex;

export const defaultDesign = (): Design => ({ version: 1, room: DEFAULT_ROOM, objects: [] });
