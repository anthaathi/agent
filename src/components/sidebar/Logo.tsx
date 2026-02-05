export function Logo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={className}
      fill="none"
    >
      <circle cx="50" cy="50" r="16" className="fill-[#D71921]" />
      <path
        d="M 28 28 A 32 32 0 0 1 50 18"
        className="stroke-current"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 72 28 A 32 32 0 0 1 72 72"
        className="stroke-current"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 50 82 A 32 32 0 0 1 28 72"
        className="stroke-current"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
