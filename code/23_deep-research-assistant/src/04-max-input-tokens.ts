import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const envVar = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const model = new ChatOpenAI({
  model: envVar.QWEN_MODEL_NAME || '',
  apiKey: envVar.QWEN_API_KEY || '',
  temperature: 0,
  configuration: {
    baseURL: envVar.QWEN_BASE_URL || '',
  },
});

console.log(model.profile.maxInputTokens);

Object.defineProperty(model, 'profile', {
  get: () => ({ maxInputTokens: 1_024 }),
});

console.log(model.profile.maxInputTokens);
