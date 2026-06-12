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

// 初始化 OpenAI embeddings 实例，用于将文档和查询文本转化为高维向量
const embeddings = new OpenAIEmbeddings({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.EMBEDDINGS_MODEL_NAME ?? 'text-embedding-v3',
  configuration: { baseURL: envVars.QWEN_BASE_URL },
});

// 初始化 Milvus 客户端实例，用于与 Milvus 向量数据库进行交互
const milvusClient = new MilvusClient({ address: envVars.MILVUS_ADDRESS ?? 'localhost:19530' });

/**
 * 从指定目录加载文本/Markdown文件，并将其切分为较小的文档块
 * @param dataDir 数据文件所在的目录路径，默认为 './data'
 * @returns 返回切分后的 LangChain 文档对象数组
 */
async function loadChunks(dataDir = './data') {
  // 检查数据目录是否存在
  if (!existsSync(dataDir)) {
    throw new Error(`数据目录 ${dataDir} 不存在`);
  }

  // 读取目录下所有的 .txt 和 .md 文件
  const files = readdirSync(dataDir).filter((f) => /\.(txt|md)$/i.test(f));
  if (files.length === 0) {
    throw new Error(`目录内无 .txt/.md 文件：${dataDir}`);
  }

  // 读取文件内容并构建原始文档对象
  const docs = files.map((f) => ({
    pageContent: readFileSync(join(dataDir, f), 'utf-8'),
    metadata: { source: f },
  }));

  // 使用递归字符文本切分器，将文档按指定块大小和重叠度进行切分
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });
  return splitter.splitDocuments(docs);
}

/**
 * 主执行函数：负责初始化向量库集合、生成向量并导入数据
 */
async function main() {
  try {
    console.log('Connection to Milvus...');
    // 连接到 Milvus 数据库
    await milvusClient.connectPromise;
    console.log('√ Connected\n');

    // 加载待导入的文档分块
    const chunks = await loadChunks();

    // 如果已存在同名集合，先将其删除（以便重新建表/数据覆盖）
    if ((await milvusClient.hasCollection({ collection_name: COLLECTION_NAME })).value) {
      await milvusClient.dropCollection({ collection_name: COLLECTION_NAME });
      console.log(`Dropped collection: ${COLLECTION_NAME}\n`);
    }

    console.log('Generating embeddings...');

    // 调用 embeddings API 批量获取文档分块的向量表示
    const vectors = await embeddings.embedDocuments(chunks.map((c) => c.pageContent));
    const dim = vectors[0].length; // 获取向量维度（如 1536 或其他维度）

    console.log('Generating collection...');

    // 在 Milvus 中创建新的集合，定义符合 LangChain 标准的数据 Schema
    await milvusClient.createCollection({
      collection_name: COLLECTION_NAME,
      fields: [
        {
          name: 'langchain_primaryid',
          data_type: DataType.Int64,
          is_primary_key: true,
          autoID: true, // 主键自增
        },
        { name: 'langchain_vector', data_type: DataType.FloatVector, dim }, // 向量字段
        { name: 'langchain_text', data_type: DataType.VarChar, max_length: 8000 }, // 原始文本内容
        { name: 'source', data_type: DataType.VarChar, max_length: 256 }, // 文档来源文件名
      ],
    });

    console.log('Collection created');

    console.log('\nCreating index...');

    // 为向量字段创建 IVF_FLAT 类型的索引，度量方式使用 L2 (欧式距离)
    await milvusClient.createIndex({
      collection_name: COLLECTION_NAME,
      field_name: 'langchain_vector',
      index_type: IndexType.IVF_FLAT,
      metric_type: MetricType.L2,
      params: { nlist: 128 },
    });

    console.log('Index created');

    console.log('\nLoading collection...');
    // 将集合加载至内存中，这是在 Milvus 中执行搜索的先决条件
    await milvusClient.loadCollection({ collection_name: COLLECTION_NAME });
    console.log('Collection loaded');

    console.log('\nInserting...');

    // 将切分后的文档、对应的向量和元数据映射为 Milvus 要求的行格式
    const data = chunks.map((chunk, i) => ({
      langchain_text: chunk.pageContent,
      langchain_vector: vectors[i],
      source: chunk.metadata.source,
    }));

    // 将数据批量插入到 Milvus 集合中
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
