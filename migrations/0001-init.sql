CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  verified BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  invited_by TEXT NOT NULL,  -- References users.id (inviter; self for default or self-signup)
  passkey TEXT,  -- For future passkey support
  FOREIGN KEY (invited_by) REFERENCES users(id)
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
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('main_admin', 'org_admin', 'team_admin', 'member')),
  org_id TEXT,
  team_id TEXT,
  PRIMARY KEY (user_id, role, org_id, team_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
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
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Seed initial main admin user (self-invited)
INSERT OR IGNORE INTO users (id, email, name, verified, invited_by) VALUES ('00000000-0000-0000-0000-000000000001', 'jeff@zellenfamily.com', 'Jeff Zellen', TRUE, '00000000-0000-0000-0000-000000000001');

-- Assign main_admin role (global, no org/team scope)
INSERT INTO user_roles (user_id, role, org_id, team_id)
SELECT '00000000-0000-0000-0000-000000000001', 'main_admin', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_id = '00000000-0000-0000-0000-000000000001' 
  AND role = 'main_admin' 
  AND org_id IS NULL 
  AND team_id IS NULL
);