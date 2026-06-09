/**
 * 数据初始化脚本 (01-seedata.ts)
 * 
 * 主要职责：
 * 1. 从项目根目录读取环境变量（`.env`）。
 * 2. 模拟 10 条个人“生活笔记”数据。
 * 3. 使用阿里百炼的向量模型（通过 OpenAI 兼容接口）对笔记进行向量化（Embedding）。
 * 4. 重建 Elasticsearch 索引，配置中文分词器（IK 分词），并将数据批量（bulk）写入。
 * 5. 重建 Milvus 向量数据库集合（Collection），建立 HNSW 向量索引，并将文本及向量批量（insert）写入。
 */

import { Client } from '@elastic/elasticsearch';
import { OpenAIEmbeddings } from '@langchain/openai';
import { DataType, IndexType, MetricType, MilvusClient } from '@zilliz/milvus2-sdk-node';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 解析当前文件路径，并加载项目根目录下的 .env 环境变量配置文件
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// 全局配置常量：定义 ES/Milvus 共享的索引/集合名称，以及 Milvus 使用的数据字段
const INDEX_NAME = 'life_notes';
const ES_MODE = 'http://localhost:9200';
const DOC_TEXT = 'doc_text'; // Milvus 存储原始文本拼接的字段名
const EMBEDDING = 'embedding'; // Milvus 存储向量数据的字段名

// 模拟的生活笔记数据，包含日常下厨、宠物、家务维保、数码、法律等多种主题
const ROWS = [
  {
    id: 'life_01',
    note_title: '周末煲汤小备忘',
    note_body:
      '排骨冷水下锅焯一下，加姜片料酒；换了砂锅小火炖一小时，最后放盐和白胡椒，海带要提前泡发切条。',
    tags: ['下厨', '周末'],
    mood: '馋',
    priority: 2,
  },
  {
    id: 'life_02',
    note_title: '晚饭后遛狗路线',
    note_body:
      '小区东门出去沿河岸走一圈大概四十分钟，记得带拾便袋和水壶；下雨天改地下停车场那层绕两圈也行。',
    tags: ['宠物', '散步'],
    mood: '放松',
    priority: 3,
  },
  {
    id: 'life_03',
    note_title: '阳台绿植浇水频率',
    note_body: '绿萝见干再浇，龟背竹叶面可以偶尔喷水；夏天蒸发快早上看一眼土表，冬天少浇防止烂根。',
    tags: ['家务', '植物'],
    mood: '碎碎念',
    priority: 1,
  },
  {
    id: 'life_04',
    note_title: '路由器偶尔断流排查笔记',
    note_body:
      '先重启光猫再重启路由；信道改成自动或固定 36；固件升级到官网最新版；还不行就还原出厂单独测网线。',
    tags: ['数码', '折腾'],
    mood: '烦躁',
    priority: 2,
  },
  {
    id: 'life_05',
    note_title: '净水器滤芯更换记录',
    note_body:
      '官网登记的机身序列 SN-MILO-77821；上次换的是第三代 RO 复合滤芯，配件订单号 PO-20250409-K9；下次提醒换前置 PP 棉。',
    tags: ['家务', '维保'],
    mood: '琐事',
    priority: 1,
  },
  {
    id: 'life_06',
    note_title: '梧州龟苓膏粉冲泡比例',
    note_body:
      '双钱牌粉一包兑常温凉水先搅匀再小火搅拌到冒小泡；千万别用滚烫开水直接冲容易结块；可加少量桂花蜜。',
    tags: ['下厨', '甜品'],
    mood: '解馋',
    priority: 1,
  },
  {
    id: 'life_07',
    note_title: '租房合同划的重点句',
    note_body:
      '第八条写的是押一付三提前三十日书面通知；手写补充了一句「甲方不得以不正当理由扣减退房押金」记得双方都签了字。',
    tags: ['租房', '法律'],
    mood: '谨慎',
    priority: 3,
  },
  {
    id: 'life_08',
    note_title: '肉汤熬久了反而涩',
    note_body:
      '大块骨肉要先焯掉浮沫，文火咕嘟太久胶质出来了汤会发黏发涩；觉得不清爽可以中途打掉一层油，起锅前再调味。',
    tags: ['下厨', '技巧'],
    mood: '琢磨',
    priority: 2,
  },
  {
    id: 'life_09',
    note_title: '半夜趴窗台透气',
    note_body:
      '脑子停不下来就一直复盘白天在会上说的话，越想越清醒；干脆开窗吹两分钟冷风，把手机扔到客厅充电再回屋。',
    tags: ['情绪', '失眠'],
    mood: '飘',
    priority: 2,
  },
  {
    id: 'life_10',
    note_title: '出差酒店网速玄学',
    note_body:
      '同一个SSID走廊尽头满格会议室里假信号；连手机热点写周报反而稳；视频会议尽量靠窗座位别躲在最里间死角。',
    tags: ['差旅', '办公'],
    mood: '无奈',
    priority: 2,
  },
];

