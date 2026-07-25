import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import _OSS from 'ali-oss';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

// 兼容 ali-oss 的 CommonJS / ES Module 导出
const OSSClient = (_OSS as any).default || _OSS;

export interface OssUploadsSignature {
  isExits: boolean; // 标识文件在 OSS 中是否存在（是否命中秒传）
  host: string;
  key: string;
  url: string;
  OSSAccessKeyId?: string;
  policy?: string;
  Signature?: string;
  expire?: string;
}

@Injectable()
export class OssService {
  private readonly logger = new Logger(OssService.name);
  private readonly client: any;
  private readonly postClient: any;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.trimEnv('OSS_BUCKET');
    this.region = this.trimEnv('OSS_REGION');
    const accessKeyId = this.trimEnv('OSS_ACCESS_KEY_ID');
    const accessKeySecret = this.trimEnv('OSS_ACCESS_KEY_SECRET');

    // 初始化OSS客户端
    this.client = new OSSClient({
      region: this.region,
      accessKeyId,
      accessKeySecret,
      authorizationV4: true,
      bucket: this.bucket,
    });

    // 初始化OSS客户端 (Post签名方式)
    this.postClient = new OSSClient({
      region: this.region,
      accessKeyId,
      accessKeySecret,
      bucket: this.bucket,
    });
  }

  /**
   * @description 基于 Content-Hash 生成上传签名或触发秒传
   * @param hash 前端计算的文件内容 Hash 值（如 SHA-256 / MD5）
   * @param ext 文件扩展名，默认 .jpg
   * @returns 上传签名
   */
  async createUploadPolicy(hash: string, ext = '.jpg'): Promise<OssUploadsSignature> {
    const prefix = this.config.get<string>('OSS_UPLOAD_PREFIX', 'ai-canvas/uploads');
    const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;

    // 以文件内容 Hash 作为唯一的 Key 名称
    const key = `${prefix}/${hash}${normalizedExt}`;
    const host = `http://${this.bucket}.${this.region}.aliyuncs.com`;
    const url = `${host}/${key}`;

    // 1. 检查 OSS 云端是否已有该文件（实现秒传去重）
    try {
      await this.client.head(key);

      // 未抛错说明文件已存在！之间触发 “秒传”
      this.logger.log(`文件命中秒传去重：${key}`);
      return {
        isExits: true,
        host,
        key,
        url,
      };
    } catch (error: any) {
      if (error.status !== 404 && error.code !== 'NoSuchKey') {
        throw this.wrapOssError(error, 'check file existence');
      }
    }

    // 2. 文件不存在：生成 1 小时有效期的上传签名
    const expire = new Date();
    expire.setHours(expire.getHours() + 1);

    const policy = {
      expiration: expire.toISOString(),
      conditions: [
        ['content-length-range', 0, 1048576000],
        ['eq', '$key', key],
      ],
    };

    try {
      const signature = this.postClient.calculatePostSignature(policy);

      return {
        isExits: false,
        host,
        key,
        url,
        OSSAccessKeyId: signature.OSSAccessKeyId,
        policy: signature.policy,
        Signature: signature.Signature,
        expire: expire.toISOString(),
      };
    } catch (error) {
      throw this.wrapOssError(error, 'create upload signature');
    }
  }

  /**
   * @description 解析可读的图片URL
   * @param imageUrl 图片URL
   * @returns 解析后的图片URL
   */
  resolveReadableUrl(imageUrl: string): string {
    const host = `${this.bucket}.${this.region}.aliyuncs.com`;
    if (!imageUrl.includes(host)) {
      return imageUrl;
    }
    const objectKey = decodeURIComponent(new URL(imageUrl).pathname.slice(1));
    return this.getSignedUrl(objectKey);
  }

  /**
   * @description 上传 Buffer 格式图片到OSS
   */
  async uploadBuffer(
    buffer: Buffer,
    prefix: string,
    filename: string
  ): Promise<{ url: string; objectKey: string }> {
    const ext = extname(filename) || '.png';
    const objectKey = `${prefix}/${Date.now()}-${randomUUID()}${ext}`;

    try {
      const result = await this.client.put(objectKey, buffer);
      return { url: result.url, objectKey };
    } catch (error) {
      throw this.wrapOssError(error, 'upload to OSS');
    }
  }

  /**
   * @description 获取图片的签名URL
   * @param objectKey 图片的对象键
   * @param expires 签名过期时间，默认1小时
   * @returns 签名URL
   */
  getSignedUrl(objectKey: string, expires = 3600): string {
    return this.client.signatureUrl(objectKey, { expires });
  }

  /**
   * @description 上传 url 格式图片到 OSS
   */
  async uploadFromUrl(sourceUrl: string): Promise<string> {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new InternalServerErrorException(`Failed to fetch generated image: ${response.status}`);
    }

    const prefix = this.config.get<string>('OSS_PREFIX', 'ai-canvas/edited');
    const buffer = Buffer.from(await response.arrayBuffer());
    const { url } = await this.uploadBuffer(buffer, prefix, 'result.png');

    return url;
  }

  // 定义获取环境变量的私有方法
  private trimEnv(key: string): string {
    return this.config.getOrThrow<string>(key).trim();
  }

  // 定义包装OSS错误的私有方法
  private wrapOssError(error: unknown, action: string): Error {
    const ossError = error as {
      code?: string;
      message?: string;
      status?: number;
    };

    this.logger.error(
      `OSS ${action} failed: ${ossError.code ?? 'UnknownError'} - ${ossError.message ?? error}`
    );

    if (ossError.code === 'InvalidAccessKeyId') {
      return new InternalServerErrorException(
        'OSS AccessKeyId 无效，请检查 .env 中的 OSS_ACCESS_KEY_ID 是否为当前阿里云账号下有效的 RAM 密钥'
      );
    }

    if (ossError.code === 'SignatureDoesNotMatch') {
      return new InternalServerErrorException(
        'OSS AccessKeySecret 不正确，请检查 .env 中的 OSS_ACCESS_KEY_SECRET'
      );
    }

    if (ossError.code === 'NoSuchBucket') {
      return new InternalServerErrorException(
        'OSS Bucket 不存在，请检查 OSS_BUCKET 和 OSS_REGION 是否匹配'
      );
    }

    return new InternalServerErrorException(
      `OSS ${action} failed: ${ossError.message ?? 'unknown error'}`
    );
  }
}
