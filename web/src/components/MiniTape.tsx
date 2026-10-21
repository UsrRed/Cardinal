export function MiniTape({ active, done }: { active: boolean; done: boolean }) {
  const cls = active ? 'now' : done ? '' : 'todo';
  return (
    <div className="minitape" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => <i key={i} className={cls} />)}
    </div>
  );
}
