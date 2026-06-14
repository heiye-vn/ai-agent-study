import { ChatOpenAI } from '@langchain/openai';
import { createAgent, HumanMessage, todoListMiddleware } from 'langchain';
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

const agent = createAgent({
  model,
  tools: [],
  systemPrompt:
    '你是生活规划助手。收到需要多步完成的请求时，先用 write_todos 列出中文执行步骤，然后简要说明你的计划。',
  middleware: [todoListMiddleware()],
});

const query =
  '我下周末想带爸妈去杭州玩两天，帮我规划一下：交通怎么选、住哪里方便、必去景点和吃什么，预算控制在人均 1500 元左右。';

const result = await agent.invoke({
  messages: [new HumanMessage(query)],
});

console.log('todos:', JSON.stringify(result.todos, null, 2));
console.log('─'.repeat(50));
console.log('回复:', result.messages.at(-1)?.content);
