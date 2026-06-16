import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenAIEmbeddings } from '@langchain/openai';
import { query } from './01-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const result = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

if (result.error) {
  throw new Error(`Failed to load .env file: ${result.error.message}`);
}

const envVars = result.parsed;
if (!envVars) {
  throw new Error('No .env file found');
}

const VALID_ROLES = ['user', 'assistant', 'system'];

let embeddings: OpenAIEmbeddings | null = null;

function getEmbeddings() {
  if (!embeddings) {
    embeddings = new OpenAIEmbeddings({
      model: envVars.EMBEDDINGS_MODEL_NAME || 'text-embedding-v3',
      apiKey: envVars.QWEN_API_KEY,
      configuration: {
        baseURL: envVars.QWEN_BASE_URL,
      },
    });
  }
  return embeddings;
}

async function createMessage(
  conversationId: number,
  role: string,
  content: string,
  withEmbedding = false
) {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`role 必须是 ${VALID_ROLES.join('、')} 之一`);
  }

  if (withEmbedding) {
    const vector = await getEmbeddings().embedQuery(content);
    const { rows } = await query(
      `INSERT INTO messages (conversation_id, role, content, embedding)
       VALUES ($1, $2, $3, $4::vector)
       RETURNING id, conversation_id, role, content, created_at`,
      [conversationId, role, content, JSON.stringify(vector)]
    );
    return rows[0];
  }

  const { rows } = await query(
    `INSERT INTO messages (conversation_id, role, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [conversationId, role, content]
  );
  return rows[0];
}

async function getMessageById(id: number) {
  const { rows } = await query(
    `SELECT id, conversation_id, role, content, created_at
     FROM messages WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

async function getMessagesByConversationId(conversationId: number) {
  const { rows } = await query(
    `SELECT id, conversation_id, role, content, created_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );
  return rows;
}

async function updateMessage(id: number, content: string, withEmbedding = false) {
  if (withEmbedding) {
    const vector = await getEmbeddings().embedQuery(content);
    const { rows } = await query(
      `UPDATE messages
       SET content = $1, embedding = $2::vector
       WHERE id = $3
       RETURNING id, conversation_id, role, content, created_at`,
      [content, JSON.stringify(vector), id]
    );
    return rows[0] ?? null;
  }

  const { rows } = await query(`UPDATE messages SET content = $1 WHERE id = $2 RETURNING *`, [
    content,
    id,
  ]);
  return rows[0] ?? null;
}

async function deleteMessage(id: number) {
  const { rowCount } = await query('DELETE FROM messages WHERE id = $1', [id]);
  return rowCount > 0;
}

async function searchSimilarMessages(conversationId: number, searchText: string, limit = 5) {
  const vector = await getEmbeddings().embedQuery(searchText);
  const { rows } = await query(
    `SELECT id, conversation_id, role, content, created_at,
            1 - (embedding <=> $1::vector) AS similarity
     FROM messages
     WHERE conversation_id = $2 AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(vector), conversationId, limit]
  );
  return rows;
}

export {
  createMessage,
  getMessageById,
  getMessagesByConversationId,
  updateMessage,
  deleteMessage,
  searchSimilarMessages,
};
