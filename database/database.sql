CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fb_id TEXT UNIQUE,
    username TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT,
    job_title TEXT,
    company TEXT,
    date_posted DATE
);