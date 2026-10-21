import type { Usage } from '../shared/types.js';

export function parseStreamJson(stdout: string): {
  text: string | null;
  usage: Usage;
  isError: boolean;
  errorText: string | null;
} {
  const usage: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  let text: string | null = null;
  let isError = false;
  let errorText: string | null = null;
  for (const line of stdout.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(s);
    } catch {
      continue;
    }
    if (ev.type !== 'result') continue;
    const u = (ev.usage ?? {}) as Record<string, unknown>;
    usage.inputTokens = Number(u.input_tokens) || 0;
    usage.outputTokens = Number(u.output_tokens) || 0;
    usage.costUsd = Number(ev.total_cost_usd) || 0;
    isError = ev.is_error === true || (typeof ev.subtype === 'string' && ev.subtype !== 'success');
    const r = typeof ev.result === 'string' ? ev.result : null;
    if (isError) errorText = r ?? String(ev.subtype ?? 'error');
    else text = r;
  }
  return { text, usage, isError, errorText };
}
