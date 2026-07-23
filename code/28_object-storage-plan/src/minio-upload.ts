import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Minio from 'minio';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const minioClient = new Minio.Client({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: envVars.MINIO_ACCESS_KEY,
  secretKey: envVars.MINIO_SECRET_KEY,
});

async function putFileToMinio() {
  try {
    const filePath = path.resolve(__dirname, '../logo_light.png');
    if (!fs.existsSync(filePath)) {
      console.error('❌ 本地文件不存在：', filePath);
      return;
    }

    let stream = fs.createReadStream(filePath);
    let result = await minioClient.putObject('my-bucket', 'uploads/first.png', stream);
    console.log('✅ 上传成功：');
    console.log(result);
  } catch (error) {
    console.error('❌ 上传失败：', error);
  }
}

putFileToMinio();
