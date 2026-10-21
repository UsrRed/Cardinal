import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../deps.js';
import { checkClaudeStatus } from '../../claude/status.js';
import { AppError } from '../../shared/errors.js';
import { SECRET_NAMES, secretPutSchema, settingsPatchSchema, zodFields, type SecretName } from '../../shared/schemas.js';
import type { ClaudeStatus } from '../../shared/types.js';

export async function registerSettingsRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { secrets, repos } = deps;
  let claudeStatus: ClaudeStatus = { state: 'unknown', checkedAt: null, cliVersion: null };

  const secretName = (raw: string): SecretName => {
    if (!(SECRET_NAMES as readonly string[]).includes(raw)) throw new AppError('not_found', 404);
    return raw as SecretName;
  };

  app.get('/api/settings', async () => deps.settings());

  app.patch('/api/settings', async (req) => {
    const r = settingsPatchSchema.safeParse(req.body ?? {});
    if (!r.success) throw new AppError('validation_error', 400, zodFields(r.error));
    repos.settings.set(r.data);
    return deps.settings();
  });

  app.put<{ Params: { name: string } }>('/api/settings/secrets/:name', async (req) => {
    const name = secretName(req.params.name);
    const r = secretPutSchema.safeParse(req.body ?? {});
    if (!r.success) throw new AppError('validation_error', 400, zodFields(r.error));
    secrets.set(name, r.data.value);
    return secrets.state(name);
  });

  app.delete<{ Params: { name: string } }>('/api/settings/secrets/:name', async (req) => {
    const name = secretName(req.params.name);
    secrets.clear(name);
    return secrets.state(name);
  });

  app.post('/api/settings/test-ntfy', async () => {
    const s = deps.settings();
    if (!s.ntfyTopic) return { ok: false, error: 'not_configured' };
    return deps.notifier.sendTest({ server: s.ntfyServer, topic: s.ntfyTopic, token: secrets.get('ntfyToken') });
  });

  app.get('/api/claude/status', async () => claudeStatus);
  app.post('/api/claude/recheck', async () => {
    claudeStatus = await checkClaudeStatus(deps.runner, secrets.get('anthropicApiKey') !== null);
    return claudeStatus;
  });
}
