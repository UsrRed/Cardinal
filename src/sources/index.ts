import type { SourceType } from '../shared/types.js';
import { rssConnector } from './rss.js';
import type { AnyConnector } from './types.js';

export function getConnector(t: SourceType): AnyConnector {
  if (t === 'rss') return rssConnector as AnyConnector;
  throw new Error('not implemented');
}
