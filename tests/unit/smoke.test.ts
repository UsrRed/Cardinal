import { describe, expect, it } from 'vitest';
import { resolveListenHost } from '../../src/config/index.js';
import { buildClaudeArgs } from '../../src/claude/args.js';

describe('scaffold', () => {
  it('resolves listen host', () => {
    expect(resolveListenHost(false, '0.0.0.0', false)).toBe('127.0.0.1');
    expect(resolveListenHost(true, undefined, false)).toBe('0.0.0.0');
  });
  it('builds claude args', () => {
    expect(buildClaudeArgs('sonnet', '/tmp/m.json')).toContain('--strict-mcp-config');
  });
});
