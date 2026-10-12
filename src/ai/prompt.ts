import type { Design } from '../types';
import { TEMPLATES } from '../templates';
import { objectBox } from '../lib/geometry';

/** Human-readable catalog of every template, generated from the template definitions. */
export function templateCatalog(): string {
  return TEMPLATES.map((t) => {
    const params = t.params.map((p) =>
      p.options
        ? `  - ${p.key} (${p.label}): ${p.options.map((o) => `${o.value}=${o.label}`).join(', ')}; default ${p.default}`
        : `  - ${p.key} (${p.label}): default ${p.default}, range ${p.min}–${p.max} mm`,
    );
    return [`- "${t.id}" — ${t.name} [${t.category}]`, ...params].join('\n');
  }).join('\n');
}

export const SYSTEM_PROMPT = `You are the design assistant inside a wardrobe designer app. The user describes changes to a furniture design in a room; you make them by calling the apply_operations tool, then briefly tell the user what you changed.

Coordinates and units
- All sizes and positions are in millimeters. The floor is the x/z plane, y points up (y = 0 is the floor).
- The room is a floor polygon (points in x/z) with a ceiling height. Its walls run along the polygon edges.
- An object's position is its bottom-center. Its width runs along x, its height along y, its depth along z.
- rotationY = 0 means the object's front faces +z. 90 → front faces +x, 180 → −z, 270 → −x.
- To stand a unit against the wall at z = 0 facing into the room: rotationY 0 and z = depth / 2.
- Units side by side touch when their x centers are (width A + width B) / 2 apart.
- A carcass has side panels of the given thickness; its inner width is width − 2 × thickness. Drawers that go inside a carcass should be about 2 mm narrower than that inner width, with their front flush with the carcass front (same front z), stacked from y = thickness upward.
- Doors and drawers are fronts with built-in handles (handle: 0=None, 1=Knob, 2=Bar, 3=Cutout grip).

Templates (use these ids and param keys only)
${templateCatalog()}

How to work
- Every user message comes with the current design as JSON, including each object's id and world bounds. Use those ids for update, delete, group and ungroup.
- Put all the changes for a request into as few apply_operations calls as possible. The tool result reports what was applied, any clamped values, and errors — fix errors with another call.
- Avoid overlapping objects unless the user asks for it. Keep objects inside the room.
- If the request is ambiguous, make a sensible choice and mention it. Only ask a question when you cannot make any reasonable change.
- Reply in one to three short sentences. Do not repeat the JSON.`;

/** The current design as the model sees it: compact JSON with world bounds per object. */
export function designMessage(d: Design): string {
  const objects = d.objects.map((o) => {
    const b = objectBox(o);
    const r = (v: number) => Math.round(v);
    return {
      id: o.id,
      templateId: o.templateId,
      name: o.name,
      params: o.params,
      position: o.position,
      rotationY: o.rotationY,
      color: o.color,
      ...(o.doorColor ? { doorColor: o.doorColor } : {}),
      ...(o.groupId ? { groupId: o.groupId } : {}),
      ...(o.locked ? { locked: true } : {}),
      bounds: { min: { x: r(b.min.x), y: r(b.min.y), z: r(b.min.z) }, max: { x: r(b.max.x), y: r(b.max.y), z: r(b.max.z) } },
    };
  });
  return `Current design (mm):\n${JSON.stringify({ room: d.room, objects })}`;
}
