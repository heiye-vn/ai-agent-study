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

const prompt = `详细介绍莫扎特的信息。`;

console.log('🌊 普通流式输出演示（无结构化）\n');

try {
  const stream = await model.stream(prompt);

  let fullContent = '';
  let chunkCount = 0;

  console.log('📡 接收流式数据:\n');

  // 异步打印返回的 chunk
  for await (const chunk of stream) {
    chunkCount++;
    const content = chunk.content;
    fullContent += content;

    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    process.stdout.write(contentStr); // 实时显示流式文本
  }

  console.log(`\n\n✅ 共接收 ${chunkCount} 个数据块\n`);
  console.log(`📝 完整内容长度: ${fullContent.length} 字符`);
} catch (error) {
  console.error('\n❌ 错误:', error.message);
}
