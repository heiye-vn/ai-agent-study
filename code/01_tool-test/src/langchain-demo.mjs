import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'node:fs/promises';
import { z } from 'zod';

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

const readFileTool = tool(
  async ({ filePath }) => {
    const content = await fs.readFile(filePath, 'utf-8');
    console.log(`[工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字节`);
    return `文件内容:\n${content}`;
  },
  {
    name: 'read_file',
    description: '读取文件内容',
    schema: z.object({
      filePath: z.string().describe('要读取的文件路径'),
    }),
  }
);

// 创建 Agent，自动处理工具调用循环
const agent = createReactAgent({
  llm: model,
  tools: [readFileTool],
  stateModifier: new SystemMessage(`你是一个代码助手，可以使用工具读取文件并解释代码。

项目结构说明：
- 当前脚本位于: code/01_tool-test/src/
- 项目根目录位于: ../../ (相对于当前脚本)
- 根目录下有: README.md, package.json, pnpm-workspace.yaml 等文件

当用户要求读取根目录文件时，请使用相对路径 "../../文件名" 或绝对路径。
`),
});

// 直接调用，无需手动循环
const result = await agent.invoke({
  messages: [new HumanMessage('请读取根目录下的 README.md 文件内容并解释')],
});

// 获取最终回复
const finalMessage = result.messages[result.messages.length - 1];
console.log('\n[最终回复]');
console.log(finalMessage.content);
