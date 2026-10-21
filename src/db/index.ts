import type Database from 'better-sqlite3';

export type Db = Database.Database;

export function openDb(_file: string): Db {
  throw new Error('not implemented');
}

export function migrate(_db: Db, _dir: string): void {
  throw new Error('not implemented');
}
