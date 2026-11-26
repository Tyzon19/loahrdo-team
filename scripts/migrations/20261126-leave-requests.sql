CREATE TABLE IF NOT EXISTS leave_reporting_lines (
 employee_id CHAR(36) PRIMARY KEY,
 supervisor_id CHAR(36) NOT NULL,
 is_department_head TINYINT NOT NULL DEFAULT 0,
 updated_by CHAR(36) NOT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(employee_id) REFERENCES users(id),
 FOREIGN KEY(supervisor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS leave_requests (
 id CHAR(36) PRIMARY KEY,
 employee_id CHAR(36) NOT NULL,
 profile_id CHAR(36) NOT NULL,
 employee_name VARCHAR(200) NOT NULL,
 department VARCHAR(200) NOT NULL,
 code VARCHAR(3) NOT NULL,
 reason TEXT NOT NULL,
 dates JSON NOT NULL,
 employee_signature MEDIUMTEXT NOT NULL,
 medical_certificate MEDIUMTEXT NULL,
 recommender_id CHAR(36) NOT NULL,
 recommender_name VARCHAR(200) NOT NULL,
 president_required TINYINT NOT NULL,
 recommender_signature MEDIUMTEXT NULL,
 recommended_at DATETIME NULL,
 hr_id CHAR(36) NULL,
 hr_name VARCHAR(200) NULL,
 hr_signature MEDIUMTEXT NULL,
 decided_at DATETIME NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'pending_recommendation',
 note TEXT NOT NULL,
 credited TINYINT NULL,
 balances JSON NULL,
 sync_status VARCHAR(20) NOT NULL DEFAULT 'not_required',
 sync_error VARCHAR(500) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY leave_employee (employee_id, created_at),
 KEY leave_queue (recommender_id, status),
 KEY leave_sync (sync_status),
 FOREIGN KEY (employee_id) REFERENCES users(id),
 FOREIGN KEY (profile_id) REFERENCES hr_sheet_profiles(id),
 FOREIGN KEY (recommender_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS leave_request_days (
 profile_id CHAR(36) NOT NULL,
 leave_date DATE NOT NULL,
 request_id CHAR(36) NOT NULL,
 PRIMARY KEY(profile_id, leave_date),
 FOREIGN KEY(request_id) REFERENCES leave_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS leave_email_outbox (
 id CHAR(36) PRIMARY KEY,
 request_id CHAR(36) NOT NULL,
 recipient VARCHAR(254) NOT NULL,
 subject VARCHAR(200) NOT NULL,
 message TEXT NOT NULL,
 sent_at DATETIME NULL,
 attempts INT NOT NULL DEFAULT 0,
 last_error VARCHAR(500) NULL,
 FOREIGN KEY(request_id) REFERENCES leave_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Not-credited leave is final in the application and never writes a paid-leave code.
-- Clear any jobs left pending by the earlier placeholder behavior.
UPDATE leave_requests SET sync_status='not_required', sync_error=NULL
WHERE status='approved' AND credited=0 AND sync_status IN ('pending','error');
