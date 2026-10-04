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
