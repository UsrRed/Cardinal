import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { originAllowed } from '../../auth/csrf.js';
import type { AppDeps } from '../../deps.js';

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

export async function wsRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  // Auth (401 when exposed) is enforced by the global onRequest hook; Origin is checked here.
  const guard = async (
    req: Parameters<typeof originAllowed>[0],
    reply: { code(n: number): { send(b: unknown): unknown } },
  ) => {
    if (!originAllowed(req, deps.config.publicUrl)) return reply.code(403).send({ error: 'forbidden_origin' });
  };

  app.get('/api/ws/runs', { websocket: true, preValidation: guard }, (ws, req) => {
    const runId = (req.query as { runId?: string }).runId;
    const off = deps.bus.on((e) => {
      if (!runId || e.runId === runId) send(ws, e);
    });
    if (runId) {
      const run = deps.repos.runs.get(runId);
      if (run) send(ws, { type: 'run.snapshot', run, logs: deps.repos.runs.logs(runId) });
    }
    ws.on('close', off);
    ws.on('error', off);
  });

  app.get('/api/ws/console', { websocket: true, preValidation: guard }, (ws) => {
    const session = deps.console.open(80, 24);
    if (!session) {
      ws.close(4409, 'console_busy');
      return;
    }
    session.onData((data) => send(ws, { type: 'output', data }));
    session.onExit((code) => {
      send(ws, { type: 'exit', code });
      ws.close(1000);
    });
    session.onClose((reason) => {
      if (reason === 'idle') {
        send(ws, { type: 'closed', reason });
        ws.close(4408, 'idle');
      }
    });
    ws.on('message', (raw: unknown) => {
      let m: { type?: string; data?: unknown; cols?: unknown; rows?: unknown };
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (m.type === 'input' && typeof m.data === 'string') session.write(m.data);
      else if (m.type === 'resize' && Number.isFinite(m.cols) && Number.isFinite(m.rows))
        session.resize(m.cols as number, m.rows as number);
    });
    ws.on('close', () => session.close('client'));
    ws.on('error', () => session.close('error'));
  });
}
