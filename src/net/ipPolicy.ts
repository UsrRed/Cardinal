export type AllowEntry = { kind: 'ip'; ip: string; port?: number } | { kind: 'cidr'; cidr: string };

export function parseAllowlist(_raw: string | undefined): AllowEntry[] {
  throw new Error('not implemented');
}

export function isBlockedAddress(_ip: string): boolean {
  throw new Error('not implemented');
}

export function isAllowlisted(_ip: string, _port: number, _list: AllowEntry[]): boolean {
  throw new Error('not implemented');
}
