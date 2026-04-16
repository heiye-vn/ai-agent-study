import { OpenAIEmbeddings } from '@langchain/openai';
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const COLLECTION_NAME = 'ai_diary'; // 集合名称
const VECTOR_DIMENSION = 1024; // 向量维度大小

// 初始化文本向量化模型
const embeddings = new OpenAIEmbeddings({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.EMBEDDINGS_MODEL_NAME as string,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
  dimensions: VECTOR_DIMENSION,
});

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
    console.log('✓ Connected\n'); // 更新数据（Milvus 通过 upsert 实现更新）

    console.log('Updating diary entry...');
    const updateId = 'diary_001';
    const updatedContent = {
      id: updateId,
      content:
        '今天下了一整天的雨，心情很糟糕。工作上遇到了很多困难，感觉压力很大。一个人在家，感觉特别孤独。',
      date: '2026-01-10',
      mood: 'sad',
      tags: ['生活', '散步', '朋友'],
    };

    console.log('Generating new embedding...');
    const vector = await getEmbedding(updatedContent.content);
    const updateData = { ...updatedContent, vector };

    const result = await milvusClient.upsert({
      collection_name: COLLECTION_NAME,
      data: [updateData],
    });

    console.log(`✓ Updated diary entry: ${updateId}`);
    console.log(`  New content: ${updatedContent.content}`);
    console.log(`  New mood: ${updatedContent.mood}`);
    console.log(`  New tags: ${updatedContent.tags.join(', ')}\n`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
