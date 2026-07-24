/**
 * 音频理解
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
  model: 'qwen3.5-omni-flash',
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

const response = await model.invoke([
  new HumanMessage({
    content: [
      { type: 'text', text: '这段音频里说了什么？' },
      {
        type: 'input_audio',
        input_audio: {
          data: 'https://zsp-agent-bucket.oss-cn-beijing.aliyuncs.com/upload-test/cherry.wav',
          format: 'wav',
        },
      },
    ],
  }),
]);

console.log('model: qwen3.5-omni-flash');
console.log(response.content);
