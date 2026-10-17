/** Original sidebar quota gauge artwork, retained for visual parity. */
export function UsageIcon({ size = 20, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.49 13.26A6.375 6.375 0 1 1 12.51 13.26" stroke="currentColor" strokeWidth="1.25" />
    <path d="M8 8.75L11.4 5.35" stroke="currentColor" strokeWidth="1.25" />
    <circle cx="8" cy="8.75" r="1.55" fill="currentColor" />
  </svg>
}
