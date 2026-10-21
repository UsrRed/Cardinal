import type { NvdSeverity } from '../shared/types.js';
import type { RawItem } from './types.js';

export function parseNvdPage(
  _json: unknown,
  _minSeverity?: NvdSeverity,
): { items: RawItem[]; totalResults: number; startIndex: number; resultsPerPage: number } {
  throw new Error('not implemented');
}

export function nvdWindows(_now: number, _freshnessDays: number): Array<{ start: string; end: string }> {
  throw new Error('not implemented');
}
