import { ThemeToggle } from "@/components/theme-toggle";
import { PaymentReturnNotice } from "@/components/payments/payment-order-checkout";
import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Check,
  ChevronRight,
  CircleCheckBig,
  HandHeart,
  MessageSquareText,
  CircleUserRound,
  Dog,
  FileText,
  Flower2,
  Gift,
  Globe2,
  Home,
  Mail,
  MapPin,
  Package,
  Plus,
  Search,
  Settings2,
  ShoppingCart,
  Sparkles,
  WashingMachine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import welcomeIcon from "@/assets/anyone-app-icon.jpg";
import symbolArt from "@/assets/anyone-symbol.png";
import { SpaceLayer, trackPointer, untrackPointer } from "@/components/space-layer";
import heroScene from "@/assets/home/hero-scene.jpg";
import ideaQueue from "@/assets/home/idea-queue.jpg";
import ideaTechnician from "@/assets/home/idea-technician.jpg";
import ideaReceive from "@/assets/home/idea-receive-2.jpg";
import ideaDocuments from "@/assets/home/idea-documents.jpg";
import ideaReturn from "@/assets/home/idea-return.jpg";
import ideaKeys from "@/assets/home/idea-keys.jpg";
import ideaWelcome from "@/assets/home/idea-welcome.jpg";
import ideaPlants from "@/assets/home/idea-plants.jpg";
import ideaPet from "@/assets/home/idea-pet.jpg";
import ideaDeliver from "@/assets/home/idea-deliver.jpg";
import oppProfessional from "@/assets/home/opp-professional.jpg";
import oppHome from "@/assets/home/opp-home.jpg";
import oppTrades from "@/assets/home/opp-trades.jpg";
import oppTalents from "@/assets/home/opp-talents.jpg";

/** Illustrative scenes; each one opens an existing idea (index into examples). */
/** Presentation of the Oportunidades concept — every CTA opens the existing Oportunidades tab. */
const opportunityScenes = [
  { step: "Conocimiento", image: oppProfessional, kicker: "Profesionales y consultas", title: "Convierte lo que sabes en una oportunidad.", copy: "Ofrece tus conocimientos, consultas o asesorías online, por hora o de forma independiente.", examples: "Diseño · Contabilidad · Clases · Consultoría · Tecnología · Idiomas · Marketing", tags: ["Online", "Por hora", "Independiente"], cta: "Ofrecer mis conocimientos", accent: "blue" },
  { step: "Servicio", image: oppHome, kicker: "Servicios a domicilio", title: "Lleva tu servicio hasta donde te necesitan.", copy: "Ofrece servicios prácticos directamente en la zona donde encuentres personas que los necesitan.", examples: "Aseo · Belleza · Reparaciones · Instalaciones · Mantenimiento · Cuidado", tags: ["A domicilio", "En tu zona", "Independiente"], cta: "Ofrecer un servicio", accent: "red" },
  { step: "Oficio", image: oppTrades, kicker: "Oficios y técnicos", title: "Tu oficio también puede convertirse en una oportunidad.", copy: "Encuentra personas que necesitan reparaciones, instalaciones y trabajos especializados.", examples: "Mecánica · Electricidad · Plomería · Carpintería · Reparaciones · Instalaciones", tags: ["Presencial", "Especializado", "Independiente"], cta: "Ofrecer mi oficio", accent: "blue" },
  { step: "Talento", image: oppTalents, kicker: "Otros talentos", title: "¿Sabes hacer algo que alguien más necesita?", copy: "Comparte tus habilidades, creatividad, conocimientos o talentos con quienes los necesitan.", examples: "Música · Clases · Fotografía · Diseño · Creatividad · Escritura · Otros", tags: ["Creativo", "A tu ritmo", "Personalizado"], cta: "Ver oportunidades", accent: "red" },
] as const;
import { AnyoneBrand, HelpingMark, Wordmark } from "@/components/anyone-brand";
import { Shell } from "@/components/app-shell";
import { AuthScreen, type AuthMode } from "@/components/auth/auth-screens";
import { CreateFavorFlow } from "@/components/create-favor/create-favor-flow";
import { FavorsScreen } from "@/components/client/favors-screen";
import { ProfileScreen } from "@/components/client/profile-screen";
import { OpportunitiesScreen } from "@/components/opportunities/opportunities-screen";
import { WorkerApp, requestWorkerTab } from "@/components/worker/worker-app";
import { WorkerOnboarding } from "@/components/worker/worker-onboarding";
import { publishFavor } from "@/lib/marketplace-store";
import { AuthProvider, useAuth, type AppMode } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { LegalGate } from "@/components/legal/legal-gate";
import { BellButton, NotificationsCenter, useNotificationsSync } from "@/components/notifications/notifications-center";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  countries,
  currencies,
  defaultMarketConfig,
  formatCurrencyName,
  languages,
} from "@/lib/market-config";

