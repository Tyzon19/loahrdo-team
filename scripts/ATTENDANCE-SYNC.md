# Google Sheets leave and attendance sync

This extends the existing `/leaves` and `/admin/late-absences` modules. Authentication, session cookies, VHTT, COE, Permission Slips, and Receipts remain in place. The repository uses SQL migrations with `mysql2`; no ORM or new dependency is introduced.

## Installation

1. Back up the existing database using your normal backup procedure.
2. Run `node scripts/migrate-attendance.mjs` against the existing `.env`. The normal runtime account may only have CRUD privileges. In that case provide `DB_MIGRATION_USER` and `DB_MIGRATION_PASSWORD` for a database account with CREATE privileges. Credentials are never printed. The migration only adds tables and is safe to rerun.
3. Set `HRDO_SHEETS_WEBHOOK_SECRET` to a randomly generated secret of at least 32 characters on the server. Set the existing `LATE_ABSENCES_NON_TEACHING_SPREADSHEET_ID`, `LATE_ABSENCES_COLLEGE_SPREADSHEET_ID`, and `LATE_ABSENCES_BASIC_ED_SPREADSHEET_ID` variables. Use raw IDs, not spreadsheet URLs. Alternatively existing `sheet_sources` rows remain valid source configuration. A tracker cannot push into another group's source.
4. Build/restart the existing application normally. Expose its existing host over public HTTPS so Google Apps Script can reach `/api/webhooks/sheets-sync`. Apps Script cannot reach a Laragon `localhost` URL.
5. In the HRDO Apps Script project, paste `scripts/Code.gs` into the attendance sync file. Configure Script Properties `WEBHOOK_URL`, `WEBHOOK_SECRET`, and the spreadsheet IDs for the trackers currently available: `NON_TEACHING_SPREADSHEET_ID`, `COLLEGE_SPREADSHEET_ID`, and/or `BASIC_ED_SPREADSHEET_ID`. At least one is required; each group must have a different tracker ID. Existing `HRDO_WEBHOOK_URL` and `HRDO_WEBHOOK_SECRET` properties remain supported. Use the same secret as the server. Do not put the secret in a spreadsheet cell or frontend environment variable.
6. Run `installRealtimeTriggers` once and grant any required Google authorization prompts. It replaces this user's old attendance timer/edit triggers with an installable edit trigger and a structural-change trigger for each configured workbook. Other jobs are preserved. Run `syncAllStaffGroupsNow` for the initial push.
7. If the tracker has `PreviousMonth` / `NextMonth` buttons, update those helpers using `scripts/TrackerNavigation.gs`. Script-driven cell changes do not fire edit triggers, so these helpers explicitly push the updated month. Other scripts/API writers must also call the sync after changing tracker values.

## Realtime test mode

There is no scheduled 15-minute wait. A manual edit anywhere in a configured workbook (including its holiday and working-day inputs) flushes formulas and pushes that workbook's complete STAFF snapshot. Structural changes also push; duplicate edit/change events and formatting-only changes are excluded. The script waits for an in-progress push rather than dropping the last edit. Google may queue trigger execution, so this is near-realtime, not a zero-latency guarantee.

Employee, HRDO admin, and director pages refresh every second, including while the page is in a background tab. `ATTENDANCE_REFRESH_MS` in `src/lib/attendance.ts` owns this temporary testing interval. Sheet edits made through Google APIs or other scripts do not fire installable edit triggers automatically; those writers must call the sync explicitly.

No service account key is needed. The previous onEdit script must be removed/disabled; the new script sends complete snapshots rather than requesting a server-side Google API pull. The old `/api/sheets/webhook` URL accepts the new snapshot contract during rollout, with the new header. Legacy name-mapping mutations and manual server-side pulls reject requests with upgrade instructions.

## Layout and balance rules

