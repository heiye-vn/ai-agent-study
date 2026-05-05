import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

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

// 定义一个 chain，使用 RunnableSequence 链式执行
// const chain = RunnableSequence.from([promptTemplate, model, outputParser]);

const chain = promptTemplate.pipe(model).pipe(outputParser);

const input = {
  text: 'LangChain 是一个强大的 AI 应用开发框架',
  format_instructions: outputParser.getFormatInstructions(),
};

const result = await chain.invoke(input);

console.log('✅ 最终结果:');
console.log(result);
