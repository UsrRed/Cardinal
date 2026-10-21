import type { SafeFetch } from '../net/safeFetch.js';
import type { Feed, Item, Priority, Settings } from '../shared/types.js';

export interface NtfyTarget {
  server: string;
  topic: string;
  token: string | null;
}
export interface NtfyMessage {
  title: string;
  body: string;
  priority: 1 | 2 | 3 | 4 | 5;
  click?: string;
}

export const PRIORITY_MAP: Record<Priority, 2 | 3 | 4> = { high: 4, medium: 3, low: 2 };

export class NtfyNotifier {
  constructor(_fetch: SafeFetch) {}
  send(_t: NtfyTarget, _m: NtfyMessage): Promise<void> {
    throw new Error('not implemented');
  }
  sendTest(_t: NtfyTarget): Promise<{ ok: true } | { ok: false; error: 'destination_blocked' | 'send_failed' | 'not_configured' }> {
    throw new Error('not implemented');
  }
  notifyRun(_o: {
    target: NtfyTarget | null;
    feed: Feed;
    items: Item[];
    digestId: string;
    publicUrl: string | null;
  }): Promise<{ sent: number; failed: number }> {
    throw new Error('not implemented');
  }
}

export function resolveTarget(_feed: Feed, _settings: Settings, _token: string | null): NtfyTarget | null {
  throw new Error('not implemented');
}
