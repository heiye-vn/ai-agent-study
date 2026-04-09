import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'node:fs/promises';
import { z } from 'zod';

// 加载根目录 .env 文件
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const model = new ChatOpenAI({
  modelName: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

// 定义读取文件的 tool
const readFileTool = tool(
  async ({ filePath }) => {
    const content = await fs.readFile(filePath, 'utf-8');
    console.log(`  [工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字节`);
    return `文件内容:\n${content}`;
  },
  {
    name: 'read_file',
    description:
      '用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）。',
    schema: z.object({
      filePath: z.string().describe('要读取的文件路径'),
    }),
  }
);

const tools = [readFileTool];

// 将工具绑定到模型上
const modelWithTools = model.bindTools(tools);

const messages = [
  new SystemMessage(`你是一个代码助手，可以使用工具读取文件并解释代码。

工作流程：
1. 用户要求读取文件时，立即调用 read_file 工具
2. 等待工具返回文件内容
3. 基于文件内容进行分析和解释

可用工具：
- read_file: 读取文件内容（使用此工具来获取文件内容）
`),
  new HumanMessage('请读取 src/tool-file-read.mjs 文件内容并详细解释代码'),
];

let response = await modelWithTools.invoke(messages);
// console.log(response);

// 循环调用模型，直到没有工具调用为止，并处理每个工具调用的结果。
while (response.tool_calls && response.tool_calls.length > 0) {
  // 先保存带工具调用的 AI 回复
  messages.push(response);

  console.log(`\n[检测到 ${response.tool_calls.length} 个工具调用]`);

  // 执行所有工具调用
  const toolResults = await Promise.all(
    response.tool_calls.map(async (toolCall) => {
      const tool = tools.find((t) => t.name === toolCall.name); // 查找工具
      if (!tool) {
        return `未找到工具 ${toolCall.name}`;
      }

      console.log(` [工具调用] ${toolCall.name}(${JSON.stringify(toolCall.args)})`);

      try {
        const result = await tool.invoke(toolCall.args); // 调用
        return result;
      } catch (error) {
        return `工具 ${toolCall.name} 调用失败：${error.message}`;
      }
    })
  );

  // 将工具结果添加到消息历史
  response.tool_calls.forEach((toolCall, index) => {
    messages.push(
      new ToolMessage({
        content: toolResults[index],
        tool_call_id: toolCall.id,
      })
    );
  });

  // 再次调用模型，传入工具结果
  response = await modelWithTools.invoke(messages);
}

// 添加最终回复
messages.push(response);

console.log('\n[最终回复]');
console.log(response.content);

/*
    LangChain 框架中的 4 种消息类型
    - SystemMessage: 系统消息，通常用于描述系统的角色和行为，比如：设置 AI 是谁，可以干什么，有什么能力，以及一些回答、行为的规范等。
    - HumanMessage: 用户输入的信息
    - AIMessage: AI 回复的消息
    - ToolMessage: 调用工具的结果返回

    整体流程：
    1. 初始化大模型
    2. 创建工具函数，并绑定到模型
    3. 设定人设以及用户问题
    4. 执行第一轮调用，并放在历史中，拿到tool_calls，存在则代表大模型需要继续执行
    5. 循环 tool_calls，依次调用对应的工具，并拿到执行的结果
    6. 将工具执行结果以及工具id存储到历史对话
    7. 根据历史记录再次进行调用，直到没有 tool_calls 调用，最终输出结果
*/
