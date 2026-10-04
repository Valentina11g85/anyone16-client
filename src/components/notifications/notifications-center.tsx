/**
 * Notifications center — list from Foundation, read/unread, open related context.
 */
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Briefcase,
  CheckCheck,
  ChevronDown,
  CreditCard,
  Handshake,
  MessageCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OrderBreakdown } from "@/components/payments/payment-order-checkout";
import { useAuth } from "@/lib/auth-context";
import { useMarketplace } from "@/lib/marketplace-store";
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKind,
  useNotifications,
  type AppNotification,
} from "@/lib/notifications-store";
import { subscribeLive } from "@/lib/realtime";
import { requestOpportunityFocus, sectionForType } from "@/lib/opportunities-focus";
import { getPaymentState, refreshPayments, usePayments } from "@/lib/payment-store";

export type NotificationTarget = "favors" | "opportunities" | "worker-offers";

/** Keeps notifications fresh while signed in (reload + 30 s polling). */
export function useNotificationsSync() {
  const { profile } = useAuth();
  const id = profile?.id ?? null;
  useEffect(() => {
    void loadNotifications(id);
    if (!id) return;
    return subscribeLive({
      name: `notif-${id}`,
      tables: [{ table: "notifications", filter: `profile_id=eq.${id}` }],
      onChange: () => void loadNotifications(id),
      fallbackMs: 30000,
    });
  }, [id]);
  const s = useNotifications();
  return s.items.filter((n) => !n.isRead).length;
}

export function BellButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  // The badge lives outside the button: buttons clip their overflow for the sheen effect.
  return (
    <span className="relative inline-flex">
      <Button
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
        variant="soft"
        size="iconLg"
        onClick={onClick}
      >
        <Bell />
      </Button>
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-1.5 -top-1.5 z-10 min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] font-bold leading-5 text-destructive-foreground shadow-sm ring-2 ring-background"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </span>
  );
}

