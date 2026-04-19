import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { FileSystemChatMessageHistory } from '@langchain/community/stores/message/file_system';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// 初始化 OpenAI Chat 模型
const model = new ChatOpenAI({
  temperature: 0,
  model: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

async function fileHistoryDemo() {
  // 指定存储文件的路径
  const filePath = path.resolve(__dirname, 'chat_history.json');
  const sessionId = 'user_session_001';

  // 系统提示词
  const systemMessage = new SystemMessage('你是一个友好的做菜助手，喜欢分享美食和烹饪技巧。');

  // 第一轮对话
  console.log('[第一轮对话...]');
  const history = new FileSystemChatMessageHistory({
    filePath,
    sessionId,
  });

  const userMessage1 = new HumanMessage('红烧肉怎么做？');
  await history.addMessage(userMessage1);

  const message1 = [systemMessage, ...(await history.getMessages())];
  const response1 = await model.invoke(message1);
  await history.addMessage(response1);

  console.log(`用户: ${userMessage1.content}`);
  console.log(`助手: ${response1.content}`);
  console.log(`✓ 对话已保存到文件: ${filePath}\n`);

  // 第二轮对话
  console.log('[第二轮对话...]');
  const userMessage2 = new HumanMessage('好吃吗？');
  await history.addMessage(userMessage2);

  const message2 = [systemMessage, ...(await history.getMessages())];
  const response2 = await model.invoke(message2);
  await history.addMessage(response2);

  console.log(`用户: ${userMessage2.content}`);
  console.log(`助手: ${response2.content}`);
  console.log(`✓ 对话已保存到文件: ${filePath}\n`);
}

fileHistoryDemo().catch(console.error);
