import type { AppDeps } from '../deps.js';
import { parse, validFeedPatch } from '../http/routes/feeds.js';
import { feedInputSchema, type FeedInput } from '../shared/schemas.js';
import { AppError } from '../shared/errors.js';
import type { Feed, FeedSummary } from '../shared/types.js';
import { testFeedUrl } from '../sources/rss.js';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run(args: Record<string, unknown>): Promise<unknown>;
}

const id = { type: 'string', description: 'Identifiant du flux (voir list_feeds).' };

const sourceParams = {
  type: 'object',
  description:
    'Dépend de sourceType. rss: {"urls": ["https://…/feed.xml"]} (1–20 URL RSS/Atom). ' +
    'osv: {"packages": [{"name": "express", "ecosystem": "npm"}]} (1–50 ; écosystèmes PyPI, npm, Go, crates.io, Maven, NuGet, RubyGems, Packagist). ' +
    'nvd: {"keywords": ["openssl"], "minSeverity": "HIGH"} (1–20 mots-clés ; minSeverity LOW|MEDIUM|HIGH|CRITICAL, facultatif).',
};

const feedFields = {
  name: { type: 'string', description: 'Nom affiché (120 car. max).' },
  instructions: {
    type: 'string',
    description: 'Consignes données à Claude pour trier et résumer : ce qui compte, ce qui est du bruit (4000 car. max).',
  },
  sourceType: { type: 'string', enum: ['rss', 'osv', 'nvd'] },
  sourceParams,
  frequencyHours: { type: 'integer', minimum: 1, maximum: 720, description: 'Période entre deux runs, en heures.' },
  freshnessDays: { type: 'integer', minimum: 1, maximum: 90, description: 'Âge maximal des éléments retenus, en jours.' },
  enabled: { type: 'boolean', description: 'Planifié automatiquement (défaut true).' },
  notify: { type: 'boolean', description: 'Notification ntfy après un run (défaut false ; serveur et sujet des Réglages).' },
  notifyThreshold: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Priorité minimale notifiée (défaut high).' },
  model: { type: 'string', description: 'Modèle Claude (défaut : celui de l’instance, ex. sonnet).' },
};

/** Keeps list_feeds readable for a model: no timestamps it does not need. */
function summary(f: FeedSummary) {
  return {
    id: f.id, name: f.name, sourceType: f.sourceType, sourceParams: f.sourceParams, enabled: f.enabled,
    frequencyHours: f.frequencyHours, notify: f.notify, lastRunStatus: f.lastRunStatus, unreadCount: f.unreadCount, nextRunAt: f.nextRunAt,
  };
}

export function createMcpTools(deps: AppDeps): McpTool[] {
  const { feeds } = deps.repos;
  const now = () => deps.clock.now();
  const need = (feedId: unknown): Feed => {
    const f = typeof feedId === 'string' ? feeds.get(feedId) : null;
    if (!f) throw new AppError('not_found', 404);
    return f;
  };

  return [
    {
      name: 'list_feeds',
      description: 'Liste les flux de veille existants (id, source, état, dernier run). À appeler avant d’en créer un, pour éviter les doublons.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: async () => feeds.list().map(summary),
    },
    {
      name: 'get_feed',
      description: 'Détail complet d’un flux, instructions comprises.',
      inputSchema: { type: 'object', properties: { id }, required: ['id'] },
      annotations: { readOnlyHint: true },
      run: async (a) => need(a.id),
    },
    {
      name: 'test_feed_url',
      description: 'Télécharge une URL RSS/Atom depuis Cardinal et compte ses éléments, sans rien enregistrer. À faire avant create_feed pour chaque URL rss.',
      inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
      annotations: { readOnlyHint: true, openWorldHint: true },
      run: async (a) => {
        if (typeof a.url !== 'string') throw new AppError('validation_error', 400, { url: 'URL requise.' });
        return testFeedUrl(a.url, deps.fetch);
      },
    },
    {
      name: 'create_feed',
      description: 'Crée un flux de veille. Activé par défaut : il sera exécuté à chaque période.',
      inputSchema: {
        type: 'object',
        properties: feedFields,
        required: ['name', 'instructions', 'sourceType', 'sourceParams', 'frequencyHours', 'freshnessDays'],
      },
      run: async (a) => {
        const input = parse(feedInputSchema, {
          model: deps.config.defaultModel,
          ...a,
          // Per-feed ntfy targets stay a UI decision: the MCP side only uses the global settings.
          ntfyServer: null,
          ntfyTopic: null,
        });
        return feeds.create(input, now());
      },
    },
    {
      name: 'update_feed',
      description: 'Modifie un flux. Seuls les champs fournis changent ; sourceType et sourceParams vont ensemble.',
      inputSchema: { type: 'object', properties: { id, ...feedFields }, required: ['id'] },
      annotations: { idempotentHint: true },
      run: async (a) => {
        const { id: feedId, ...body } = a;
        const patch = validFeedPatch(need(feedId), body);
        delete (patch as Partial<FeedInput> & Record<string, unknown>).ntfyServer;
        delete (patch as Partial<FeedInput> & Record<string, unknown>).ntfyTopic;
        return feeds.update(feedId as string, patch, now());
      },
    },
    {
      name: 'set_feed_enabled',
      description: 'Active (reprend) ou met en pause un flux.',
      inputSchema: { type: 'object', properties: { id, enabled: { type: 'boolean' } }, required: ['id', 'enabled'] },
      annotations: { idempotentHint: true },
      run: async (a) => {
        need(a.id);
        if (typeof a.enabled !== 'boolean') throw new AppError('validation_error', 400, { enabled: 'Booléen requis.' });
        return feeds.setEnabled(a.id as string, a.enabled, now());
      },
    },
    {
      name: 'run_feed',
      description: 'Lance un run immédiat du flux (coûte un appel Claude). Le résultat arrive dans l’interface, pas dans la réponse.',
      inputSchema: { type: 'object', properties: { id }, required: ['id'] },
      annotations: { openWorldHint: true },
      run: async (a) => deps.queue.enqueue(need(a.id).id, 'manual'),
    },
  ];
}
