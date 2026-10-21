import { SsrfError, type SafeFetch } from '../net/safeFetch.js';
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
const RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
const MAX_INDIVIDUAL = 5;
const BLOCKED_MSG = 'destination refusée par la politique réseau';

// Node rejects non-latin1 header chars; ntfy accepts RFC 2047 encoded words.
function headerValue(v: string): string {
  const clean = v.replace(/[\r\n]+/g, ' ');
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

export class NtfyNotifier {
  constructor(private readonly fetch: SafeFetch) {}

  async send(t: NtfyTarget, m: NtfyMessage): Promise<void> {
    if (!t.topic) return;
    const headers: Record<string, string> = {
      Title: headerValue(m.title),
      Priority: String(m.priority),
      'Content-Type': 'text/plain; charset=utf-8',
    };
    if (m.click) headers.Click = m.click;
    if (t.token) headers.Authorization = `Bearer ${t.token}`;
    const url = `${t.server.replace(/\/+$/, '')}/${encodeURIComponent(t.topic)}`;
    let res;
    try {
      res = await this.fetch(url, { method: 'POST', headers, body: m.body.slice(0, 300) });
    } catch (e) {
      if (e instanceof SsrfError && e.code === 'destination_blocked') throw new Error(BLOCKED_MSG);
      throw new Error("échec de l'envoi de la notification");
    }
    if (res.status < 200 || res.status >= 300) throw new Error("échec de l'envoi de la notification");
  }

  async sendTest(t: NtfyTarget): Promise<{ ok: true } | { ok: false; error: 'destination_blocked' | 'send_failed' | 'not_configured' }> {
    if (!t.topic) return { ok: false, error: 'not_configured' };
    try {
      await this.send(t, { title: '[Personnal Flux] Test', body: 'Notification de test.', priority: 3 });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message === BLOCKED_MSG ? 'destination_blocked' : 'send_failed' };
    }
  }

  async notifyRun(o: {
    target: NtfyTarget | null;
    feed: Feed;
    items: Item[];
    digestId: string;
    publicUrl: string | null;
  }): Promise<{ sent: number; failed: number }> {
    const { target, feed, digestId } = o;
    if (!target || !target.topic) return { sent: 0, failed: 0 };
    const eligible = o.items
      .filter((i) => RANK[i.priority] >= RANK[feed.notifyThreshold])
      .sort((a, b) => RANK[b.priority] - RANK[a.priority]);
    const click = o.publicUrl ? `${o.publicUrl.replace(/\/+$/, '')}/digests/${digestId}` : undefined;
    const msgs: NtfyMessage[] = eligible.slice(0, MAX_INDIVIDUAL).map((i) => ({
      title: `[Personnal Flux] ${feed.name} — ${i.title}`,
      body: (i.summary || i.justification).slice(0, 300),
      priority: PRIORITY_MAP[i.priority],
      click,
    }));
    const rest = eligible.length - MAX_INDIVIDUAL;
    if (rest > 0) {
      msgs.push({
        title: `[Personnal Flux] ${feed.name} — ${rest} autres éléments`,
        body: `${rest} autres éléments à consulter dans le digest.`,
        priority: 3,
        click,
      });
    }
    let sent = 0;
    let failed = 0;
    for (const m of msgs) {
      try {
        await this.send(target, m);
        sent++;
      } catch {
        failed++;
      }
    }
    return { sent, failed };
  }
}

export function resolveTarget(feed: Feed, settings: Settings, token: string | null): NtfyTarget | null {
  const topic = feed.ntfyTopic || settings.ntfyTopic;
  if (!topic) return null;
  return { server: feed.ntfyServer || settings.ntfyServer, topic, token };
}
