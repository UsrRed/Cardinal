import type { SourceType } from '../shared/types.js';
import { nvdConnector } from './nvd.js';
import { osvConnector } from './osv.js';
import { rssConnector } from './rss.js';
import type { AnyConnector } from './types.js';

export function getConnector(t: SourceType): AnyConnector {
  if (t === 'rss') return rssConnector as AnyConnector;
  if (t === 'osv') return osvConnector as AnyConnector;
  return nvdConnector as AnyConnector;
}
