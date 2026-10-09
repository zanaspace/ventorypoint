import { cn } from "cn";

interface BrandMarkProps {
  className?: string;
}

// Placeholder mark until the final logo lands (see design-system/ventorypoint-design-system.html).
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-purple-600 to-purple-800",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[55%]"
      >
        <path d="M4 6l8 13 8-13" />
        <path d="M9 6h6" />
      </svg>
    </span>
  );
}
