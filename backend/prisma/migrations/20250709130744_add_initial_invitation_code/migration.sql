-- This is an empty migration.

-- Temporarily disable foreign key constraints
SET session_replication_role = replica;

-- Insert initial invitation code for admin setup
INSERT INTO "invitation_codes" ("id", "code", "max_uses", "used_count", "expires_at", "createdAt", "updatedAt", "created_by_id")
VALUES (
  'initial_invite_code_001',
  'OSCHF1842',
  1,
  0,
  NULL,
  NOW(),
  NOW(),
  'system'
);

-- Re-enable foreign key constraints
SET session_replication_role = DEFAULT;