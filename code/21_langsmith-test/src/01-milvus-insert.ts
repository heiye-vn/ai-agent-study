import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { DataType, IndexType, MetricType, MilvusClient } from '@zilliz/milvus2-sdk-node';
import dotenv from 'dotenv';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const COLLECTION_NAME = 'rag_docs';

const embeddings = new OpenAIEmbeddings({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.EMBEDDINGS_MODEL_NAME ?? 'text-embedding-v3',
  configuration: { baseURL: envVars.QWEN_BASE_URL },
});

const milvusClient = new MilvusClient({ address: envVars.MILVUS_ADDRESS ?? 'localhost:19530' });

async function loadChunks(dataDir = './data') {
  if (!existsSync(dataDir)) {
    throw new Error(`数据目录 ${dataDir} 不存在`);
  }

  const files = readdirSync(dataDir).filter((f) => /\.(txt|md)$/i.test(f));
  if (files.length === 0) {
    throw new Error(`目录内无 .txt/.md 文件：${dataDir}`);
  }

  const docs = files.map((f) => ({
    pageContent: readFileSync(join(dataDir, f), 'utf-8'),
    metadata: { source: f },
  }));

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });
  return splitter.splitDocuments(docs);
}

async function main() {
  try {
    console.log('Connection to Milvus...');
    await milvusClient.connectPromise;
    console.log('√ Connected\n');

    const chunks = await loadChunks();

    if ((await milvusClient.hasCollection({ collection_name: COLLECTION_NAME })).value) {
      await milvusClient.dropCollection({ collection_name: COLLECTION_NAME });
      console.log(`Dropped collection: ${COLLECTION_NAME}\n`);
    }

    console.log('Generating embeddings...');

    const vectors = await embeddings.embedDocuments(chunks.map((c) => c.pageContent));
    const dim = vectors[0].length;

    console.log('Generating collection...');

    await milvusClient.createCollection({
      collection_name: COLLECTION_NAME,
      fields: [
        {
          name: 'langchain_primaryid',
          data_type: DataType.Int64,
          is_primary_key: true,
          autoID: true,
        },
        { name: 'langchain_vector', data_type: DataType.FloatVector, dim },
        { name: 'langchain_text', data_type: DataType.VarChar, max_length: 8000 },
        { name: 'source', data_type: DataType.VarChar, max_length: 256 },
      ],
    });

    console.log('Collection created');

    console.log('\nCreating index...');

    await milvusClient.createIndex({
      collection_name: COLLECTION_NAME,
      field_name: 'langchain_vector',
      index_type: IndexType.IVF_FLAT,
      metric_type: MetricType.L2,
      params: { nlist: 128 },
    });

    console.log('Index created');

    console.log('\nLoading collection...');
    await milvusClient.loadCollection({ collection_name: COLLECTION_NAME });
    console.log('Collection loaded');

    console.log('\nInserting...');

    const data = chunks.map((chunk, i) => ({
      langchain_text: chunk.pageContent,
      langchain_vector: vectors[i],
      source: chunk.metadata.source,
    }));

    const result = await milvusClient.insert({
      collection_name: COLLECTION_NAME,
      data,
    });
    console.log(`√ Inserted ${result.insert_cnt} records\n`);
  } catch (error) {
    console.error('Error: ', error.message);
    process.exit(1);
  }
}

main();
