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
- Oportunidades premium access (job offers / SEEK): access is decided only by Foundation (RPC `get_my_opportunities_access`, proposal in docs/foundation-pending/2026-10-08_PROPUESTA_oportunidades_acceso_premium.sql); the browser redacts locked listings via `src/lib/opportunities-access.ts` and the unlock button never grants access. Why: entitlement must be server-authoritative and tied to the account.
