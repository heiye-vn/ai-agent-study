import { ChatOpenAI } from '@langchain/openai';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { StringOutputParser } from '@langchain/core/output_parsers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// 初始化模型
const model = new ChatOpenAI({
  temperature: 0.3,
  model: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

// 定义聊天提示词模板，包含系统提示、历史消息占位符和人类最新输入
const prompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    '你是一个简洁、有帮助的中文助手，会用 1-2 句话回答用户问题，重点给出明确、有用的信息。',
  ],
  // 占位符：运行时会自动将历史消息列表插入到该位置
  new MessagesPlaceholder('history'),
  ['human', '{question}'],
]);

// 将提示词、模型和输出解析器串联为一个简单的基础可运行链
const simpleChain = prompt.pipe(model).pipe(new StringOutputParser());

// 用于在内存中存储不同会话（sessionId）对应的聊天历史记录
const messageHistories = new Map();

// 获取指定会话的聊天历史：如果该会话不存在，则初始化一个新的内存历史对象
const getMessageHistory = (sessionId) => {
  if (!messageHistories.has(sessionId)) {
    messageHistories.set(sessionId, new InMemoryChatMessageHistory());
  }
  return messageHistories.get(sessionId);
};

// 创建带消息历史的链：这是一个核心装饰器（Wrapper），它可以为基础链赋予自动记忆和读取对话历史的功能
const chain = new RunnableWithMessageHistory({
  runnable: simpleChain, // 需要被包装的基础运行链
  getMessageHistory: (sessionId) => getMessageHistory(sessionId), // 提供获取特定会话历史记录的工厂函数
  inputMessagesKey: 'question', // 指示输入对象中，哪个键代表用户当前的新问题
  historyMessagesKey: 'history', // 指示提示词模板中，哪个变量（MessagesPlaceholder）用于注入和接收历史消息
});

// 测试：第一次对话
console.log('--- 第一次对话（提供信息） ---');
const result1 = await chain.invoke(
  {
    question: '我的名字是神光，我来自山东，我喜欢编程、写作、金铲铲。',
  },
  {
    configurable: {
      sessionId: 'user-123',
    },
  }
);
console.log('问题: 我的名字是神光，我来自山东，我喜欢编程、写作、金铲铲。');
console.log('回答:', result1);
console.log();

// 测试：第二次对话
console.log('--- 第二次对话（询问之前的信息） ---');
const result2 = await chain.invoke(
  {
    question: '我刚才说我来自哪里？',
  },
  {
    configurable: {
      sessionId: 'user-123',
    },
  }
);
console.log('问题: 我刚才说我来自哪里？');
console.log('回答:', result2);
console.log();

// 测试：第三次对话
console.log('--- 第三次对话（继续询问） ---');
const result3 = await chain.invoke(
  {
    question: '我的爱好是什么？',
  },
  {
    configurable: {
      sessionId: 'user-123',
    },
  }
);
console.log('问题: 我的爱好是什么？');
console.log('回答:', result3);
console.log();
