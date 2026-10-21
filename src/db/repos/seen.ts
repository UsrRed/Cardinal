export interface SeenRepo {
  filterUnseen(feedId: string, keys: string[]): Set<string>;
  markSeen(feedId: string, keys: string[], now: number): void;
}
