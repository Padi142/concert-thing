-- Application-level administrators are kept in D1 so the Worker can enforce
-- the role without trusting client-visible Clerk metadata.
CREATE TABLE admin_users (
  user_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE INDEX admin_users_created_at ON admin_users(created_at);
