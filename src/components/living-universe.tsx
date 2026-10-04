/**
 * AnyOne¹⁶ — living universe engine (presentation only).
 * Gives existing UI objects (cards, modules, tiles) an independent
 * zero-gravity phase, a depth that drives cursor-camera parallax, and a
 * scroll "arrival" from depth. Writes data-attributes / CSS vars only;
 * never touches React state, data or behaviour.
 */
import { useEffect } from "react";

const OBJECTS = [
  ".fv-card", ".sv-card", ".opp-card", ".object-tile", ".flow-step", ".opx-portal",
  ".pf-item", ".pf-mini", ".pf-world", ".uv-module", ".nt-item",
  ".helper-card", ".offer-card", ".command-card", ".review-card",
].join(",");

/** Deterministic per-element phase so motion never looks synchronised. */
function seed(i: number) {
  const h = Math.imul(i + 1, 2654435761) >>> 0;
  return {
    delay: -((h % 9000) / 1000),
    dur: 7 + ((h >> 8) % 50) / 10, // 7–12 s
    depth: 0.35 + ((h >> 14) % 65) / 100, // 0.35–1.0
    tilt: (((h >> 20) % 7) - 3) * 0.18, // -0.54..0.54 deg
  };
}

export function LivingUniverse() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let counter = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            el.dataset["uvIn"] = "1";
            io.unobserve(el);
            // After the arrival, switch to fast focus timings.
            window.setTimeout(() => (el.dataset["uvSettled"] = "1"), 900);
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
    );

    // Performance: only animate objects that are on screen.
    const vis = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) el.dataset["uvVis"] = "1";
        else delete el.dataset["uvVis"];
      }
    }, { rootMargin: "120px" });

    const adopt = (el: HTMLElement) => {
      if (el.dataset["uv"]) return;
      const s = seed(counter++);
      el.dataset["uv"] = "1";
      el.style.setProperty("--f-delay", `${s.delay}s`);
      el.style.setProperty("--f-dur", `${s.dur}s`);
      el.style.setProperty("--f-z", s.depth.toFixed(2));
      el.style.setProperty("--f-tilt", `${s.tilt.toFixed(2)}deg`);
      vis.observe(el);
      if (reduce) { el.dataset["uvIn"] = "1"; el.dataset["uvSettled"] = "1"; }
      else io.observe(el);
    };
    const scan = (root: ParentNode) => {
      if (root instanceof HTMLElement && root.matches(OBJECTS)) adopt(root);
      root.querySelectorAll<HTMLElement>(OBJECTS).forEach(adopt);
    };

    scan(document);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => n instanceof HTMLElement && scan(n));
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // ONE engine: pointer camera, scroll velocity and sector detection share a single rAF.
    const root = document.documentElement;
    const coarse = window.matchMedia("(hover: none)").matches || window.innerWidth < 768;
    const cores = (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency ?? 8;
    root.dataset["uvPerf"] = coarse || cores <= 4 ? "low" : "high";
    // Adaptive: measure the first ~90 frames; downgrade if the device struggles.
    if (!reduce && root.dataset["uvPerf"] === "high") {
      let n = 0; const t0 = performance.now();
      const probe = () => {
        if (++n < 90) { requestAnimationFrame(probe); return; }
        const fps = (n * 1000) / (performance.now() - t0);
        if (fps < 45) root.dataset["uvPerf"] = "low";
      };
      requestAnimationFrame(probe);
    }
    let px = 0, py = 0, pDirty = false, sDirty = false, raf = 0, settle = 0, lastSector = 0;
    let last = window.scrollY;
    const frame = () => {
      raf = 0;
      if (pDirty) {
        pDirty = false;
        root.style.setProperty("--ux", px.toFixed(3));
        root.style.setProperty("--uy", py.toFixed(3));
      }
      if (sDirty) {
        sDirty = false;
        const y = window.scrollY;
        const v = Math.max(-1, Math.min(1, (y - last) / 60));
        last = y;
        root.style.setProperty("--uv-vel", v.toFixed(2));
        window.clearTimeout(settle);
        settle = window.setTimeout(() => root.style.setProperty("--uv-vel", "0"), 140);
        const now = performance.now();
        if (now - lastSector > 250) { lastSector = now; pickSector(); }
      }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || reduce) return;
      px = (e.clientX / window.innerWidth) * 2 - 1;
      py = (e.clientY / window.innerHeight) * 2 - 1;
      pDirty = true; kick();
    };
    const onScroll = () => { sDirty = true; kick(); };
    if (!coarse) window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    // Sectors: the environment shifts as you travel into each region.
    const SECTORS: [string, string][] = [
      [".object-rail", "constellation"], [".opx-portals", "portals"], [".fv-grid", "missions"],
      [".sv-grid", "network"], [".uv-archive", "timeline"], [".pf-world", "planet"],
      [".pf-id", "planet"], [".nt-item", "signals"], [".uv-shield", "shield"], [".uv-console", "station"],
    ];
    // Travel: the camera moves through depth when arriving in a new sector.
    let travelT = 0;
    let lastTravel = 0;
    const travel = () => {
      if (reduce) return;
      const now = performance.now();
      if (now - lastTravel < 900) return;
      lastTravel = now;
      root.dataset["uvTravel"] = "1";
      window.clearTimeout(travelT);
      travelT = window.setTimeout(() => delete root.dataset["uvTravel"], 820);
    };
    const onNav = (e: MouseEvent) => {
      const t = (e.target as HTMLElement | null)?.closest?.("nav button, nav a, .glass-nav button, .glass-nav a, .pf-nav button, .pf-nav a");
      if (t) travel();
    };
    document.addEventListener("click", onNav, true);
    const pickSector = () => {
      {
        const mid = window.innerHeight / 2;
        let best = "core";
        let bestD = Infinity;
        for (const [sel, name] of SECTORS) {
          document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.bottom < 0 || r.top > window.innerHeight) return;
            const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
            if (d < bestD) { bestD = d; best = name; }
          });
        }
        if (bestD > window.innerHeight * 0.45) best = "core";
        if (root.dataset["uvSector"] !== best) {
          const had = root.dataset["uvSector"];
          root.dataset["uvSector"] = best;
          if (had) travel();
        }
      }
    };
    const sectorTimer = window.setInterval(pickSector, 1500);
    pickSector();

    // Constellations: light connections drawn between objects of a group.
    const GROUPS = ".object-rail, .fv-grid, .sv-grid, .uv-archive, .opx-portals";
    const NS = "http://www.w3.org/2000/svg";
    const draw = (g: HTMLElement) => {
      const kids = Array.from(g.children).filter(
        (k): k is HTMLElement => k instanceof HTMLElement && !k.classList.contains("uv-links") && k.offsetWidth > 0,
      );
      let svg = g.querySelector<SVGSVGElement>(":scope > svg.uv-links");
      if (kids.length < 2) { svg?.remove(); return; }
      g.classList.add("uv-linked");
      // Spatial hierarchy: near / middle / far tiers inside each group.
      kids.forEach((k, i) => { if (!k.dataset["uvTier"]) k.dataset["uvTier"] = ["near", "far", "mid"][i % 3]!; });
      if (!svg) {
        svg = document.createElementNS(NS, "svg");
        svg.setAttribute("class", "uv-links");
        svg.setAttribute("aria-hidden", "true");
        g.prepend(svg);
      }
      const w = g.scrollWidth, h = g.scrollHeight;
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      const pts = kids.map((k) => [k.offsetLeft + k.offsetWidth / 2, k.offsetTop + k.offsetHeight / 2] as const);
      let d = "";
      pts.forEach(([x, y], i) => {
        if (i === 0) { d += `M${x} ${y}`; return; }
        const [px, py] = pts[i - 1]!;
        const bend = (i % 2 ? -1 : 1) * Math.min(60, Math.hypot(x - px, y - py) * 0.18);
        d += ` Q${(px + x) / 2 + bend} ${(py + y) / 2 - bend} ${x} ${y}`;
      });
      svg.innerHTML = `<path class="uv-link-base" d="${d}"/><path class="uv-link-pulse" d="${d}"/>` +
        pts.map(([x, y]) => `<circle class="uv-link-node" cx="${x}" cy="${y}" r="3"/>`).join("");
    };
    const ro = new ResizeObserver((es) => es.forEach((e) => draw(e.target as HTMLElement)));
    const watched = new WeakSet<Element>();
    const scanGroups = () => document.querySelectorAll<HTMLElement>(GROUPS).forEach((g) => {
      if (!watched.has(g)) { watched.add(g); ro.observe(g); }
      draw(g);
    });
    let groupT = 0;
    const mo2 = new MutationObserver((muts) => {
      if (muts.every((m) => m.target instanceof SVGElement)) return;
      window.clearTimeout(groupT);
      groupT = window.setTimeout(scanGroups, 250);
    });
    mo2.observe(document.body, { childList: true, subtree: true });
    scanGroups();

    // Timeline depth: older records recede.
    const depthT = window.setInterval(() => {
      document.querySelectorAll<HTMLElement>(".uv-archive").forEach((a) =>
        Array.from(a.children).forEach((c, i) => (c as HTMLElement).style?.setProperty("--uv-i", String(Math.min(i, 10)))),
      );
    }, 1500);

    // Portals: a light tunnel when entering a sector (visual only, never blocks the click).
    const onPortal = (e: MouseEvent) => {
      if (reduce) return;
      const t = (e.target as HTMLElement | null)?.closest?.(".opx-portal, .opp-card, .object-tile");
      if (!t) return;
      const r = t.getBoundingClientRect();
      const tun = document.createElement("div");
      tun.className = "uv-tunnel";
      tun.style.setProperty("--tx", `${r.left + r.width / 2}px`);
      tun.style.setProperty("--ty", `${r.top + r.height / 2}px`);
      document.body.appendChild(tun);
      window.setTimeout(() => tun.remove(), 950);
    };
    document.addEventListener("click", onPortal, true);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("click", onNav, true);
      window.clearTimeout(travelT);
      window.clearInterval(sectorTimer);
      window.clearInterval(depthT);
      ro.disconnect();
      mo2.disconnect();
      window.clearTimeout(groupT);
      document.removeEventListener("click", onPortal, true);
      mo.disconnect();
      io.disconnect();
      vis.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return (
    <div className="uv-fore" aria-hidden="true">
      <span className="uv-fore-a" />
      <span className="uv-fore-b" />
    </div>
  );
}
