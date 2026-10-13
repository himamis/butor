import { z } from 'zod';
import { CATEGORIES, catalog } from '../../src/catalog';
import { describeParams, PublicOp, type AnyTemplate, type ParamDescription } from '../../src/core';

export const TOOL_NAME = 'apply_operations';

export interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, unknown>; // JSON Schema of the input
}

/** Tool input: a list of operations, validated again with zod on the server (input may be partial). */
export const ToolInput = z.object({ operations: z.array(z.unknown()).min(1).max(200) });

function paramLine(d: ParamDescription): string {
  switch (d.kind) {
    case 'mm':
      return `${d.key} (${d.label}): ${d.min}–${d.max} mm, default ${d.default}`;
    case 'count':
      return `${d.key} (${d.label}): ${d.min}–${d.max}, default ${d.default}`;
    case 'choice':
      return `${d.key} (${d.label}): one of ${Object.entries(d.options)
        .map(([k, v]) => `"${k}" (${v})`)
        .join(', ')}; default "${d.default}"`;
    case 'toggle':
      return `${d.key} (${d.label}): true/false, default ${d.default}`;
    case 'color':
      return `${d.key} (${d.label}): #rrggbb, default ${d.default}`;
  }
}

function templateBlock(t: AnyTemplate): string {
  const extra =
    t.kind === 'unit'
      ? ` Size limits w ${t.sizeLimits.w.join('–')}, h ${t.sizeLimits.h.join('–')}, d ${t.sizeLimits.d.join('–')} mm; default ${t.defaultSize.w}×${t.defaultSize.h}×${t.defaultSize.d}.`
      : t.kind === 'front'
        ? ` Mount: ${t.mount}; minimum ${t.minSize.w}×${t.minSize.h} mm.${t.attachesToItem ? " Attaches to one item that can take a front: give that item's id as `item`." : ''}`
        : t.kind === 'item' && t.takesFront
          ? ' Can take a front on the unit face that moves with it, depending on its parameters.'
          : '';
  const params = describeParams(t.params).map((d) => `    - ${paramLine(d)}`);
  return [`- ${t.id} (${t.kind}, ${t.category}): ${t.name}. ${t.description}${extra}`, ...params].join('\n');
}

/** The system prompt, generated from the catalog so new templates reach the assistant automatically. Deterministic. */
export function systemPrompt(): string {
  const templates = [...catalog.all()].sort((a, b) => a.id.localeCompare(b.id));
  return [
    'You are the design assistant inside Butor, a wardrobe and cabinet designer. You change the design only by calling',
    `the ${TOOL_NAME} tool with operations; the app validates and applies them and returns a result for each one.`,
    '',
    'Coordinates: millimetres. x runs left→right, z runs from the back wall (z = 0 for the default room) into the room,',
    'y is up. An entity position is the bottom centre of its footprint. rotation is degrees about +y; at rotation 0 a',
    "unit's front faces +z (into the room from the back wall); 90 faces +x; 180 faces −z; −90 faces −x.",
    'A unit stands against a wall when its back face touches it: for the back wall z = 0 at rotation 0, position.z = depth / 2.',
    '',
    'Units have columns (left → right, width in mm or "auto" sharing the rest), items in a column at a height y',
    '(mm above the column floor, bottom of the item), and fronts that cover a column range [first, last] (0-based, inclusive)',
    "and a height range [bottom, top] measured from the unit's bottom edge. Some fronts attach to an item (see the templates) and name it in `item`.",
    '',
    'Rules:',
    '- The current design is attached to every user message as JSON. Use its ids; never invent ids of existing things.',
    '- Send all operations for a request in as few tool calls as possible. Results list created ids — use them in later calls.',
    '- If an operation fails, read the message, fix the operation and try again, or explain why it cannot be done.',
    '- Values outside a parameter range are clamped; results mention it. Locked entities cannot be changed.',
    '- Keep the user’s existing design unless asked to change it. Avoid overlaps; keep units inside the room and below the ceiling.',
    '- When you are done, reply in one or two short sentences saying what you changed (no JSON, no operation names).',
    '',
    `Categories: ${CATEGORIES.map((c) => c.id).join(', ')}.`,
    '',
    'Templates (id, kind, category: name. description; then parameters with limits):',
    ...templates.map(templateBlock),
  ].join('\n');
}

let cached: ToolDef | null = null;

/** The one tool. Its operation schema is generated from the operations layer (docs/v2/05). */
export function toolDef(): ToolDef {
  if (cached) return cached;
  const op = z.toJSONSchema(PublicOp, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete op.$schema;
  cached = {
    name: TOOL_NAME,
    description:
      'Apply operations to the design, in order. Each result says whether it applied, what it created (ids) and any clamping. ' +
      'Template parameters are listed in the system prompt.',
    schema: {
      type: 'object',
      properties: { operations: { type: 'array', minItems: 1, maxItems: 200, items: op } },
      required: ['operations'],
      additionalProperties: false,
    },
  };
  return cached;
}