type Step = "welcome" | "country" | "preferences" | "summary" | "auth";

const stepOrder: Step[] = ["country", "preferences", "summary"];

const backMap: Partial<Record<Step, Step>> = {
  country: "welcome",
  preferences: "country",
  summary: "preferences",
  auth: "summary",
};

function SelectField({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ code: string; name: string }>;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-14 rounded-2xl border-border bg-surface px-4 text-base shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72 rounded-2xl">
          {options.map((option) => (
            <SelectItem className="min-h-11 rounded-xl" key={option.code} value={option.code}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ------------------------------------------------------------- client -- */

export function HomeScreen({
  countryCode,
  languageCode,
  currencyCode,
  onSwitchToWorker,
}: {
  countryCode: string;
  languageCode: string;
  currencyCode: string;
  onSwitchToWorker: () => void;
}) {
  const [draftText, setDraftText] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [tab, setTab] = useState<"home" | "favors" | "opportunities" | "profile">("home");
  /** Id of the favor the user just published, so "Ver mi favor" opens that one. */
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const unreadNotifications = useNotificationsSync();
  /** Worker items open worker mode on Offers (tracking + chat), not the client's favors. */
  const openTarget = (t: "favors" | "opportunities" | "worker-offers" | "earnings") => {
    if (t === "earnings") {
      setTab("profile");
      setTimeout(() => document.getElementById("pf-gains")?.scrollIntoView({ behavior: "smooth" }), 300);
      return;
    }
    if (t === "worker-offers") {
      requestWorkerTab("offers");
      onSwitchToWorker();
      return;
    }
    setTab(t);
  };
  /** Presentation examples only — each one pre-fills the existing "Crear un favor" flow. */
  const openOpportunities = () => {
    setPublishedId(null);
    setTab("opportunities");
    window.scrollTo({ top: 0 });
  };

  const examples: Array<{ title: string; line: string; prompt: string; art: string }> = [
    { title: "Hacer fila", line: "Haz que alguien espere por ti.", prompt: "Necesito que alguien haga fila por mí mientras yo trabajo.", art: ideaQueue },
    { title: "Esperar al técnico", line: "Alguien puede estar en casa por ti.", prompt: "Necesito que alguien espere al técnico en mi casa mientras estoy trabajando.", art: ideaTechnician },
    { title: "Recibir un paquete", line: "Que alguien lo reciba por ti.", prompt: "Necesito que alguien reciba un paquete por mí.", art: ideaReceive },
    { title: "Recoger documentos", line: "Tus papeles, donde deben estar.", prompt: "Necesito que alguien recoja unos documentos por mí.", art: ideaDocuments },
    { title: "Devolver una compra", line: "Alguien puede devolverla por ti.", prompt: "Necesito que alguien devuelva una compra por mí.", art: ideaReturn },
    { title: "Recoger unas llaves", line: "Alguien puede recogerlas por ti.", prompt: "Necesito que alguien recoja unas llaves por mí.", art: ideaKeys },
    { title: "Recibir a alguien", line: "Que alguien esté ahí cuando llegue.", prompt: "Necesito que alguien reciba a una persona en mi casa cuando llegue.", art: ideaWelcome },
    { title: "Cuidar mis plantas", line: "Una mano mientras no estás.", prompt: "Necesito que alguien cuide y riegue mis plantas mientras no estoy.", art: ideaPlants },
    { title: "Ayudar con mi mascota", line: "Una mano para tu compañero.", prompt: "Necesito que alguien me ayude con mi mascota.", art: ideaPet },
    { title: "Compra y entrega", line: "Lo compra, lo recoge o lo lleva.", prompt: "Necesito que alguien compre algo y me lo entregue.", art: ideaDeliver },
  ];

  if (creating !== null) {
    return (
      <CreateFavorFlow
        initialText={creating}
        countryCode={countryCode}
        languageCode={languageCode}
        currencyCode={currencyCode}
        onPublished={async (favor) => {
          const published = await publishFavor(favor);
          setPublishedId(published.id);
          return published;
        }}
        onClose={() => {
          setCreating(null);
          setDraftText("");
          setTab("favors");
        }}
      />
    );
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      <PaymentReturnNotice />
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-8 lg:pt-8">
        {tab !== "profile" && (
          <header className="glass-chip sticky top-3 z-20 flex items-center justify-between rounded-full py-1.5 pl-2 pr-1.5 shadow-soft backdrop-blur-xl" style={{ background: "color-mix(in oklab, var(--background) 92%, transparent)" }}>
            <div className="flex items-center gap-2.5">
              <span className="grid size-10 place-items-center overflow-hidden rounded-full bg-stage ring-1 ring-neon-blue/30">
                <img src={symbolArt} alt="" width={629} height={610} className="size-[88%] object-contain" />
              </span>
              <span className="text-lg leading-none text-foreground">
                <Wordmark />
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              <BellButton unread={unreadNotifications} onClick={() => setNotifOpen(true)} />
              <Button
                aria-label="Abrir perfil"
                variant="soft"
                size="iconLg"
                className="rounded-full"
                onClick={() => setTab("profile")}
              >
                <CircleUserRound />
              </Button>
            </div>
          </header>
        )}
        {tab === "home" && (
          <>
            {/* 1 — Hero scene: the ring lives inside the universe, the portal sits in front of it. */}
            <section onPointerMove={trackPointer} onPointerLeave={untrackPointer} className="hero-scene step-enter relative -mx-4 mt-3 overflow-hidden sm:-mx-8 sm:rounded-[2.25rem]">
              <img
                src={heroScene}
                alt=""
                width={1600}
                height={907}
                className="hero-scene-img absolute inset-0 h-full w-full object-cover object-[72%_center]"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,var(--background)_8%,color-mix(in_oklab,var(--background)_70%,transparent)_45%,transparent_75%)] max-lg:bg-[linear-gradient(180deg,transparent_20%,color-mix(in_oklab,var(--background)_75%,transparent)_55%,var(--background)_92%)]" />
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
              <span aria-hidden="true" className="particles" />
              <SpaceLayer count={70} orbit={{ x: "74%", y: "40%" }} />
              <div className="relative z-10 px-5 pb-10 pt-[46vw] sm:px-10 sm:pt-[34vw] lg:max-w-[46rem] lg:px-14 lg:pb-16 lg:pt-20">
                <p className="eyebrow inline-flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-neon-red shadow-[0_0_10px_var(--neon-red)]" />
                  Anyone can help.
                </p>
                <h1 className="mt-4 font-display text-[2.6rem] font-bold leading-[0.98] tracking-[-0.04em] text-foreground sm:text-[4.25rem]">
                  ¿En qué podemos
                  <br />
                  <span className="neon-text">ayudarte</span> hoy?
                </h1>

                <div className="command-card mt-8">
                  <label htmlFor="favor" className="sr-only">
                    Cuéntanos qué necesitas
                  </label>
                  <div className="relative">
                    <Search className="field-icon text-neon-blue" />
                    <Input
                      id="favor"
                      className="h-16 rounded-[1.25rem] border-transparent bg-background/60 pl-12 text-base focus-visible:border-neon-blue/50 focus-visible:ring-neon-blue/20"
                      placeholder="Cuéntanos qué necesitas..."
                      value={draftText}
                      onChange={(event) => setDraftText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setCreating(draftText);
                      }}
                    />
                  </div>
                  <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
                    {examples.slice(0, 4).map((idea) => (
                      <button
                        key={idea.title}
                        type="button"
                        className="suggest-chip"
                        onClick={() => setCreating(idea.prompt)}
                      >
                        <img src={idea.art} alt="" className="size-5 rounded-full object-cover" aria-hidden="true" />
                        {idea.title}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="cta-help mt-3"
                    onClick={() => setCreating(draftText)}
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-stage-foreground/15">
                      <Plus className="size-5" />
                    </span>
                    <span className="flex-1 text-left">
                      <span className="block font-display text-base font-bold">Crear un favor</span>
                      <span className="block text-xs font-medium opacity-80">Pide ayuda en segundos</span>
                    </span>
                    <ChevronRight className="size-5 opacity-80" />
                  </button>
                </div>
              </div>
            </section>

            {/* 2 — Discovery: each idea is an object, the name is secondary. */}
            <section className="mt-14" aria-labelledby="future-examples">
              <div className="flex items-end justify-between gap-4">
                <h2 id="future-examples" className="font-display text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-3xl">
                  Pide lo que <span className="text-neon-red">sea</span>
                </h2>
                <span className="text-xs font-semibold text-muted-foreground">¿También puedo pedir eso? Sí.</span>
              </div>
              <div className="object-rail no-scrollbar mt-5" role="list">
                {examples.map((idea, index) => (
                  <button
                    key={idea.title}
                    type="button"
                    role="listitem"
                    data-accent={index % 3 === 1 ? "red" : "blue"}
                    className="object-tile group"
                    title={idea.prompt}
                    onClick={() => setCreating(idea.prompt)}
                  >
                    <span className="object-stage">
                      <img src={idea.art} alt="" width={440} height={440} loading="lazy" />
                      <span className="object-go" aria-hidden="true">
                        <ChevronRight className="size-4" />
                      </span>
                      <span className="object-caption">
                        <span className="block font-display text-[15px] font-semibold leading-tight text-foreground">
                          {idea.title}
                        </span>
                        <span className="mt-1 block text-[11.5px] leading-snug text-muted-foreground">{idea.line}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* 3 — Bridge: asking for help <-> offering help. */}
            <div className="help-bridge mt-24" aria-hidden="true">
              <span className="help-bridge-side">
                <small>Pedir ayuda</small>
                Lo que necesito
              </span>
              <i><b /></i>
              <span className="help-bridge-side">
                <small>Ofrecer ayuda</small>
                Lo que puedo hacer
              </span>
            </div>

            {/* 4 — Opportunities: panoramic service banners, a different language from favors. */}
            <section className="mt-12" aria-labelledby="opportunities-home">
              <p className="eyebrow">Oportunidades</p>
              <h2 id="opportunities-home" className="mt-2 max-w-2xl font-display text-3xl font-bold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-4xl">
                Convierte lo que sabes hacer en una <span className="text-brand-light">oportunidad</span>.
              </h2>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
                Ofrece tu profesión, tu oficio, tus conocimientos, tus habilidades o tu tiempo.<span className="mt-1 block text-foreground/80">Encuentra personas que necesitan lo que tú sabes hacer.</span>
              </p>
              <div className="opp-rail opp-network no-scrollbar mt-8">
                {opportunityScenes.map((scene, i) => (
                  <button
                    key={scene.kicker}
                    type="button"
                    className="opp-card group"
                    data-accent={scene.accent}
                    onClick={openOpportunities}
                  >
                    <span className="opp-media">
                      <img src={scene.image} alt="" width={1200} height={675} loading="lazy" />
                      <span className="opp-nodes" aria-hidden="true"><i /><i /><i /></span>
                      <span className="opp-sheen" aria-hidden="true" />
                    </span>
                    <span className="opp-body">
                      <span className="opp-step"><i />0{i + 1} · {scene.step}</span>
                      <span className="opp-kicker">{scene.kicker}</span>
                      <span className="mt-2 block font-display text-lg font-semibold leading-tight text-foreground sm:text-xl">
                        {scene.title}
                      </span>
                      <span className="opp-copy">{scene.copy}</span>
                      <span className="opp-examples">{scene.examples}</span>
                      <span className="mt-3 flex flex-wrap gap-1.5">
                        {scene.tags.map((tag) => (
                          <span key={tag} className="opp-tag">{tag}</span>
                        ))}
                      </span>
                      <span className="opp-cta">
                        {scene.cta} <ChevronRight className="size-3.5" />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="opp-closing mt-8">
                <p className="font-display text-lg font-semibold text-foreground">¿No encontraste tu categoría?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No necesitas encajar en una categoría para tener algo que ofrecer.
                  <span className="block">Si sabes hacer algo que otra persona necesita, puedes convertirlo en una oportunidad.</span>
                </p>
                <button type="button" className="opp-explore mt-4" onClick={openOpportunities}>
                  Explorar oportunidades <ChevronRight className="size-4" />
                </button>
              </div>
            </section>

            {/* 5 — How it works: three lights on one line. */}
            <section className="relative mt-20 mb-6" aria-labelledby="how-it-works">
              <h2 id="how-it-works" className="text-center font-display text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-3xl">
                Así de simple
              </h2>
              <ol className="flow-line mt-10 grid gap-10 sm:grid-cols-3 sm:gap-6">
                {(
                  [
                    [MessageSquareText, "Cuéntalo", "Escribe lo que necesitas."],
                    [HandHeart, "Alguien acepta", "Personas cerca te ayudan."],
                    [CircleCheckBig, "Listo", "Confirmas y calificas."],
                  ] as const
                ).map(([Icon, title, copy], index) => (
                  <li key={title} className="flow-step" data-accent={index === 1 ? "red" : "blue"}>
                    <span className="flow-dot">
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                    <strong className="mt-4 block font-display text-lg font-semibold text-foreground">{title}</strong>
                    <span className="mt-1 block text-sm text-muted-foreground">{copy}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>

      {tab === "favors" && (
        <FavorsScreen
          languageCode={languageCode}
          initialFavorId={publishedId}
          onCreate={() => {
            setPublishedId(null);
            setTab("home");
            setCreating("");
          }}
        />
      )}

      {tab === "opportunities" && (
        <OpportunitiesScreen
          countryCode={countryCode}
          languageCode={languageCode}
          currencyCode={currencyCode}
        />
      )}

      {tab === "profile" && (
        <ProfileScreen
          onSwitchToWorker={onSwitchToWorker}
          onOpenNotifications={() => setNotifOpen(true)}
          unreadNotifications={unreadNotifications}
          onNavigate={openTarget}
        />
      )}
      <NotificationsCenter open={notifOpen} onOpenChange={setNotifOpen} onNavigate={openTarget} />

      <nav
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        aria-label="Navegación principal"
      >
        <div className="orb-nav mx-auto max-w-md">
          {(
            [
              ["home", Home, "Inicio"],
              ["favors", Sparkles, "Favores"],
              ["opportunities", Briefcase, "Oportunidades"],
              ["profile", CircleUserRound, "Perfil"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              data-world={key}
              data-active={tab === key ? "" : undefined}
              className="orb-nav-item"
              aria-current={tab === key ? "page" : undefined}
              onClick={() => {
                setPublishedId(null);
                setTab(key);
              }}
            >
              <span className="orb-nav-world" aria-hidden>
                <span className="orb-nav-orbit" />
                <span className="orb-nav-spark" />
                <Icon className="orb-nav-icon" strokeWidth={1.8} />
              </span>
              <span className="orb-nav-label">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

/* ---------------------------------------------------------- onboarding -- */

function Onboarding({
  countryCode,
  languageCode,
  currencyCode,
  setCountryCode,
  setLanguageCode,
  setCurrencyCode,
  onAuth,
}: {
  countryCode: string;
  languageCode: string;
  currencyCode: string;
  setCountryCode: (value: string) => void;
  setLanguageCode: (value: string) => void;
  setCurrencyCode: (value: string) => void;
  onAuth: (mode: AuthMode) => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const country = countries.find((item) => item.code === countryCode) ?? countries[0];
  const language = languages.find((item) => item.code === languageCode) ?? languages[0];
  const currency = currencies.find((item) => item.code === currencyCode) ?? currencies[0];
  if (!country || !language || !currency) return null;

  const back = backMap[step];
  const progressIndex = stepOrder.indexOf(step);

  return (
    <Shell
      stepKey={step}
      onBack={back ? () => setStep(back) : undefined}
      progress={
        progressIndex >= 0 ? { current: progressIndex + 1, total: stepOrder.length } : undefined
      }
    >
      {step === "welcome" && (
        <>
          <div className="lg:hidden">
            <img src={welcomeIcon} alt="AnyOne16" width={1024} height={1024} className="mark-float mx-auto w-56 rounded-[26%] ring-1 ring-stage-foreground/10 shadow-[0_30px_80px_-24px_var(--neon-blue)]" />
          </div>
          <p className="mt-10 text-sm font-bold text-primary lg:mt-0">Anyone can help.</p>
          <h1 className="mt-3 font-display text-[2.65rem] font-extrabold leading-[1.05] text-foreground">
            Necesitas algo.
            <br />
            <span className="text-primary">Alguien puede</span>
            <br />
            ayudarte.
          </h1>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-muted-foreground">
            Conecta con personas que pueden darte una mano con las cosas de todos los días.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-2 text-center">
            <div className="config-chip">
              <span>{country.flag}</span>
              <b>{country.name}</b>
            </div>
            <div className="config-chip">
              <Globe2 />
              <b>{language.name}</b>
            </div>
            <div className="config-chip">
              <span className="font-display font-extrabold">{currency.code}</span>
              <b>Tu moneda</b>
            </div>
          </div>
          <Button className="mt-8 w-full" size="touch" onClick={() => setStep("country")}>
            Comenzar
            <ChevronRight />
          </Button>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="secondary" size="touch" className="whitespace-normal px-3 text-sm leading-tight sm:text-base" onClick={() => onAuth("signup")}>
              Crear una cuenta
            </Button>
            <Button variant="secondary" size="touch" className="whitespace-normal px-3 text-sm leading-tight sm:text-base" onClick={() => onAuth("login")}>
              Ya tengo una cuenta
            </Button>
          </div>
        </>
      )}

      {step === "country" && (
        <>
          <p className="eyebrow">Primero, tu ubicación</p>
          <h1 className="screen-title">¿En qué país estás?</h1>
          <p className="screen-copy">Esto nos ayudará a preparar una experiencia relevante.</p>
          <button
            type="button"
            className="selection-card mt-8"
            aria-pressed="true"
            onClick={() => setCountryCode("CO")}
          >
            <span className="text-3xl">{country.flag}</span>
            <span className="flex-1 text-left">
              <strong>{country.name}</strong>
              <small>Configuración inicial disponible</small>
            </span>
            <span className="selected-check">
              <Check />
            </span>
          </button>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Más países estarán disponibles próximamente.
          </p>
          <Button className="mt-8 w-full" size="touch" onClick={() => setStep("preferences")}>
            Continuar
            <ChevronRight />
          </Button>
        </>
      )}

      {step === "preferences" && (
        <>
          <p className="eyebrow">A tu manera</p>
          <h1 className="screen-title">Personaliza tu experiencia</h1>
          <p className="screen-copy">El idioma y la moneda son independientes de tu país.</p>
          <div className="mt-8 space-y-5">
            <SelectField
              label="Idioma"
              value={languageCode}
              onValueChange={setLanguageCode}
              options={languages}
            />
            <SelectField
              label="Moneda"
              value={currencyCode}
              onValueChange={setCurrencyCode}
              options={currencies.map((item) => ({ ...item, name: formatCurrencyName(item) }))}
            />
          </div>
          <div className="mt-5 flex gap-3 rounded-2xl bg-brand-soft p-4 text-sm leading-relaxed text-brand-dark">
            <Settings2 className="mt-0.5 size-5 shrink-0" />
            <p>
              Puedes usar <b>English con COP</b> o <b>Español con USD</b>. Tú decides.
            </p>
          </div>
          <Button className="mt-7 w-full" size="touch" onClick={() => setStep("summary")}>
            Revisar configuración
            <ChevronRight />
          </Button>
        </>
      )}

      {step === "summary" && (
        <>
          <p className="eyebrow">Todo listo</p>
          <h1 className="screen-title">Tu configuración</h1>
          <p className="screen-copy">Así personalizaremos AnyOne¹⁶ para ti.</p>
          <div className="mt-8 divide-y divide-border rounded-[24px] border border-border bg-card px-5 shadow-soft">
            <div className="summary-row">
              <span>
                <MapPin />
                País
              </span>
              <strong>{country.name}</strong>
            </div>
            <div className="summary-row">
              <span>
                <Globe2 />
                Idioma
              </span>
              <strong>{language.name}</strong>
            </div>
            <div className="summary-row">
              <span className="currency-glyph">$</span>
              <span className="sr-only">Moneda</span>
              <strong>{formatCurrencyName(currency)}</strong>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-3 text-sm text-muted-foreground">
            <Check className="size-5 text-success" />
            <span>Zona horaria: {country.timezone}</span>
          </div>
          <Button className="mt-8 w-full" size="touch" onClick={() => setStep("auth")}>
            Continuar
            <ChevronRight />
          </Button>
          <Button
            className="mt-2 w-full"
            variant="ghost"
            size="touch"
            onClick={() => setStep("preferences")}
          >
            Editar
          </Button>
        </>
      )}

      {step === "auth" && (
        <>
          <p className="eyebrow">Un último paso</p>
          <h1 className="screen-title">¿Cómo quieres continuar?</h1>
          <p className="screen-copy">Crea tu cuenta o entra para comenzar tu experiencia.</p>
          <div className="mt-8 space-y-3">
            <Button className="w-full" size="touch" onClick={() => onAuth("signup")}>
              <Mail />
              Crear una cuenta
            </Button>
            <Button
              className="w-full"
              variant="outline"
              size="touch"
              onClick={() => onAuth("login")}
            >
              Iniciar sesión
            </Button>
          </div>
        </>
      )}
    </Shell>
  );
}

/* --------------------------------------------------------------- root -- */

function ModeTransition({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="fixed inset-0 z-50 grid place-items-center bg-background/95 backdrop-blur-sm"
    >
      <div className="step-enter text-center">
        <p className="font-display text-lg font-extrabold text-foreground">
          AnyOne<sup>16</sup>
        </p>
        <p className="mt-3 font-display text-3xl font-extrabold text-primary">{label}</p>
      </div>
    </div>
  );
}

function Splash({ label }: { label: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="text-center">
        <HelpingMark className="mx-auto size-16 rounded-[20px]" />
        <p className="mt-5 text-sm text-muted-foreground">{label}</p>
      </div>
    </main>
  );
}

function AppRoot() {
  const { loading, user, profile, worker, mode, setMode } = useAuth();
  const [countryCode, setCountryCode] = useState(defaultMarketConfig.countryCode);
  const [languageCode, setLanguageCode] = useState(defaultMarketConfig.languageCode);
  const [currencyCode, setCurrencyCode] = useState(defaultMarketConfig.currencyCode);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [activating, setActivating] = useState(false);
  const [transition, setTransition] = useState<string | null>(null);

  useEffect(() => {
    if (worker) setActivating(false);
  }, [worker]);

  useEffect(() => {
    if (!transition) return;
    const timer = setTimeout(() => setTransition(null), 1100);
    return () => clearTimeout(timer);
  }, [transition]);

  const preferences = useMemo(
    () => ({
      countryCode: profile?.countryCode ?? countryCode,
      languageCode: profile?.languageCode ?? languageCode,
      currencyCode: profile?.currencyCode ?? currencyCode,
    }),
    [profile, countryCode, languageCode, currencyCode],
  );

  const switchMode = (next: AppMode) => {
    if (next === "worker" && !worker) {
      setActivating(true);
      return;
    }
    setTransition(next === "worker" ? "Ahora estás ayudando." : "Ahora estás buscando ayuda.");
    setMode(next);
  };

  if (loading) return <Splash label="Preparando AnyOne¹⁶…" />;

  if (!user) {
    return authMode ? (
      <AuthScreen
        mode={authMode}
        preferences={preferences}
        onBack={() => setAuthMode(null)}
        onMode={setAuthMode}
      />
    ) : (
      <Onboarding
        countryCode={countryCode}
        languageCode={languageCode}
        currencyCode={currencyCode}
        setCountryCode={setCountryCode}
        setLanguageCode={setLanguageCode}
        setCurrencyCode={setCurrencyCode}
        onAuth={setAuthMode}
      />
    );
  }

  if (!profile) return <Splash label="Preparando tu cuenta…" />;

  const overlay = (
    <>
      {transition ? <ModeTransition label={transition} /> : null}
      <LegalGate email={profile.email} />
    </>
  );

  if (activating && !worker) {
    return (
      <>
        <WorkerOnboarding onCancel={() => setActivating(false)} />
        {overlay}
      </>
    );
  }

  if (mode === "worker" && worker) {
    return (
      <>
        <WorkerApp languageCode={preferences.languageCode} onExit={() => switchMode("client")} />
        {overlay}
      </>
    );
  }

  return (
    <>
      <HomeScreen
        countryCode={preferences.countryCode}
        languageCode={preferences.languageCode}
        currencyCode={preferences.currencyCode}
        onSwitchToWorker={() => switchMode("worker")}
      />
      {overlay}
    </>
  );
}

export function StageOneApp() {
  return (
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  );
}
