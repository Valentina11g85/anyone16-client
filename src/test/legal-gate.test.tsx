import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const acceptLegal = vi.fn().mockResolvedValue(undefined);
let ageConfirmed = false;
vi.mock("@/lib/legal", () => ({
  loadPendingLegal: vi.fn(async () => []),
  loadLegalStatus: vi.fn(async () => ({ complete: ageConfirmed, ageConfirmed })),
  acceptLegal: (...a: unknown[]) => { ageConfirmed = true; return acceptLegal(...a); },
}));
vi.mock("@/components/legal/legal-center", () => ({ LegalCenter: () => null }));

import { LegalGate } from "@/components/legal/legal-gate";

describe("LegalGate age confirmation", () => {
  it("shows an enabled CTA after ticking and records via the existing RPC", async () => {
    render(<LegalGate email="a@b.co" />);
    const btn = await screen.findByRole("button", { name: "Confirmar y continuar" });
    expect(btn.parentElement?.tagName).toBe("DIV"); // not a direct child hidden by [&>button]:hidden
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(acceptLegal).toHaveBeenCalledWith([], "update_prompt", true));
    await waitFor(() => expect(screen.queryByText("Confirma tu edad")).toBeNull());
  });
});
