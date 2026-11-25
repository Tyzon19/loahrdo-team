-- Additive migration. Existing auth, attendance, COE, VHTT and receipt tables remain intact.
CREATE TABLE IF NOT EXISTS hr_sheet_profiles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  department_group ENUM('NON_TEACHING','COLLEGE','BASIC_ED') NOT NULL,
  sheet_row_number INT UNSIGNED NOT NULL,
  full_name VARCHAR(190) NOT NULL,
  normalized_full_name VARCHAR(190) NOT NULL,
  name_key VARCHAR(190) NOT NULL,
  claimed_by_user_id CHAR(36) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  cycle_start DATE NOT NULL,
  cycle_end DATE NOT NULL,
  leaves_this_month DECIMAL(6,1) NOT NULL DEFAULT 0,
  leaves_this_year DECIMAL(6,1) NOT NULL DEFAULT 0,
  remaining_el DECIMAL(6,1) NOT NULL DEFAULT 0,
  remaining_sl DECIMAL(6,1) NOT NULL DEFAULT 0,
  remaining_vl DECIMAL(6,1) NOT NULL DEFAULT 0,
  remaining_bl DECIMAL(6,1) NOT NULL DEFAULT 0,
  remarks VARCHAR(1000) NULL,
  synced_at DATETIME(3) NOT NULL,
  UNIQUE KEY hr_sheet_profiles_row_uq (department_group, sheet_row_number),
  UNIQUE KEY hr_sheet_profiles_user_uq (claimed_by_user_id),
  KEY hr_sheet_profiles_match_idx (department_group, name_key, is_active),
  CONSTRAINT hr_sheet_profiles_user_fk FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT hr_sheet_profiles_row_ck CHECK (sheet_row_number >= 8)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_leave_incidents (
  id CHAR(36) NOT NULL PRIMARY KEY,
  profile_id CHAR(36) NOT NULL,
  incident_date DATE NOT NULL,
  code VARCHAR(12) NOT NULL,
  leave_type VARCHAR(40) NOT NULL,
  credited_days DECIMAL(3,1) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  acknowledged_at DATETIME(3) NULL,
  acknowledged_by_user_id CHAR(36) NULL,
  explanation VARCHAR(1000) NULL,
  synced_at DATETIME(3) NOT NULL,
  UNIQUE KEY attendance_leave_incidents_date_uq (profile_id, incident_date),
  KEY attendance_leave_incidents_date_idx (incident_date, code),
  CONSTRAINT attendance_leave_incidents_profile_fk FOREIGN KEY (profile_id) REFERENCES hr_sheet_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT attendance_leave_incidents_user_fk FOREIGN KEY (acknowledged_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserve prior acknowledgments/explanations when a tracker code is corrected.
CREATE TABLE IF NOT EXISTS attendance_incident_responses (
  incident_id CHAR(36) NOT NULL,
  incident_revision INT UNSIGNED NOT NULL,
  user_id CHAR(36) NULL,
  code VARCHAR(12) NOT NULL,
  acknowledged_at DATETIME(3) NOT NULL,
  explanation VARCHAR(1000) NULL,
  PRIMARY KEY (incident_id, incident_revision),
  CONSTRAINT attendance_incident_responses_incident_fk FOREIGN KEY (incident_id) REFERENCES attendance_leave_incidents(id) ON DELETE RESTRICT,
  CONSTRAINT attendance_incident_responses_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_profile_claims (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  department_group ENUM('NON_TEACHING','COLLEGE','BASIC_ED') NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  middle_initial VARCHAR(6) NOT NULL DEFAULT '',
  last_name VARCHAR(100) NOT NULL,
  name_key VARCHAR(190) NOT NULL,
  status ENUM('PENDING_REVIEW','DUPLICATE_REVIEW_REQUIRED','NO_MATCH_REVIEW_REQUIRED','APPROVED') NOT NULL,
  profile_id CHAR(36) NULL,
  approved_by_user_id CHAR(36) NULL,
  approved_by_hrdo_user_id CHAR(36) NULL,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  approved_at DATETIME(3) NULL,
  UNIQUE KEY attendance_profile_claims_user_uq (user_id),
  KEY attendance_profile_claims_status_idx (status, requested_at),
  CONSTRAINT attendance_profile_claims_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT attendance_profile_claims_profile_fk FOREIGN KEY (profile_id) REFERENCES hr_sheet_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT attendance_profile_claims_actor_fk FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT attendance_profile_claims_hrdo_actor_fk FOREIGN KEY (approved_by_hrdo_user_id) REFERENCES hrdo_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_audit_logs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  department_group ENUM('NON_TEACHING','COLLEGE','BASIC_ED') NOT NULL,
  spreadsheet_id VARCHAR(255) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  captured_at DATETIME(3) NOT NULL,
  status ENUM('RUNNING','SUCCESS','FAILED','STALE') NOT NULL,
  rows_seen INT UNSIGNED NOT NULL DEFAULT 0,
  changes_applied INT UNSIGNED NOT NULL DEFAULT 0,
  message VARCHAR(500) NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  KEY sync_audit_logs_source_idx (department_group, status, captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
