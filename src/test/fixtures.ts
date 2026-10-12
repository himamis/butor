import type { SceneObject } from '../types';
import { defaultParams, getTemplate } from '../templates';

let n = 0;
export function obj(templateId: string, patch: Partial<SceneObject> = {}, params: Record<string, number> = {}): SceneObject {
  return {
    id: `o${++n}`,
    templateId,
    name: templateId,
    params: { ...defaultParams(getTemplate(templateId)), ...params },
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    color: '#ffffff',
    ...patch,
  };
}
