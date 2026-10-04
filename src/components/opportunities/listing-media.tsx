/** Renders Oportunidades photo/portfolio references (Storage refs or legacy URLs). */
import { FileText } from "lucide-react";

import { isPdfRef, useListingMedia } from "@/lib/listing-media";

export function MediaThumb({ src, className }: { src: string | null; className: string }) {
  if (!src) return <span className={`${className} block animate-pulse bg-muted`} aria-hidden="true" />;
  return <img src={src} alt="" className={className} />;
}

/** Grid/row of media; PDFs open in a new tab through a short-lived link. */
export function MediaList({
  refs,
  itemClassName,
  className,
}: {
  refs: string[];
  itemClassName: string;
  className: string;
}) {
  const urls = useListingMedia(refs);
  return (
    <div className={className}>
      {refs.map((ref, i) =>
        isPdfRef(ref) ? (
          <a
            key={ref}
            href={urls[i] ?? undefined}
            target="_blank"
            rel="noreferrer"
            className={`${itemClassName} grid place-items-center bg-surface text-xs font-semibold text-foreground`}
          >
            <span className="flex flex-col items-center gap-1">
              <FileText className="size-6" aria-hidden="true" /> PDF
            </span>
          </a>
        ) : urls[i] ? (
          <a key={ref} href={urls[i]!} target="_blank" rel="noreferrer" className="shrink-0">
            <img src={urls[i]!} alt="" className={itemClassName} />
          </a>
        ) : (
          <MediaThumb key={ref} src={null} className={itemClassName} />
        ),
      )}
    </div>
  );
}

export function useFirstPhoto(refs: string[]) {
  return useListingMedia(refs.slice(0, 1))[0] ?? null;
}
