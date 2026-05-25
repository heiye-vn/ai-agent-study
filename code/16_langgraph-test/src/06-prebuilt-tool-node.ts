import { tool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt';
import z from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { getProductBySku } from './06-inventory-mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const getProductStock = tool(async ({ sku }) => getProductBySku(sku), {
  name: 'get_product_stock',
  description: '按 SKU 查商品名与库存，SKU 如 SKU-001',
  schema: z.object({
    sku: z.string().describe('商品 SKU'),
  }),
});

const tools = [getProductStock];

const llm = new ChatOpenAI({
  model: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
}).bindTools(tools);

async function agent(state: any) {
  const response = await llm.invoke(state.messages);
  return { messages: response };
}

const toolNode = new ToolNode(tools);

const graph = new StateGraph(MessagesAnnotation)
  .addNode('agent', agent)
  .addNode('tools', toolNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', toolsCondition, ['tools', END])
  .addEdge('tools', 'agent')
  .compile();

const result = await graph.invoke({
  messages: [new HumanMessage('查一下 SKU-001 的库存还有多少，回答里带上商品名和数字。')],
});

const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({ withStyles: true });
console.log(mermaid);

const last = result.messages[result.messages.length - 1];
console.log(last?.content ?? result.messages);
