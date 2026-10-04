/**
 * Decorative 3D scenes for Tus favores and Mis contrataciones / marketplace cards.
 * Purely visual: chosen from existing category codes, never stored anywhere.
 */
import type { PointerEvent } from "react";

import favLaundry from "@/assets/fav/fav-laundry.jpg";
import favPackages from "@/assets/fav/fav-packages.jpg";
import favShopping from "@/assets/fav/fav-shopping.jpg";
import favDocuments from "@/assets/fav/fav-documents.jpg";
import favWaiting from "@/assets/fav/fav-waiting.jpg";
import favFlowers from "@/assets/fav/fav-flowers.jpg";
import favGifts from "@/assets/fav/fav-gifts.jpg";
import favPets from "@/assets/fav/fav-pets.jpg";
import favOther from "@/assets/fav/fav-other.jpg";
import favLaundryB from "@/assets/fav/fav-laundry-b.jpg";
import favLaundryC from "@/assets/fav/fav-laundry-c.jpg";
import favPackagesB from "@/assets/fav/fav-packages-b.jpg";
import favPackagesC from "@/assets/fav/fav-packages-c.jpg";
import favShoppingB from "@/assets/fav/fav-shopping-b.jpg";
import favShoppingC from "@/assets/fav/fav-shopping-c.jpg";
import favDocumentsB from "@/assets/fav/fav-documents-b.jpg";
import favDocumentsC from "@/assets/fav/fav-documents-c.jpg";
import favWaitingB from "@/assets/fav/fav-waiting-b.jpg";
import favWaitingC from "@/assets/fav/fav-waiting-c.jpg";
import favFlowersB from "@/assets/fav/fav-flowers-b.jpg";
import favFlowersC from "@/assets/fav/fav-flowers-c.jpg";
import favGiftsB from "@/assets/fav/fav-gifts-b.jpg";
import favGiftsC from "@/assets/fav/fav-gifts-c.jpg";
import favPetsB from "@/assets/fav/fav-pets-b.jpg";
import favPetsC from "@/assets/fav/fav-pets-c.jpg";
import favOtherB from "@/assets/fav/fav-other-b.jpg";
import favOtherC from "@/assets/fav/fav-other-c.jpg";
import favEmpty from "@/assets/fav/fav-empty.jpg";
import svcDeveloper from "@/assets/svc/svc-developer.jpg";
import svcPhoto from "@/assets/svc/svc-photo.jpg";
import svcDesign from "@/assets/svc/svc-design.jpg";
import svcElectric from "@/assets/svc/svc-electric.jpg";
import svcTeach from "@/assets/svc/svc-teach.jpg";
import svcHome from "@/assets/svc/svc-home.jpg";
import svcRepair from "@/assets/svc/svc-repair.jpg";
import svcPro from "@/assets/svc/svc-pro.jpg";
import svcCare from "@/assets/svc/svc-care.jpg";
import svcMusic from "@/assets/svc/svc-music.jpg";
import svcBeauty from "@/assets/svc/svc-beauty.jpg";

export const FAVOR_EMPTY_ART = favEmpty;

/** Small per-category variant library (A/B/C). Chosen deterministically from the favor id. */
const FAVOR_ART: Record<string, string[]> = {
  laundry: [favLaundry, favLaundryB, favLaundryC],
  packages: [favPackages, favPackagesB, favPackagesC],
  shopping: [favShopping, favShoppingB, favShoppingC],
  documents: [favDocuments, favDocumentsB, favDocumentsC],
  waiting: [favWaiting, favWaitingB, favWaitingC],
  flowers: [favFlowers, favFlowersB, favFlowersC],
  gifts: [favGifts, favGiftsB, favGiftsC],
  pets: [favPets, favPetsB, favPetsC],
};
const FAVOR_OTHER = [favOther, favOtherB, favOtherC];

export const favorArtVariants = (category: string) => FAVOR_ART[category] ?? FAVOR_OTHER;

/** Stable hash of an id — never random, so a card keeps its look across visits. */
export function stableHash(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export const favorVariantIndex = (category: string, id: string) => stableHash(id) % favorArtVariants(category).length;

export const favorArt = (category: string, variant = 0) => {
  const list = favorArtVariants(category);
  return list[((variant % list.length) + list.length) % list.length];
};

const SERVICE_ART: Record<string, string> = {
  developer: svcDeveloper,
  consultant: svcDeveloper,
  photographer: svcPhoto,
  photography: svcPhoto,
  video: svcPhoto,
  designer: svcDesign,
  design: svcDesign,
  architect: svcDesign,
  electrician: svcElectric,
  technician: svcElectric,
  teacher: svcTeach,
  tutor: svcTeach,
  languages: svcTeach,
  translation: svcTeach,
  cleaning: svcHome,
  mechanic: svcRepair,
  plumber: svcRepair,
  construction: svcRepair,
  repairs: svcRepair,
  doctor: svcPro,
  lawyer: svcPro,
  accountant: svcPro,
  nanny: svcCare,
  pet_care: svcCare,
  cook: svcCare,
  driver: svcHome,
  music: svcMusic,
  editing: svcMusic,
  manicure: svcBeauty,
  hair: svcBeauty,
  makeup: svcBeauty,
};

export const serviceArt = (code: string) => SERVICE_ART[code] ?? svcPro;

/** Stable per-item framing so two cards of the same category never look identical. */
export function sceneVariant(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const x = 30 + (h % 41); // 30–70 %
  const y = 35 + ((h >> 6) % 31); // 35–65 %
  const flip = (h >> 11) % 3 === 0;
  const depth = 0.6 + ((h >> 13) % 5) / 10; // parallax strength 0.6–1.0
  return {
    "--sx": `${x}%`,
    "--sy": `${y}%`,
    "--sflip": flip ? "-1" : "1",
    "--sdepth": String(depth),
  } as React.CSSProperties;
}

/** Pointer-driven light + tilt; writes CSS vars only (no React state). */
export const tiltHandlers = {
  onPointerMove(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    el.style.setProperty("--rx", (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
    el.style.setProperty("--ry", (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
  },
  onPointerLeave(e: PointerEvent<HTMLElement>) {
    const el = e.currentTarget;
    el.style.setProperty("--rx", "0");
    el.style.setProperty("--ry", "0");
  },
};
