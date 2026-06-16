import { pool } from './01-db.js';

async function migrate() {
  console.log('开始迁移数据库维度...');
  await pool.query(`
    ALTER TABLE messages DROP COLUMN IF EXISTS embedding;
    ALTER TABLE messages ADD COLUMN embedding vector(1024);
    DROP INDEX IF EXISTS idx_messages_embedding;
    CREATE INDEX IF NOT EXISTS idx_messages_embedding ON messages USING hnsw (embedding vector_cosine_ops);
  `);
  console.log('数据库迁移完成：embedding 维度已改为 1024！');
}

migrate()
  .catch((err) => {
    console.error('迁移失败:', err);
  })
  .finally(() => {
    pool.end();
  });
