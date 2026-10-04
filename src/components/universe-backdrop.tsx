/**
 * AnyOne¹⁶ — global universe backdrop (presentation only).
 * Fixed layers behind every screen: deep space, far stars, nebulae, floating
 * particles, orbits and cursor-reactive light. Stars are created after mount so
 * server and client HTML match. Pointer/camera input lives in the single LivingUniverse engine.
 */
import { useEffect, useState } from "react";

type Star = { x: number; y: number; s: number; d: number; t: number; z: number };

export function UniverseBackdrop() {
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    const small = window.matchMedia("(max-width: 640px)").matches;
    setStars(
      Array.from({ length: small ? 55 : 110 }, () => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        s: Math.random() < 0.88 ? 0.8 + Math.random() * 1.1 : 1.9 + Math.random() * 1.2,
        d: Math.random() * 10,
        t: 3 + Math.random() * 7,
        z: Math.floor(Math.random() * 3),
      })),
    );

  }, []);

  return (
    <div className="universe" aria-hidden="true">
      <span className="uv-deep" />
      <span className="uv-nebula uv-nebula-a" />
      <span className="uv-nebula uv-nebula-b" />
      <span className="uv-nebula uv-nebula-c" />
      {[0, 1, 2].map((z) => (
        <span key={z} className="uv-plane" data-z={z}>
          {stars
            .filter((s) => s.z === z)
            .map((s, i) => (
              <i
                key={i}
                className="uv-star"
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
      <span className="uv-dust" />
      <span className="uv-orbit uv-orbit-a"><b /></span>
      <span className="uv-orbit uv-orbit-b"><b /></span>
      <span className="uv-cursor" />
    </div>
  );
}
