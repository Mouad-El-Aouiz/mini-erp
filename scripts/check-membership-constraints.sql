BEGIN;

DO $$
DECLARE
  test_tenant_id UUID := gen_random_uuid();
  test_user_id TEXT := gen_random_uuid()::TEXT;
BEGIN
  INSERT INTO tenants (id, name, updated_at)
  VALUES (test_tenant_id, 'Membership constraint test', CURRENT_TIMESTAMP);

  INSERT INTO "user" (id, name, email, "updatedAt")
  VALUES (
    test_user_id,
    'Membership test user',
    test_user_id || '@example.invalid',
    CURRENT_TIMESTAMP
  );

  INSERT INTO memberships (tenant_id, user_id, updated_at)
  VALUES (test_tenant_id, test_user_id, CURRENT_TIMESTAMP);

  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE tenant_id = test_tenant_id
      AND user_id = test_user_id
      AND role = 'EMPLOYEE'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Default values test failed';
  END IF;
  RAISE NOTICE 'PASS: default role and active status';

  BEGIN
    INSERT INTO memberships (tenant_id, user_id, updated_at)
    VALUES (test_tenant_id, test_user_id, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Duplicate membership was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: duplicate membership rejected';
  END;

  BEGIN
    INSERT INTO memberships (tenant_id, user_id, updated_at)
    VALUES (gen_random_uuid(), test_user_id, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Missing tenant was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: missing tenant rejected';
  END;

  BEGIN
    INSERT INTO memberships (tenant_id, user_id, updated_at)
    VALUES (test_tenant_id, gen_random_uuid()::TEXT, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Missing user was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: missing user rejected';
  END;

  BEGIN
    DELETE FROM tenants WHERE id = test_tenant_id;
    RAISE EXCEPTION 'Referenced tenant was deleted';
  EXCEPTION WHEN restrict_violation THEN
    RAISE NOTICE 'PASS: referenced tenant deletion rejected';
  END;

  BEGIN
    DELETE FROM "user" WHERE id = test_user_id;
    RAISE EXCEPTION 'Referenced user was deleted';
  EXCEPTION WHEN restrict_violation THEN
    RAISE NOTICE 'PASS: referenced user deletion rejected';
  END;
END $$;

ROLLBACK;
