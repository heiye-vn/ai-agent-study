import { Client } from '@elastic/elasticsearch';

const client = new Client({
  node: 'http://localhost:9200',
});

const INDEX_NAME = 'travel_journal';

// 创建索引
async function createIndex() {
  const exists = await client.indices.exists({ index: INDEX_NAME });

  if (exists) {
    console.log(`ℹ️ 索引已存在: ${INDEX_NAME}`);
    return;
  }

  // client.indices 创建索引（类似 mysql 中的表）
  await client.indices.create({
    index: INDEX_NAME,
    mappings: {
      properties: {
        note_title: { type: 'text', analyzer: 'ik_max_word', search_analyzer: 'ik_smart' },
        note_body: { type: 'text', analyzer: 'ik_max_word', search_analyzer: 'ik_smart' },
        tags: { type: 'keyword' },
        mood: { type: 'keyword' },
        priority: { type: 'integer' }, // 优先级，权重
        created_at: { type: 'date' },
        updated_at: { type: 'date' },
      },
    },
  });

  console.log(`✅ 索引创建成功: ${INDEX_NAME}`);
}

//
async function seedData() {
  const now = new Date().toISOString();
  const docs = [
    {
      note_title: '川西稻城亚丁自由行',
      note_body: `早上自驾前往川西稻城亚丁，中午吃当地特色黄牛肉，下午在亚丁村的星空下泡温泉，绝对是极致享受。`,
      tags: ['川西', '稻城亚丁', '自由行', '旅行', '四川', '周末'],
      mood: 'relaxed',
      priority: 2,
      created_at: now,
      updated_at: now,
    },
    {
      note_title: '城市骑行计划',
      note_body: '周六沿江骑行 30 公里，带上水和简易修车工具。',
      tags: ['运动', '骑行'],
      mood: 'energetic',
      priority: 3,
      created_at: now,
      updated_at: now,
    },
    {
      note_title: '雨天宅家追剧',
      note_body: '下雨天在家整理房间，看了《权力的游戏》，做了美味的晚餐。',
      tags: ['电影', '追剧', '宅家', '生活'],
      mood: 'calm',
      priority: 1,
      created_at: now,
      updated_at: now,
    },
  ];

  // 使用 flatMap 为了将每个文档转换成 [action, document] 并合并成一个扁平化数组, [action, document, action, document, ...]
  // action: { index: { _index: INDEX_NAME } }
  const operations = docs.flatMap((doc) => [{ index: { _index: INDEX_NAME } }, doc]);

  // 批量插入数据
  await client.bulk({ refresh: true, operations });

  console.log(`✅ 初始化数据完成，共 ${docs.length} 条数据`);
}

async function run() {
  await createIndex();
  await seedData();
}

run().catch((err) => {
  console.error('❌ 创建阶段失败:', err);
  process.exit(1); // 退出进程
});
