import type { Design, Op } from '../core';
import type { AiSettings } from './settings';

export interface AiFinal {
  transaction: { label: string; ops: Op[]; ids: string[] };
  changes: string[];
  reply: string;
  history: unknown[];
  baseRevision: number;
  stopped?: 'refusal' | 'limit';
}

export type AiEvent =
  | { type: 'text'; delta: string }
  | { type: 'progress'; text: string }
  | { type: 'final'; result: AiFinal }
  | { type: 'error'; message: string };

/** One assistant turn: POST /api/ai/turn and read the server-sent events (fetch streaming works on plain http too). */
export async function runAiTurn(
  s: AiSettings,
  body: { message: string; design: Design; history: unknown[] },
  onEvent: (e: AiEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/ai/turn', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...(s.accessToken ? { 'x-butor-ai-token': s.accessToken } : {}) },
    body: JSON.stringify({
      provider: s.provider,
      ...(s.model.trim() ? { model: s.model.trim() } : {}),
      ...(s.baseUrl.trim() ? { baseUrl: s.baseUrl.trim() } : {}),
      ...(s.apiKey.trim() ? { apiKey: s.apiKey.trim() } : {}),
      ...(s.provider === 'anthropic' ? { effort: s.effort } : {}),
      ...body,
    }),
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    onEvent({ type: 'error', message: j?.error ?? `The assistant is unavailable (${res.status}).` });
    return;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let finished = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let end: number;
    while ((end = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, end);
      buf = buf.slice(end + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (!event || !data) continue;
      const json = JSON.parse(data) as Record<string, unknown>;
      if (event === 'text') onEvent({ type: 'text', delta: String(json.delta ?? '') });
      else if (event === 'progress') onEvent({ type: 'progress', text: String(json.text ?? '') });
      else if (event === 'final') {
        finished = true;
        onEvent({ type: 'final', result: json as unknown as AiFinal });
      } else if (event === 'error') {
        finished = true;
        onEvent({ type: 'error', message: String(json.message ?? 'The assistant failed.') });
      }
    }
  }
  if (!finished && !signal.aborted) onEvent({ type: 'error', message: 'The connection to the assistant was lost.' });
}
