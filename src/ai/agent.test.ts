import { describe, expect, it } from 'vitest';
import { runAgent, type ChatProvider, type StepResult } from './agent';
import { defaultDesign } from '../state/defaults';

/** A scripted model: returns the given steps in order and records what it was sent. */
function fakeProvider(steps: StepResult[]): ChatProvider & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  let i = 0;
  return {
    calls,
    userMessage: (text) => [{ role: 'user', text }],
    toolResults: (rs) => rs.map((r) => ({ role: 'tool', ...r })),
    async step(history) {
      calls.push([...history]);
      const s = steps[Math.min(i++, steps.length - 1)];
      return s;
    },
  };
}

const add = (id: string) => ({ id, input: { operations: [{ op: 'add', templateId: 'carcass', position: { x: 1000, y: 0, z: 290 } }] } });

describe('runAgent', () => {
  it('applies tool calls, feeds results back and returns the final reply', async () => {
    const p = fakeProvider([
      { assistant: { role: 'assistant', n: 1 }, text: '', toolCalls: [add('t1')], stop: 'tool_use' },
      { assistant: { role: 'assistant', n: 2 }, text: 'Added a carcass.', toolCalls: [], stop: 'end' },
    ]);
    const r = await runAgent({ provider: p, system: 'sys', history: [], message: 'add a unit', design: defaultDesign() });
    expect(r.design.objects).toHaveLength(1);
    expect(r.reply).toBe('Added a carcass.');
    expect(r.changes[0]).toMatch(/added Carcass/);
    // second call saw: user msg, assistant 1, tool result
    expect(p.calls[1]).toHaveLength(3);
    expect(p.calls[1][2]).toMatchObject({ role: 'tool', id: 't1', isError: false });
  });

  it('keeps history append-only: earlier entries are passed back unchanged', async () => {
    const prior = [{ role: 'user', text: 'old' }, { role: 'assistant', opaque: { thinking: 'sig' } }];
    const p = fakeProvider([{ assistant: { role: 'assistant' }, text: 'ok', toolCalls: [], stop: 'end' }]);
    const r = await runAgent({ provider: p, system: 's', history: prior, message: 'hi', design: defaultDesign() });
    expect(p.calls[0].slice(0, 2)).toEqual(prior);
    expect(r.history.slice(0, 2)).toEqual(prior);
    expect(r.history).toHaveLength(4);
  });

  it('sends the current design with the user message', async () => {
    const p = fakeProvider([{ assistant: {}, text: 'ok', toolCalls: [], stop: 'end' }]);
    await runAgent({ provider: p, system: 's', history: [], message: 'hi', design: defaultDesign() });
    expect((p.calls[0][0] as { text: string }).text).toMatch(/hi[\s\S]*Current design/);
  });

  it('reports invalid tool input as an error result and leaves the design alone', async () => {
    const p = fakeProvider([
      { assistant: {}, text: '', toolCalls: [{ id: 't1', input: { operations: [{ op: 'add', templateId: 'spaceship' }] } }], stop: 'tool_use' },
      { assistant: {}, text: 'Sorry.', toolCalls: [], stop: 'end' },
    ]);
    const r = await runAgent({ provider: p, system: 's', history: [], message: 'x', design: defaultDesign() });
    expect(r.design.objects).toHaveLength(0);
    expect(p.calls[1][2]).toMatchObject({ isError: true });
  });

  it('handles input that is not even an object', async () => {
    const p = fakeProvider([
      { assistant: {}, text: '', toolCalls: [{ id: 't1', input: 'not json' }], stop: 'tool_use' },
      { assistant: {}, text: 'ok', toolCalls: [], stop: 'end' },
    ]);
    const r = await runAgent({ provider: p, system: 's', history: [], message: 'x', design: defaultDesign() });
    expect(r.design).toEqual(defaultDesign());
    expect(p.calls[1][2]).toMatchObject({ isError: true });
  });

  it('stops after maxSteps and says so', async () => {
    const p = fakeProvider([{ assistant: {}, text: '', toolCalls: [add('t')], stop: 'tool_use' }]);
    const r = await runAgent({ provider: p, system: 's', history: [], message: 'x', design: defaultDesign(), maxSteps: 3 });
    expect(p.calls).toHaveLength(3);
    expect(r.reply).toMatch(/stopped after 3/);
  });

  it('explains a refusal', async () => {
    const p = fakeProvider([{ assistant: {}, text: '', toolCalls: [], stop: 'refusal' }]);
    const r = await runAgent({ provider: p, system: 's', history: [], message: 'x', design: defaultDesign() });
    expect(r.reply).toMatch(/declined/);
  });
});
