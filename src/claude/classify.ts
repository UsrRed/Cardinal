import type { ClaudeErrorKind } from './types.js';

export function classifyError(o: { stdout: string; stderr: string; code: number | null }): ClaudeErrorKind {
  const t = `${o.stderr}\n${o.stdout}`.toLowerCase();
  if (/usage limit|limit reached|rate.?limit|quota|\b429\b/.test(t)) return 'usage_limit';
  if (/not logged in|invalid api key|\/login|authentication_error|unauthorized|\b401\b|oauth token/.test(t)) {
    return 'unauthenticated';
  }
  if (/overloaded|\b529\b|\b503\b/.test(t)) return 'overloaded';
  return 'unknown';
}
