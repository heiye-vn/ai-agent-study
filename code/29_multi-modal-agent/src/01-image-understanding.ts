/**
 * 图像理解 - qwen3.7-plus-2026-05-26 模型
 * DashScope OpenAI 兼容接口 + ChatOpenAI
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const model = new ChatOpenAI({
  apiKey: envVars.QWEN_API_KEY,
  model: 'qwen3.7-plus-2026-05-26',
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

const response = await model.invoke([
  new HumanMessage({
    content: [
      { type: 'text', text: '详细描述这张图片的内容' },
      {
        type: 'image_url',
        image_url: {
          url: 'https://zsp-resource.oss-cn-chengdu.aliyuncs.com/upload-test/37.png',
        },
      },
    ],
  }),
]);

console.log('🤖[qwen3.7-plus-2026-05-26] Response:');
console.log(response.content);
