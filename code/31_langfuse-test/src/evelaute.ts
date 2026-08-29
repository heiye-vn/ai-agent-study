/**
 * Langfuse 离线评测：Dataset → Experiment（task + evaluators）→ Scores
 *
 * 流程：
 * 1. 确保评测 Dataset 存在并写入测试用例
 * 2. 对每条用例跑 Deep Agent（带 CallbackHandler，生成 Trace）
 * 3. 用确定性 evaluator 打分（关键词命中 / 必含数字等）
 * 4. 用 run-level evaluator 汇总平均分
 * 5. flush 后可在 Langfuse Datasets → Runs 对比结果
 */
import './instrumentation';

import { Langfuse } from 'langfuse';
import { CallbackHandler } from '@langfuse/langchain';
import { createAgent, extractReply } from './agent';
import { shutdownTracing } from './instrumentation';

const DATASET_NAME = process.env.LANGFUSE_DATASET_NAME ?? 'deepagents-eval';

/** 本地种子用例；expectedOutput.contains 为需在回复中出现的关键词（不区分大小写） */
const SEED_ITEMS = [
  {
    id: 'weather-shanghai',
    input: '用工具查一下 Shanghai 的天气，直接告诉我结果。',
    expectedOutput: {
      contains: ['31', '上海', 'shanghai', '闷热', '多云'],
      minHits: 1,
    },
    metadata: { case: 'weather' },
  },
  {
    id: 'weather-tokyo',
    input: '用工具查一下 Tokyo 的天气。',
    expectedOutput: {
      contains: ['28', '东京', 'tokyo', '晴'],
      minHits: 1,
    },
    metadata: { case: 'weather' },
  },
  {
    id: 'calculate-sum',
    input: '用计算器把 31 和 28 相加，只告诉我结果。',
    expectedOutput: {
      contains: ['59'],
      minHits: 1,
    },
    metadata: { case: 'calculate' },
  },
  {
    id: 'weather-then-sum',
    input: '查一下 Shanghai 和 Tokyo 的天气，再用计算器把两地气温数字相加（31+28），最后总结。',
    expectedOutput: {
      contains: ['31', '28', '59', '上海', '东京', 'shanghai', 'tokyo'],
      minHits: 3,
    },
    metadata: { case: 'e2e' },
  },
];

async function ensureDataset(langfuse: Langfuse) {
  try {
    await langfuse.createDataset({
      name: DATASET_NAME,
      description: 'Deep Agents 天气/计算工具评测集',
      metadata: { app: 'langfuse-test', version: '1' },
    });
    console.log(`created dataset: ${DATASET_NAME}`);
  } catch (err: any) {
    // 已存在则忽略
    const msg = err?.message ?? String(err);
    if (!/already|exist|409|conflict/i.test(msg)) {
      console.warn(`dataset create warning: ${msg}`);
    } else {
      console.log(`dataset exists: ${DATASET_NAME}`);
    }
  }

  for (const item of SEED_ITEMS) {
    await langfuse.createDatasetItem({
      datasetName: DATASET_NAME,
      id: `${DATASET_NAME}:${item.id}`,
      input: item.input,
      expectedOutput: item.expectedOutput,
      metadata: item.metadata,
    });
  }
  console.log(`upserted ${SEED_ITEMS.length} dataset items`);
}

/**
 * Item-level：检查回复是否包含足够多的期望关键词
 * expectedOutput: { contains: string[], minHits?: number }
 */
async function keywordHitEvaluator({ output, expectedOutput }: { output: any; expectedOutput?: any }) {
  const text = String(output ?? '').toLowerCase();
  const needles = expectedOutput?.contains ?? [];
  const minHits = expectedOutput?.minHits ?? 1;
  const hits = needles.filter((k: string) => text.includes(String(k).toLowerCase()));
  const passed = hits.length >= minHits;

  return {
    name: 'keyword_hit',
    value: passed ? 1 : 0,
    comment: passed
      ? `命中 ${hits.length}/${needles.length}：${hits.join(', ') || '—'}`
      : `未达 minHits=${minHits}，仅命中：${hits.join(', ') || '无'}`,
  };
}

/** Item-level：回复非空且有一定长度 */
async function nonEmptyEvaluator({ output }: { output: any }) {
  const text = String(output ?? '').trim();
  const ok = text.length >= 4;
  return {
    name: 'non_empty',
    value: ok ? 1 : 0,
    comment: ok ? `长度 ${text.length}` : '回复为空或过短',
  };
}

/** Run-level：keyword_hit 平均分 */
async function averageKeywordHit({ itemResults }: { itemResults: Array<{ evaluations?: Array<{ name: string; value: any }> }> }) {
  const scores = itemResults
    .flatMap((r) => r.evaluations ?? [])
    .filter((e) => e.name === 'keyword_hit')
    .map((e) => Number(e.value))
    .filter((v) => Number.isFinite(v));

  if (scores.length === 0) {
    return { name: 'avg_keyword_hit', value: null, comment: '无 keyword_hit 分数' };
  }

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    name: 'avg_keyword_hit',
    value: avg,
    comment: `平均命中率 ${(avg * 100).toFixed(1)}%（${scores.length} 条）`,
  };
}

async function main() {
  const langfuse = new Langfuse();

  console.log('1) ensure dataset + seed items…');
  await ensureDataset(langfuse);

  console.log('2) run experiment on Langfuse dataset…');
  const dataset = await langfuse.getDataset(DATASET_NAME);
  const runName = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;

  const itemResults: Array<{
    item: any;
    output: string;
    evaluations: Array<{ name: string; value: number | null; comment: string }>;
  }> = [];

  for (const item of dataset.items) {
    console.log(`\n▶ 运行测试用例: ${item.id}`);
    const handler = new CallbackHandler({
      sessionId: `eval-${DATASET_NAME}`,
      userId: 'eval-runner',
      tags: ['deepagents', 'evaluation'],
    });

    const agent = createAgent();
    const query = typeof item.input === 'string' ? item.input : String(item.input);
    const result = await agent.invoke(
      { messages: [{ role: 'user', content: query }] },
      { callbacks: [handler], recursionLimit: 30 }
    );

    const output = extractReply(result);
    console.log(`用例输出:`, output);

    if (handler.last_trace_id) {
      // 1. 将 trace 关联至数据集 Run
      await item.link(
        { traceId: handler.last_trace_id } as any,
        runName,
        {
          description: '天气查询 + 计算器工具调用评测',
          metadata: {
            model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
            app: 'langfuse-test',
          },
        }
      );

      // 2. 执行打分并上报 Score
      const evals = [
        await keywordHitEvaluator({ output, expectedOutput: item.expectedOutput }),
        await nonEmptyEvaluator({ output }),
      ];

      for (const e of evals) {
        await langfuse.score({
          traceId: handler.last_trace_id,
          name: e.name,
          value: e.value,
          comment: e.comment,
        });
      }

      itemResults.push({ item, output, evaluations: evals });
    }
  }

  console.log('\n3) experiment result:\n');
  console.table(
    itemResults.map((r) => ({
      用例ID: r.item.id,
      回复内容: r.output.slice(0, 30) + '...',
      关键词评估: r.evaluations.find((e) => e.name === 'keyword_hit')?.comment,
      非空评估: r.evaluations.find((e) => e.name === 'non_empty')?.comment,
    }))
  );

  const summary = await averageKeywordHit({ itemResults });
  console.log(`\n总体评估: ${summary.comment}`);

  await langfuse.flushAsync();
  console.log(`\n完成。到 Langfuse → Datasets →「${DATASET_NAME}」→ Runs 查看对比。`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdownTracing();
  });
