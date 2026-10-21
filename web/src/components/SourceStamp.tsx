import type { SourceType } from '../../../src/shared/types.js';

export function SourceStamp({ type, detail }: { type: SourceType; detail?: string }) {
  return <span className="stamp src">{type.toUpperCase()}{detail ? ` · ${detail}` : ''}</span>;
}
