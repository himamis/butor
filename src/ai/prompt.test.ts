import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT, designMessage, templateCatalog } from './prompt';
import { TEMPLATES } from '../templates';
import { defaultDesign } from '../state/defaults';
import { obj } from '../test/fixtures';

describe('prompt', () => {
  it('the catalog lists every template with its params, ranges and options', () => {
    const cat = templateCatalog();
    for (const t of TEMPLATES) {
      expect(cat).toContain(`"${t.id}"`);
      for (const p of t.params) expect(cat).toContain(p.key);
    }
    expect(cat).toMatch(/hinge.*0=Left.*1=Right/);
    expect(cat).toMatch(/width.*800.*100–2400/);
  });

  it('the system prompt includes the catalog and the coordinate conventions', () => {
    expect(SYSTEM_PROMPT).toContain(templateCatalog());
    expect(SYSTEM_PROMPT).toMatch(/millimet/i);
    expect(SYSTEM_PROMPT).toMatch(/bottom-center/);
  });

  it('the design message gives ids, params and world bounds of every object', () => {
    const d = { ...defaultDesign(), objects: [obj('carcass', { id: 'abc', position: { x: 1000, y: 0, z: 300 } })] };
    const msg = designMessage(d);
    const json = JSON.parse(msg.slice(msg.indexOf('{')));
    expect(json.objects[0]).toMatchObject({ id: 'abc', templateId: 'carcass', bounds: { min: { x: 600, y: 0, z: 10 }, max: { x: 1400, y: 2200, z: 590 } } });
    expect(json.room.points).toHaveLength(4);
  });
});
