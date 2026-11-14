import Link from "next/link";
export function TraceMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 3 34.72 11.5v17L20 37 5.28 28.5v-17L20 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity=".45"
      />
      <path
        d="M12 13h16M20 13v14"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="27" r="2" fill="currentColor" />
    </svg>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="Tracelet home">
      <span className="brand-icon">
        <TraceMark />
      </span>
      <span>
        tracelet<span className="brand-period">.</span>
      </span>
      {!compact && <span className="beta">BETA</span>}
    </Link>
  );
}
