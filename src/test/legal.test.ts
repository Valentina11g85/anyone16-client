import { describe, expect, it } from "vitest";

import { LEGAL_DRAFTS, REQUIRES_ACCEPTANCE } from "@/content/legal/drafts";

describe("legal drafts", () => {
  it("are clearly marked as drafts", () => {
    for (const text of Object.values(LEGAL_DRAFTS)) expect(text).toContain("Borrador pendiente de revisión por abogado");
  });
  it("never claim registrations or certifications that do not exist", () => {
    const banned = [/100% legal/i, /DNDA registrad/i, /SIC registrad/i, /GDPR compliant/i, /ISO certif/i, /®/];
    for (const text of Object.values(LEGAL_DRAFTS)) for (const re of banned) expect(re.test(text)).toBe(false);
  });
  it("only core documents require acceptance", () => {
    expect(Object.entries(REQUIRES_ACCEPTANCE).filter(([, v]) => v).map(([k]) => k).sort()).toEqual(
      ["data_treatment", "privacy_policy", "terms"],
    );
  });
});
