import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
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

  const systemMessage = new SystemMessage('你是一个友好、幽默的做菜助手，喜欢分享美食和烹饪技巧。');

  const restoredHistory = new FileSystemChatMessageHistory({
    filePath,
    sessionId,
  });

  // 从文件中读取历史消息
  const restoredMessages = await restoredHistory.getMessages();
  console.log(`从文件恢复了 ${restoredMessages.length} 条历史消息：`);
  restoredMessages.forEach((msg, index) => {
    const type = msg.type;
    const prefix = type === 'human' ? '用户' : '助手';
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    console.log(`  ${index + 1}. [${prefix}]: ${content.substring(0, 50)}...`);
  });

  console.log('[开始新的对话...]');
  const userMessage3 = new HumanMessage('需要哪些食材？');
  await restoredHistory.addMessage(userMessage3);

  const message3 = [systemMessage, ...(await restoredHistory.getMessages())];
  const response3 = await model.invoke(message3);
  await restoredHistory.addMessage(response3);

  console.log(`用户: ${userMessage3.content}`);
  console.log(`助手: ${response3.content}`);
  console.log(`✓ 对话已保存到文件: ${filePath}\n`);
}

fileHistoryDemo().catch(console.error);
