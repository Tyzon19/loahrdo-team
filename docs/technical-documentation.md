---
title: LOA HRDO Desk Technical Documentation
description: Technical, operational, security, testing, deployment, and maintenance documentation for the LOA HRDO Desk.
---

# System overview

LOA HRDO Desk is an integrated employee-services platform for Lyceum of Alabang. It provides vehicle reservations and trip tickets, Certificate of Employment processing, Permission Slip processing, and leave and attendance access.

The platform replaces manual or fragmented handling of requests with role-based web workflows. It records request information, approval decisions, signatures, document outputs, notifications, and operational history in MySQL.

## System owner and operational boundaries

The Human Resources and Development Office owns the employee-service operations. The Physical Facilities Management Office owns vehicle reservations and trip-ticket operations. System owners, super administrators, module administrators, and designated approvers control access to their respective workflows.

## Project scope

The system includes:

- Institutional account authentication and account administration.
- Vehicle reservation submission, staged approval, fleet assignment, ticket generation, QR verification, and trip records.
- COE and employment verification requests, HRDO processing, document preparation, delivery status, and history.
- Permission Slip submission, department review, approval or rejection, receipts, and receipt delivery.
- Late and absence viewing, attendance synchronization, leave balances, and discrepancy submission.
- Role-based dashboards, records, notifications, reports, receipts, and audit history.

The system does not replace institutional policies, legal authority, or final human authorization. External systems remain subject to their own availability and account controls.

# System architecture

## Development stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TanStack Router, TanStack Query, Tailwind CSS |
| Backend | TanStack Start server functions |
| Language | TypeScript |
| Database | MySQL or MariaDB |
| Authentication | Institutional accounts, password sessions, Google OAuth, and OTP verification |
| Integrations | Google OAuth, Gmail, Google Sheets, QR generation |
| Development and testing | Vite, Vitest, Testing Library, ESLint |

The application follows a client-server architecture. React renders responsive pages and calls typed server functions or HTTP routes. Server functions validate input, enforce access, execute database operations, and integrate with external services.

## Major components

- Public service landing page and authentication pages.
- Main vehicle-ticket application and administrator area.
- Separate HRDO user and staff experience for COE operations.
- Separate Permission Slip session and employee/approver experience.
- Attendance and leave module for current institutional employees.
- MySQL persistence, session tables, audit history, and document storage.
- Gmail delivery for workflow and official-document messages.
- Google Sheets synchronization for attendance data.

# Modules

## Vehicle reservation and trip tickets

Requisitioners submit trip requests with destination, schedule, purpose, passengers, and supporting information. The Head of Transport Services performs the initial review and assigns the vehicle and driver. The Director for Administration and President complete subsequent approval stages.

Official tickets are generated after final approval. A signed QR code links to a public verification route. Administrators can search records, maintain fleet information, dispatch trips, complete requests, and review trip analytics.

## Certificate of Employment

Current employees sign in through the institutional HRDO flow. Former employees and verifiers may use a separate external Google OAuth flow. HRDO staff review requests, prepare or upload documents, await requestor review where applicable, mark requests ready, and record pickup or delivery.

COE workflows maintain status history and three-day processing expectations in the application.

## Permission Slip

Employees submit their department, requested date, departure time, return time, reason, and electronic signature. Assigned signatories review pending slips and approve or reject them.

The system stores employee and approver snapshots, status history, rejection reasons, official receipt images, and delivery information. Department signatories and administrators cannot bypass module-level access restrictions.

## Late and absences

Institutional employees view leave balances and synchronized attendance records. The system supports staff-group mappings, discrepancy flags, leave balances, and scheduled or event-driven synchronization from Google Sheets.

## Administration

Super administrators manage organization-wide access and module administration. Administrators manage users, signatories, records, reports, and module configuration according to their role.

The system includes:

- Vehicle signatory and assistant account management.
- Permission Slip administrator and signatory management.
- HRDO staff and processor account management.
- Password resets and forced password changes.
- Employee profile and department maintenance.
- Trip archive, analytics, receipt, and notification records.

# User roles

| Role | Responsibilities |
| --- | --- |
| Requisitioner or employee | Submit requests, maintain profiles, track status, and download authorized documents. |
| Transport head | Review transport requests and assign vehicles and drivers. |
| Director | Perform the assigned approval stage and authorization. |
| President | Approve or reject final-stage vehicle requests. |
| Department signatory | Review and decide assigned Permission Slip requests. |
| HRDO staff or processor | Review and process COE requests and documents. |
| Administrator | Manage assigned module operations, accounts, records, and reports. |
| Super administrator | Manage organization-wide access and high-level configuration. |
| External verifier | Use Google authentication to request or verify eligible external COE information. |

