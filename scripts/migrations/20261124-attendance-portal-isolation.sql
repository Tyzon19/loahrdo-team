-- Session scope is per system. Identity remains linked to the existing users table.
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  UNIQUE KEY attendance_sessions_token_uq (token_hash),
  KEY attendance_sessions_user_idx (user_id),
  KEY attendance_sessions_expiry_idx (expires_at),
  CONSTRAINT attendance_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Only accounts first created through Attendance are restricted. Existing LOA
-- accounts keep their explicitly established access to the other systems.
CREATE TABLE IF NOT EXISTS attendance_only_accounts (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attendance_only_accounts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
