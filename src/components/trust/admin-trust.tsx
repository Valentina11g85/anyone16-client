/**
 * Admin Trust & Safety console 🔴⚫ — every action is audited and reversible.
 * No automatic bans and no unilateral money movements.
 */

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createTrustTranslator } from "@/lib/trust-i18n";
import {
  loadCodeAttempts,
  loadPendingVerifications,
  restoreWorker,
  restrictWorker,
  setVerificationStatus,
  updateDisputeStatus,
} from "@/lib/trust-repo";
import { refreshTrust, useTrust } from "@/lib/trust-store";

type Row = Record<string, unknown>;

const Empty = ({ label }: { label: string }) => (
  <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
    {label}
  </p>
);

export function AdminTrust({
  languageCode,
  adminProfileId,
}: {
  languageCode: string;
  adminProfileId: string | null;
}) {
  const t = useMemo(() => createTrustTranslator(languageCode), [languageCode]);
  const trust = useTrust();
  const [pending, setPending] = useState<Awaited<ReturnType<typeof loadPendingVerifications>>>({
    identity: [],
    address: [],
    vehicles: [],
    background: [],
  });
  const [attempts, setAttempts] = useState<Row[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!trust.isAdmin) return;
    let alive = true;
    void Promise.all([loadPendingVerifications(), loadCodeAttempts()]).then(([rows, codes]) => {
      if (!alive) return;
      setPending(rows);
      setAttempts(codes);
    });
    return () => {
      alive = false;
    };
  }, [trust.isAdmin, reload]);

  if (!trust.isAdmin) return null;

  const after = async () => {
    await refreshTrust();
    setReload((value) => value + 1);
  };

  const verificationRows = [
    ...pending.identity.map((row) => ({ row, table: "worker_identity_verifications" as const })),
    ...pending.address.map((row) => ({ row, table: "worker_address_verifications" as const })),
    ...pending.vehicles.map((row) => ({ row, table: "worker_vehicles" as const })),
    ...pending.background.map((row) => ({ row, table: "worker_background_checks" as const })),
  ];

  const workers = Object.values(trust.workers).filter((worker) => !worker.isDemo);

  return (
    <section className="rounded-[22px] border border-foreground/20 bg-foreground/5 p-5">
      <h2 className="inline-flex items-center gap-2 font-display text-lg font-extrabold">
        <ShieldCheck className="size-5" aria-hidden="true" />
        {t("trust.admin.title")}
      </h2>

      <Tabs defaultValue="verifications" className="mt-4">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="verifications">{t("trust.admin.verifications")}</TabsTrigger>
          <TabsTrigger value="workers">{t("trust.admin.workers")}</TabsTrigger>
          <TabsTrigger value="disputes">{t("trust.admin.disputes")}</TabsTrigger>
          <TabsTrigger value="codes">{t("trust.admin.codes")}</TabsTrigger>
          <TabsTrigger value="risk">{t("trust.admin.risk")}</TabsTrigger>
        </TabsList>

        <TabsContent value="verifications" className="mt-3 space-y-2">
          <p className="rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t("trust.admin.providerNote")}
          </p>
          {verificationRows.length === 0 && <Empty label={t("trust.admin.empty")} />}
          {verificationRows.map(({ row, table }) => (
            <div key={`${table}-${String(row['id'])}`} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-bold">{table.replace("worker_", "").replace(/_/g, " ")}</p>
              <p className="text-xs text-muted-foreground">
                {String(row['status'])} · {String(row['worker_profile_id']).slice(0, 8)}
                {row['is_demo'] === true ? ` · ${t("trust.demo")}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void setVerificationStatus({
                      table,
                      id: String(row['id']),
                      workerProfileId: String(row['worker_profile_id']),
                      status: "in_review",
                    }).then(after)
                  }
                >
                  {t("trust.admin.review")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void setVerificationStatus({
                      table,
                      id: String(row['id']),
                      workerProfileId: String(row['worker_profile_id']),
                      status: "requires_review",
                    }).then(after)
                  }
                >
                  {t("trust.admin.requireReview")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void setVerificationStatus({
                      table,
                      id: String(row['id']),
                      workerProfileId: String(row['worker_profile_id']),
                      status: "flagged",
                      failureReason: "admin_flagged",
                    }).then(after)
                  }
                >
                  {t("trust.admin.flag")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void setVerificationStatus({
                      table,
                      id: String(row['id']),
                      workerProfileId: String(row['worker_profile_id']),
                      status: "rejected",
                      failureReason: "admin_rejected",
                    }).then(after)
                  }
                >
                  {t("trust.admin.reject")}
                </Button>
              </div>
            </div>
          ))}
        </TabsContent>


        <TabsContent value="workers" className="mt-3 space-y-2">
          {workers.length === 0 && <Empty label={t("trust.admin.empty")} />}
          {workers.map((worker) => (
            <div key={worker.workerProfileId} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-bold">
                {t("trust.level.label")} {worker.trustLevel} · {worker.city ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("trust.stats.completed")}: {worker.completedFavors} · {t("trust.stats.disputes")}:{" "}
                {worker.disputeCount} · {worker.restriction}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void restrictWorker({
                      workerProfileId: worker.workerProfileId,
                      kind: "temporarily_suspended",
                      reason: "admin_review",
                      adminProfileId,
                    }).then(after)
                  }
                >
                  {t("trust.admin.suspend")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void restoreWorker(worker.workerProfileId, adminProfileId).then(after)}
                >
                  {t("trust.admin.restore")}
                </Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="disputes" className="mt-3 space-y-2">
          {trust.disputes.length === 0 && <Empty label={t("trust.admin.empty")} />}
          {trust.disputes.map((row) => (
            <div key={String(row['id'])} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-bold">
                {String(row['category'] ?? row['reason'])} · {String(row['status'])}
                {row['is_demo'] ? " · DEMO" : ""}
              </p>
              <p className="text-xs text-muted-foreground">{String(row['description'] ?? "")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["under_review", "additional_info_required", "resolved", "closed"].map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void updateDisputeStatus({
                        disputeId: String(row['id']),
                        favorId: String(row['favor_id']),
                        status,
                        adminProfileId,
                      }).then(after)
                    }
                  >
                    {status}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="codes" className="mt-3 space-y-2">
          {attempts.length === 0 && <Empty label={t("trust.admin.empty")} />}
          {attempts.slice(0, 40).map((row) => (
            <div key={String(row['id'])} className="rounded-2xl border border-border bg-card p-3 text-sm">
              <p className="font-semibold">
                {row['succeeded'] ? "OK" : "FAIL"} · {String(row['favor_id']).slice(0, 8)}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(String(row['created_at'])).toLocaleString()}
              </p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="risk" className="mt-3 space-y-2">
          {trust.riskSignals.length === 0 && <Empty label={t("trust.admin.empty")} />}
          {trust.riskSignals.slice(0, 40).map((row) => (
            <div key={String(row['id'])} className="rounded-2xl border border-border bg-card p-3 text-sm">
              <p className="font-semibold">
                {String(row['signal'])} · {String(row['level'])}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(String(row['created_at'])).toLocaleString()}
              </p>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </section>
  );
}
