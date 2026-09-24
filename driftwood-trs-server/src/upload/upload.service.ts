import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { config } from '../libs/config';

@Injectable()
export class UploadService {
  private readonly s3 = new S3Client({
    region: config.AWS_REGION,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
  });

  async getPresignedUploadUrl(
    fileName: string,
    contentType: string,
    folder = 'uploads',
  ): Promise<{ url: string; key: string }> {
    const ext = path.extname(fileName);
    const key = `${folder}/${randomUUID()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: config.AWS_S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.s3, command, {
      expiresIn: config.AWS_S3_PRESIGN_EXPIRES_IN,
    });

    return { url, key };
  }

  async getPresignedGetUrl(key: string, expiresIn = 900): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: config.AWS_S3_BUCKET,
      Key: key,
    });

    return getSignedUrl(this.s3, command, { expiresIn });
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: config.AWS_S3_BUCKET,
      Key: key,
    });
    await this.s3.send(command);
  }

  /**
   * Reads an object's body as UTF-8 text — the one place this service actually pulls file
   * content into the server process (everywhere else only mints presigned URLs). Added for
   * AI Review, which needs the document's text to send to the AI provider. Only meaningful
   * for genuinely text-based objects; callers are responsible for only calling this for
   * file types where "decode as UTF-8" is correct (e.g. `text/plain`) — this method has no
   * way to know or enforce that itself.
   */
  async getObjectText(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: config.AWS_S3_BUCKET,
      Key: key,
    });

    const response = await this.s3.send(command);
    if (!response.Body) {
      throw new Error(`S3 object "${key}" has no body`);
    }

    return response.Body.transformToString('utf-8');
  }

  /**
   * Reads an object's body as raw bytes — the binary counterpart to `getObjectText`, for
   * file types that aren't plain UTF-8 text (e.g. DOCX, PDF) and need a format-specific
   * parser instead of naive text decoding. Added for AI Review's document text extraction.
   */
  async getObjectBuffer(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: config.AWS_S3_BUCKET,
      Key: key,
    });

    const response = await this.s3.send(command);
    if (!response.Body) {
      throw new Error(`S3 object "${key}" has no body`);
    }

    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }
}
