import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import type { StorageProvider } from './index'

interface S3Config {
  endpoint:        string
  region:          string
  bucket:          string
  accessKeyId:     string
  secretAccessKey: string
  publicBaseUrl:   string
}

export class S3Storage implements StorageProvider {
  private client: S3Client
  private bucket: string
  private publicBaseUrl: string

  constructor(config: S3Config) {
    this.bucket = config.bucket
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/$/, '')
    this.client = new S3Client({
      endpoint: config.endpoint,
      region:   config.region,
      credentials: {
        accessKeyId:     config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    })
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket:       this.bucket,
      Key:          key,
      Body:         data,
      ContentType:  mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    }))
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key:    key,
    }))
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`
  }
}
