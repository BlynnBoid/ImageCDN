import { pgTable, text, integer, timestamp, boolean, index } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id:             integer('id').generatedAlwaysAsIdentity().primaryKey(),
  username:       text('username').notNull().unique(),
  display_name:   text('display_name'),
  credit_balance: integer('credit_balance').default(0).notNull(),
  created_at:     timestamp('created_at').defaultNow().notNull(),
  updated_at:     timestamp('updated_at').defaultNow().notNull(),
})

export const api_keys = pgTable('api_keys', {
  id:           integer('id').generatedAlwaysAsIdentity().primaryKey(),
  user_id:      integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  prefix:       text('prefix').notNull().unique(),
  hash:         text('hash').notNull(),
  label:        text('label'),
  last_used_at: timestamp('last_used_at'),
  created_at:   timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('api_keys_prefix_idx').on(t.prefix),
])

export const albums = pgTable('albums', {
  id:             integer('id').generatedAlwaysAsIdentity().primaryKey(),
  slug:           text('slug').notNull().unique(),
  title:          text('title').notNull(),
  description:    text('description'),
  visibility:     text('visibility').default('public').notNull(),
  user_id:        integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  cover_image_id: integer('cover_image_id'),
  created_at:     timestamp('created_at').defaultNow().notNull(),
  updated_at:     timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('albums_user_id_idx').on(t.user_id, t.created_at),
])

export const images = pgTable('images', {
  id:                integer('id').generatedAlwaysAsIdentity().primaryKey(),
  slug:              text('slug').notNull().unique(),
  mime_type:         text('mime_type').notNull(),
  size_bytes:        integer('size_bytes').notNull(),
  width:             integer('width').notNull(),
  height:            integer('height').notNull(),
  original_filename: text('original_filename'),
  storage_key:       text('storage_key').notNull(),
  ext:               text('ext').notNull(),
  album_id:          integer('album_id').references(() => albums.id, { onDelete: 'set null' }),
  user_id:           integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  is_ai_generated:   boolean('is_ai_generated').default(false).notNull(),
  storage_origin:    text('storage_origin'),
  deleted_at:        timestamp('deleted_at'),
  created_at:        timestamp('created_at').defaultNow().notNull(),
  updated_at:        timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('images_album_id_idx').on(t.album_id, t.created_at),
  index('images_user_id_idx').on(t.user_id, t.created_at),
  index('images_deleted_at_idx').on(t.deleted_at),
])

export type User = typeof users.$inferSelect
export type Album = typeof albums.$inferSelect
export type Image = typeof images.$inferSelect
export type ApiKey = typeof api_keys.$inferSelect