Role checks occur in route guards and server-side functions. UI visibility does not replace server authorization.

# Workflow

## Vehicle request workflow

1. An eligible requisitioner signs in or registers.
2. The requisitioner submits destination, purpose, travel schedule, passenger details, and supporting information.
3. The Transport Head reviews the request and assigns the vehicle and driver.
4. The Director for Administration and President review the request according to their assigned stages.
5. Final approval creates an official trip ticket.
6. The requester receives or downloads the ticket.
7. Staff dispatch and complete the trip.
8. The approved record remains searchable in trip history and analytics.

The public verification route validates the signed QR token and displays the authorized verification result.

## COE workflow

1. An internal employee or eligible external requester selects the appropriate request path.
2. The requester supplies purpose, delivery preference, personal information, and compensation preference if applicable.
3. HRDO staff verify and process the request.
4. Staff prepare or upload the document.
5. The requester receives status updates and review steps where required.
6. The record is marked ready and delivery or pickup is recorded.
7. Request history remains available to authorized users.

## Permission Slip workflow

1. An employee opens the Permission Slip service and signs in.
2. The employee enters department, date, departure time, return time, reason, and signature.
3. The system validates the input and saves the pending request.
4. An assigned department signatory reviews the request.
5. The signatory approves or rejects the slip.
6. Approval may generate and send an official receipt.
7. Employee and signatory history retain the decision and activity.

# Data management

MySQL or MariaDB is the primary persistent datastore. The database schema separates user accounts, module sessions, requests, signatures, history, notifications, attendance, documents, and configuration.

The main data areas include:

- `users`, institutional sessions, registration OTPs, and role assignments.
- `requests`, destinations, signatures, history, returns, dispatch records, and analytics.
- `permission_slips`, `permission_history`, Permission Slip sessions, and receipt images.
- `hrdo_users`, COE requests, COE documents, COE history, and HRDO sessions.
- `leave_balances`, `attendance_logs`, discrepancy flags, notifications, and synchronization logs.
- `vehicles`, signatory assignments, assistant assignments, document configuration, and notification attachments.

## Data integrity

The schema uses primary keys, unique email constraints, foreign keys, indexes, enum values, timestamps, and transactions where appropriate. Server-side validation verifies required fields, formats, role eligibility, state transitions, and authorization.

Sensitive session information uses server-side token records with hashed token values rather than exposing complete session tokens.

# API and integration behavior

## Server functions

TanStack Start server functions provide typed operations for authentication, requests, approvals, administration, attendance, notifications, and document delivery.

API routes provide browser-facing operations that include authentication callbacks and document or ticket verification.

## Authentication and authorization

- Password sessions are stored in server-side session tables and cookies.
- Password policies and account lockout rules are enforced.
- Forced password changes are required after temporary credentials.
- Institutional email restrictions are applied during eligible flows.
- Google OAuth is supported for institutional and separate external COE flows.
- OTP registration verifies institutional addresses before account creation.
- Permission Slip and HRDO modules use dedicated sessions and access checks.
- Role-based checks run before sensitive read, update, approval, and administration actions.

## Google and email integrations

Google OAuth authenticates supported flows. Gmail delivers workflow messages and official documents through a configured institutional sender account.

The sender is configured separately from recipient accounts. Delivery failures are reported to the operation and do not silently roll back committed request actions.

## Google Sheets integration

The Late and Absences module synchronizes data from configured Google Sheets sources. The synchronization process supports multiple staff groups and records sync and discrepancy information.

# Security and privacy

Security controls include server-side authorization, role restrictions, institutional email validation, OTP verification, password policy enforcement, session expiration, and audit history.

Personal and employee data is restricted to authorized system users. Confidential records are not exposed through public verification routes. Public QR verification exposes only the data permitted for authorized ticket verification.

Application and database credentials are loaded through environment variables. `.env` files must not be committed. Production secrets should be managed through the hosting platform or server environment.

Recommended operational controls include:

- HTTPS-only production access.
- Database users limited to required CRUD operations.
- Restricted administrative access.
- Rotation of OAuth credentials and signing secrets.
- Session and audit-log review.
- Regular database and document backups.
- Dependency and security updates.
- Validation of institutional email and account ownership.

# User interface

The interface uses responsive React components, Tailwind CSS, Radix UI primitives, accessible form controls, mobile navigation, clear status indicators, and server-side loading and error states.

Core interface areas include:

