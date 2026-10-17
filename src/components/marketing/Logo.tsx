import Image from "next/image";

/* Shared, camera-free folded M across the website and workspace. */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return <Image src="/brand/mohuddle-icon-v2.png" width={64} height={64} sizes="40px" alt="" aria-hidden="true" className={`shrink-0 rounded-[24%] ${className}`} />;
}
