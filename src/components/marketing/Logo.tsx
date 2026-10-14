/* A folded M: two confident pillars, connected by a shared path forward. */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="60" height="60" rx="18" fill="#173e35" />
      <path d="M14 44V20h9l9 12 9-12h9v24h-9V33l-9 11-9-11v11Z" fill="#f8f7ee" />
      <path d="M41 20h9v24h-9V33L32 44V32Z" fill="#dcef98" />
    </svg>
  );
}
