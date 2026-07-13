import { S3Storage } from './s3'
import { LocalStorage } from './local'

export interface StorageProvider {
  put(key: string, data: Buffer, mimeType: string): Promise<void>
  delete(key: string): Promise<void>
  publicUrl(key: string): string
}

export function createStorage(): StorageProvider {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY } = process.env

  if (S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY && S3_SECRET_KEY) {
    return new S3Storage({
      endpoint:        S3_ENDPOINT,
      region:          process.env.S3_REGION ?? 'auto',
      bucket:          S3_BUCKET,
      accessKeyId:     S3_ACCESS_KEY,
      secretAccessKey: S3_SECRET_KEY,
      publicBaseUrl:   process.env.S3_PUBLIC_BASE_URL ?? `${S3_ENDPOINT}/${S3_BUCKET}`,
    })
  }

  return new LocalStorage({
    root:          './uploads',
    publicBaseUrl: process.env.PUBLIC_URL ?? 'http://localhost:3000',
  })
}
