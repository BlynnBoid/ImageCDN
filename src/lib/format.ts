import type { StorageProvider } from './storage/index'
import type { Image, Album, User } from '../db/schema'

export interface ImageResponse {
  encoded_id:        string
  mime:              string
  size_bytes:        number
  width:             number
  height:            number
  original_filename: string | null
  original_url:      string
  medium_url:        string
  thumb_url:         string
  is_ai_generated:   boolean
  created_at:        string
  updated_at:        string
  deleted_at:        string | null
}

export interface AlbumResponse {
  encoded_id:   string
  title:        string
  description:  string | null
  visibility:   string
  images_count: number
  cover_image:  ImageResponse | null
}

export function formatImage(img: Image, storage: StorageProvider): ImageResponse {
  const base = img.storage_key
  const publicUrl = (key: string) => img.storage_origin && storage.urlFromOrigin
    ? storage.urlFromOrigin(key, img.storage_origin)
    : storage.publicUrl(key)

  return {
    encoded_id:        img.slug,
    mime:              img.mime_type,
    size_bytes:        img.size_bytes,
    width:             img.width,
    height:            img.height,
    original_filename: img.original_filename,
    original_url:      publicUrl(`${base}/original.${img.ext}`),
    medium_url:        publicUrl(`${base}/medium.webp`),
    thumb_url:         publicUrl(`${base}/thumb.webp`),
    is_ai_generated:   img.is_ai_generated,
    created_at:        img.created_at.toISOString(),
    updated_at:        img.updated_at.toISOString(),
    deleted_at:        img.deleted_at?.toISOString() ?? null,
  }
}

export function formatAlbum(
  album: Album,
  imagesCount: number,
  coverImage: Image | null,
  storage: StorageProvider,
): AlbumResponse {
  return {
    encoded_id:   album.slug,
    title:        album.title,
    description:  album.description,
    visibility:   album.visibility,
    images_count: imagesCount,
    cover_image:  coverImage ? formatImage(coverImage, storage) : null,
  }
}

export function formatUser(user: User) {
  return {
    username:       user.username,
    display_name:   user.display_name,
    credit_balance: user.credit_balance,
  }
}
