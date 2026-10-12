import type { Design, MaterialLibrary } from '../core';
import { GLASS } from './fronts';

/** The materials every new design starts with. Prices are illustrative defaults the user can change. */
export const DEFAULT_MATERIALS: MaterialLibrary = {
  white: {
    kind: 'board',
    name: 'White melamine',
    thicknesses: [8, 16, 18, 25],
    appearance: { color: '#f2f1ec', texture: 'plain', roughness: 0.75 },
    grain: 'none',
    price: { perM2: 22, currency: 'EUR' },
    edgeBanding: { name: 'White ABS 1 mm', perM: 0.8 },
  },
  oak: {
    kind: 'board',
    name: 'Oak veneer',
    thicknesses: [18, 25],
    appearance: { color: '#c8a06a', texture: 'woodgrain', roughness: 0.6 },
    grain: 'length',
    price: { perM2: 68, currency: 'EUR' },
    edgeBanding: { name: 'Oak veneer edge', perM: 2.4 },
  },
  walnut: {
    kind: 'board',
    name: 'Walnut veneer',
    thicknesses: [18, 25],
    appearance: { color: '#6b4a2f', texture: 'woodgrain', roughness: 0.55 },
    grain: 'length',
    price: { perM2: 95, currency: 'EUR' },
    edgeBanding: { name: 'Walnut veneer edge', perM: 3.2 },
  },
  anthracite: {
    kind: 'board',
    name: 'Anthracite matt',
    thicknesses: [16, 18, 25],
    appearance: { color: '#3a3d40', texture: 'plain', roughness: 0.8 },
    grain: 'none',
    price: { perM2: 34, currency: 'EUR' },
    edgeBanding: { name: 'Anthracite ABS 1 mm', perM: 1 },
  },
  sand: {
    kind: 'board',
    name: 'Sand matt',
    thicknesses: [16, 18, 25],
    appearance: { color: '#d9cbb0', texture: 'plain', roughness: 0.8 },
    grain: 'none',
    price: { perM2: 34, currency: 'EUR' },
    edgeBanding: { name: 'Sand ABS 1 mm', perM: 1 },
  },
  hardboard: {
    kind: 'board',
    name: 'White hardboard',
    thicknesses: [3, 8],
    appearance: { color: '#ebe9e3', texture: 'plain', roughness: 0.85 },
    grain: 'none',
    price: { perM2: 9, currency: 'EUR' },
  },
  chrome: { kind: 'finish', name: 'Chrome', appearance: { color: '#c3c7cc', metalness: 0.9, roughness: 0.2 } },
  black: { kind: 'finish', name: 'Matt black', appearance: { color: '#202124', metalness: 0.5, roughness: 0.5 } },
  brass: { kind: 'finish', name: 'Brushed brass', appearance: { color: '#b08d57', metalness: 0.85, roughness: 0.35 } },
  [GLASS]: { kind: 'finish', name: 'Clear glass', appearance: { color: '#cfe3e6', metalness: 0, roughness: 0.05 } },
};

export const DEFAULT_ROLES: Design['defaults'] = {
  carcass: 'white',
  front: 'white',
  back: 'hardboard',
  interior: 'white',
  handle: 'chrome',
};
