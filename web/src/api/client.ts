export class ApiError extends Error {
  constructor(public status: number, public code: string, public fields?: Record<string, string>, public requestId?: string) {
    super(code);
  }
}

const MESSAGES: Record<string, string> = {
  validation_error: 'Certaines valeurs sont invalides.',
  unauthorized: 'Session expirée.',
  csrf_failed: 'Requête refusée, rechargez la page.',
  forbidden_origin: 'Origine refusée.',
  not_found: 'Élément introuvable.',
  run_already_active: 'Un run est déjà en cours pour ce flux.',
  daily_running: 'Le résumé de ce jour est déjà en cours de génération.',
  no_items: 'Aucun élément retenu ce jour-là.',
  rate_limited: 'Trop de tentatives, réessayez plus tard.',
  destination_blocked: 'Destination non autorisée.',
};
export function errorMessage(e: unknown): string {
  const code = e instanceof ApiError ? e.code : '';
  return MESSAGES[code] ?? 'Une erreur est survenue.';
}

let csrf: string | null = null;
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
// Exempt server-side too (auth plugin): in exposed mode /api/csrf answers 401
// until logged in, so fetching a token first would make login impossible.
const NO_CSRF = new Set(['/api/auth/login']);

async function getCsrf(force = false): Promise<string> {
  if (csrf && !force) return csrf;
  const res = await fetch('/api/csrf', { credentials: 'same-origin' });
  if (!res.ok) throw new ApiError(res.status, 'internal_error');
  csrf = ((await res.json()) as { token: string }).token;
  return csrf;
}

export function resetCsrf(): void { csrf = null; }

function goLogin(): void {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') window.location.assign('/login');
}

export async function api<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const m = method.toUpperCase();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!SAFE.has(m) && !NO_CSRF.has(path)) headers['X-CSRF-Token'] = await getCsrf();
  const res = await fetch(path, {
    method: m, headers, credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    goLogin();
    throw new ApiError(401, 'unauthorized');
  }
  if (!res.ok) {
    let data: { error?: string; fields?: Record<string, string>; requestId?: string } = {};
    try { data = (await res.json()) as typeof data; } catch { /* non-JSON */ }
    if (res.status === 403 && data.error === 'csrf_failed' && !retried && !SAFE.has(m)) {
      csrf = null;
      return api<T>(method, path, body, true);
    }
    throw new ApiError(res.status, data.error ?? 'internal_error', data.fields, data.requestId);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});
export const put = <T>(path: string, body?: unknown) => api<T>('PUT', path, body ?? {});
export const patch = <T>(path: string, body?: unknown) => api<T>('PATCH', path, body ?? {});
export const del = <T>(path: string) => api<T>('DELETE', path);
