import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join, resolve } from 'path';
import { randomUUID } from 'crypto';

/**
 * Where invoice files live.
 *
 * Deliberately the only place that touches the filesystem, so swapping
 * local disk for S3 later is one file rather than a hunt through the
 * codebase - the same trick StripeService uses for the Stripe SDK.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('UPLOAD_DIR') ?? './uploads';
    this.root = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
  }

  async onModuleInit() {
    await mkdir(this.root, { recursive: true });
    this.logger.log(`Invoice storage: ${this.root}`);
  }

  /**
   * Writes a buffer under a generated uuid key. The client's filename is
   * never used to build the path - only stored as metadata - so a name
   * like '../../etc/passwd' cannot escape the upload directory.
   */
  async save(buffer: Buffer, originalFilename?: string): Promise<string> {
    const ext = this.safeExtension(originalFilename);
    const key = `${randomUUID()}${ext}`;
    await writeFile(join(this.root, key), buffer);
    return key;
  }

  /** Resolves a storage key to an absolute path, refusing anything outside root. */
  pathFor(key: string): string | null {
    const full = resolve(this.root, key);
    // Containment check: a crafted key must not resolve outside the root.
    if (!full.startsWith(this.root)) return null;
    return existsSync(full) ? full : null;
  }

  stream(key: string) {
    const path = this.pathFor(key);
    return path ? createReadStream(path) : null;
  }

  async remove(key: string) {
    const path = this.pathFor(key);
    if (path) await unlink(path).catch(() => undefined);
  }

  private safeExtension(filename?: string): string {
    if (!filename) return '';
    const match = /\.([a-zA-Z0-9]{1,8})$/.exec(filename);
    return match ? `.${match[1].toLowerCase()}` : '';
  }
}
