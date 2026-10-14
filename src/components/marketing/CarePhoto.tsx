import Image from "next/image";
import { cn } from "@/lib/cn";

export function CarePhoto({ src, alt, caption, className, sizes = "(max-width: 768px) 100vw, 50vw" }: {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  sizes?: string;
}) {
  return (
    <figure className={cn("care-photo", className)}>
      <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
      <span className="care-photo-disclosure">Illustrative imagery</span>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
