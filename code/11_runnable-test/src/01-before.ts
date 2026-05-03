import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// 初始化模型
const model = new ChatOpenAI({
  temperature: 0.3,
  model: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

// 定义输出结构 schema
const schema = z.object({
  translation: z.string().describe('翻译后的英文文本'),
  keywords: z.array(z.string()).length(3).describe('3个关键词'),
});

const outputParser = StructuredOutputParser.fromZodSchema(schema);

const promptTemplate = ChatPromptTemplate.fromTemplate(
  '将以下文本翻译成英文，然后总结为3个关键词。\n\n文本：{text}\n\n{format_instructions}'
);

const input = {
  text: 'LangChain 是一个强大的 AI 应用开发框架',
  format_instructions: outputParser.getFormatInstructions(),
};

// 步骤1：格式化 prompt
const formattedPrompt = await promptTemplate.format(input);

// 步骤2：调用大模型
const response = await model.invoke(formattedPrompt);

// 步骤3：解析大模型输出
const rawText =
  typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
const result = await outputParser.parse(rawText);

console.log('✅ 最终结果:');
console.log(result);
