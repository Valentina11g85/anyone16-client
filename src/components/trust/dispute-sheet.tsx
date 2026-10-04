/**
 * Evidence-based dispute. Opening one snapshots the favor evidence bundle;
 * no decision is taken automatically for or against anybody.
 */

import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Favor } from "@/lib/favor-model";
import { createTrustTranslator } from "@/lib/trust-i18n";
import { DISPUTE_CATEGORIES, type DisputeCategory } from "@/lib/trust-model";
import { openTrustDispute } from "@/lib/trust-repo";
import { refreshTrust } from "@/lib/trust-store";

export function DisputeSheet({
  favor,
  open,
  onOpenChange,
  languageCode,
  profileId,
  role,
}: {
  favor: Favor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  languageCode: string;
  profileId: string | null;
  role: "customer" | "worker";
}) {
  const t = useMemo(() => createTrustTranslator(languageCode), [languageCode]);
  const [category, setCategory] = useState<DisputeCategory>("item_not_delivered");
  const [description, setDescription] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await openTrustDispute({
        favorId: favor.id,
        category,
        description,
        openedByProfileId: profileId,
        openedByRole: role,
        isDemo: !profileId,
      });
      await refreshTrust();
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-[26px]">
        <SheetHeader>
          <SheetTitle className="inline-flex items-center gap-2">
            <ShieldAlert className="size-5" aria-hidden="true" />
            {t("trust.dispute.title")}
          </SheetTitle>
        </SheetHeader>

        {done ? (
          <p className="mt-4 rounded-2xl bg-success/15 p-4 text-sm font-bold text-success">
            {t("trust.dispute.done")}
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            <p className="text-sm text-muted-foreground">{t("trust.dispute.neutral")}</p>
            <div className="flex flex-wrap gap-2">
              {DISPUTE_CATEGORIES.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  className="h-10 rounded-xl"
                  variant={category === item ? "default" : "secondary"}
                  aria-pressed={category === item}
                  onClick={() => setCategory(item)}
                >
                  {t(`trust.dispute.category.${item}` as never)}
                </Button>
              ))}
            </div>
            <Textarea
              rows={4}
              placeholder={t("trust.dispute.description")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <Button size="touch" disabled={!description || busy} onClick={() => void submit()}>
              {t("trust.dispute.submit")}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
