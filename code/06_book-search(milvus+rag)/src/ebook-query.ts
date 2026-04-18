import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node';
import { OpenAIEmbeddings } from '@langchain/openai';
import dotenv from 'dotenv';
import path, { parse } from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const COLLECTION_NAME = 'ebook_collection';
const VECTOR_DIMENSION = 1024;

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

async function main() {
  try {
    console.log('Connecting to Milvus...');
    await milvusClient.connectPromise;
    console.log('✓ Connected\n'); // 确保集合已加载

    try {
      await milvusClient.loadCollection({ collection_name: COLLECTION_NAME });
      console.log('✓ 集合已加载\n');
    } catch (error) {
      // 如果已经加载，会报错，忽略即可
      if (!error.message.includes('already loaded')) {
        throw error;
      }
      console.log('✓ 集合已处于加载状态\n');
    } // 向量搜索

    console.log('Searching for similar ebook content...');
    const query = '段誉会什么武功？';
    console.log(`Query: "${query}"\n`);

    const queryVector = await getEmbedding(query);
    const searchResult = await milvusClient.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit: 3,
      metric_type: MetricType.COSINE,
      output_fields: ['id', 'book_id', 'chapter_num', 'index', 'content'],
    });

    console.log(`Found ${searchResult.results.length} results:\n`);
    searchResult.results.forEach((item, index) => {
      console.log(`${index + 1}. [Score: ${item.score.toFixed(4)}]`);
      console.log(`   ID: ${item.id}`);
      console.log(`   Book ID: ${item.book_id}`);
      console.log(`   Chapter: 第 ${item.chapter_num} 章`);
      console.log(`   Index: ${item.index}`);
      console.log(`   Content: ${item.content}\n`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
