import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatOpenAI } from '@langchain/openai';
import { JsonOutputParser } from '@langchain/core/output_parsers';

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

const parser = new JsonOutputParser();

const question = `请介绍一下爱因斯坦的信息。请以 JSON 格式返回，包含以下字段：name（姓名）、birth_year（出生年份）、nationality（国籍）、major_achievements（主要成就，数组）、famous_theory（著名理论）。

${parser.getFormatInstructions()}`;

console.log('question:', question);
try {
  console.log('🤔 正在调用大模型（使用 JsonOutputParser）...\n');

  const response = await model.invoke(question);

  console.log('📤 模型原始响应:\n');
  console.log(response.content);

  const contentStr =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  const result = JSON.parse(contentStr);

  console.log('✅ JsonOutputParser 自动解析的结果:\n');
  console.log(result);
  console.log(`姓名: ${result.name}`);
  console.log(`出生年份: ${result.birth_year}`);
  console.log(`国籍: ${result.nationality}`);
  console.log(`著名理论: ${result.famous_theory}`);
  console.log(`主要成就:`, result.major_achievements);
} catch (error) {
  console.error('❌ 错误:', error.message);
}
