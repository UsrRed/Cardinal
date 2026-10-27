import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { originAllowed } from '../../auth/csrf.js';
import type { AppDeps } from '../../deps.js';
import { createMcpTools } from '../../mcp/tools.js';
import { AppError } from '../../shared/errors.js';

/**
 * Minimal MCP server (Streamable HTTP, stateless, JSON responses only): enough for a
 * client such as Claude Code to manage feeds. Enabled only when PFLUX_MCP_TOKEN is set;
 * clients authenticate with `Authorization: Bearer <token>`, never with the UI session.
 */
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'cardinal', version: '0.1.0' };
const INSTRUCTIONS =
  'Cardinal : veille RSS / OSV / NVD triée par Claude. Ces outils gèrent les flux (lister, créer, modifier, activer, lancer). ' +
  'Lire et éditer les digests se fait dans l’interface web.';

type Id = string | number | null;
interface Message {
  jsonrpc?: unknown;
  id?: Id;
  method?: unknown;
  params?: unknown;
}

const digest = (s: string) => createHash('sha256').update(s).digest();

function bearer(req: FastifyRequest): string | undefined {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
  return m?.[1];
}

const ok = (id: Id, result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: Id, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

export async function mcpRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const token = deps.config.mcpToken;
  const tools = createMcpTools(deps);
  const byName = new Map(tools.map((t) => [t.name, t]));

  async function callTool(params: Record<string, unknown>) {
    const tool = typeof params.name === 'string' ? byName.get(params.name) : undefined;
    if (!tool) return null;
    const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {};
    try {
      const data = await tool.run(args);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      const text = e.fields ? `${e.code}: ${JSON.stringify(e.fields)}` : e.code;
      return { content: [{ type: 'text', text }], isError: true };
    }
  }

  async function handle(msg: Message): Promise<object | null> {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return fail(null, -32600, 'Invalid Request');
    // Notifications and client responses get no reply.
    if (typeof msg.method !== 'string' || msg.id === undefined) return null;
    const id = msg.id;
    const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<string, unknown>;
    switch (msg.method) {
      case 'initialize': {
        const asked = params.protocolVersion;
        const protocolVersion = typeof asked === 'string' && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0];
        return ok(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
      }
      case 'ping':
        return ok(id, {});
      case 'tools/list':
        return ok(id, { tools: tools.map(({ run: _r, ...t }) => t) });
      case 'tools/call': {
        const result = await callTool(params);
        return result ? ok(id, result) : fail(id, -32602, 'Unknown tool');
      }
      default:
        return fail(id, -32601, 'Method not found');
    }
  }

  app.post('/mcp', async (req, reply) => {
    if (!token) throw new AppError('not_found', 404);
    reply.header('Cache-Control', 'no-store');
    // DNS-rebinding guard required by the MCP spec; non-browser clients send no Origin.
    if (!originAllowed(req, deps.config.publicUrl)) return reply.code(403).send({ error: 'forbidden_origin' });
    const given = bearer(req);
    if (!given || !timingSafeEqual(digest(given), digest(token))) {
      return reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: 'unauthorized' });
    }
    const body = req.body as Message | Message[];
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(handle))).filter((r) => r !== null);
      return out.length ? out : reply.code(202).send();
    }
    const res = await handle(body);
    return res ?? reply.code(202).send();
  });

  // No server-initiated stream and no session to end.
  const notAllowed = async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!token) throw new AppError('not_found', 404);
    return reply.code(405).header('Allow', 'POST').send({ error: 'method_not_allowed' });
  };
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);
}
