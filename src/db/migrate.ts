import { resolve } from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')

// Single connection, prepared statements off (PgBouncer-compatible).
const client = postgres(connectionString, { max: 1, prepare: false })
const migrationsFolder = resolve(import.meta.dir, 'migrations')
const migrations = readMigrationFiles({ migrationsFolder })

try {
  await client.begin(async (tx) => {
    // pg_advisory_xact_lock is transaction-scoped: automatically released on
    // commit or rollback, safe with PgBouncer transaction pooling.
    await tx`select pg_advisory_xact_lock(hashtext('imagecdn_migrations'))`

    await tx`
      create table if not exists public.__imagecdn_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `

    let [lastMigration] = await tx<{ created_at: string | null }[]>`
      select created_at
      from public.__imagecdn_migrations
      order by created_at desc
      limit 1
    `

    if (!lastMigration && migrations.length > 0) {
      const [schemaState] = await tx<{ complete: boolean }[]>`
        select
          to_regclass('public.users') is not null
          and to_regclass('public.albums') is not null
          and to_regclass('public.api_keys') is not null
          and to_regclass('public.images') is not null as complete
      `

      // Earlier installations used drizzle-kit push, which created the schema
      // without migration metadata. Baseline only when the complete base schema exists.
      if (schemaState?.complete) {
        const baseMigration = migrations[0]!
        await tx`
          insert into public.__imagecdn_migrations (hash, created_at)
          values (${baseMigration.hash}, ${baseMigration.folderMillis})
        `
        lastMigration = { created_at: String(baseMigration.folderMillis) }
        console.log('Existing database schema baselined')
      }
    }

    for (const migration of migrations) {
      if (lastMigration && Number(lastMigration.created_at) >= migration.folderMillis) continue

      for (const statement of migration.sql) {
        if (statement.trim()) await tx.unsafe(statement)
      }

      await tx`
        insert into public.__imagecdn_migrations (hash, created_at)
        values (${migration.hash}, ${migration.folderMillis})
      `
    }
  })

  console.log('Database migrations applied')
} finally {
  await client.end()
}
