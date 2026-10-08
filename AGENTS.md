<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Oportunidades listing media lives in the private Foundation bucket `service-listing-media` (path `<profile>/<listing>/<kind>/<file>`); rows store `lm:<path>` refs and the UI resolves signed URLs — never store file data in listing rows.
- Notification deep links go through `src/lib/opportunities-focus.ts` using notification IDs, resolved only against RLS-loaded data.
- Oportunidades earnings/withdrawals: balances come only from Foundation (ledger `service_ledger`, RPC `get_my_service_balance`); browser never computes or writes balances — every write is a Foundation RPC (pending SQL in docs/foundation-pending/2026-10-07_oportunidades_ganancias_retiros.sql). Why: money must be server-authoritative and reconstructable.
- Legal/consent: published legal versions, acceptances and privacy requests live in Foundation and are written only via RPCs (pending SQL docs/foundation-pending/2026-10-07_legal_privacidad.sql); signup sends only the ticked boxes as account metadata and a Foundation trigger on profiles records them (published version, server time) in the profile-creation transaction; LegalGate blocks the UI and the trigger legal_enforce_gate (docs/foundation-pending/2026-10-08_legal_gate_server.sql) blocks writes on protected Favores/Oportunidades/Ganancias tables for authenticated users lacking mandatory acceptances, without touching their RLS; nothing in browser storage counts as consent. Drafts live in src/content/legal/drafts.ts and are never treated as in force. Why: consent must be server-stamped and versioned.
- Oportunidades premium access: decided only by Foundation (pending SQL docs/foundation-pending/2026-10-08_oportunidades_premium_access.sql). The marketplace is read only via RPC `get_opportunities_market` (not requested without access), one concrete listing only via `get_service_listing_for_me`, own listings via a direct select filtered by profile_id; never fall back to a direct service_listings select for the market and never redact client-side. The unlock button never grants access. Why: entitlement must be server-authoritative and the browser must not receive data it can't see.
- Oportunidades Premium purchase goes only through src/lib/opportunities-payment.ts (startOpportunitiesPremiumCheckout); it never grants access — only Foundation does, via a server-side webhook. Why: swap the payment provider without touching UI or trusting the browser.
