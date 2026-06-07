/**
 * 查询改写与扩写组件 (02-query-augment.ts)
 * 
 * 主要职责：
 * 1. 采用大语言模型对用户输入的原始中文问题进行改写或扩写，生成另外 3 条多角度的中文检索问句。
 * 2. 结合 Zod 模式定义（withStructuredOutput）保证大模型输出格式是精确的 JSON 结构。
 * 3. 提取包含原始问题和扩写问题的“多角度检索列表”（共 4 条检索问句），用于多分支关键词/向量搜索。
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import z from 'zod';

// 1. Zod 结构定义：强制约束大模型的输出格式为一个恰好包含 3 个检索句子的 queries 数组
export const QueryAugmentActionSchema = z.object({
  queries: z
    .array(z.string())
    .length(3)
    .describe(
      '恰好 3 条中文检索问句：不同角度改写或扩写；保留订单号、品牌等字面信息；不要编造事实'
    ),
});

// 2. 改写任务提示词模板：指导 LLM 保持核心信息不变的情况下，从拼写变体、同义表达、场景细化等角度扩展提问方式
const AUGMENT_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `用户会给出一句中文问题。请另外写出恰好 3 条检索用的问句（与原意一致、角度尽量不同），便于搜索引擎或向量库分别召回：
可改写说法、换提问角度、或略加限定词；专有名词、型号、订单号等必须保留原样。
只输出结构化字段 queries（长度为 3 的字符串数组）。`,
  ],
  ['human', '{query}'],
]);

/**
 * 校验并归一化扩写结果。
 * 过滤空字符串或非字符串类型，如果扩写数量不足 3 条，则用原始问题进行保底填充，确保输出永远为 3 条。
 */
function normalizeThreeQueries(original: string, list: any) {
  const out = (list ?? []).map((s: any) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);

  while (out.length < 3) out.push(original);
  return out.slice(0, 3);
}

/**
 * 查询扩写逻辑主函数
 * 
 * @param chatModel 大语言模型实例
 * @param query 原始用户输入问题
 * @returns 扩写后的 3 条检索问句列表（queries）
 */
export async function augmentQuery(chatModel: any, query: string) {
  // 通过 withStructuredOutput 绑定 Zod Schema，使大模型强行输出 JSON 格式
  const structured = chatModel.withStructuredOutput(QueryAugmentActionSchema);
  const chain = AUGMENT_PROMPT.pipe(structured);
  try {
    const raw: any = await chain.invoke({ query });
    return { queries: normalizeThreeQueries(query, raw?.queries) };
  } catch (error: any) {
    // 容灾保底：在模型超时或解析 JSON 失败时，返回 3 个由原始提问填充的数组
    return { queries: normalizeThreeQueries(query, []) };
  }
}

/**
 * 拼接检索句子列表
 * 
 * 原始问题作为第 0 位（最优先），加上 LLM 生成的 3 个改写问题，组合成用于多路检索的 4 条检索词序列。
 */
export function retrievalQueryStrings(original: string, augmentation: any) {
  return [original, ...(augmentation?.queries ?? [])]
    .map((s: any) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
}


