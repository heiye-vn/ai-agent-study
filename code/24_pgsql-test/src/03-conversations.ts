import { query } from './01-db.js';

async function createConversation(userId: number, title = null) {
  const { rows } = await query(
    'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *',
    [userId, title]
  );
  return rows[0];
}

async function getConversationById(id: number) {
  const { rows } = await query('SELECT * FROM conversations WHERE id = $1', [id]);
  return rows[0] ?? null;
}

async function getConversationsByUserId(userId: number) {
  const { rows } = await query(
    'SELECT * FROM conversations WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

async function getAllConversations() {
  const { rows } = await query('SELECT * FROM conversations ORDER BY created_at DESC');
  return rows;
}

async function updateConversation(id: number, { title }) {
  const { rows } = await query('UPDATE conversations SET title = $1 WHERE id = $2 RETURNING *', [
    title,
    id,
  ]);
  return rows[0] ?? null;
}

async function deleteConversation(id: number) {
  const { rowCount } = await query('DELETE FROM conversations WHERE id = $1', [id]);
  return rowCount > 0;
}

export {
  createConversation,
  getConversationById,
  getConversationsByUserId,
  getAllConversations,
  updateConversation,
  deleteConversation,
};
