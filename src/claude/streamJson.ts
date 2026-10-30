export function parseStreamJson(stdout: string): {
  text: string | null;
  isError: boolean;
  errorText: string | null;
} {
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
    isError = ev.is_error === true || (typeof ev.subtype === 'string' && ev.subtype !== 'success');
    const r = typeof ev.result === 'string' ? ev.result : null;
    if (isError) errorText = r ?? String(ev.subtype ?? 'error');
    else text = r;
  }
  return { text, isError, errorText };
}
