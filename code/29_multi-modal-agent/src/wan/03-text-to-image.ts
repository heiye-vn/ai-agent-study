/**
 * 文生图 — wan2.6-t2i
 * dashscope-sdk-official
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'node:fs';
import { Configuration, MultiModalConversation, type GenerationResult } from 'dashscope-sdk-official';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../../.env') }).parsed || {};

const configuration = new Configuration({
  apiKey: envVars.QWEN_API_KEY,
});
// 万相文生图走 DashScope 原生 multimodal-generation，不能用 ChatOpenAI
const client = new MultiModalConversation(configuration);

const result = (await client.call({
  model: 'wan2.6-t2i',
  // messages.content 用 { text } / { image } 格式，不是 OpenAI 的 type 字段
  messages: [
    {
      role: 'user',
      content: [{ text: '一间有着精致窗户的花店，漂亮的木质门，摆放着花朵' }],
    },
  ],
  size: '1280*1280', // 输出分辨率，格式为 宽*高
  n: 1, // 生成张数
  watermark: false, // 是否添加「AI 生成」水印
})) as GenerationResult;

if (result.status_code !== 200 || result.code) {
  throw new Error(result.message ?? `Request failed: ${result.status_code}`);
}

const content = result.output?.choices?.[0]?.message?.content;
const imageUrl = Array.isArray(content) ? content[0]?.image : undefined;
if (!imageUrl) {
  throw new Error(`No image URL in response: ${JSON.stringify(result)}`);
}

console.log('model: wan2.6-t2i');
console.log('image URL:', imageUrl);

const imageResponse = await fetch(imageUrl);
writeFileSync('output-wan-text-to-image.png', Buffer.from(await imageResponse.arrayBuffer()));
console.log('Saved to output-wan-text-to-image.png');
