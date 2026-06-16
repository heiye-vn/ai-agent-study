-- 启用 pgvector 向量扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 会话表
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- 定义外键约束，关联 users 表，实现级联删除
    CONSTRAINT fk_conversations_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

-- 消息表（带向量）
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    -- 消息所属的会话 id
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    -- 重：embedding 客户端和数据表结构必须在维度数量上保持一致，否则会报错。
    embedding vector(1024), -- 与 EMBEDDING_MODEL 输出维度一致（text-embedding-v4 为 1024）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- 添加外键约束，关联 conversations 表，实现级联删除
    CONSTRAINT fk_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        ON DELETE CASCADE
);

-- 向量索引（加速搜索）
CREATE INDEX IF NOT EXISTS idx_messages_embedding
    ON messages USING hnsw (embedding vector_cosine_ops);