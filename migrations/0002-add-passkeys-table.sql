-- Create the new passkeys table
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,  -- UUID for each passkey
  user_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,  -- Base64-encoded credential ID
  public_key TEXT NOT NULL,     -- Base64-encoded public key
  counter INTEGER NOT NULL DEFAULT 0,  -- Anti-replay counter
  transports TEXT,              -- Comma-separated, e.g., 'usb,nfc,internal'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_passkeys_credential_id ON passkeys(credential_id);  -- Unique to prevent duplicates

-- Optional: Migrate any existing data from users.passkey (if populated)
-- Assuming it's JSON like '{"credential_id": "...", ...}' – adjust as needed
-- INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, transports)
-- SELECT uuid(), id, json_extract(passkey, '$.credential_id'), ... FROM users WHERE passkey IS NOT NULL;

-- Drop the old column once migrated
ALTER TABLE users DROP COLUMN passkey;