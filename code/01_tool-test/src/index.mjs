import OpenAI from 'openai';
import process from 'process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 加载根目录 .env 文件
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// 初始化 openai 客户端
const openai = new OpenAI({
  apiKey: envVars.QWEN_API_KEY, // 从环境变量读取
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});
let isAnswering = false;
async function main() {
  try {
    const messages = [{ role: 'user', content: '你是谁，当前是什么模型？' }];
    const stream = await openai.chat.completions.create({
      model: envVars.QWEN_MODEL_NAME,
      messages,
      stream: true,
      enable_thinking: true,
    });
    console.log('\n' + '='.repeat(20) + '思考过程' + '='.repeat(20));
    for await (const chunk of stream) {
      const delta = chunk.choices[0].delta;
      if (delta.reasoning_content !== undefined && delta.reasoning_content !== null) {
        if (!isAnswering) {
          process.stdout.write(delta.reasoning_content);
        }
      }
      if (delta.content !== undefined && delta.content) {
        if (!isAnswering) {
          console.log('\n' + '='.repeat(20) + '完整回复' + '='.repeat(20));
          isAnswering = true;
        }
        process.stdout.write(delta.content);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}
main();
