ALTER TABLE migration_settings ADD COLUMN source TEXT NOT NULL DEFAULT 'postgres' CHECK(source IN('d1','postgres'));
ALTER TABLE migration_settings ADD COLUMN d1_database_id TEXT NOT NULL DEFAULT '';
