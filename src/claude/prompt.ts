export const SYSTEM_HEADER = '';

export function escapeDelimiters(s: string): string {
  return s.replaceAll('<<<', '‹‹‹').replaceAll('>>>', '›››');
}

export interface PromptItem {
  ref: string;
  title: string;
  url: string | null;
  publishedAt?: string;
  content: string;
  sources: string[];
}

export function buildTriagePrompt(_o: { feedName: string; instructions: string; items: PromptItem[] }): string {
  throw new Error('not implemented');
}

export function buildDigestPrompt(_o: {
  feedName: string;
  instructions: string;
  items: PromptItem[];
  withTriage: boolean;
}): string {
  throw new Error('not implemented');
}

export function buildCorrectionPrompt(_original: string, _problems: string[]): string {
  throw new Error('not implemented');
}
