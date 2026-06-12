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
  model: 'qwen-plus', // 固定为 qwen-plus 模型，因为 qwen-plus 模型对测评库 Prompt 的兼容输出更好
  configuration: { baseURL: envVars.QWEN_BASE_URL },
  temperature: 0,
});

// 1. 初始化忠实度裁判：判断生成的回答是否被检索出的上下文所支撑，检测有无凭空捏造的幻觉
const ragGroundednessJudge = createLLMAsJudge({
  // 千问 API 有一个硬性校验规定：若使用 json_object 输出格式，Prompt 或消息内容中必须显式包含 'json' 或 'JSON' 词汇
  prompt: RAG_GROUNDEDNESS_PROMPT + '\nRespond in JSON format.',
  feedbackKey: 'rag_groundedness',
  judge,
  continuous: true, // 开启连续打分（如 0 到 1 之间的数值）
});

// 2. 初始化有用性裁判：判断生成的回答是否有效解答了用户的输入问题，是否切题或答非所问
const ragHelpfulnessJudge = createLLMAsJudge({
  prompt: RAG_HELPFULNESS_PROMPT + '\nRespond in JSON format.',
  feedbackKey: 'rag_helpfulness',
  judge,
  continuous: true,
});

// 3. 初始化检索相关性裁判：判断向量库检索出来的文档片段与用户提问是否高度相关
const ragRetrievalRelevanceJudge = createLLMAsJudge({
  prompt: RAG_RETRIEVAL_RELEVANCE_PROMPT + '\nRespond in JSON format.',
  feedbackKey: 'rag_retrieval_relevance',
  judge,
  continuous: true,
});

/**
 * 裁判调用包装器：用于日志记录并确保 score 打分具有正确的数字/布尔类型
 */
async function wrapJudgeCall(judgeFn: any, args: any, name: string) {
  try {
    const result = await judgeFn(args);
    console.log(`[Eval Debug - ${name}] raw result:`, JSON.stringify(result));

    // 转换 score 的字符串格式为正确数值或布尔，防止 LangSmith 422 报错
    if (result && result.score !== undefined && result.score !== null) {
      if (typeof result.score === 'string') {
        const num = Number(result.score);
        if (!isNaN(num)) {
          result.score = num;
        } else {
          const lower = result.score.toLowerCase().trim();
          if (lower === 'true' || lower === 'yes') result.score = true;
          else if (lower === 'false' || lower === 'no') result.score = false;
        }
      }
    }
    console.log(`[Eval Debug - ${name}] sanitized result:`, JSON.stringify(result));
    return result;
  } catch (error) {
    console.error(`[Eval Debug - ${name}] error:`, error);
    throw error;
  }
}

/**
 * 忠实度 (Groundedness) 评估器：评判大模型生成的 answer 是否完全基于 context
 * @param param0 包含大模型输出结果 outputs 的对象
 * @returns 评测打分及反馈结果
 */
export async function ragGroundednessEvaluator({ outputs }) {
  return wrapJudgeCall(
    ragGroundednessJudge,
    {
      context: { documents: outputs.context },
      outputs: { answer: outputs.answer },
    },
    'Groundedness'
  );
}

/**
 * 有用性 (Helpfulness) 评估器：评判大模型生成的 answer 是否对解答 input 问题有帮助
 * @param param0 包含输入 inputs 与模型输出 outputs 的对象
 * @returns 评测打分及反馈结果
 */
export async function ragHelpfulnessEvaluator({ inputs, outputs }) {
  return wrapJudgeCall(
    ragHelpfulnessJudge,
    { inputs, outputs: { answer: outputs.answer } },
    'Helpfulness'
  );
}

/**
 * 检索相关性 (Retrieval Relevance) 评估器：评判检索出的文档 chunks 是否与 input 问题相关
 * @param param0 包含输入 inputs 与模型输出 outputs 的对象
 * @returns 评测打分及反馈结果
 */
export async function ragRetrievalRelevanceEvaluator({ inputs, outputs }) {
  return wrapJudgeCall(
    ragRetrievalRelevanceJudge,
    {
      inputs,
      context: { documents: outputs.context },
    },
    'RetrievalRelevance'
  );
}

// 导出所有评估器的数组，以便在评测运行器中统一配置并自动执行
export const ragEvaluators = [
  ragGroundednessEvaluator,
  ragHelpfulnessEvaluator,
  ragRetrievalRelevanceEvaluator,
];
