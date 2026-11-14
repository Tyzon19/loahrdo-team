SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone_number VARCHAR(32) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('requisitioner','department_head','transport_head','director','president','transport_staff','assistant','guard','driver','admin') NOT NULL,
  department VARCHAR(190) NOT NULL DEFAULT '',
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  profile_complete TINYINT(1) NOT NULL DEFAULT 1,
  is_super_admin TINYINT(1) NOT NULL DEFAULT 0,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_uq (email),
  KEY users_super_admin_idx (is_super_admin, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permission_slip_admins (
  user_id CHAR(36) NOT NULL,
  assigned_by CHAR(36) NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT permission_slip_admin_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT permission_slip_admin_actor_fk FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permission_slip_signatories (
  user_id CHAR(36) NOT NULL,
  assigned_by CHAR(36) NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT permission_slip_signatory_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT permission_slip_signatory_actor_fk FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_access_history (
  id CHAR(36) NOT NULL,
  actor_id CHAR(36) NULL,
  actor_name VARCHAR(120) NOT NULL,
  actor_email VARCHAR(190) NOT NULL,
  target_id CHAR(36) NULL,
  target_email VARCHAR(190) NOT NULL,
  module_key ENUM('global','permission_slips') NOT NULL,
  role_key ENUM('super_admin','admin') NOT NULL,
  action ENUM('granted','revoked') NOT NULL,
  happened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY system_access_history_time_idx (happened_at),
  KEY system_access_history_target_idx (target_email, happened_at),
  CONSTRAINT system_access_history_actor_fk FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT system_access_history_target_fk FOREIGN KEY (target_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY sessions_token_uq (token_hash),
  KEY sessions_token_last_seen_idx (token_hash, last_seen_at),
  KEY sessions_user_idx (user_id),
  KEY sessions_expiry_idx (expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permission_sessions (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY permission_sessions_token_uq (token_hash),
  KEY permission_sessions_user_idx (user_id),
  KEY permission_sessions_expiry_idx (expires_at),
  CONSTRAINT permission_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permission_slips (
  id CHAR(36) NOT NULL,
  employee_id CHAR(36) NOT NULL,
  employee_name VARCHAR(120) NOT NULL,
  employee_email VARCHAR(190) NOT NULL,
  department VARCHAR(190) NOT NULL,
  requested_date DATE NOT NULL,
  time_out CHAR(5) NOT NULL,
  time_in CHAR(5) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  employee_signature MEDIUMTEXT NOT NULL,
  status ENUM('pending_approval','approved','rejected') NOT NULL DEFAULT 'pending_approval',
  department_head_id CHAR(36) NULL,
  department_head_name VARCHAR(120) NULL,
  department_head_signature MEDIUMTEXT NULL,
  rejection_reason VARCHAR(500) NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME NULL,
  rejected_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY permission_employee_idx (employee_id, requested_at),
  KEY permission_employee_email_idx (employee_email, requested_at),
  KEY permission_status_idx (status, department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permission_history (
  id CHAR(36) NOT NULL,
  permission_slip_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NULL,
  actor_name VARCHAR(120) NOT NULL,
  actor_role ENUM('requisitioner','department_head','system') NOT NULL,
  type ENUM('submitted','approved','rejected') NOT NULL,
  message VARCHAR(500) NOT NULL,
  happened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY permission_history_idx (permission_slip_id, happened_at),
  CONSTRAINT permission_history_slip_fk FOREIGN KEY (permission_slip_id) REFERENCES permission_slips (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registration_otps (
  email VARCHAR(190) NOT NULL,
  name VARCHAR(120) NOT NULL,
  department VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  send_nonce CHAR(36) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_sent_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (email),
  KEY registration_otps_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicles (
  id CHAR(36) NOT NULL,
  driver_name VARCHAR(120) NOT NULL,
  type VARCHAR(80) NOT NULL,
  plate_no VARCHAR(32) NOT NULL,
  status ENUM('in_service','maintenance') NOT NULL DEFAULT 'in_service',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY vehicles_plate_uq (plate_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_sequences (
  year SMALLINT NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS requests (
  id CHAR(36) NOT NULL,
  number VARCHAR(32) NOT NULL,
  requisitioner_id CHAR(36) NOT NULL,
  requisitioner_name VARCHAR(120) NOT NULL,
  department VARCHAR(190) NOT NULL,
  passengers INT NOT NULL,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  time_needed CHAR(5) NOT NULL,
  purpose TEXT NOT NULL,
  status ENUM('pending_review','pending_recommendation','pending_approval','returned','approved','dispatched','completed') NOT NULL DEFAULT 'pending_review',
  attempt INT NOT NULL DEFAULT 1,
  vehicle_id CHAR(36) NULL,
  vehicle_type VARCHAR(80) NULL,
  plate_no VARCHAR(32) NULL,
  review_remarks TEXT NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY requests_number_uq (number),
  KEY requests_requisitioner_idx (requisitioner_id, submitted_at),
  KEY requests_status_idx (status),
  KEY requests_status_date_idx (status, date_start, submitted_at),
  KEY requests_date_submitted_idx (date_start, submitted_at),
  KEY requests_vehicle_idx (vehicle_id),
  CONSTRAINT requests_requisitioner_fk FOREIGN KEY (requisitioner_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT requests_vehicle_fk FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE SET NULL,
  CONSTRAINT requests_passengers_ck CHECK (passengers BETWEEN 1 AND 200),
  CONSTRAINT requests_dates_ck CHECK (date_end >= date_start),
  CONSTRAINT requests_attempt_ck CHECK (attempt >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS request_destinations (
  request_id CHAR(36) NOT NULL,
  sort_order INT NOT NULL,
  destination VARCHAR(200) NOT NULL,
  PRIMARY KEY (request_id, sort_order),
  CONSTRAINT request_destinations_fk FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_signatures (
  id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  stage ENUM('review','recommend','approve') NOT NULL,
  attempt INT NOT NULL,
  signer_id CHAR(36) NULL,
  signer_name VARCHAR(120) NOT NULL,
  signer_role ENUM('requisitioner','department_head','transport_head','director','president','transport_staff','assistant','guard','driver','admin') NOT NULL,
  proxy_signer_name VARCHAR(120) NULL,
  image MEDIUMTEXT NULL,
  method ENUM('drawn','uploaded') NOT NULL,
  remarks TEXT NULL,
  signed_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY request_signatures_request_idx (request_id, attempt),
  CONSTRAINT request_signatures_request_fk FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE CASCADE,
  CONSTRAINT request_signatures_signer_fk FOREIGN KEY (signer_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_history (
  id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  attempt INT NOT NULL,
  actor_id CHAR(36) NULL,
  actor_name VARCHAR(120) NOT NULL,
  actor_role ENUM('requisitioner','department_head','transport_head','director','president','transport_staff','assistant','guard','driver','admin') NOT NULL,
  type ENUM('submitted','updated','signed','returned','resubmitted','approved','dispatch','completed') NOT NULL,
  message VARCHAR(500) NOT NULL,
  reason TEXT NULL,
  happened_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY request_history_request_idx (request_id, happened_at),
  CONSTRAINT request_history_request_fk FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE CASCADE,
  CONSTRAINT request_history_actor_fk FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_returns (
  id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  stage ENUM('review','recommend','approve') NOT NULL,
  by_id CHAR(36) NULL,
  by_name VARCHAR(120) NOT NULL,
  by_role ENUM('requisitioner','department_head','transport_head','director','president','transport_staff','assistant','guard','driver','admin') NOT NULL,
  reason TEXT NOT NULL,
  attempt INT NOT NULL,
  returned_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY request_returns_request_idx (request_id, returned_at),
  CONSTRAINT request_returns_request_fk FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE CASCADE,
  CONSTRAINT request_returns_actor_fk FOREIGN KEY (by_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dispatch_records (
  request_id CHAR(36) NOT NULL,
  dispatched_by VARCHAR(120) NULL,
  time_out DATETIME NULL,
  time_in DATETIME NULL,
  user_signature_name VARCHAR(120) NULL,
  odometer_start INT NULL,
  odometer_end INT NULL,
  driver_report TEXT NULL,
  driver_name VARCHAR(120) NULL,
  completed_at DATETIME NULL,
  PRIMARY KEY (request_id),
  CONSTRAINT dispatch_records_request_fk FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  to_user_id CHAR(36) NOT NULL,
  to_name VARCHAR(120) NOT NULL,
  to_email VARCHAR(190) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  kind ENUM('action_review','action_recommend','action_approve','returned','approved_requester','approved_transport','trip_ticket_reminder') NOT NULL,
  stage ENUM('review','recommend','approve') NULL,
  heading VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  cta_label VARCHAR(80) NOT NULL,
  read_at DATETIME NULL,
  email_status ENUM('pending','sent','failed') NULL,
  email_error VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY notifications_inbox_idx (to_user_id, created_at),
  KEY notifications_request_idx (request_id),
  CONSTRAINT notifications_request_fk FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE CASCADE,
  CONSTRAINT notifications_user_fk FOREIGN KEY (to_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_attachments (
  notification_id CHAR(36) NOT NULL,
  mime VARCHAR(32) NOT NULL DEFAULT 'image/png',
  image MEDIUMBLOB NOT NULL,
  PRIMARY KEY (notification_id),
  CONSTRAINT notification_attachments_fk FOREIGN KEY (notification_id) REFERENCES notifications (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doc_config (
  id TINYINT NOT NULL DEFAULT 1,
  institution VARCHAR(190) NOT NULL,
  certification VARCHAR(120) NOT NULL,
  office VARCHAR(190) NOT NULL,
  title VARCHAR(190) NOT NULL,
  doc_no VARCHAR(64) NOT NULL,
  revision_no VARCHAR(16) NOT NULL,
  effective_date DATE NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT doc_config_single_ck CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS signatory_assistants (
  stage_key VARCHAR(16) NOT NULL,
  assistant_name VARCHAR(120) NOT NULL,
  assistant_user_id CHAR(36) NULL,
  PRIMARY KEY (stage_key),
  CONSTRAINT signatory_assistants_stage_ck CHECK (stage_key IN ('review','recommend','approve')),
  CONSTRAINT signatory_assistants_user_fk FOREIGN KEY (assistant_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS main_signatory_assignments (
  stage_key VARCHAR(16) NOT NULL,
  user_id CHAR(36) NOT NULL,
  PRIMARY KEY (stage_key),
  UNIQUE KEY main_signatory_assignments_user_uq (user_id),
  CONSTRAINT main_signatory_assignments_stage_ck CHECK (stage_key IN ('review','recommend','approve')),
  CONSTRAINT main_signatory_assignments_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_pageviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  path VARCHAR(255) NOT NULL,
  viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY analytics_path_idx (path),
  KEY analytics_viewed_idx (viewed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS hrdo_users (
  id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('employee','hrdo_staff','hrdo_admin') NOT NULL DEFAULT 'employee',
  is_external TINYINT(1) NOT NULL DEFAULT 0,
  department VARCHAR(190) NOT NULL DEFAULT '',
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY hrdo_users_email_uq (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hrdo_sessions (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY hrdo_sessions_token_uq (token_hash),
  KEY hrdo_sessions_token_last_seen_idx (token_hash, last_seen_at),
  KEY hrdo_sessions_user_idx (user_id),
  KEY hrdo_sessions_expiry_idx (expires_at),
  CONSTRAINT hrdo_sessions_user_fk FOREIGN KEY (user_id) REFERENCES hrdo_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hrdo_registration_otps (
  email VARCHAR(190) NOT NULL,
  name VARCHAR(120) NOT NULL,
  department VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  send_nonce CHAR(36) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_sent_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (email),
  KEY hrdo_registration_otps_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hrdo_coe_requests (
  id CHAR(36) NOT NULL,
  employee_id CHAR(36) NOT NULL,
  employee_name VARCHAR(120) NOT NULL,
  employee_email VARCHAR(190) NOT NULL,
  employee_number VARCHAR(40) NOT NULL DEFAULT '',
  department VARCHAR(190) NOT NULL DEFAULT '',
  purpose VARCHAR(255) NOT NULL,
  note TEXT NULL,
  copy_type ENUM('soft','original','both') NOT NULL DEFAULT 'original',
  status ENUM('pending','under_review','correction_requested','processing','awaiting_review','ready_for_pickup','released','rejected') NOT NULL DEFAULT 'pending',
  remarks TEXT NULL,
  correction_message TEXT NULL,
  deadline_at DATETIME NOT NULL,
  verified_at DATETIME NULL,
  verified_by_name VARCHAR(120) NULL,
  correction_requested_at DATETIME NULL,
  finalized_at DATETIME NULL,
  ready_at DATETIME NULL,
  released_at DATETIME NULL,
  released_by_name VARCHAR(120) NULL,
  received_by_name VARCHAR(120) NULL,
  email_thread_id VARCHAR(255) NULL,
  processed_by_id CHAR(36) NULL,
  processed_by_name VARCHAR(120) NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY hrdo_coe_employee_idx (employee_id, requested_at),
  KEY hrdo_coe_status_idx (status),
  KEY hrdo_coe_requested_idx (requested_at, status),
  KEY hrdo_coe_deadline_idx (deadline_at),
  CONSTRAINT hrdo_coe_employee_fk FOREIGN KEY (employee_id) REFERENCES hrdo_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hrdo_coe_documents (
  request_id CHAR(36) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime VARCHAR(255) NOT NULL DEFAULT 'application/pdf',
  size_bytes INT UNSIGNED NOT NULL,
  content MEDIUMBLOB NOT NULL,
  uploaded_by_id CHAR(36) NULL,
  uploaded_by_name VARCHAR(120) NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id),
  CONSTRAINT hrdo_coe_documents_request_fk FOREIGN KEY (request_id) REFERENCES hrdo_coe_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hrdo_coe_history (
  id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  actor_name VARCHAR(120) NOT NULL,
  actor_role ENUM('employee','hrdo_staff','hrdo_admin','system') NOT NULL,
  type ENUM('submitted','viewed','verified','correction_requested','resubmitted','processing','template_sent','document_uploaded','ready_for_pickup','released','rejected') NOT NULL,
  message VARCHAR(500) NOT NULL,
  happened_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY hrdo_coe_history_request_idx (request_id, happened_at),
  CONSTRAINT hrdo_coe_history_request_fk FOREIGN KEY (request_id) REFERENCES hrdo_coe_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