// 初始化阿里云百炼的向量 Embedding 模型 (兼容 OpenAI SDK 的接口调用规范)
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.QWEN_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME as string,
  configuration: {
    baseURL: process.env.QWEN_BASE_URL,
  },
});

// 初始化 Milvus 客户端实例
const milvusClient = new MilvusClient({
  address: process.env.MILVUS_ADDRESS ?? 'localhost:19530',
});

/**
 * 重建 Elasticsearch 索引并批量（bulk）写入文档
 * 
 * @param indexName 索引名称
 * @param rows 待导入的结构化生活笔记数据
 */
async function seedElasticsearch(indexName: string, rows: any[]) {
  try {
    console.log('\n[Elasticsearch]');
    const client = new Client({ node: ES_MODE });

    // 1. 检查索引是否存在，如果存在则将其物理删除以实现无残留覆盖
    const exists = await client.indices.exists({ index: indexName });
    if (exists) {
      console.log('删除已有索引...');
      await client.indices.delete({ index: indexName });
      console.log('✓ 已删除');
    }

    console.log('创建索引与 mapping...');

    // 2. 创建新索引并显式配置 Mapping 映射规则
    // 特别地：针对文本字段 note_title 和 note_body 使用 IK 中文分词器，支持中文搜索
    await client.indices.create({
      index: indexName,
      mappings: {
        properties: {
          note_title: {
            type: 'text',
            analyzer: 'ik_max_word', // 写入时使用最细粒度切分以提高召回率
            search_analyzer: 'ik_smart', // 查询时使用粗粒度切分，提高精准度
          },
          note_body: {
            type: 'text',
            analyzer: 'ik_max_word',
            search_analyzer: 'ik_smart',
          },
          tags: { type: 'keyword' }, // 标签使用不分词的精确匹配型
          mood: { type: 'keyword' }, // 情绪属性使用不分词匹配
          priority: { type: 'integer' }, // 优先级数值属性
          created_at: { type: 'date' },
          updated_at: { type: 'date' },
        },
      },
    });
    console.log('✓ 索引创建成功');

    const now = new Date().toISOString();
    console.log(`写入 ${rows.length} 条文档...`);

    // 3. 将数组形式的数据展平成 ES 的 Bulk API 结构并提交批量写入
    await client.bulk({
      refresh: true, // 写入完成后立即刷新索引以使文档可以被检索
      operations: rows.flatMap((row: any) => {
        const { id, ...rest } = row;
        return [
          { index: { _index: indexName, _id: id } }, // 声明当前操作在指定的 ID 上建立索引
          { ...rest, created_at: now, updated_at: now }, // 写入文档的正文数据
        ];
      }),
    });
    console.log('✓ ES 写入完成');
  } catch (error: any) {
    console.error('Elasticsearch 出错:', error.message);
    throw error;
  }
}

/**
 * 重建 Milvus 向量集合，生成向量嵌入，配置 HNSW 索引并导入数据
 * 
 * @param collectionName 集合名称
 * @param rows 待写入的笔记数据
 * @param emb 向量生成实例（Embeddings）
 */
