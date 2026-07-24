/**
 * 图像编辑 — wan2.6-image
 * dashscope-sdk-official
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'node:fs';
import {
  Configuration,
  MultiModalConversation,
  type GenerationResult,
} from 'dashscope-sdk-official';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../../.env') }).parsed || {};

const imageUrl = 'https://zsp-resource.oss-cn-chengdu.aliyuncs.com/upload-test/37.png';

const configuration = new Configuration({
  apiKey: envVars.QWEN_API_KEY,
});
// 万相图像编辑走 DashScope 原生 multimodal-generation，不能用 ChatOpenAI
const client = new MultiModalConversation(configuration);

const result = (await client.call({
  model: 'wan2.6-image',
  // 编辑任务：同一条 message 里同时传 { text } 指令和 { image } 原图 URL
  messages: [
    {
      role: 'user',
      content: [{ text: '沙发上的白色猫咪改为橘猫，人物保持不变' }, { image: imageUrl }],
    },
  ],
  prompt_extend: true, // 是否自动扩写提示词
  watermark: false, // 是否添加「AI 生成」水印
  n: 1, // 生成张数
  enable_interleave: false, // false = 图像编辑；true = 图文混排生成
  size: '1K', // 输出分辨率档位
})) as GenerationResult;

if (result.status_code !== 200 || result.code) {
  throw new Error(result.message ?? `Request failed: ${result.status_code}`);
}

const content = result.output?.choices?.[0]?.message?.content;
const resultUrl = Array.isArray(content) ? content[0]?.image : undefined;
if (!resultUrl) {
  throw new Error(`No image URL in response: ${JSON.stringify(result)}`);
}

console.log('model: wan2.6-image');
console.log('edited image URL:', resultUrl);

const imageResponse = await fetch(resultUrl);
writeFileSync('output-wan-image-edit.png', Buffer.from(await imageResponse.arrayBuffer()));
console.log('Saved to output-wan-image-edit.png');