- Public service dashboard.
- Sign-in, registration, and password recovery.
- Employee request forms and dashboards.
- Approval queues and decision forms.
- Administrator dashboards and account management.
- Trip archive and analytics.
- HRDO request and document-processing views.
- Permission Slip request, review, profile, and history views.
- Attendance and leave records.

# Testing and quality assurance

Vitest and Testing Library cover application behavior and server-side rules. Existing test areas include:

- Approval workflows and access rules.
- Permission Slip access, approval, receipts, and signatory management.
- COE account access and dashboard behavior.
- Google sign-in eligibility and callback behavior.
- Gmail workflow delivery and email templates.
- Password validation and account security.
- Trip verification, request validation, archive filters, and analytics.
- Attendance mappings and discrepancy behavior.
- Destination search and destination analytics.

Automated tests do not replace browser UAT or production verification. Each release should include:

1. Unit tests for changed validation and business rules.
2. Integration tests for database and server functions.
3. Workflow tests for approval state transitions.
4. Browser testing for desktop and mobile layouts.
5. Authentication and authorization testing.
6. Email and third-party integration verification.
7. Database migration or setup verification.
8. Production smoke tests for critical routes.

# Deployment

## Environment setup

The application requires Node.js 20 or newer, npm, and MySQL or MariaDB. A production deployment requires a public origin, database credentials, OAuth credentials, a ticket-verification secret, and optional Google Sheets credentials.

The database setup and seed scripts create application tables and the initial administrator. They generate a database application password and environment values when supported.

## Environment configuration

Environment values include database host and credentials, public site URL, allowed institutional domains, ticket QR signing secret, Google OAuth credentials, Gmail sender credentials, and Google Sheets synchronization settings.

Environment-specific values must be reviewed before every deployment. Secrets must not be stored in source control or documentation pages.

## Deployment procedure

1. Prepare the target server and database.
2. Configure environment variables.
3. Run database setup and migrations.
4. Run the database seed only for initial setup or approved maintenance.
5. Install dependencies.
6. Run the test suite and production build.
7. Deploy the application to the production host.
8. Verify authentication, database connectivity, email, and external integrations.
9. Exercise one vehicle request, COE request, Permission Slip, and attendance flow.
10. Confirm logs and monitoring are active.

# Operations and administration

Administrators are responsible for account management, assigned approval assignments, signatory configuration, record integrity, operational reports, and supporting users.

Routine operations include:

- Review pending requests.
- Assign and replace approvers.
- Reset temporary credentials.
- Review failed workflow delivery.
- Search and archive records.
- Confirm attendance synchronization.
- Monitor database and application errors.
- Rotate credentials and update dependencies.

System changes should be documented with the operator, date, affected modules, rollback plan, and approval.

# Backup and recovery

Database backups should include all application tables and follow an approved schedule. Document and receipt backups should preserve file integrity and access restrictions.

Recovery procedures should verify:

- Database and application configuration.
- Environment secrets.
- Document and receipt availability.
- Session validity.
- OAuth and email configuration.
- Critical workflow behavior.
- Data consistency and foreign-key integrity.

Restores must use approved copies and should be tested in a staging environment before production recovery.

# Support and troubleshooting

## Authentication issues

- Confirm the email belongs to an allowed institutional or eligible external domain.
- Check account existence and status.
- Confirm the password and temporary-password requirement.
- Clear expired session state and sign in again.
- Review Google OAuth redirect URI and test-user configuration.

## Request submission issues

- Verify required fields and data formats.
- Confirm the requester is eligible for the module.
- Review database connectivity.
- Confirm server validation and state-transition errors.

## Notification or document issues

- Verify Gmail OAuth authorization and sender configuration.
- Confirm the recipient is valid.
- Review external-service delivery logs.
- Confirm that the request was committed before troubleshooting email delivery.

## Attendance synchronization issues

- Verify Google Sheets credentials.
- Confirm spreadsheet IDs and service-account access.
- Review staff-group mappings.
- Check synchronization logs and discrepancy records.

# Maintenance and future development

Routine maintenance should cover dependencies, database indexes, schema migrations, account cleanup, credential rotation, log review, and backup verification.

Future improvements may include:

- Centralized audit reporting and export.
- Document retention and lifecycle automation.
- Expanded monitoring and alerting.
- Automated backup verification.
- Additional HR and facility integrations.
- Improved UAT and end-to-end test automation.
- Scalability review for database and third-party services.
- More granular module permissions.

# Document references

- Application repository: `Tyzon19/Trip-Ticket`
- Setup guide: `README.md`
- Database schema: `scripts/schema.sql`
- Environment template: `.env.example`
- Automated tests: `src/test`
