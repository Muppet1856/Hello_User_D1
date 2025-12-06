-- Backup existing data (assuming no duplicates in scopes)
CREATE TABLE IF NOT EXISTS user_roles_backup AS SELECT * FROM user_roles;

-- Drop the old table
DROP TABLE IF EXISTS user_roles;

-- Recreate with new PK (user_id, org_id, team_id) to enforce unique role per scope
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('main_admin', 'org_admin', 'team_admin', 'statistician', 'member', 'guest')),
  org_id TEXT,
  team_id TEXT,
  PRIMARY KEY (user_id, org_id, team_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Restore data from backup
INSERT INTO user_roles SELECT * FROM user_roles_backup;

-- Drop backup
DROP TABLE IF EXISTS user_roles_backup;