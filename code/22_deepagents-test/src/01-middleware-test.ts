import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';
import { AIMessage, createAgent, createMiddleware, HumanMessage, SystemMessage } from 'langchain';
import path from 'path';
import { fileURLToPath } from 'url';
import z from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const model = new ChatOpenAI({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.QWEN_MODEL_NAME ?? 'qwen-plus',
  temperature: 0,
  configuration: { baseURL: envVars.QWEN_BASE_URL },
});

/* 自定义 Middleware */

/* 日志 + 模型调用次数统计 */
const loggingMiddleware = createMiddleware({
  name: 'LoggingMiddleware',
  stateSchema: z.object({
    modelCallCount: z.number().default(0),
  }),
  beforeAgent: (state) => {
    console.log('\n[Logging] agent 开始，消息数: ', state.messages.length);
  },
  beforeModel: (state) => {
    console.log(
      `[Logging] 即将调用模型，当前消息数: ${state.messages.length}, 已调用: ${state.modelCallCount} 次`
    );
  },
  afterModel: (state) => {
    const last = state.messages[state.messages.length - 1];
    const preview =
      typeof last?.content === 'string'
        ? last.content.slice(0, 80)
        : JSON.stringify(last?.content)?.slice(0, 80);
    console.log(`[Logging] 模型返回: ${preview}...`);
    return { modelCallCount: state.modelCallCount + 1 };
  },
  afterAgent: (state) => {
    console.log(`[Logging] agent 结束，累计模型调用: ${state.modelCallCount} 次\n`);
  },
});

/* 在每次模型调用前追加 system 上下文 */
const addContextMiddleware = createMiddleware({
  name: 'AddContextMiddleware',
  wrapModelCall: async (request, handler) => {
    console.log('[AddContext] 注入额外 system 上下文');
    const systemMessage = request.systemMessage ?? new SystemMessage('');
    return handler({
      ...request,
      systemMessage: systemMessage.concat('\n\n 请用一句话简洁回答'),
    });
  },
});

/* 拦截敏感词，直接结束 agent */
const blockedContentMiddleware = createMiddleware({
  name: 'BlockedContentMiddleware',
  beforeModel: {
    canJumpTo: ['end'],
    hook: (state) => {
      const last = state.messages[state.messages.length - 1];
      const text = typeof last?.content === 'string' ? last.content : String(last?.content ?? '');
      if (text.includes('BLOCKED')) {
        console.log('[Blocked] 检测到 BLOCKED，短路结束');
        return {
          messages: [new AIMessage('该请求已被 middleware 拦截，无法处理。')],
          jumpTo: 'end',
        };
      }
      return;
    },
  },
});

/* Agent */
const agent = createAgent({
  model,
  tools: [],
  systemPrompt: '你是一个助手',
  middleware: [loggingMiddleware, addContextMiddleware, blockedContentMiddleware],
});

async function main() {
  for (const text of ['用中文说：middleware 是什么？', '这句话包含 BLOCKED 关键词']) {
    console.log('\n用户: ', text);

    const { messages, modelCallCount } = await agent.invoke({ messages: [new HumanMessage(text)] });

    console.log('回复: ', messages[messages.length - 1]?.content);
    console.log('modelCallCount: ', modelCallCount);
  }
}

main().catch(console.error);
