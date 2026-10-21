import type { Digest, DigestSection, DigestSummary, Page } from '../../shared/types.js';

export interface DigestsRepo {
  create(
    d: { feedId: string; runId: string; title: string; lede: string; sections: DigestSection[]; partial: boolean },
    now: number,
  ): string;
  get(id: string): Digest | null;
  listByFeed(feedId: string | null, page: number, pageSize: number): Page<DigestSummary>;
}
