import type { Config } from '../config/index.js';

export interface Session {
  id: string;
  authenticated: boolean;
  createdAt: number;
}

export function loadSessionSecret(_cfg: Config): Buffer {
  throw new Error('not implemented');
}
export function signCookie(_value: string, _secret: Buffer): string {
  throw new Error('not implemented');
}
export function verifyCookie(_signed: string, _secret: Buffer): string | null {
  throw new Error('not implemented');
}

export class SessionStore {
  create(_authenticated: boolean): Session {
    throw new Error('not implemented');
  }
  get(_id: string): Session | null {
    throw new Error('not implemented');
  }
  destroy(_id: string): void {
    throw new Error('not implemented');
  }
}
