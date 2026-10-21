import { AppError } from '../../shared/errors.js';

export function pageParams(q: Record<string, unknown>): { page: number; pageSize: number } {
  const num = (v: unknown, def: number, min: number, max: number, field: string): number => {
    if (v === undefined || v === '') return def;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new AppError('validation_error', 400, { [field]: 'Valeur invalide.' });
    return n;
  };
  return { page: num(q.page, 1, 1, 100000, 'page'), pageSize: num(q.pageSize, 20, 1, 100, 'pageSize') };
}