- `A1` is the currently selected month and `A2` is the tracker calendar year. A1 follows the active-month selector; changing it only changes the displayed month and must not shift record dates. The server maps the twelve 31-column blocks to January–December of A2.
- STAFF row 3 is read as the tracker-calculated working-day calendar. Its formulas reflect the workbook's selected weekdays and holidays; leave requests and tracker write-backs reject dates not marked `TRUE`. Missing or invalid flags reject the snapshot instead of assuming weekdays.
- All leave and attendance entries in the tracker calendar year are imported. A snapshot is authoritative within that year: existing entries absent from it are deactivated, and changed entries are updated without deleting their history. Previously synchronized years remain in employee history, and the month filter is built from all available record dates.
- Rows begin at 8. Blank rows remain in the snapshot so `(department_group, sheet_row_number)` never shifts during serialization.
- Columns B:NI contain exactly 12 blocks of 31 days. Impossible dates (such as June 31 or February 30) are skipped. Offsets restart at day 1 for every block, including year boundaries and leap years.
- NJ/NK are selected-month/cycle used totals; NW/NX/NY are authoritative remaining EL/SL/VL balances. Empty/error balances or unknown codes on valid dates reject the full snapshot, preserving the previous good data.
- `L`/`LATE` normalize to `LATE`, and `A`/`ABSENT` to `ABSENT`. Half-day codes are 0.5 days; daily full-day leave codes are 1 day.
- The combined annual credit ceiling is 17 days. `leavesThisYear` is derived from 17 minus the combined remaining EL, SL, VL, and Birthday balances in the latest tracker snapshot; it is not counted from dated history rows. HR approval checks those tracker balances and reserves credited approvals awaiting tracker sync, without applying separate hard-coded per-category limits. The displayed total is capped at 17, while each category balance mirrors its tracker total. Existing incidents are preserved rather than silently removed.
- The current leave-cycle dates still follow the tracker's selected calendar year. Employee-anniversary replenishment requires an authoritative hire-date/credit-anniversary field, which is not present in the current STAFF snapshot contract; do not infer it from A2.
- Only row-local remarks containing RESIGNED, RETIRED or CARRY OVER are included; adjacent auxiliary legend text is not presented as an employee remark.

### Reviewed credit inputs and formulas

| Sheet location                          | Owns                                               | Module handling                                                                                         |
| --------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A1/A2                                   | Selected month / calendar year                     | A1 only controls the displayed month; A2 determines January–December dates                             |
| A3 and B2                               | Selected-month control and displayed month          | NJ is this selected month, not necessarily today's calendar month                                       |
| B:NI                                    | January–December 31-day blocks of leave codes       | Synced history; impossible dates are skipped                                                            |
| Row 3 / row 4                         | Cycle / selected-month working-day flags | Row 3 is synchronized for leave-date validation; sheet formulas own usage calculations |
| Holidays!B2:B12; Sheet3!D1:E7; OD8:OE17 | Holiday dates, weekday lookup, working-day choices | Recalculated in Sheets before each snapshot                                                             |
| OA/OB code legend; NL5:NV5              | Code meanings and summary headings                 | Existing supported codes retain their meanings; changing codes requires matching application validation |
| NJ / NK                                 | Selected-month / cycle usage                       | Displayed directly from the snapshot                                                                    |
| NL:NV                                   | S, V, M, P, B, E, SP, SIL, HV, HS, HE breakup      | Drives the sheet's balance formulas; HR manual overrides are preserved                                  |
| NW                                      | `max(6 - (NQ + NV / 2), 0)`                        | TOTAL EL, including any HR formula adjustment                                                           |
| NX                                      | `max(5 - (NL + NU / 2), 0)`                        | TOTAL SL, including manual SL breakup adjustments                                                       |
| NY                                      | `max(5 - (NM + NT / 2), 0)`                        | TOTAL VL                                                                                                |
| NP + row-local BL carry-over remark     | Birthday usage and carried credits                 | Derived birthday remainder, separately identified in the UI                                             |

The reviewed workbook has numeric SL overrides at NL25 and NL63, and an individual schedule note at NL57. Its holiday list contains historical dates from 2018/2021. These are HR workbook inputs, not values for the application to silently replace; verify the intended holiday calendar and per-person adjustments with HR before relying on the totals as policy calculations. Realtime synchronization faithfully reflects the sheet's current computed values.

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
