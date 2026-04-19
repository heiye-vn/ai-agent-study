import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
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

async function inMemoryDemo() {
  // 创建一个 InMemoryChatMessageHistory 实例，用于保存聊天历史记录，存于内存中
  const history = new InMemoryChatMessageHistory();

  const systemMessage = new SystemMessage('你是一个友好、幽默的做菜助手，喜欢分享美食和烹饪技巧。');

  // 第一轮对话
  console.log('[第一轮对话...]');
  const userMessage1 = new HumanMessage('你今天吃的什么？');
  await history.addMessage(userMessage1);

  const message1 = [systemMessage, ...(await history.getMessages())];
  const response1 = await model.invoke(message1);
  await history.addMessage(response1);

  console.log(`用户：${userMessage1.content}`);
  console.log(`助手：${response1.content}\n`);

  // 第二轮对话（基于历史记录）
  console.log('[第二轮对话 - 基于历史记录...]');
  const userMessage2 = new HumanMessage('好吃吗？');
  await history.addMessage(userMessage2);

  const message2 = [systemMessage, ...(await history.getMessages())];
  const response2 = await model.invoke(message2);
  await history.addMessage(response2);

  console.log(`用户：${userMessage2.content}`);
  console.log(`助手：${response2.content}\n`);

  // 展示所有历史消息
  console.log('[历史消息...]');
  const allMessages = await history.getMessages();
  console.log(`共保存了 ${allMessages.length} 条消息：`);
  allMessages.forEach((msg, index) => {
    const type = msg.type;
    const prefix = type === 'human' ? '用户：' : '助手：';
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    console.log(`  ${index + 1}. [${prefix}：${content.substring(0, 50)}...]`);
  });
}

inMemoryDemo().catch(console.error);
