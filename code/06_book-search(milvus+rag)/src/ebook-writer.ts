import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';
import { OpenAIEmbeddings } from '@langchain/openai';
import {} from '@langchain/community/document_loaders/fs/epub';
import dotenv from 'dotenv';
import path, { parse } from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const COLLECTION_NAME = 'ebook_collection';
const VECTOR_DIMENSION = 1024;
const CHUNL_SIZE = 500; // 拆分的文本大小
const EPUB_FILE = './天龙八部.epub';

// 从文件名提取书名
const BOOK_NAME = parse(EPUB_FILE).name;

// 初始化 Embeddings 模型
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
 * @param text 文本内容
 */
async function getEmbedding(text: string) {
  const result = await embeddings.embedQuery(text);
  return result;
}

/**
 * 确保集合存在，如果不存在则创建
 * @param bookId 书籍ID
 */
const ensureCollectionExist = async (bookId: number) => {
  try {
    // 检查集合是否存在
    const hasCollection = await milvusClient.hasCollection({
      collection_name: COLLECTION_NAME,
    });

    if (!hasCollection.value) {
      console.log('创建集合...');
      await milvusClient.createCollection({
        collection_name: COLLECTION_NAME,
        fields: [
          { name: 'id', data_type: DataType.VarChar, max_length: 100, is_primary_key: true },
          { name: 'book_id', data_type: DataType.VarChar, max_length: 100 },
          { name: 'book_name', data_type: DataType.VarChar, max_length: 200 },
          { name: 'chapter_num', data_type: DataType.Int32 },
          { name: 'index', data_type: DataType.Int32 },
          { name: 'content', data_type: DataType.VarChar, max_length: 10000 },
          { name: 'vector', data_type: DataType.FloatVector, dim: VECTOR_DIMENSION },
        ],
      });
      console.log('✓ 创建集合成功\n');

      // 创建索引
      console.log('创建索引...');
      await milvusClient.createIndex({
        collection_name: COLLECTION_NAME,
        field_name: 'vector',
        index_type: IndexType.IVF_FLAT,
        metric_type: MetricType.COSINE,
        params: {
          nlist: 1024,
        },
      });
      console.log('✓ 创建索引成功\n');

      // 确保集合已加载
      try {
        await milvusClient.loadCollection({
          collection_name: COLLECTION_NAME,
        });
        console.log('✓ 集合加载成功');
      } catch (error) {
        console.log('√ 集合已处于加载状态');
      }
    }
  } catch (error) {
    console.log('创建集合时出错', error.message);
    throw error;
  }
};

/**
 * 将文档块批量插入到 Milvus（流式处理）
 * @param chunks 文档块数组
 * @param bookId 书籍ID
 * @param chapterNum 章节号
 */
async function insertChunksBatch(chunks: string[], bookId: number, chapterNum: number) {
  try {
    if (chunks.length === 0) {
      return 0;
    }

    // 为每个文档块生成向量并构建插入数据
    const insertData = await Promise.all(
      chunks.map(async (chunk, chunkIndex) => {
        const vector = await getEmbedding(chunk);
        // 手动生成 id：book_id_chapterNum_index
        return {
          id: `${bookId}_${chapterNum}_${chunkIndex}`,
          book_id: bookId,
          book_name: BOOK_NAME,
          chapter_num: chapterNum,
          index: chunkIndex,
          content: chunk,
          vector,
        };
      })
    );

    // 批量插入到 Milvus
    const insertResult = await milvusClient.insert({
      collection_name: COLLECTION_NAME,
      data: insertData,
    });

    return Number(insertResult.insert_cnt) || 0;
  } catch (error) {
    console.error(`插入章节 ${chapterNum} 的数据时出错:`, error.message);
    console.error('错误详情:', error);
    throw error;
  }
}

/**
 * 加载和处理 EPUB 文件（流式处理，边处理边插入）
 * @param bookId 书籍ID
 */
async function loadAndProcessEpubStreaming(bookId: number) {
  try {
    console.log(`\n开始加载 EPUB 文件： ${EPUB_FILE} ...\n`);

    // 使用 EPubLoader 加载文件，按章节拆分
  } catch (error) {
    console.error('加载 EPUB 文件时出错:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('电子书处理程序');
    console.log('='.repeat(80));

    // 连接 Milvus 向量数据库
    console.log('\n连接 Milvus...');
    await milvusClient.connectPromise;
    console.log('√ 已连接\n');

    // 设置 book_id
    const bookId = 1;

    // 确保集合存在
    await ensureCollectionExist(bookId);

    // 加载和处理 EPUB 文件（流式处理，边处理边插入）
    await loadAndProcessEpubStreaming(bookId);

    console.log('='.repeat(80));
    console.log('处理完成！');
    console.log('='.repeat(80));
  } catch (error) {
    console.log('\n错误:', error.message);
    console.log(error.stack);
    process.exit(1);
  }
}
