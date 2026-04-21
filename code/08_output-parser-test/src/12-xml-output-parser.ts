import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatOpenAI } from '@langchain/openai';
import { XMLOutputParser } from '@langchain/core/output_parsers';

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

const parser = new XMLOutputParser();

const question = `请提取以下文本中的人物信息：阿尔伯特·爱因斯坦出生于 1879 年，是一位伟大的物理学家。

${parser.getFormatInstructions()}`;

console.log('question:', question);

try {
  console.log('🤔 正在调用大模型（使用 XMLOutputParser）...\n');

  const response = await model.invoke(question);

  console.log('📤 模型原始响应:\n');
  console.log(response.content);

  const contentStr =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  const result = await parser.parse(contentStr);

  console.log('\n✅ XMLOutputParser 自动解析的结果:\n');
  console.log(result);
} catch (error) {
  console.error('❌ 错误:', error.message);
}
