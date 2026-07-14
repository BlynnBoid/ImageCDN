import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')

export const sql = postgres(connectionString, {
  max:     Number(process.env.DB_POOL_MAX ?? '10'),
  prepare: false, // required for PgBouncer transaction pooling
})

export const db = drizzle(sql, { schema })
export type DB = typeof db