async function seedMilvus(collectionName: string, rows: any[], emb: any) {
  try {
    console.log('\n[Milvus]');

    // 1. 将标题和笔记正文拼接，组装成用于生成向量嵌入的整段检索文本
    const texts = rows.map((row) => `${row.note_title}\n${row.note_body}`);
    console.log('生成向量嵌入...');
    const vectors = await emb.embedDocuments(texts); // 调用百炼大模型批量向量化
    const dim = vectors[0].length; // 获取向量维度（例如：text-embedding-v4 通常为 1024 维）

    // 2. 检测该集合在 Milvus 中是否存在，若存在则将其 drop 以便覆盖式重建
    const hasCollection = await milvusClient.hasCollection({
      collection_name: collectionName,
    });
    if (hasCollection.value) {
      console.log('删除已有集合...');
      await milvusClient.dropCollection({ collection_name: collectionName });
      console.log('✓ 已删除');
    }

    console.log('创建集合...');
    // 3. 构建 Milvus 集合字段结构 Schema，同时匹配 LangChain 内置的 Milvus 存储规范
    await milvusClient.createCollection({
      collection_name: collectionName,
      fields: [
        { name: 'id', data_type: DataType.VarChar, max_length: 100 }, // 原始文档 ID
        {
          name: 'note_title',
          data_type: DataType.VarChar,
          max_length: 512,
        },
        {
          name: 'note_body',
          data_type: DataType.VarChar,
          max_length: 4096,
        },
        { name: 'mood', data_type: DataType.VarChar, max_length: 64 },
        {
          name: 'priority',
          data_type: DataType.VarChar,
          max_length: 16,
        },
        { name: 'tags', data_type: DataType.VarChar, max_length: 256 },
        {
          name: 'langchain_primaryid', // LangChain 规范要求的主键，配置为 INT64 自增
          data_type: DataType.Int64,
          is_primary_key: true,
          autoID: true,
        },
        {
          name: DOC_TEXT, // 存放用于召回对比的拼装原始文本
          data_type: DataType.VarChar,
          max_length: 10000,
        },
        {
          name: EMBEDDING, // 向量字段
          data_type: DataType.FloatVector,
          dim,
        },
      ],
    });
    console.log('✓ 集合创建成功');

    console.log('创建向量索引...');
    // 4. 创建向量索引。在此选用经典的 HNSW 索引以支持高并发近邻距离搜索。度量方式为 L2 (欧氏距离)。
    await milvusClient.createIndex({
      collection_name: collectionName,
      field_name: EMBEDDING,
      index_type: IndexType.HNSW,
      metric_type: MetricType.L2,
      params: { M: 8, efConstruction: 64 },
    });
    console.log('✓ 索引创建成功');

    // 5. 加载该集合以供之后进行实时的向量召回
    try {
      await milvusClient.loadCollection({ collection_name: collectionName });
      console.log('✓ 集合已加载');
    } catch {
      console.log('✓ 集合已处于加载状态');
    }

    console.log(`插入 ${rows.length} 条...`);
    // 6. 整理写入字段，元数据属性及拼接文本并将其写入向量集合
    const insertData = rows.map((row, i) => ({
      id: row.id,
      note_title: row.note_title,
      note_body: row.note_body,
      mood: row.mood,
      priority: String(row.priority),
      tags: row.tags.join(','),
      [DOC_TEXT]: texts[i],
      [EMBEDDING]: vectors[i],
    }));

    const insertResult = await milvusClient.insert({
      collection_name: collectionName,
      data: insertData,
    });

    // 7. 强制执行同步刷盘落库
    await milvusClient.flushSync({ collection_names: [collectionName] });

    const cnt = Number(insertResult.insert_cnt) || rows.length;
    console.log(`✓ Milvus 写入完成（insert_cnt: ${cnt}）`);
  } catch (error: any) {
    console.error('Milvus 出错:', error.message);
    throw error;
  }
}

/**
 * 主程序入口
 */
async function main() {
  try {
    console.log('\n连接 Milvus...');
    await milvusClient.connectPromise; // 建立长连接
    console.log('✓ 已连接');

    // 依次执行 Elasticsearch 及 Milvus 的数据写入初始化
    await seedElasticsearch(INDEX_NAME, ROWS);
    await seedMilvus(INDEX_NAME, ROWS, embeddings);
  } catch (error: any) {
    console.error('\n错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

