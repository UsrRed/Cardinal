export function buildClaudeArgs(model: string, mcpConfigPath: string): string[] {
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    model,
    '--strict-mcp-config',
    '--mcp-config',
    mcpConfigPath,
    '--tools',
    '',
    '--disallowedTools',
    '*',
  ];
}
