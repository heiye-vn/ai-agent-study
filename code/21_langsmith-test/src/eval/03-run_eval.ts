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

/* 被评测的 RAG Agent */
async function runRagAgent(inputs: any) {
  const { answer, context } = await ask(inputs.question);

  return {
    answer,
    context: context.map((d) => d.pageContent),
  };
}

async function main() {
  const result = await evaluate(runRagAgent, {
    data: DATASET_NAME,
    evaluators: ragEvaluators,
    client,
    experimentPrefix: `rag-openvals-${envVars.QINIU_MODEL_NAME ?? 'qwen'}`,
    maxConcurrency: 2,
  });

  // 等待全部样例跑完
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
