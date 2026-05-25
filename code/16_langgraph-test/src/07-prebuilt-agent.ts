import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getProductBySku } from './06-inventory-mock.js';
import z from 'zod';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { MemorySaver } from '@langchain/langgraph';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const getProductStock = tool(async ({ sku }) => getProductBySku(sku), {
  name: 'get_product_stock',
  description: '按 SKU 查商品名与库存，SKU 如 SKU-001',
  schema: z.object({
    sku: z.string().describe('商品 SKU'),
  }),
});

const model = new ChatOpenAI({
  model: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

const agent = createAgent({
  model,
  tools: [getProductStock],
  systemPrompt: '你是一名仓库助手。问库存时必须调用 get_product_stock（模拟数据），禁止编造。',
  checkpointer: new MemorySaver(),
});

const result = await agent.invoke({ messages: [new HumanMessage('SKU-002 还剩多少库存？')] }, {
  configurable: { thread_id: 'demo-thread' },
} as any);

const drawable = await agent.graph.getGraphAsync();
const mermaid = drawable.drawMermaid({ withStyles: true });
console.log(mermaid);

const last = result.messages[result.messages.length - 1];
console.log(last?.content ?? result);
