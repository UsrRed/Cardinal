export function SegFilter<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <a
          key={o.value}
          href="#"
          role="button"
          aria-pressed={o.value === value}
          className={o.value === value ? 'on' : undefined}
          onClick={(e) => { e.preventDefault(); onChange(o.value); }}
        >{o.label}</a>
      ))}
    </div>
  );
}
