import { useEffect, useState } from "react";
import { LocateFixed, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  cacheCoarsePosition,
  readPermissionState,
  requestDeviceLocation,
  type LocationPermissionState,
} from "@/lib/device-location";
import type { Coords } from "@/lib/geo";
import type { Translator } from "@/lib/i18n";

/**
 * Contextual location prompt. It explains why we ask, it never blocks the app
 * and the user can always continue manually.
 */
export function LocationPermissionCard({
  t,
  onGranted,
  compact = false,
}: {
  t: Translator;
  onGranted?: (coords: Coords) => void;
  compact?: boolean;
}) {
  const [state, setState] = useState<LocationPermissionState>("unknown");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    void readPermissionState().then((value) => active && setState(value));
    return () => {
      active = false;
    };
  }, []);

  const ask = async () => {
    setBusy(true);
    try {
      const reading = await requestDeviceLocation();
      cacheCoarsePosition(reading.coords);
      setState("granted");
      onGranted?.(reading.coords);
    } catch {
      setState("denied");
    } finally {
      setBusy(false);
    }
  };

  if (dismissed || state === "granted" || state === "unavailable") return null;

  return (
    <section
      className={`rounded-[22px] border border-border bg-card p-4 ${compact ? "" : "sm:p-5"}`}
      aria-live="polite"
    >
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-primary">
          <LocateFixed className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm font-bold">{t("location.permission.title")}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {state === "denied" ? t("location.permission.denied") : t("location.permission.body")}
          </p>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
            {t("location.permission.privacy")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {state !== "denied" && (
              <Button size="sm" className="h-11 rounded-xl" disabled={busy} onClick={ask}>
                {busy ? t("common.loading") : t("location.permission.allow")}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="h-11 rounded-xl"
              onClick={() => setDismissed(true)}
            >
              {t("location.permission.manual")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
