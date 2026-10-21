import type { Priority } from '../../../src/shared/types.js';

const MAP: Record<Priority, [string, string, string]> = {
  high: ['p-high', '▮▮▮', 'Haute'],
  medium: ['p-med', '▮▮▯', 'Moyenne'],
  low: ['p-low', '▮▯▯', 'Basse'],
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const [cls, bars, label] = MAP[priority];
  return <span className={`prio ${cls}`}><span className="bars" aria-hidden="true">{bars}</span>{label}</span>;
}
