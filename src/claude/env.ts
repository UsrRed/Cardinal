export function buildClaudeEnv(o: { home: string; apiKey: string | null; lang?: string }): Record<string, string> {
  const env: Record<string, string> = {
    HOME: o.home,
    PATH: '/usr/local/bin:/usr/bin:/bin',
    LANG: o.lang ?? 'C.UTF-8',
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  };
  if (o.apiKey) env.ANTHROPIC_API_KEY = o.apiKey;
  return env;
}
