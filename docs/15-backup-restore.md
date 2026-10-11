# PostgreSQL Backup and Restore

## Scope

This procedure backs up the local development database and restores it
into a separate database using the existing PostgreSQL Docker service.

It does not modify the source database or the cloud staging database.
A separate database in the same container provides logical isolation,
but does not protect against loss of the Docker host or its storage.

## Requirements

- Docker Compose database service running.
- Commands executed from the repository root using Bash.
- The backups directory excluded from Git.
- No application writes during the comparison exercise.

Backups contain sensitive application and authentication data.
Keep them private and outside version control.

## Create a Backup

```bash
mkdir -p backups
git check-ignore backups/probe.dump

docker compose exec -T db pg_dump \
  -U mini_erp_local \
  -d mini_erp \
  --format=custom \
  --no-owner \
  --no-acl \
  > backups/mini-erp-local.dump
```

Check the exit status immediately:

```bash
echo $?
ls -lh backups/mini-erp-local.dump
```

The expected exit status is 0 and the file must be non-empty.
Do not restore an archive from a failed backup command.

This filename is suitable for the exercise. For repeated backups,
use unique filenames to avoid overwriting previous archives.

## Restore into a Separate Database

Create a new destination:

```bash
docker compose exec -T db createdb \
  -U mini_erp_local \
  mini_erp_restore_check
```

If the database already exists, stop and inspect it.
Do not delete or overwrite an existing destination automatically.

Restore the archive:

```bash
docker compose exec -T db pg_restore \
  -U mini_erp_local \
  -d mini_erp_restore_check \
  --no-owner \
  --no-acl \
  --exit-on-error \
  < backups/mini-erp-local.dump
```

Check the exit status immediately:

```bash
echo $?
```

Expected result: 0. A failed restore can leave a partially restored
database; do not treat it as verified or retry into it blindly.

Inspect the restored tables:

```bash
docker compose exec -T db psql \
  -U mini_erp_local \
  -d mini_erp_restore_check \
  -c '\dt'
```

## Compare Every Public Table

Run both counting passes and confirm that neither reports an error:

```bash
for database in mini_erp mini_erp_restore_check; do
  (
    set -o pipefail

    docker compose exec -T db psql \
      -U mini_erp_local \
      -d "$database" \
      -v ON_ERROR_STOP=1 \
      -At \
      -c "SELECT format(
        'SELECT %L AS table_name, COUNT(*) AS row_count FROM %I.%I;',
        tablename, schemaname, tablename
      )
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;" \
    | docker compose exec -T db psql \
        -U mini_erp_local \
        -d "$database" \
        -v ON_ERROR_STOP=1 \
        -At \
    > "backups/${database}-counts.txt"
  ) || { echo "Counting failed for $database"; break; }
done
```

Only compare the files after both counting passes succeed:

```bash
diff -u backups/mini_erp-counts.txt backups/mini_erp_restore_check-counts.txt
```

No output means the table names and row counts match.
Changes to the source after the backup can produce legitimate differences.

Matching counts do not prove equality of every value or application
behavior. A complete recovery drill also requires critical data checks
and application tests against the restored database.

## Recorded Local Exercise

- Backup command completed successfully.
- Archive size was approximately 49 KiB.
- Restore into a separate database completed successfully.
- All public table row counts matched.

The restored database and archive remain available for further checks.

## Remaining Recovery Work

Before treating this as a cloud recovery procedure:

- Practice restoring a staging backup into an isolated destination.
- Verify critical records and application behavior.
- Define protected storage outside the database host.
- Define retention, access controls and a backup schedule.
- Agree acceptable data loss and recovery time.
- Record the recovery drill results.

An application rollback does not undo database migrations.