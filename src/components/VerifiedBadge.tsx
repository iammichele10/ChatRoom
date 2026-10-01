export default function VerifiedBadge({
  className = "w-4 h-4",
}: {
  className?: string;
}) {
  return (
    <svg
      className={`${className} inline-block flex-shrink-0`}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Verified"
      role="img"
    >
      {/* Blue verification circle */}
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="#1877F2"
      />

      {/* White check */}
      <path
        d="M7.8 12.2l2.7 2.7 5.8-6"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}