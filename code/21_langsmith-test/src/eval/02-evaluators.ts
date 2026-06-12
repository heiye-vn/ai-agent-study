/* OpenEvals 内置 RAG 指标 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createLLMAsJudge,
  RAG_GROUNDEDNESS_PROMPT,
  RAG_HELPFULNESS_PROMPT,
  RAG_RETRIEVAL_RELEVANCE_PROMPT,
} from 'openevals';
import { ChatOpenAI } from '@langchain/openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../../.env') }).parsed || {};

// 初始化大模型裁判 (Judge LLM)，用于对评估指标进行打分评估，设定 temperature=0 以保证评测标准的客观稳定
const judge = new ChatOpenAI({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.QWEN_MODEL_NAME ?? 'qwen-plus',
  configuration: { baseURL: envVars.QWEN_BASE_URL },
  temperature: 0,
});

// 1. 初始化忠实度裁判：判断生成的回答是否被检索出的上下文所支撑，检测有无凭空捏造的幻觉
const ragGroundednessJudge = createLLMAsJudge({
  prompt: RAG_GROUNDEDNESS_PROMPT,
  feedbackKey: 'rag_groundedness',
  judge,
  continuous: true, // 开启连续打分（如 0 到 1 之间的数值）
});

// 2. 初始化有用性裁判：判断生成的回答是否有效解答了用户的输入问题，是否切题或答非所问
const ragHelpfulnessJudge = createLLMAsJudge({
  prompt: RAG_HELPFULNESS_PROMPT,
  feedbackKey: 'rag_helpfulness',
  judge,
  continuous: true,
});

// 3. 初始化检索相关性裁判：判断向量库检索出来的文档片段与用户提问是否高度相关
const ragRetrievalRelevanceJudge = createLLMAsJudge({
  prompt: RAG_RETRIEVAL_RELEVANCE_PROMPT,
  feedbackKey: 'rag_retrieval_relevance',
  judge,
  continuous: true,
});

/**
 * 忠实度 (Groundedness) 评估器：评判大模型生成的 answer 是否完全基于 context
 * @param param0 包含大模型输出结果 outputs 的对象
 * @returns 评测打分及反馈结果
 */
export async function ragGroundednessEvaluator({ outputs }) {
  return ragGroundednessJudge({
    context: { documents: outputs.context },
    outputs: { answer: outputs.answer },
  });
}

/**
 * 有用性 (Helpfulness) 评估器：评判大模型生成的 answer 是否对解答 input 问题有帮助
 * @param param0 包含输入 inputs 与模型输出 outputs 的对象
 * @returns 评测打分及反馈结果
 */
export async function ragHelpfulnessEvaluator({ inputs, outputs }) {
  return ragHelpfulnessJudge({ inputs, context: { answer: outputs.answer } });
}

/**
 * 检索相关性 (Retrieval Relevance) 评估器：评判检索出的文档 chunks 是否与 input 问题相关
 * @param param0 包含输入 inputs 与模型输出 outputs 的对象
 * @returns 评测打分及反馈结果
 */
export async function ragRetrievalRelevanceEvaluator({ inputs, outputs }) {
  return ragRetrievalRelevanceJudge({
    inputs,
    context: { documents: outputs.context },
  });
}

// 导出所有评估器的数组，以便在评测运行器中统一配置并自动执行
export const ragEvaluators = [
  ragGroundednessEvaluator,
  ragHelpfulnessEvaluator,
  ragRetrievalRelevanceEvaluator,
];
