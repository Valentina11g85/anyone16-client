import { OPPORTUNITIES_UNLOCK_LABEL, type OpportunitiesAccess } from "@/lib/opportunities-access";
/**
 * AnyOne¹⁶ — Oportunidades entry experience (presentation only).
 * Every action here calls existing handlers: start the existing ServiceEditor,
 * or pre-set the existing search/category filter of the feed.
 */
import {
  ArrowRight,
  BookOpen,
  Brush,
  Calculator,
  Camera,
  Code2,
  Droplets,
  Hammer,
  Languages,
  Lightbulb,
  Music2,
  PenLine,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";

import { SpaceLayer, trackPointer as track, untrackPointer as untrack } from "@/components/space-layer";
import heroArt from "@/assets/opp/world-hero.jpg";
import artProfessional from "@/assets/opp/world-knowledge.jpg";
import artHome from "@/assets/opp/world-home.jpg";
import artTrades from "@/assets/opp/world-craft.jpg";
import artTalents from "@/assets/opp/world-talent.jpg";

export type Discover = { group?: string; query?: string };

export function OppHero({
  signedIn,
  access,
  onOffer,
  onHire,
}: {
  signedIn: boolean;
  access?: OpportunitiesAccess;
  onOffer: () => void;
  onHire: () => void;
}) {
  return (
    <header className="opx-hero opx-hero-compact" onPointerMove={track} onPointerLeave={untrack}>
      <img src={heroArt} alt="" width={1400} height={788} className="opx-hero-art" />
      <span className="opx-hero-glow" aria-hidden />
      <SpaceLayer count={80} orbit={{ x: "72%", y: "48%" }} />
      <div className="opx-hero-body">
        <p className="eyebrow text-xs font-bold uppercase">Oportunidades · AnyOne¹⁶</p>
        <h1 className="mt-3 font-display text-[2.3rem] font-extrabold leading-[1.02] text-foreground sm:text-6xl">
          Lo que sabes hacer <span className="opx-grad">tiene valor.</span>
        </h1>
        <p className="mt-4 max-w-md text-base text-muted-foreground sm:text-lg">
          Ofrece tus servicios, encuentra nuevas oportunidades o encuentra a la persona adecuada
          para lo que necesitas.
        </p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Encuentra oportunidades reales y conecta con las personas que necesitan lo que sabes hacer.
        </p>
        {access && access !== "loading" && (
          <div className="pw-active !mt-4 !text-foreground">
            {access === "unlocked" ? (
              <>Acceso desbloqueado ✓</>
            ) : (
              <>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Acceso a Oportunidades</span>
                <span>Desbloquea el contenido completo · {OPPORTUNITIES_UNLOCK_LABEL}</span>
              </>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" className="opx-cta" onClick={onOffer} disabled={!signedIn}>
            Ofrecer mi servicio <ArrowRight className="size-4" />
          </button>
          <button type="button" className="opx-ghost" onClick={onHire} disabled={!signedIn}>
            Publicar lo que necesito
          </button>
        </div>
        {!signedIn && (
          <p className="mt-3 text-xs text-muted-foreground">Inicia sesión para publicar.</p>
        )}
        <div className="opx-bridge" aria-hidden>
          <span>Necesito ayuda</span>
          <i>
            <b />
          </i>
          <span>Yo puedo ayudar</span>
        </div>
      </div>
    </header>
  );
}

const PORTALS = [
  {
    n: "01",
    accent: "pro",
    cta: "Ofrecer mis conocimientos",
    group: "Profesionales",
    title: "Profesionales y consultas",
    line: "Tu conocimiento, a una consulta de distancia.",
    examples: "Diseño · Contabilidad · Tecnología · Consultoría · Asesorías",
    tags: ["Online", "Por hora", "Independiente"],
    art: artProfessional,
  },
  {
    n: "02",
    accent: "home",
    cta: "Ofrecer un servicio",
    group: "Servicios",
    title: "Servicios a domicilio",
    line: "Tu servicio llega hasta donde te necesitan.",
    examples: "Aseo · Belleza · Cuidado · Cocina · Mascotas",
    tags: ["A domicilio", "En tu zona"],
    art: artHome,
  },
  {
    n: "03",
    accent: "craft",
    cta: "Ofrecer mi oficio",
    group: "Técnicos",
    title: "Oficios y técnicos",
    line: "Saber hacerlo bien es un oficio.",
    examples: "Electricidad · Plomería · Mecánica · Construcción · Reparaciones",
    tags: ["Especializado", "Por trabajo"],
    art: artTrades,
  },
  {
    n: "04",
    accent: "talent",
    cta: "Mostrar mi talento",
    group: "Creativos",
    title: "Otros talentos",
    line: "No necesitas un título para tener algo valioso.",
    examples: "Música · Fotografía · Video · Edición · Diseño",
    tags: ["Creativo", "Por proyecto"],
    art: artTalents,
  },
];

export function OppPortals({ onDiscover }: { onDiscover: (d: Discover) => void }) {
  return (
    <section className="mt-14" aria-labelledby="opx-portals">
      <p className="eyebrow text-xs font-bold uppercase">Cuatro mundos</p>
      <h2 id="opx-portals" className="mt-2 font-display text-2xl font-extrabold text-foreground sm:text-4xl">
        ¿Qué tipo de oportunidad eres?
      </h2>
      <div className="opx-portals mt-6">
        <span className="opx-energy" aria-hidden />
        {PORTALS.map((p, i) => (
          <button
            key={p.n}
            type="button"
            data-accent={p.accent}
            className={`opx-portal ${i === 0 ? "opx-portal-lead" : ""}`}
            onClick={() => onDiscover({ group: p.group })}
            onPointerMove={track}
            onPointerLeave={untrack}
          >
            <img src={p.art} alt="" loading="lazy" width={1400} height={788} className="opx-portal-art" />
            <span className="opx-portal-light" aria-hidden />
            <span className="opx-portal-shade" aria-hidden />
            <span className="opx-portal-sweep" aria-hidden />
            <span className="opx-portal-body">
              <span className="opx-num">{p.n}</span>
              <span className="mt-2 block font-display text-xl font-extrabold text-foreground sm:text-2xl">
                {p.title}
              </span>
              <span className="mt-1 block text-sm text-foreground/85">{p.line}</span>
              <span className="mt-2 block text-xs text-muted-foreground">{p.examples}</span>
              <span className="mt-3 flex flex-wrap gap-1.5">
                {p.tags.map((t) => (
                  <span key={t} className="opx-tag">
                    {t}
                  </span>
                ))}
              </span>
              <span className="opx-portal-go">
                {p.cta} <ArrowRight className="opx-arrow size-4" />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Each query is an existing category name so the current search matches it. */
const SKILLS = [
  { label: "Diseño", query: "Diseño", Icon: Brush },
  { label: "Tecnología", query: "Programador", Icon: Code2 },
  { label: "Clases", query: "Profesor", Icon: BookOpen },
  { label: "Idiomas", query: "Idiomas", Icon: Languages },
  { label: "Contabilidad", query: "Contador", Icon: Calculator },
  { label: "Consultoría", query: "Consultor", Icon: Lightbulb },
  { label: "Reparaciones", query: "Reparaciones", Icon: Wrench },
  { label: "Electricidad", query: "Electricista", Icon: Zap },
  { label: "Plomería", query: "Plomero", Icon: Droplets },
  { label: "Construcción", query: "Construcción", Icon: Hammer },
  { label: "Belleza", query: "Maquillaje", Icon: Sparkles },
  { label: "Fotografía", query: "Fotografía", Icon: Camera },
  { label: "Música", query: "Música", Icon: Music2 },
  { label: "Edición", query: "Edición", Icon: PenLine },
];

export function OppSkills({ onDiscover }: { onDiscover: (d: Discover) => void }) {
  return (
    <section className="mt-14" aria-labelledby="opx-skills">
      <p className="eyebrow text-xs font-bold uppercase">Descubre</p>
      <h2 id="opx-skills" className="mt-2 font-display text-2xl font-extrabold text-foreground sm:text-4xl">
        ¿Qué sabes hacer?
      </h2>
      <div className="opx-skills mt-5">
        {SKILLS.map(({ label, query, Icon }) => (
          <button key={label} type="button" className="opx-skill" onClick={() => onDiscover({ query })}>
            <span className="opx-skill-icon">
              <Icon className="size-5" strokeWidth={1.6} />
            </span>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

const WAYS = [
  ["Ofrece lo que sabes", "Tu profesión, oficio o habilidad."],
  ["Por proyecto", "Un trabajo, un precio."],
  ["Por hora", "Cobra el tiempo que dedicas."],
  ["Online", "Atiende desde cualquier lugar."],
  ["A domicilio", "Ve hasta donde te necesitan."],
  ["Clientes reales", "Personas que buscan justo eso."],
];

export function OppExplainer() {
  return (
    <section className="opx-explain mt-14" aria-labelledby="opx-explain">
      <h2 id="opx-explain" className="font-display text-2xl font-extrabold text-foreground sm:text-4xl">
        Tu experiencia no tiene que quedarse <span className="opx-grad">en un currículum.</span>
      </h2>
      <ol className="opx-ways mt-6">
        {WAYS.map(([t, d], i) => (
          <li key={t}>
            <span className="opx-num">{String(i + 1).padStart(2, "0")}</span>
            <span className="mt-2 block font-display font-bold text-foreground">{t}</span>
            <span className="text-sm text-muted-foreground">{d}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
