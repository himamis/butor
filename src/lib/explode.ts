import type { Vec3 } from '../types';

/** How far (mm) a part on the outer surface travels at full explode. */
export const EXPLODE_DIST = 300;
/** Fraction of an object's distance from the scene center added between objects at full explode. */
const OBJECT_SPREAD = 0.5;

const zero = (): Vec3 => ({ x: 0, y: 0, z: 0 });

/**
 * Offset (object-local mm) for a part whose center is `anchor`, pushing it away from the
 * object's center in proportion to how far out it sits. size = object width/height/depth.
 */
export function partExplodeOffset(anchor: Vec3, size: Vec3, amount: number): Vec3 {
  if (amount === 0) return zero();
  const k = EXPLODE_DIST * amount;
  return {
    x: (anchor.x / (size.x / 2)) * k,
    y: ((anchor.y - size.y / 2) / (size.y / 2)) * k,
    z: (anchor.z / (size.z / 2)) * k,
  };
}

/** Horizontal offset (mm) spreading whole objects away from the scene center. */
export function objectExplodeOffset(objCenter: Vec3, sceneCenter: Vec3, amount: number): Vec3 {
  if (amount === 0) return zero();
  return { x: (objCenter.x - sceneCenter.x) * OBJECT_SPREAD * amount, y: 0, z: (objCenter.z - sceneCenter.z) * OBJECT_SPREAD * amount };
}
