import { BlockList, isIP } from 'node:net';

export type AllowEntry = { kind: 'ip'; ip: string; port?: number } | { kind: 'cidr'; cidr: string };

const blocked = new BlockList();
const V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
const V6: Array<[string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['64:ff9b::', 96],
];
for (const [n, p] of V4) blocked.addSubnet(n, p, 'ipv4');
for (const [n, p] of V6) blocked.addSubnet(n, p, 'ipv6');

/** Normalizes an IP; unwraps IPv4-mapped IPv6 to plain IPv4. Returns null if invalid. */
function normalize(ip: string): { ip: string; family: 'ipv4' | 'ipv6' } | null {
  const bare = ip.replace(/^\[|\]$/g, '').split('%')[0]!;
  const fam = isIP(bare);
  if (fam === 4) return { ip: bare, family: 'ipv4' };
  if (fam !== 6) return null;
  const lower = bare.toLowerCase();
  const dotted = /^(?:0{0,4}:){2,5}ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (dotted) return { ip: dotted[1]!, family: 'ipv4' };
  const hex = /^(?:0{0,4}:){2,5}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const a = parseInt(hex[1]!, 16);
    const b = parseInt(hex[2]!, 16);
    return { ip: `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`, family: 'ipv4' };
  }
  return { ip: bare, family: 'ipv6' };
}

export function isBlockedAddress(ip: string): boolean {
  const n = normalize(ip);
  if (!n) return true;
  return blocked.check(n.ip, n.family);
}

function isNeverAllowable(ip: string): boolean {
  const n = normalize(ip);
  if (!n) return true;
  if (n.family === 'ipv4') return n.ip.startsWith('0.') || Number(n.ip.split('.')[0]) >= 224;
  return n.ip === '::' || n.ip.toLowerCase().startsWith('ff');
}

function parseOne(raw: string): AllowEntry | null {
  const cidr = /^([0-9a-fA-F:.]+)\/(\d{1,3})$/.exec(raw);
  if (cidr) {
    const fam = isIP(cidr[1]!);
    if (fam === 0 || Number(cidr[2]) > (fam === 6 ? 128 : 32)) return null;
    return { kind: 'cidr', cidr: raw };
  }
  const m = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(raw) ?? /^\[([0-9a-fA-F:.]+)\]:(\d{1,5})$/.exec(raw);
  if (m) {
    const port = Number(m[2]);
    if (isIP(m[1]!) === 0 || port < 1 || port > 65535) return null;
    return { kind: 'ip', ip: m[1]!, port };
  }
  return isIP(raw) !== 0 ? { kind: 'ip', ip: raw } : null;
}

/** Parses a comma-separated allowlist; invalid entries are ignored. */
export function parseAllowlist(raw: string | undefined): AllowEntry[] {
  const out: AllowEntry[] = [];
  for (const part of (raw ?? '').split(',')) {
    const t = part.trim();
    if (!t) continue;
    const e = parseOne(t);
    if (e) out.push(e);
  }
  return out;
}

export function isAllowlisted(ip: string, port: number, list: AllowEntry[]): boolean {
  const n = normalize(ip);
  if (!n || isNeverAllowable(ip)) return false;
  for (const e of list) {
    if (e.kind === 'ip') {
      const en = normalize(e.ip);
      if (en && en.ip === n.ip && (e.port === undefined || e.port === port)) return true;
    } else {
      const [base, bits] = e.cidr.split('/') as [string, string];
      const bn = normalize(base);
      if (!bn || bn.family !== n.family) continue;
      const bl = new BlockList();
      bl.addSubnet(bn.ip, Number(bits), bn.family);
      if (bl.check(n.ip, n.family)) return true;
    }
  }
  return false;
}
