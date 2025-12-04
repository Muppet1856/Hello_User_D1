CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  verified BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  passkey TEXT  -- For future passkey support
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,  -- References users.id (Main Admin)
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  org_id TEXT NOT NULL,
  created_by TEXT NOT NULL,  -- References users.id (Main Admin)
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('main_admin', 'org_admin', 'team_admin', 'member')),
  org_id TEXT,
  team_id TEXT,
  PRIMARY KEY (user_id, role, org_id, team_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  org_id TEXT,
  team_id TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Seed initial main admin user
INSERT OR IGNORE INTO users (id, email, name, verified) VALUES ('00000000-0000-0000-0000-000000000001', 'jeff@zellenfamily.com', 'Jeff Zellen', TRUE);

-- Assign main_admin role (global, no org/team scope)
INSERT OR IGNORE INTO user_roles (user_id, role, org_id, team_id) VALUES ('00000000-0000-0000-0000-000000000001', 'main_admin', NULL, NULL);
