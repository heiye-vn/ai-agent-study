import dotenv from 'dotenv';
import { Client } from 'langsmith';
import path from 'path';
import { fileURLToPath } from 'url';
import { evaluate } from 'langsmith/evaluation';
import { ask } from '../02-rag_agent';
import { ragEvaluators } from './02-evaluators';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../../.env') }).parsed || {};

const DATASET_NAME = 'rag-eval-v1';
const client = new Client({ apiKey: envVars.LANGCHAIN_API_KEY });

/* 被评测的 RAG Agent 包装器函数：将输入问题传入 RAG 智能体，并规范化输出格式以供 Evaluators 使用 */
async function runRagAgent(inputs: any) {
  // 调用本地 RAG Agent 获取答案及检索上下文
  const { answer, context } = await ask(inputs.question);

  // 返回符合评测指标要求的标准化输出（将上下文文档映射为纯文本数组）
  return {
    answer,
    context: context.map((d) => d.pageContent),
  };
}

/**
 * 主评测流程入口函数：使用 LangSmith 的 evaluate 函数自动对 RAG Agent 进行多维度评测
 */
async function main() {
  // 调用 LangSmith 评测接口，传入被评测对象、评估集名称、评估器数组等参数
  const result = await evaluate(runRagAgent, {
    data: DATASET_NAME,
    evaluators: ragEvaluators,
    client,
    experimentPrefix: `rag-openvals-${envVars.QINIU_MODEL_NAME ?? 'qwen'}`,
    maxConcurrency: 2, // 限制最大并发数，防止超出大模型 API 限制或限流
  });

  // 等待所有的测试样本执行并评估完毕
  for await (const _row of result) {
  }

  const project = envVars.LANGCHAIN_PROJECT ?? 'default';
  console.log('✅ 评测完成');
  console.log('实验名:', result.experimentName);
  console.log('指标: rag_groundedness | rag_helpfulness | rag_retrieval_relevance');
  console.log(
    `报告: https://smith.langchain.com/o/default/projects/p/${encodeURIComponent(project)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
