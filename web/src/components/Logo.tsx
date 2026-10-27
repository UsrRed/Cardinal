/** Cardinal mark: a cardinal's head in profile (crest, black mask, beak). Keep in sync with web/favicon.svg. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path className="logo-body" d="M17 5 L30 17 C40 13 49 18 51 26 L51 36 C49 46 40 53 27 57 L11 61 L17 50 C13 42 15 31 24 24 Z" />
      <path className="logo-wing" d="M21 37 C30 34 38 40 40 49 C32 52 24 50 17 53 C17 47 18 41 21 37 Z" />
      <path className="logo-mask" d="M37 21 C44 19 50 23 51 28 L51 36 C46 40 40 39 37 34 C35 30 35 25 37 21 Z" />
      <path className="logo-beak" d="M50 25 L61 31 L50 37 Z" />
      <circle className="logo-eye" cx="43.5" cy="26.5" r="1.9" />
    </svg>
  );
}
