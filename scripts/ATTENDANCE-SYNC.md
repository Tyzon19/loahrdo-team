# Google Sheets leave and attendance sync

This extends the existing `/leaves` and `/admin/late-absences` modules. Authentication, session cookies, VHTT, COE, Permission Slips, and Receipts remain in place. The repository uses SQL migrations with `mysql2`; no ORM or new dependency is introduced.

## Installation

1. Back up the existing database using your normal backup procedure.
2. Run `node scripts/migrate-attendance.mjs` against the existing `.env`. The normal runtime account may only have CRUD privileges. In that case provide `DB_MIGRATION_USER` and `DB_MIGRATION_PASSWORD` for a database account with CREATE privileges. Credentials are never printed. The migration only adds tables and is safe to rerun.
3. Set `HRDO_SHEETS_WEBHOOK_SECRET` to a randomly generated secret of at least 32 characters on the server. Set the existing `LATE_ABSENCES_NON_TEACHING_SPREADSHEET_ID`, `LATE_ABSENCES_COLLEGE_SPREADSHEET_ID`, and `LATE_ABSENCES_BASIC_ED_SPREADSHEET_ID` variables. Use raw IDs, not spreadsheet URLs. Alternatively existing `sheet_sources` rows remain valid source configuration. A tracker cannot push into another group's source.
4. Build/restart the existing application normally. Expose its existing host over public HTTPS so Google Apps Script can reach `/api/webhooks/sheets-sync`. Apps Script cannot reach a Laragon `localhost` URL.
5. In a standalone Google Apps Script project owned by an HRDO account with read access to all three trackers, paste `scripts/Code.gs`. Set Script Properties `WEBHOOK_URL`, `WEBHOOK_SECRET`, `NON_TEACHING_SPREADSHEET_ID`, `COLLEGE_SPREADSHEET_ID`, and `BASIC_ED_SPREADSHEET_ID`. Use the same secret as the server. Do not put the secret in a spreadsheet cell or frontend environment variable.
6. Run `install15MinuteTrigger` once and grant the Google authorization prompts. It replaces only this script's existing `syncAllStaffGroupsNow` triggers. Run `syncAllStaffGroupsNow` for the initial push. Check all three tracker statuses in the HRDO panel.

No service account key is needed. The previous onEdit script must be removed/disabled; the new script sends complete snapshots rather than requesting a server-side Google API pull. The old `/api/sheets/webhook` URL accepts the new snapshot contract during rollout, with the new header. Legacy name-mapping mutations and manual server-side pulls reject requests with upgrade instructions.

## Layout and balance rules

- `A1` and `A2` are authoritative for the starting month/year. Month banners and weekday headings are display-only. The supplied reference has a first banner inconsistent with these settings; the server deliberately derives dates from A1/A2 and the fixed offsets.
- Rows begin at 8. Blank rows remain in the snapshot so `(department_group, sheet_row_number)` never shifts during serialization.
- Columns B:NI contain exactly 12 blocks of 31 days. Impossible dates (such as June 31 or February 30) are skipped. Offsets restart at day 1 for every block, including year boundaries and leap years.
- NJ/NK are monthly/annual used totals; NW/NX/NY are authoritative remaining EL/SL/VL balances. Empty/error balances or unknown codes on valid dates reject the full snapshot, preserving the previous good data.
- `L`/`LATE` normalize to `LATE`, and `A`/`ABSENT` to `ABSENT`. Half-day codes are 0.5 days; daily full-day leave codes are 1 day.
- The 17-day baseline is EL 6 + SL 5 + VL 5 + birthday 1. As there is no remaining-birthday balance column, birthday remainder is derived from 1 + row-local BL carry over − birthday-coded days. The UI labels this calculation. EL/SL/VL carry-over balances are taken directly from the sheet totals, never inferred from notes.
- Only row-local remarks containing RESIGNED, RETIRED or CARRY OVER are included; adjacent auxiliary legend text is not presented as an employee remark.

