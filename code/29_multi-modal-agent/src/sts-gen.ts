import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import OSS from 'ali-oss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

async function main() {
  const config = {
    region: 'oss-cn-beijing',
    bucket: 'zsp-agent-bucket',
    accessKeyId: envVars.OSS_ACCESS_KEY_ID,
    accessKeySecret: envVars.OSS_ACCESS_KEY_SECRET,
  };

  const client = new OSS(config);

  const date = new Date();

  date.setDate(date.getDate() + 1);

  const res = client.calculatePostSignature({
    expiration: date.toISOString(),
    conditions: [
      ['content-length-range', 0, 1048576000], //设置上传文件的大小限制。
    ],
  });

  console.log(res);

  const location = await client.getBucketLocation(config.bucket);

  const host = `https://${config.bucket}.${location.location}.aliyuncs.com`;

  console.log(host);

  // 自动配置/更新 Bucket CORS 跨域访问规则
  try {
    await client.putBucketCORS(config.bucket, [
      {
        allowedOrigin: '*',
        allowedMethod: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
        allowedHeader: '*',
        exposeHeader: ['ETag', 'x-oss-request-id'],
        maxAgeSeconds: '3600',
      },
    ]);
    console.log('✅ OSS CORS 跨域规则设置成功！');
  } catch (err) {
    console.error('❌ 设置 CORS 失败:', err);
  }
}

main();
