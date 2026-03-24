// 环境变量加载模块

import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../../../.env')
dotenv.config({ path: envPath });

export const env = process.env as Record<string, string>;

export function validateEnv() {
  const required = ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL_NAME'];
  const missing = required.filter(key => !env[key]);
  
  if (missing.length > 0) {
    throw new Error(`缺少必要的环境变量：${missing.join(', ')}`);
  }
}