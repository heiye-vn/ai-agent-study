import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';
import { createAgent, tool } from 'langchain';
import path from 'path';
import { fileURLToPath } from 'url';
import z from 'zod';
import { lookupWeather, lookupCityTrivia } from './08-simple-mock.js';
import { createSupervisor } from '@langchain/langgraph-supervisor';
import { HumanMessage } from '@langchain/core/messages';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const model = new ChatOpenAI({
  model: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

const lookupWeatherTool = tool(async ({ city }) => lookupWeather(city), {
  name: 'lookup_weather',
  description: '查询某城市当日天气概况（气温区间、天气、空气质量等）',
  schema: z.object({
    city: z.string().describe('城市名，如 杭州'),
  }),
});

const lookupCityTriviaTool = tool(async ({ city }) => lookupCityTrivia(city), {
  name: 'lookup_city_trivia',
  description: '查询与某城市相关的一句趣味知识',
  schema: z.object({
    city: z.string().describe('城市名，如 杭州'),
  }),
});

/* 子代理 A: 只回答【天气】类问题 */
const weatherAgent = createAgent({
  name: 'weather_agent',
  description: '专门查询天气',
  model,
  tools: [lookupWeatherTool],
  systemPrompt:
    '你只处理天气，用户提到城市时，用 lookup_weather 这个工具查询，然后再用中文简短说明。',
});

/* 子代理 B: 只回答【城市小知识】 */
const triviaAgent = createAgent({
  name: 'trivia_agent',
  description: '专门讲与城市相关的小知识；必须调用 lookup_city_trivia 这个 tool',
  model,
  tools: [lookupCityTriviaTool],
  systemPrompt:
    '你只讲城市小知识。先调用 lookup_city_trivia 这个 tool，然后用简洁的语言把结果讲清楚。不要编造工具里没有的内容',
});

/**
 * Supervisor：根据用户问的是【天气】还是【小知识】切换子代理
 * （真实业务里还可以再加更多的子代理）
 * createSupervisor：创建核心调度器
 */
const workflow = createSupervisor({
  agents: [weatherAgent.graph, triviaAgent.graph],
  llm: model,
  prompt: `你是一个调度员，只负责选人，不要自己报温度、也不要自己将城市百科。
    - 问天气、气温、下不下雨、空气等内容 -> 用 weather_agent
    - 问小知识、名胜、历史、一句话介绍等内容 -> 用 trivia_agent
    `,
});

const app = workflow.compile();

const drawable = await app.getGraphAsync();
console.log(drawable.drawMermaid({ withStyles: true }));

const input = {
  messages: [new HumanMessage('查一下杭州的天气，再讲一条和杭州有关的小知识')],
};

const nodePath = [];
let finalState = null;
const stream = await app.stream(input, { streamMode: ['updates', 'values'] });
for await (const event of stream) {
  const [mode, payload] = event;
  if ((mode as unknown as string) === 'updates' && payload && typeof payload === 'object') {
    nodePath.push(...Object.keys(payload));
  } else if ((mode as unknown as string) === 'values') {
    finalState = payload;
  }
}

console.log('路径:', nodePath.join(' → '));
const last = finalState?.messages?.[finalState.messages.length - 1];
console.log(last?.content ?? finalState?.messages);
