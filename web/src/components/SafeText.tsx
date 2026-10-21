/** Renders plain text as escaped paragraphs (blank-line separated). Never injects HTML. */
export function SafeText({ text, className }: { text: string; className?: string }) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className={className ? `safe ${className}` : 'safe'}>
      {paras.map((p, i) => <p key={i}>{p}</p>)}
    </div>
  );
}
