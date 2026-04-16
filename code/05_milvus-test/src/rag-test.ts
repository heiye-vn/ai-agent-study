import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';
import dotenv from 'dotenv';
import path from 'path';
import { env } from 'process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const COLLECTION_NAME = 'ai_diary'; // 集合名称
const VECTOR_DIMENSION = 1024; // 向量维度大小

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

/**
 * 获取文本的向量嵌入
 */
async function getEmbedding(text: string) {
  const result = await embeddings.embedQuery(text);
  return result;
}
/**
 * 从 Milvus 中检索相关的日记条目
 */
async function retrieveRelevantDiaries(question, k = 2) {
  try {
    // 生成问题的向量
    const queryVector = await getEmbedding(question); // 在 Milvus 中搜索相似的日记

    const searchResult = await milvusClient.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit: k,
      metric_type: MetricType.COSINE,
      output_fields: ['id', 'content', 'date', 'mood', 'tags'],
    });

    return searchResult.results;
  } catch (error) {
    console.error('检索日记时出错:', error.message);
    return [];
  }
}

/**
 * 使用 RAG 回答关于日记的问题
 */
async function answerDiaryQuestion(question, k = 2) {
  try {
    console.log('='.repeat(80));
    console.log(`问题: ${question}`);
    console.log('='.repeat(80)); // 1. 检索相关日记

    console.log('\n【检索相关日记】');
    const retrievedDiaries = await retrieveRelevantDiaries(question, k);

    if (retrievedDiaries.length === 0) {
      console.log('未找到相关日记');
      return '抱歉，我没有找到相关的日记内容。';
    } // 2. 打印检索到的日记及相似度

    retrievedDiaries.forEach((diary, i) => {
      console.log(`\n[日记 ${i + 1}] 相似度: ${diary.score.toFixed(4)}`);
      console.log(`日期: ${diary.date}`);
      console.log(`心情: ${diary.mood}`);
      console.log(`标签: ${diary.tags?.join(', ')}`);
      console.log(`内容: ${diary.content}`);
    }); // 3. 构建上下文

    const context = retrievedDiaries
      .map((diary, i) => {
        return `[日记 ${i + 1}]
    日期: ${diary.date}
    心情: ${diary.mood}
    标签: ${diary.tags?.join(', ')}
    内容: ${diary.content}`;
      })
      .join('\n\n━━━━━\n\n'); // 4. 构建 prompt

    const prompt = `你是一个温暖贴心的 AI 日记助手。基于用户的日记内容回答问题，用亲切自然的语言。
    
    请根据以下日记内容回答问题：
    ${context}
    
    用户问题: ${question}
    
    回答要求：
    1. 如果日记中有相关信息，请结合日记内容给出详细、温暖的回答
    2. 可以总结多篇日记的内容，找出共同点或趋势
    3. 如果日记中没有相关信息，请温和地告知用户
    4. 用第一人称"你"来称呼日记的作者
    5. 回答要有同理心，让用户感到被理解和关心
    
    AI 助手的回答:`; // 5. 调用 LLM 生成回答

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

// 主函数
async function main() {
  try {
    console.log('连接到 Milvus...');
    await milvusClient.connectPromise;
    console.log('✓ 已连接\n');

    await answerDiaryQuestion('我最近做了什么让我感到快乐的事情？', 2);
  } catch (error) {
    console.error('错误:', error.message);
  }
}

main();
