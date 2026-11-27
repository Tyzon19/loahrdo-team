CREATE TABLE IF NOT EXISTS attendance_workday_calendars (
  department_group ENUM('NON_TEACHING','COLLEGE','BASIC_ED') NOT NULL PRIMARY KEY,
  cycle_start DATE NOT NULL,
  cycle_end DATE NOT NULL,
  working_dates JSON NOT NULL,
  synced_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
