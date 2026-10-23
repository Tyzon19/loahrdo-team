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

## Architecture rules
- Approval/rejection/resubmission rules live as pure functions in `src/lib/workflow.ts` (tested in `src/test/workflow.test.ts`); UI must call them, never mutate status directly — keeps the fixed approval order enforceable in one place.
- Data lives in MySQL (Laragon locally). Client code calls server functions from `src/server-functions.ts`; database and session logic stays server-only in `src/server/**`.
- Every server function calls `requireViewer()` and enforces role/ownership checks server-side. Requisitioners may only read their own requests and notifications.
- Schema changes go in `scripts/schema.sql`; local setup runs through `npm run db:setup` and `npm run db:seed`. No demo data is seeded.
- Emails are simulated as an in-app inbox (`/notifications`); never claim real delivery until an email service is connected.
