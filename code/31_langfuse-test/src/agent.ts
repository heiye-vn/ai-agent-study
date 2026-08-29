import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createDeepAgent } from 'deepagents';

const getWeather = tool(
  async ({ city }) => {
    const data: Record<string, string> = {
      shanghai: '31°C，闷热多云',
      tokyo: '28°C，晴',
      beijing: '33°C，晴热',
    };
    return data[city.trim().toLowerCase()] ?? `暂无 ${city} 的天气数据`;
  },
  {
    name: 'get_weather',
    description: '查询城市天气（模拟数据）',
    schema: z.object({
      city: z.string().describe('城市英文名，如 Shanghai'),
    }),
  }
);

const calculate = tool(async ({ a, b }) => String(a + b), {
  name: 'calculate',
  description: '两个数相加',
  schema: z.object({
    a: z.number(),
    b: z.number(),
  }),
});

export function createAgent() {
  return createDeepAgent({
    model: `openai:${process.env.OPENAI_MODEL ?? 'gpt-4o-mini'}`,
    // 由于 deepagents 内部引用的 @langchain/core 与当前项目版本不一致，使用 as any 避免跨版本的 protected 成员名义类型冲突
    tools: [getWeather, calculate] as any,
    systemPrompt: '你是助手。查天气用 get_weather，加法用 calculate。用简体中文回答。',
  });
}

/** 从 agent 结果里取出最终回复文本 */
export function extractReply(result: any) {
  const last = result?.messages?.at(-1);
  if (typeof last?.content === 'string') return last.content;
  if (Array.isArray(last?.content)) {
    return last.content
      .map((part: any) => (typeof part === 'string' ? part : (part?.text ?? '')))
      .join('');
  }
  return String(last?.content ?? result ?? '');
}

