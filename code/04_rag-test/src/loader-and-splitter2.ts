import dotenv from 'dotenv';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import path from 'path';
import { fileURLToPath } from 'url';
import 'cheerio';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const model = new ChatOpenAI({
  modelName: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

const embeddings = new OpenAIEmbeddings({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.EMBEDDINGS_MODEL_NAME as any,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

const cheerioLoader = new CheerioWebBaseLoader(
  // "https://juejin.cn/post/7233327509919547452",
  'https://juejin.cn/post/7208036915015467066',
  {
    selector: '.main-area p',
  }
);

const documents = await cheerioLoader.load();

console.assert(documents.length === 1);
console.log(`Total characters: ${documents[0].pageContent.length}`);

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500, // 每个分开的字符数
  chunkOverlap: 20, // 分块之间的重叠字符数
  separators: ['。', '！', '？'], // 分割符，优先使用段落分割
});

const splitDocuments = await textSplitter.splitDocuments(documents);

console.log(`文档分割完成，共 ${splitDocuments.length} 个分块\n`);

console.log('正在创建向量存储...');

// 创建向量存储
const vectorStore = await MemoryVectorStore.fromDocuments(splitDocuments, embeddings);

console.log('向量存储创建完成\n');

// const questions = ['父亲的去世对作者的人生态度产生了怎样的根本性逆转？'];
const questions = ['typescript 中的类型断言是什么？', 'typescript 中的类型断言有什么作用？'];

// RAG 流程：对每个问题进行检索和回答
for (const question of questions) {
  console.log('='.repeat(50));
  console.log(`问题: ${question}`);
  console.log('='.repeat(50));

  // 使用 similaritySearchWithScore 获取相似度评分
  const scoredResults = await vectorStore.similaritySearchWithScore(question, 2);

  // 从带评分的结果中提取文档
  const retrievedDocs = scoredResults.map(([doc]) => doc);

  // 打印检索到的文档和相似度评分
  console.log('\n【检索到的文档及相似度评分】');
  retrievedDocs.forEach((doc, i) => {
    // 找到对应的评分
    const scoredResult = scoredResults.find(
      ([scoredDoc]) => scoredDoc.pageContent === doc.pageContent
    );
    const score = scoredResult ? scoredResult[1] : null;
    const similarity = score !== null ? (1 - score).toFixed(4) : 'N/A';
    console.log(`\n[文档 ${i + 1}] 相似度: ${similarity}`);
    console.log(`内容: ${doc.pageContent}`);
    if (doc.metadata && Object.keys(doc.metadata).length > 0) {
      console.log(`元数据:`, doc.metadata);
    }
  });

  // 构建 prompt
  const context = retrievedDocs
    .map((doc, i) => `[片段${i + 1}]\n${doc.pageContent}`)
    .join('\n\n━━━━━\n\n');

  const prompt = `你是一个文章辅助阅读助手，根据文章内容来解答：

文章内容：
${context}

问题: ${question}

你的回答:`;

  console.log('\n【AI 回答】');
  const response = await model.invoke(prompt);
  console.log(response.content);
  console.log('\n');
}
