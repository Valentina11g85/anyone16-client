import { describe, expect, it } from "vitest";

import { pickReturnOrigin, sessionToActivation, toMinorUnits, verifyStripeSignature, type StripeSession } from "@/lib/stripe-premium";

const SECRET = "whsec_test_dummy";
const hmac = async (payload: string) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const PROFILE = "11111111-2222-3333-4444-555555555555";
const base: StripeSession = {
  id: "cs_test_1",
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  amount_total: 400000,
  currency: "cop",
  livemode: false,
  client_reference_id: PROFILE,
  metadata: { product: "opportunities_premium", profile_id: PROFILE },
  payment_intent: "pi_test_1",
};

describe("Stripe signature", () => {
  const body = '{"id":"evt_1"}';
  const now = 1_800_000_000;
  it("accepts a valid signature", async () => {
    const h = `t=${now},v1=${await hmac(`${now}.${body}`)}`;
    expect(await verifyStripeSignature(body, h, SECRET, now)).toBe(true);
  });
  it("rejects a tampered body", async () => {
    const h = `t=${now},v1=${await hmac(`${now}.${body}`)}`;
    expect(await verifyStripeSignature('{"id":"evt_2"}', h, SECRET, now)).toBe(false);
  });
  it("rejects a wrong secret, missing header and old timestamps", async () => {
    const h = `t=${now},v1=${await hmac(`${now}.${body}`)}`;
    expect(await verifyStripeSignature(body, h, "whsec_other", now)).toBe(false);
    expect(await verifyStripeSignature(body, null, SECRET, now)).toBe(false);
    expect(await verifyStripeSignature(body, h, SECRET, now + 3600)).toBe(false);
  });
});

describe("Session → Foundation activation args", () => {
  it("maps a paid session (COP minor units → 4000 COP)", () => {
    expect(sessionToActivation(base, "checkout.session.completed")).toEqual({
      _profile_id: PROFILE,
      _provider: "stripe",
      _external_payment_id: "pi_test_1",
      _amount: 4000,
      _currency: "COP",
      _status: "confirmed",
      _live_mode: false,
    });
  });
  it("unpaid/async sessions are pending, failures are failed", () => {
    expect(sessionToActivation({ ...base, payment_status: "unpaid" }, "checkout.session.completed")?._status).toBe("pending");
    expect(sessionToActivation(base, "checkout.session.async_payment_failed")?._status).toBe("failed");
    expect(sessionToActivation({ ...base, status: "expired", payment_status: "unpaid" }, "checkout.session.expired")?._status).toBe("failed");
  });
  it("ignores sessions that are not ours or are inconsistent", () => {
    expect(sessionToActivation({ ...base, metadata: { product: "other", profile_id: PROFILE } }, "checkout.session.completed")).toBeNull();
    expect(sessionToActivation({ ...base, mode: "subscription" }, "checkout.session.completed")).toBeNull();
    expect(sessionToActivation({ ...base, client_reference_id: "not-a-uuid" }, "checkout.session.completed")).toBeNull();
    expect(
      sessionToActivation({ ...base, metadata: { product: "opportunities_premium", profile_id: "99999999-2222-3333-4444-555555555555" } }, "checkout.session.completed"),
    ).toBeNull();
    expect(sessionToActivation({ ...base, payment_intent: null }, "checkout.session.completed")).toBeNull();
  });
  it("passes the real amount/currency so Foundation can reject manipulated ones", () => {
    const a = sessionToActivation({ ...base, amount_total: 100, currency: "mxn" }, "checkout.session.completed");
    expect(a?._amount).toBe(1);
    expect(a?._currency).toBe("MXN");
  });
});

describe("helpers", () => {
  it("minor units and return origin allowlist", () => {
    expect(toMinorUnits(4000, "COP")).toBe(400000);
    expect(pickReturnOrigin("https://evil.example")).toBe("https://anyone16.com");
    expect(pickReturnOrigin("https://www.anyone16.com")).toBe("https://www.anyone16.com");
  });
});
