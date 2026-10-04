/**
 * Oportunidades — listing photos / portfolio files in Foundation Storage.
 *
 * Files go to the private bucket LISTING_MEDIA_BUCKET under
 *   <author_profile_id>/<listing_id>/<photos|portfolio>/<uuid>.<ext>
 * The listing row stores only a reference ("lm:<object path>"), never the
 * file itself. Reading uses short-lived signed URLs, so Storage RLS (author
 * or anyone who can see the listing) decides access. Older rows that hold
 * data:/https URLs keep rendering as before.
 */
import { useEffect, useState } from "react";

import { foundation } from "@/integrations/foundation/client";

export const LISTING_MEDIA_BUCKET = "service-listing-media";
const PREFIX = "lm:";
const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_TTL = 60 * 60;

export type MediaKind = "photos" | "portfolio";

export const isStoredRef = (ref: string) => ref.startsWith(PREFIX);
export const isPdfRef = (ref: string) => /\.pdf($|\?)/i.test(ref) || ref.startsWith("data:application/pdf");

function extFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return file.type === "application/pdf" ? "pdf" : "jpg";
}

export function acceptFor(kind: MediaKind) {
  return kind === "photos" ? "image/*" : "image/*,application/pdf";
}

/** Uploads every file or throws with a user-readable reason; nothing is kept only in memory. */
export async function uploadListingMedia(
  files: File[],
  opts: { profileId: string | null; listingId: string; kind: MediaKind },
): Promise<string[]> {
  if (!opts.profileId) throw new Error("Inicia sesión para adjuntar archivos.");
  const allowed = (f: File) =>
    f.type.startsWith("image/") || (opts.kind === "portfolio" && f.type === "application/pdf");
  const bad = files.find((f) => !allowed(f));
  if (bad) throw new Error(`"${bad.name}" no es un formato permitido.`);
  const big = files.find((f) => f.size > MAX_BYTES);
  if (big) throw new Error(`"${big.name}" supera el máximo de 10 MB.`);

  const refs: string[] = [];
  for (const file of files) {
    const path = `${opts.profileId}/${opts.listingId}/${opts.kind}/${crypto.randomUUID()}.${extFor(file)}`;
    const { error } = await foundation.storage
      .from(LISTING_MEDIA_BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) {
      const msg = error.message || "";
      if (/bucket not found/i.test(msg)) {
        throw new Error(
          "El almacenamiento de archivos de Oportunidades aún no está configurado en Foundation.",
        );
      }
      throw new Error(`No se pudo subir "${file.name}": ${msg}`);
    }
    refs.push(PREFIX + path);
  }
  return refs;
}

/** Best effort: removes files the author dropped from the form. */
export async function removeListingMedia(refs: string[]) {
  const paths = refs.filter(isStoredRef).map((r) => r.slice(PREFIX.length));
  if (paths.length) await foundation.storage.from(LISTING_MEDIA_BUCKET).remove(paths);
}

const cache = new Map<string, { url: string; exp: number }>();

/** Resolves references to displayable URLs; refs the user can't access resolve to null. */
export function useListingMedia(refs: string[]): Array<string | null> {
  const key = refs.join("|");
  const initial = () =>
    refs.map((r) => (isStoredRef(r) ? (cache.get(r)?.url ?? null) : r));
  const [urls, setUrls] = useState<Array<string | null>>(initial);

  useEffect(() => {
    let alive = true;
    const now = Date.now();
    const need = refs.filter((r) => isStoredRef(r) && !((cache.get(r)?.exp ?? 0) > now));
    setUrls(initial());
    if (need.length === 0) return;
    void foundation.storage
      .from(LISTING_MEDIA_BUCKET)
      .createSignedUrls(
        need.map((r) => r.slice(PREFIX.length)),
        SIGNED_TTL,
      )
      .then(({ data }) => {
        (data ?? []).forEach((d, i) => {
          if (d.signedUrl) cache.set(need[i], { url: d.signedUrl, exp: Date.now() + (SIGNED_TTL - 60) * 1000 });
        });
        if (alive) setUrls(initial());
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