export function NotificationsCenter({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onNavigate: (t: NotificationTarget) => void;
}) {
  const { profile, worker } = useAuth();
  const marketplace = useMarketplace();
  const s = useNotifications();
  const [err, setErr] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const unread = s.items.filter((n) => !n.isRead).length;

  useEffect(() => {
    if (open) void loadNotifications(profile?.id ?? null);
  }, [open, profile?.id]);

  const [expanded, setExpanded] = useState<string | null>(null);

  const markRead = (n: AppNotification) => {
    if (!n.isRead) void markNotificationRead(n.id).catch(() => setErr("No pudimos marcarla como leída."));
  };

  const toggle = (n: AppNotification) => {
    setErr(null);
    markRead(n);
    setExpanded((cur) => (cur === n.id ? null : n.id));
  };

  const openItem = async (n: AppNotification) => {
    setErr(null);
    if (!n.isRead) await markNotificationRead(n.id).catch(() => setErr("No pudimos marcarla como leída."));
    if (n.relatedPaymentOrderId) {
      setPaymentId(n.relatedPaymentOrderId);
      void refreshPayments();
      return;
    }
    if (n.relatedServiceListingId || n.relatedServiceOfferId || n.type.startsWith("service")) {
      // Open the exact listing/negotiation/contract the notification refers to.
      requestOpportunityFocus({
        listingId: n.relatedServiceListingId,
        offerId: n.relatedServiceOfferId,
        section: sectionForType(n.type),
      });
      onOpenChange(false);
      onNavigate("opportunities");
      return;
    }
    if (n.relatedFavorId || n.relatedOfferId) {
      onOpenChange(false);
      // Workers go to their own offers/active favor (tracking + chat), never the client's list.
      const favorId =
        n.relatedFavorId ?? marketplace.offers.find((o) => o.id === n.relatedOfferId)?.favorId ?? null;
      const favor = favorId ? marketplace.favors.find((f) => f.id === favorId) : undefined;
      const mine = favor ? favor.userId === profile?.id : !worker;
      onNavigate(worker && !mine ? "worker-offers" : "favors");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="nt-sheet flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="nt-head">
          <span className="nt-head-glow" aria-hidden="true" />
          <p className="eyebrow relative text-[11px] font-bold uppercase">Centro de actividad</p>
          <div className="relative flex items-end justify-between gap-3">
            <SheetTitle className="font-display text-2xl font-extrabold tracking-tight">Notificaciones</SheetTitle>
            {unread > 0 && (
              <button
                type="button"
                className="nt-markall"
                onClick={() => void markAllNotificationsRead().catch(() => setErr("No pudimos marcarlas como leídas."))}
              >
                <CheckCheck className="size-3.5" aria-hidden="true" /> Marcar todas como leídas
              </button>
            )}
          </div>
          <p className="relative mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {unread > 0 ? (
              <>
                <span className="nt-live" aria-hidden="true" />
                <span><b className="text-foreground">{unread}</b> {unread === 1 ? "nueva" : "nuevas"}</span>
              </>
            ) : (
              "Sin nuevas notificaciones"
            )}
          </p>
        </SheetHeader>

        <div className="nt-list">
          {err && <p className="mb-3 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{err}</p>}

          {s.status === "loading" && s.items.length === 0 && (
            <div className="space-y-2" aria-busy="true" aria-label="Cargando notificaciones">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="nt-item nt-skel" aria-hidden="true">
                  <span className="nt-icon" />
                  <span className="flex-1 space-y-2">
                    <span className="block h-2.5 w-20 rounded-full bg-muted" />
                    <span className="block h-3.5 w-3/4 rounded-full bg-muted" />
                  </span>
                </div>
              ))}
            </div>
          )}

          {s.status === "error" && (
            <div className="nt-state">
              <span className="nt-state-icon" data-tone="red"><AlertTriangle className="size-6" aria-hidden="true" /></span>
              <p className="mt-4 font-display text-lg font-bold text-foreground">No pudimos cargar tus notificaciones.</p>
              <Button className="mt-4" variant="secondary" onClick={() => void loadNotifications(profile?.id ?? null)}>
                <RefreshCw aria-hidden="true" /> Reintentar
              </Button>
            </div>
          )}

          {(s.status === "ready" || s.status === "idle") && s.items.length === 0 && (
            <div className="nt-state">
              <span className="nt-state-icon" data-tone="green"><CheckCheck className="size-7" aria-hidden="true" /></span>
              <p className="mt-4 font-display text-xl font-bold text-foreground">Todo al día</p>
              <p className="mt-1 text-sm text-muted-foreground">No tienes notificaciones nuevas.</p>
            </div>
          )}

          <ul className="space-y-2">
            {s.items.map((n, i) => {
              const fam = familyOf(n.type);
              const Icon = FAMILY[fam].icon;
              const isOpen = expanded === n.id;
              const action = actionLabel(n);
              return (
                <li key={n.id} className="nt-in" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                  <div className="nt-item" data-tone={toneOf(n.type, fam)} data-unread={!n.isRead} data-open={isOpen}>
                    <button type="button" className="nt-row" aria-expanded={isOpen} onClick={() => toggle(n)}>
                      <span className="nt-icon" aria-hidden="true"><Icon className="size-[18px]" strokeWidth={1.8} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="nt-kind">{notificationKind(n.type)}</span>
                          <span className="nt-time">
                            {new Date(n.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </span>
                        <span className="nt-title">{n.title}</span>
                        {n.body && !isOpen && <span className="nt-body line-clamp-1">{n.body}</span>}
                      </span>
                      <span className="nt-side">
                        {!n.isRead ? <span className="nt-dot" aria-label="No leída" /> : <span className="sr-only">Leída</span>}
                        <ChevronDown className="nt-chev size-4" aria-hidden="true" />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="nt-detail">
                        {n.body && <p className="text-sm leading-relaxed text-muted-foreground">{n.body}</p>}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground">{n.isRead ? "Leída" : "No leída"}</span>
                          {action && (
                            <button type="button" className="nt-action" onClick={() => void openItem(n)}>
                              {action}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <PaymentDetail id={paymentId} onClose={() => setPaymentId(null)} />
      </SheetContent>
    </Sheet>
  );
}

type Family = "proposal" | "payment" | "contract" | "review" | "security" | "message" | "system";

const FAMILY: Record<Family, { icon: LucideIcon; tone: string }> = {
  proposal: { icon: Handshake, tone: "blue" },
  payment: { icon: CreditCard, tone: "amber" },
  contract: { icon: Briefcase, tone: "green" },
  review: { icon: Star, tone: "amber" },
  security: { icon: ShieldAlert, tone: "red" },
  message: { icon: MessageCircle, tone: "blue" },
  system: { icon: Sparkles, tone: "violet" },
};

/** Visual family only — derived from the real notification type, nothing new stored. */
function familyOf(type: string): Family {
  const t = type.toLowerCase();
  if (t.includes("disput") || t.includes("security") || t.includes("fraud")) return "security";
  if (t.startsWith("payment")) return "payment";
  if (t.startsWith("service_offer") || t === "service_counter_offer" || t.includes("offer")) return "proposal";
  if (t.startsWith("service_contract")) return "contract";
  if (t.startsWith("service_review") || t.includes("review") || t.includes("rating")) return "review";
  if (t.includes("message")) return "message";
  return "system";
}

function toneOf(type: string, fam: Family) {
  const t = type.toLowerCase();
  if (t === "payment_paid" || t === "payment_confirmed" || t.endsWith("completed") || t.endsWith("accepted")) return "green";
  if (t.endsWith("failed") || t.endsWith("rejected") || t.endsWith("cancelled")) return "red";
  return FAMILY[fam].tone;
}

function actionLabel(n: AppNotification): string | null {
  if (n.relatedPaymentOrderId) return "Ver pago";
  if (n.type.startsWith("service_contract") || n.type === "service_offer_accepted") return "Ver contratación";
  if (n.type.startsWith("service_review")) return "Ver calificación";
  if (n.type.startsWith("service_message")) return "Abrir chat";
  if (n.relatedServiceOfferId) return "Ver propuesta completa";
  if (n.relatedServiceListingId || n.type.startsWith("service")) return "Ver servicio";
  if (n.relatedFavorId || n.relatedOfferId) return "Ver favor";
  return null;
}

function PaymentDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  usePayments();
  const order = id ? getPaymentState().orders.find((o) => o.id === id) : null;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-[28px]">
        <SheetHeader>
          <SheetTitle className="font-display text-xl font-extrabold">Detalle del pago</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {order ? (
            <>
              <p className="text-sm font-semibold">{order.description}</p>
              <OrderBreakdown order={order} />
              <p className="text-xs text-muted-foreground">Orden {order.id.slice(0, 8)}… · Estado según Foundation.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Consultando la orden en Foundation…</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
