import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { S3Client, PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

// 初始化统一S3客户端（RustFS/MinIO/阿里云OSS通用）
const s3Client = new S3Client({
  endpoint: envVars.S3_ENDPOINT,
  credentials: {
    accessKeyId: envVars.S3_ACCESS_KEY_ID,
    secretAccessKey: envVars.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
  region: 'us-east-1', // 本地私有存储，值任意
});

/**
 * 文件流上传
 */
async function uploadFile(
  objectKey: string,
  stream: PutObjectCommandInput['Body'],
  contentType: string = 'image/png'
) {
  try {
    const uploadCmd = new PutObjectCommand({
      Bucket: 'hello',
      Key: objectKey,
      Body: stream,
      ContentType: contentType,
    });
    await s3Client.send(uploadCmd);
    console.log('上传成功');
  } catch (error) {
    console.error('上传失败', error);
  }
}

async function main() {
  const filePath = path.resolve(__dirname, '../logo_light.png');
  if (!fs.existsSync(filePath)) {
    console.error('❌ 本地文件不存在：', filePath);
    return;
  }

  let stream = fs.createReadStream(filePath);
  await uploadFile('uploads/logo_light.png', stream);
}

main();
