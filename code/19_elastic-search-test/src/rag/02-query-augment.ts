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
    .describe('3 条不同角度改写或扩写后的中文检索问句'),
});

// 2. 改写任务提示词模板：指导 LLM 保持核心信息不变的情况下，从拼写变体、同义表达、场景细化等角度扩展提问方式
const AUGMENT_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `你是一个搜索查询改写专家。请将用户输入的中文问题改写为 3 条不同的检索问句，以便从搜索引擎或向量库中召回最相关的文档。
你必须返回合法的 JSON 格式。返回的 JSON 对象中必须只包含一个名为 "queries" 的字段，其值是包含 3 条不同角度改写问句的字符串数组。

改写规则：
1. 从不同角度、同义词、口语与书面语转换、场景细化等方面进行改写。
2. 确保 3 条问句在表达上“角度尽量不同”，严禁直接复制原句。
3. 专有名词、产品型号、订单号、数字等关键事实必须保留。
4. 必须输出 3 条不同的句子。

示例 1：
输入：电脑蓝屏怎么修
输出：
{{
  "queries": [
    "电脑开机蓝屏且无法进系统的解决办法",
    "Windows系统频繁蓝屏的排查步骤",
    "电脑蓝屏并显示错误代码怎么处理"
  ]
}}

示例 2：
输入：净水器SN-MILO-77821怎么换滤芯
输出：
{{
  "queries": [
    "净水器SN-MILO-77821更换滤芯的步骤教程",
    "SN-MILO-77821净水器滤芯如何拆卸和安装",
    "净水器SN-MILO-77821第三代复合滤芯保养说明"
  ]
}}
`,
  ],
  ['human', '输入：{query}\n输出：'],
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
  // 显式指定 method: 'jsonMode' 以便在通义千问等兼容 OpenAI 接口上获得更好的兼容性
  const structured = chatModel.withStructuredOutput(QueryAugmentActionSchema, { method: 'jsonMode' });
  const chain = AUGMENT_PROMPT.pipe(structured);
  try {
    const raw: any = await chain.invoke({ query });
    return { queries: normalizeThreeQueries(query, raw?.queries) };
  } catch (error: any) {
    console.error('查询改写失败，已触发容灾保底逻辑，错误信息:', error.message);
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


