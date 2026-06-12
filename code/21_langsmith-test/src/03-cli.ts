import dotenv from 'dotenv';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import { ask } from './02-rag_agent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

// 默认测试问题列表：当未传入命令行参数时，默认执行这组常见问答测试
const DEFAULT_QUESTIONS = [
  '无理由退货要在几天内？',
  '满多少元包邮？',
  '金卡会员有什么折扣？',
  '电子发票多久能开好？',
  '手机保修多久？',
  '紧急问题怎么联系客服？',
];

// 解析命令行传入的参数，如果有参数则作为单个问题提问，否则使用默认问题列表
const args = process.argv.slice(2);
const questions = args.length > 0 ? [args.join(' ')] : DEFAULT_QUESTIONS;

/**
 * 打印检索出的来源文档片段信息（辅助调试）
 * @param context 包含检索到的文档的数组
 */
function printContext(context: any) {
  if (context.length) {
    console.log('\n引用片段：（无）');
    return;
  }
  // console.log("\n引用片段:");
  // context.forEach((doc, i) => {
  //   const source = doc.metadata?.source ?? "未知";
  //   const text = doc.pageContent.replace(/\s+/g, " ").trim();
  //   const preview = text.length > 100 ? `${text.slice(0, 100)}…` : text;
  //   console.log(`  [${i + 1}] ${source}`);
  //   console.log(`      ${preview}`);
  // });
}

// 遍历问题列表，逐个调用 RAG Agent 提问并打印模型回答与来源上下文
for (let i = 0; i < questions.length; i++) {
  const question = questions[i];
  console.log(`\n${'='.repeat(50)}`);
  console.log(`问题 ${i + 1}: ${question}`);

  // 调用 RAG Agent 接口获取答复与引用文档
  const { answer, context } = await ask(question);
  console.log(`\n答: ${answer}`);
  printContext(context);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`共 ${questions.length} 个问题`);
