-- Lyceum of Alabang PFMO — Vehicle Reservation & Trip Ticket
-- MySQL 8 / MariaDB 10.4+ schema. Applied by `npm run db:setup`.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('requisitioner','transport_head','director','president','transport_staff','assistant','guard','driver','admin') NOT NULL,
  department VARCHAR(190) NOT NULL DEFAULT '',
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_uq (email)
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
  KEY sessions_user_idx (user_id),
  KEY sessions_expiry_idx (expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
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
  type VARCHAR(80) NOT NULL,
  plate_no VARCHAR(32) NOT NULL,
  capacity INT NOT NULL,
  status ENUM('in_service','maintenance') NOT NULL DEFAULT 'in_service',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY vehicles_plate_uq (plate_no),
  CONSTRAINT vehicles_capacity_ck CHECK (capacity > 0)
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
  signer_id CHAR(36) NOT NULL,
  signer_name VARCHAR(120) NOT NULL,
  signer_role ENUM('requisitioner','transport_head','director','president','transport_staff','assistant','guard','driver','admin') NOT NULL,
  proxy_signer_name VARCHAR(120) NULL,
  image MEDIUMTEXT NULL,
  method ENUM('drawn','uploaded') NOT NULL,
  remarks TEXT NULL,
  signed_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY request_signatures_request_idx (request_id, attempt),
  CONSTRAINT request_signatures_request_fk FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE CASCADE,
  CONSTRAINT request_signatures_signer_fk FOREIGN KEY (signer_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_history (
  id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  attempt INT NOT NULL,
  actor_name VARCHAR(120) NOT NULL,
  actor_role ENUM('requisitioner','transport_head','director','president','transport_staff','assistant','guard','driver','admin') NOT NULL,
  type ENUM('submitted','signed','returned','resubmitted','approved','dispatch','completed') NOT NULL,
  message VARCHAR(500) NOT NULL,
  reason TEXT NULL,
  happened_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY request_history_request_idx (request_id, happened_at),
  CONSTRAINT request_history_request_fk FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_returns (
  id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  stage ENUM('review','recommend','approve') NOT NULL,
  by_name VARCHAR(120) NOT NULL,
  by_role ENUM('requisitioner','transport_head','director','president','transport_staff','assistant','guard','driver','admin') NOT NULL,
  reason TEXT NOT NULL,
  attempt INT NOT NULL,
  returned_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY request_returns_request_idx (request_id, returned_at),
  CONSTRAINT request_returns_request_fk FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE CASCADE
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
  kind ENUM('action_review','action_recommend','action_approve','returned','approved_requester','approved_transport') NOT NULL,
  stage ENUM('review','recommend','approve') NULL,
  heading VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  cta_label VARCHAR(80) NOT NULL,
  read_at DATETIME NULL,
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

CREATE TABLE IF NOT EXISTS analytics_pageviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  path VARCHAR(255) NOT NULL,
  viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY analytics_path_idx (path),
  KEY analytics_viewed_idx (viewed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
