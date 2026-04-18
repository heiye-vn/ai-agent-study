import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';
import path, { parse } from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const COLLECTION_NAME = 'ebook_collection';
const VECTOR_DIMENSION = 1024;

// 初始化 OpenAI Chat 模型
const model = new ChatOpenAI({
  temperature: 0.7,
  model: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

// 初始化文本向量化模型
const embeddings = new OpenAIEmbeddings({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.EMBEDDINGS_MODEL_NAME as string,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
  dimensions: VECTOR_DIMENSION,
});

// 初始化 Milvus 客户端
const milvusClient = new MilvusClient({
  address: envVars.MILVUS_ADDRESS,
});

async function getEmbedding(text: string) {
  const result = await embeddings.embedQuery(text);
  return result;
}

/**
 * 从 Milvus 中检索相关的电子书内容
 */
async function retrieveRelevantContent(question, topK = 3) {
  try {
    // 生成问题的向量
    const queryVector = await getEmbedding(question);

    // 在 Milvus 中搜索相似的内容
    const searchResult = await milvusClient.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit: topK,
      metric_type: MetricType.COSINE,
      output_fields: ['id', 'book_id', 'chapter_num', 'index', 'content'],
    });

    return searchResult.results; // 返回搜索结果
  } catch (error) {
    console.error('检索内容时出错:', error.message);
    return [];
  }
}

/**
 * 使用 RAG 回答关于《天龙八部》的问题
 */
async function answerEbookQuestion(question, topK = 3) {
  try {
    console.log('='.repeat(80));
    console.log(`问题: ${question}`);
    console.log('='.repeat(80)); // 1. 检索相关内容

    console.log('\n【检索相关内容】');
    const retrievedContent = await retrieveRelevantContent(question, topK);

    if (retrievedContent.length === 0) {
      console.log('未找到相关内容');
      return '抱歉，我没有找到相关的《天龙八部》内容。';
    }

    // 2. 打印检索到的内容及相似度
    retrievedContent.forEach((item, i) => {
      console.log(`\n[片段 ${i + 1}] 相似度: ${item.score.toFixed(4)}`);
      console.log(`书籍: ${item.book_id}`);
      console.log(`章节: 第 ${item.chapter_num} 章`);
      console.log(`片段索引: ${item.index}`);
      console.log(
        `内容: ${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}`
      );
    });

    // 3. 构建上下文
    const context = retrievedContent
      .map((item, i) => {
        return `[片段 ${i + 1}]
章节: 第 ${item.chapter_num} 章
内容: ${item.content}`;
      })
      .join('\n\n━━━━━\n\n');

    // 4. 构建 prompt
    const prompt = `你是一个专业的《天龙八部》小说助手。基于小说内容回答问题，用准确、详细的语言。

请根据以下《天龙八部》小说片段内容回答问题：
${context}

用户问题: ${question}

回答要求：
1. 如果片段中有相关信息，请结合小说内容给出详细、准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
4. 回答要准确，符合小说的情节和人物设定
5. 可以引用原文内容来支持你的回答

AI 助手的回答:`;

    // 5. 调用 LLM 生成回答
    console.log('\n【AI 回答】');
    const response = await model.invoke(prompt);
    console.log(response.content);
    console.log('\n');

    return response.content;
  } catch (error) {
    console.error('回答问题时出错:', error.message);
    return '抱歉，处理您的问题时出现了错误。';
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('连接到 Milvus...');
    await milvusClient.connectPromise;
    console.log('✓ 已连接\n'); // 确保集合已加载

    try {
      await milvusClient.loadCollection({ collection_name: COLLECTION_NAME });
      console.log('✓ 集合已加载\n');
    } catch (error) {
      // 如果已经加载，会报错，忽略即可
      if (!error.message.includes('already loaded')) {
        throw error;
      }
      console.log('✓ 集合已处于加载状态\n');
    } // 问一个关于《天龙八部》的问题

    // await answerEbookQuestion('鸠摩智会什么武功？', 5);
    await answerEbookQuestion('乔峰、虚竹、段誉三兄弟谁最厉害？', 5);
  } catch (error) {
    console.error('错误:', error.message);
  }
}

main();
