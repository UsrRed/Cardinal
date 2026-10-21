import type { Usage } from '../shared/types.js';

export function parseStreamJson(_stdout: string): {
  text: string | null;
  usage: Usage;
  isError: boolean;
  errorText: string | null;
} {
  throw new Error('not implemented');
}
