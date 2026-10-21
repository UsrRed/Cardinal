import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../deps.js';

export async function registerStatsRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get('/api/stats', async () => {
    const feeds = deps.repos.feeds.list();
    return {
      ...deps.repos.runs.usageByFeed(),
      nav: {
        feeds: feeds.length,
        unread: feeds.reduce((n, f) => n + f.unreadCount, 0),
        activeRuns: feeds.filter((f) => f.activeRunId).length,
      },
    };
  });
}