## Identity and access

Leave & Attendance has its own `/leaves/login`, navigation shell, `attendance_sessions` table and HttpOnly `loa_attendance_session` cookie. It reuses the existing institutional account identity and password verification, including lockout rules. Its login never creates a VHTT, COE or Permission Slip session. Other-system cookies are not accepted as attendance sessions. Google sign-in uses `mode=attendance` on the existing OAuth endpoints and callback; no new Google Cloud client or callback registration is required. Redirects stay inside the attendance system.

No employee read accepts a profile ID, row number, account ID or name. Claim submission accepts only first name (all given names), middle initial, surname and department group. No roster/candidate list is returned to employees. Both the existing institutional domain and the specifically requested `lyceumofalabang.edu.ph` domain pass the attendance check; existing sign-in domain policy is unchanged.

Every claim requires HRDO approval, including a unique name whose email resembles firstname.lastname. This is the review option in the requested flow. Full given names are matched, so CARL CHRISTIAN never matches LARIZA or CARL alone. Duplicate rows show `DUPLICATE_REVIEW_REQUIRED` and require an explicit row selection. Database constraints enforce one account per profile and one profile per account. Pending names can be corrected by resubmitting the claim. HRDO administrator and Super Admin permissions are resolved from their existing database assignments after a separate attendance sign-in. Ordinary central Admins receive no new attendance authority.

New institutional identities created through attendance receive an `attendance_only_accounts` record. Other-system session issuers, session readers and shared Google callbacks reject those accounts. No COE profile is auto-created by attendance registration. Previously established LOA accounts retain their existing other-system permissions; no existing role or account is bulk revoked. Attendance logout clears only its own session. Account name completion and password changes remain inside `/leaves/account` and reuse the canonical account maintenance logic without issuing a main session.

Previously auto-created `employee_sheet_mappings`, legacy logs, balances, flags and notifications remain stored. They are not trusted as new identity claims or copied automatically: employees are verified against the synced row before viewing the new data.

Never sort, insert or replace named tracker rows after initial ingestion without an HR-reviewed row migration. If an existing row changes to another normalized full name, the entire snapshot is rejected with its row number rather than showing someone else's records to the linked account. Restore the original row positions to resume syncing, or perform a reviewed database/row mapping migration. Removed rows are marked inactive and hidden from employees, with historical incidents retained.

## Reliability

Sync is transactional and serialized per tracker. Snapshot UUID + payload hash prevents altered replays; retries of successful snapshots are no-ops. Older captures cannot overwrite newer data. New/corrected late/absence entries create in-app notifications only for the bound account; approval also delivers existing unacknowledged alerts. No notification is duplicated by unchanged snapshots or repeat approvals.

Incident changes increment a revision. Responses are checked against the current revision and session-owned profile. Corrected codes require acknowledgment again. Prior explanations remain in `attendance_incident_responses` and appear as historical responses in the HRDO panel. Cleared cells deactivate incidents rather than deleting them.

## Validation and rollback

Run `node scripts/test-attendance-db.mjs` for the integration acceptance tests. It creates and drops only a randomly named `loa_attendance_test_*` database, applies the complete schema and reruns the additive migration, then exercises the real MySQL queries. Optional connection variables are `ATTENDANCE_TEST_DB_HOST`, `ATTENDANCE_TEST_DB_PORT`, `ATTENDANCE_TEST_DB_USER`, and `ATTENDANCE_TEST_DB_PASSWORD`. It never selects the application's database. Run `npm test` for the repository suite and `npm run build` for the production build.

For a UI rollback, retain the new account-scope guards and session tables so attendance-only identities remain restricted. A full authentication rollback requires an explicit review of those identities first: older application versions do not enforce `attendance_only_accounts`. Keep the added tables to preserve claim and response history; no destructive down migration is required. Do not run the old automatic name-matching sync alongside the new workflow.
