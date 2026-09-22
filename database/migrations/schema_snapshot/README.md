# Database schema snapshots

This directory stores **documentation snapshots** of the CourseHub database structure after important migrations.

Snapshots are not migrations and should not be executed to update an existing database. Their purpose is to record the exact table definitions produced by MySQL.

## Naming convention

```text
YYYY-MM-DD-short-description.sql
```

Current snapshot:

```text
2026-07-29-admin-financial-schema.sql
```

## How to update a snapshot

1. Open `2026-07-29-admin-financial-schema.sql`.
2. Run each `SHOW CREATE TABLE` command in MySQL Workbench.
3. Copy the complete value from the `Create Table` column in the result grid.
4. Paste the statement under the matching table heading.
5. Keep one complete `CREATE TABLE` statement per section.
6. Commit the snapshot together with the migration and backend code that depends on it.

## Difference between the folders

```text
database/migrations/
```

Contains ordered scripts that modify the database.

```text
database/schema-snapshots/
```

Contains the resulting table definitions for reference, review and debugging.

## Important

Never edit an old migration after it has been shared or applied in another environment. Create a new migration for later changes.
