import type { SourceType } from '../shared/types.js';
import type { AnyConnector } from './types.js';

export function getConnector(_t: SourceType): AnyConnector {
  throw new Error('not implemented');
}
