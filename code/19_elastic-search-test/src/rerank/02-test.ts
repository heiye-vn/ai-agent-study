import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { DashScopeRerank } from './01-dashscope-rerank';
import { Document } from '@langchain/core/documents';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function main() {
  const apiKey = process.env.QWEN_API_KEY;

  const compressor = new DashScopeRerank({ apiKey, topN: 3 });

  const query = '什么是文本排序模型';

  const docs = [
    new Document({ pageContent: '预训练语言模型的发展给文本排序带来了新的进展' }),
    new Document({ pageContent: '量子计算是计算机科学的一个前沿领域' }),
    new Document({ pageContent: '文本排序模型广泛应用于搜索引擎和推荐系统中...' }),
  ];

  const reranked = await compressor.compressDocuments(docs, query);

  console.log('重排后顺序（pageContent）：');

  for (const d of reranked) {
    console.log('-', d.pageContent);
  }
}

main();
