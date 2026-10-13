import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/api/public/payments/stripe/webhook";

// Isolated dummy values — never real secrets.
const SECRET = "whsec_isolated_unit_test";
const sign = async (payload: string) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

type Handler = (ctx: { request: Request }) => Promise<Response>;
const POST = (Route.options as unknown as { server: { handlers: { POST: Handler } } }).server.handlers.POST;

const call = (body: string, sig: string | null) =>
  POST({
    request: new Request("https://anyone16.com/api/public/payments/stripe/webhook", {
      method: "POST",
      body,
      headers: sig ? { "stripe-signature": sig } : {},
    }),
  });

describe("Stripe webhook route — signature gate (no network, no Foundation)", () => {
  const fetchSpy = vi.fn(async () => new Response("{}", { status: 500 }));
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("FOUNDATION_SERVICE_ROLE_KEY", "dummy_service_key");
    vi.stubEnv("STRIPE_LIVE_ENABLED", "");
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // An event type the handler ignores: proves the signature passed without touching Stripe/Foundation.
  const body = JSON.stringify({ id: "evt_unit", type: "unit.test.event", data: { object: { id: "x" } } });

  it("accepts a valid signature over the raw body and makes no external call", async () => {
    const t = Math.floor(Date.now() / 1000);
    const res = await call(body, `t=${t},v1=${await sign(`${t}.${body}`)}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ignored");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature with 400 and no external call", async () => {
    const t = Math.floor(Date.now() / 1000);
    const res = await call(body, `t=${t},v1=${"0".repeat(64)}`);
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a re-serialized (tampered) body", async () => {
    const t = Math.floor(Date.now() / 1000);
    const res = await call(body.replace("evt_unit", "evt_other"), `t=${t},v1=${await sign(`${t}.${body}`)}`);
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a correctly signed payload older than 5 minutes", async () => {
    const t = Math.floor(Date.now() / 1000) - 301;
    const res = await call(body, `t=${t},v1=${await sign(`${t}.${body}`)}`);
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing signature header", async () => {
    const res = await call(body, null);
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stays closed (503) with a live key while STRIPE_LIVE_ENABLED is off", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_dummy");
    const t = Math.floor(Date.now() / 1000);
    const res = await call(body, `t=${t},v1=${await sign(`${t}.${body}`)}`);
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
