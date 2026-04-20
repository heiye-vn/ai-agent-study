import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatOpenAI } from '@langchain/openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const model = new ChatOpenAI({
  temperature: 0,
  model: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

// 简单的问题，要求 JSON 格式返回
const question =
  '请介绍一下爱因斯坦的信息。请以 JSON 格式返回，包含以下字段：name（姓名）、birth_year（出生年份）、nationality（国籍）、major_achievements（主要成就，数组）、famous_theory（著名理论）。';

try {
  console.log('🤔 正在调用大模型...\n');

  const response = await model.invoke(question);

  console.log('✅ 收到响应:\n');
  console.log(response.content);

  // 解析 JSON
  const contentStr =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  const jsonResult = JSON.parse(contentStr);
  console.log('\n📋 解析后的 JSON 对象:');
  console.log(jsonResult);
} catch (error) {
  console.error('❌ 错误:', error.message);
}
