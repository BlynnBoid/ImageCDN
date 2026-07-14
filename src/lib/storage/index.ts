import { S3Storage } from './s3'
import { LocalStorage } from './local'

export interface StorageProvider {
  put(key: string, data: Buffer, mimeType: string): Promise<void>
  delete(key: string): Promise<void>
  publicUrl(key: string): string
  // For multi-region local storage: build the file URL from a specific origin.
  // S3 implementations do not need this — their publicUrl() is already absolute.
  urlFromOrigin?(key: string, origin: string): string
}

export function createStorage(): StorageProvider {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY } = process.env
  const provider = process.env.STORAGE_PROVIDER?.toLowerCase()
  const s3Values = [S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY]
  const hasAnyS3Config = s3Values.some(Boolean)
  const hasAllS3Config = s3Values.every(Boolean)

  if (provider && provider !== 'local' && provider !== 's3') {
    throw new Error('STORAGE_PROVIDER must be either "local" or "s3"')
  }

  if ((provider === 's3' || hasAnyS3Config) && !hasAllS3Config) {
    throw new Error('S3 storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, and S3_SECRET_KEY')
  }

  if (provider === 's3' || hasAllS3Config) {
    return new S3Storage({
      endpoint:        S3_ENDPOINT!,
      region:          process.env.S3_REGION ?? 'auto',
      bucket:          S3_BUCKET!,
      accessKeyId:     S3_ACCESS_KEY!,
      secretAccessKey: S3_SECRET_KEY!,
      publicBaseUrl:   process.env.S3_PUBLIC_BASE_URL ?? `${S3_ENDPOINT}/${S3_BUCKET}`,
    })
  }

  return new LocalStorage({
    root:          process.env.UPLOAD_DIR ?? './uploads',
    publicBaseUrl: process.env.PUBLIC_URL ?? 'http://localhost:3000',
  })
}
