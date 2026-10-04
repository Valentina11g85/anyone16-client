/**
 * AnyOne¹⁶ — living space overlay (presentation only).
 * Twinkling stars at random rhythms, drifting nebulae, orbiting motes and a
 * glass sheen. Stars are generated after mount so server and client HTML match.
 */
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

type Star = { x: number; y: number; s: number; d: number; t: number; z: number };

export function SpaceLayer({ count = 70, orbit = { x: "70%", y: "50%" } }: { count?: number; orbit?: { x: string; y: string } }) {
  const [stars, setStars] = useState<Star[]>([]);
  useEffect(() => {
    setStars(
      Array.from({ length: count }, () => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        s: Math.random() < 0.85 ? 1 + Math.random() * 1.2 : 2.2 + Math.random() * 1.4,
        d: Math.random() * 9,
        t: 2.5 + Math.random() * 6,
        z: Math.floor(Math.random() * 3),
      })),
    );
  }, [count]);

  return (
    <span className="space-layer" aria-hidden style={{ "--ox": orbit.x, "--oy": orbit.y } as React.CSSProperties}>
      <span className="space-nebula space-nebula-a" />
      <span className="space-nebula space-nebula-b" />
      {[0, 1, 2].map((z) => (
        <span key={z} className="space-plane" data-z={z}>
          {stars
            .filter((s) => s.z === z)
            .map((s, i) => (
              <i
                key={i}
                className="space-star"
                style={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  width: s.s,
                  height: s.s,
                  animationDelay: `${s.d}s`,
                  animationDuration: `${s.t}s`,
                }}
              />
            ))}
        </span>
      ))}
      <span className="space-orbit space-orbit-a"><b /></span>
      <span className="space-orbit space-orbit-b"><b /></span>
      <span className="space-sheen" />
    </span>
  );
}

/** Visual only: feeds cursor position to CSS (--mx/--my in -1..1, --px/--py in %). */
export function trackPointer(e: ReactPointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse") return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty("--mx", (x * 2 - 1).toFixed(3));
  el.style.setProperty("--my", (y * 2 - 1).toFixed(3));
  el.style.setProperty("--px", `${(x * 100).toFixed(1)}%`);
  el.style.setProperty("--py", `${(y * 100).toFixed(1)}%`);
}
export function untrackPointer(e: ReactPointerEvent<HTMLElement>) {
  e.currentTarget.style.setProperty("--mx", "0");
  e.currentTarget.style.setProperty("--my", "0");
}
