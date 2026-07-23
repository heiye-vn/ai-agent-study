import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import OSS from 'ali-oss';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const client = new OSS({
  region: envVars.OSS_REGION,
  accessKeyId: envVars.OSS_ACCESS_KEY_ID,
  accessKeySecret: envVars.OSS_ACCESS_KEY_SECRET,
  authorizationV4: true,
  bucket: envVars.OSS_BUCKET,
  secure: true, // 开启 HTTPS 传输，避免 HTTP 80 端口连接被拒绝
});

async function putFileToOSS() {
  try {
    const filePath = path.resolve(__dirname, '../logo_light.png');
    if (!fs.existsSync(filePath)) {
      console.error('❌ 本地文件不存在：', filePath);
      return;
    }

    // 使用 chunked encoding。使用 putStream 接口时，SDK 默认会发起一个 chunked encoding 的 HTTP PUT 请求
    let stream = fs.createReadStream(filePath);
    // 填写 Object 完整路径，例如：exampledir/exampleobject.txt。Object 完整路径中不能包含 Bucket 名称。
    let result = await client.putStream('upload-test/first.png', stream);
    console.log('✅ 上传成功：');
    console.log(result);
  } catch (error) {
    console.error('❌ 上传失败：', error);
  }
}

putFileToOSS();
