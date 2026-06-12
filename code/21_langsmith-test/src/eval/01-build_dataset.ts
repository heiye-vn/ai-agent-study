import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'langsmith';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../../.env') }).parsed || {};

// LangSmith 上的评估数据集名称
const DATASET_NAME = 'rag-eval-v1';

// 评测样本数据（标准 Ground Truth），包含输入问题(question)和预期标准回答(answer)
const EXAMPLES = [
  {
    inputs: { question: '无理由退货要在几天内申请？' },
    outputs: { answer: '自签收之日起 7 天内支持无理由退货。' },
  },
  {
    inputs: { question: '质量问题换货期限是多久？' },
    outputs: { answer: '15 天内出现质量问题可免费换货。' },
  },
  {
    inputs: { question: '无理由退货运费谁承担？' },
    outputs: { answer: '无理由退货由买家承担退货运费。' },
  },
  {
    inputs: { question: '客服工作时间是什么？' },
    outputs: { answer: '周一至周五 9:00-18:00，周六 10:00-17:00，法定节假日顺延。' },
  },
  {
    inputs: { question: '满多少元包邮？' },
    outputs: { answer: '满 99 元包邮（部分大件/冷链除外）。' },
  },
  {
    inputs: { question: '现货商品多久发货？' },
    outputs: { answer: '付款后 24 小时内发货，大促期间 48 小时内。' },
  },
  {
    inputs: { question: '支持哪些支付方式？' },
    outputs: {
      answer: '支持微信支付、支付宝、银联云闪付、花呗/信用卡分期（满 500 元可选 3/6/12 期）。',
    },
  },
  {
    inputs: { question: '价保是多久？' },
    outputs: { answer: '下单后 7 天内同款降价可申请差价退还。' },
  },
  {
    inputs: { question: '金卡会员有什么折扣？' },
    outputs: { answer: '金卡享 95 折，并有专属客服和每月满 200 减 30 券。' },
  },
  {
    inputs: { question: '积分多少可以抵 1 元？' },
    outputs: { answer: '100 积分可抵 1 元，单笔最多抵扣实付金额的 30%。' },
  },
  {
    inputs: { question: '手机保修多久？' },
    outputs: { answer: '手机、平板、耳机全国联保 1 年。' },
  },
  {
    inputs: { question: '紧急问题怎么联系？' },
    outputs: { answer: '可拨打 400-800-1234 转 2，接通后报订单号。' },
  },
];

/**
 * 主程序：在 LangSmith 中创建或获取评估数据集，并向其中导入示例测试数据
 */
async function main() {
  // 初始化 LangSmith 客户端，读取环境变量中的 API Key
  const client = new Client({ apiKey: envVars.LANGCHAIN_API_KEY });

  let dataset;

  try {
    // 尝试读取已存在的同名数据集
    dataset = await client.readDataset({ datasetName: DATASET_NAME });
    console.log(`数据集已存在：${DATASET_NAME}`);
  } catch (error) {
    // 如果不存在，则新建该数据集
    dataset = await client.createDataset(DATASET_NAME, {
      description: 'RAG Agent 回归评估集',
    });
    console.log(`已创建数据集：${DATASET_NAME}`);
  }

  // 将本地评测示例列表映射并批量上传到 LangSmith 数据集中
  const created = await client.createExamples(
    EXAMPLES.map((e) => ({
      dataset_id: dataset.id,
      inputs: e.inputs,
      outputs: e.outputs,
    }))
  );

  console.log(`已创建 ${created.length} 个示例`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
