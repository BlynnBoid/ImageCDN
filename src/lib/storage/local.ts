import { join, dirname } from 'node:path'
import { unlink, mkdir } from 'node:fs/promises'
import type { StorageProvider } from './index'

interface LocalConfig {
  root:          string
  publicBaseUrl: string
}

export class LocalStorage implements StorageProvider {
  private root:          string
  private publicBaseUrl: string

  constructor(config: LocalConfig) {
    this.root          = config.root
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/$/, '')
  }

  async put(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const fullPath = join(this.root, key)
    await mkdir(dirname(fullPath), { recursive: true })
    await Bun.write(fullPath, data)
  }

  async delete(key: string): Promise<void> {
    await unlink(join(this.root, key)).catch(() => {/* already gone */})
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/files/${key}`
  }
}
