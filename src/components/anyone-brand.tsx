import symbolAsset from "@/assets/anyone-symbol.png";
import { cn } from "@/lib/utils";

type BrandProps = {
  compact?: boolean;
  className?: string;
};

/** AnyOne16 symbol: glass ring "O" with one person lifting another. */
export function HelpingMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl neon-stage ring-1 ring-inset ring-stage-foreground/10 shadow-brand",
        className,
      )}
    >
      <img src={symbolAsset} alt="" width={629} height={610} className="size-[86%] object-contain" />
    </span>
  );
}

/** Wordmark: the O carries the brand's blue-to-red connection; 16 sits as a refined superscript. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-extrabold tracking-[-0.02em]", className)}>
      Any<span className="brand-o">O</span>ne
      <sup className="relative -top-[0.55em] ml-[0.04em] align-baseline text-[0.44em] font-bold tracking-normal text-neon-blue">16</sup>
    </span>
  );
}

export function AnyoneBrand({ compact = false, className }: BrandProps) {
  return (
    <div
      className={cn("flex items-center gap-3", className)}
      aria-label="AnyOne 16, Anyone can help"
    >
      {compact ? <HelpingMark className="size-11 rounded-[14px]" /> : <HelpingMark />}
      <div className="leading-none">
        <p className={cn("text-brand-dark", compact ? "text-xl" : "text-2xl")}>
          <Wordmark />
        </p>
        {!compact && (
          <p className="mt-1.5 text-[11px] font-medium tracking-[0.04em] text-muted-foreground">
            Anyone can help.
          </p>
        )}
      </div>
    </div>
  );
}
