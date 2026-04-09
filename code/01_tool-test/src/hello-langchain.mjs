import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 加载根目录 .env 文件
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 获取 .env 中定义的变量
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const model = new ChatOpenAI({
  modelName: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

const response = await model.invoke('介绍下自己');
console.log(response.content);
