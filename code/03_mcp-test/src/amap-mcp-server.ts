import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

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

const mcpClient = new MultiServerMCPClient({
  /*
      客户端连接MCP的方式：http、stdio，通过参数来判断是哪种方式
      1. 参数中带有 url，则使用 http 方式
      2. 参数中带有 command，则使用 stdio 方式
  */
  mcpServers: {
    // 本地 MCP Server
    'my-mcp-server': {
      command: 'npx',
      args: [
        '-y',
        'tsx',
        'E:/Study/Front_End/My_Study/ai-agent-study/code/03_mcp-test/src/my-mcp-server.ts',
      ],
    },
    /* 第三方 MCP Server */
    // 高德地图 MCP
    'amap-maps-streamableHTTP': {
      url: 'https://mcp.amap.com/mcp?key=' + envVars.AMAP_MAPS_API_KEY,
    },
    // 文件系统 MCP
    filesystem: {
      command: 'npx',
      args: [
        '-y',
        '@modelcontextprotocol/server-filesystem',
        // 允许操作的文件夹路径，防止误删除系统中的其他重要文件，类似安全沙箱
        ...(envVars.ALLOWED_PATHS.split(',') || ''),
      ],
    },
    // chrome Devtools MCP
    'chrome-devtools': {
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp@latest'],
    },
  },
});

const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools);

async function runAgentWithTools(query, maxIterations = 30) {
  const messages: (HumanMessage | ToolMessage | AIMessage | SystemMessage)[] = [
    new HumanMessage(query),
  ];

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`));
    const response = await modelWithTools.invoke(messages);
    messages.push(response); // 检查是否有工具调用

    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log(`\n✨ AI 最终回复:\n${response.content}\n`);
      return response.content;
    }

    console.log(chalk.bgBlue(`🔍 检测到 ${response.tool_calls.length} 个工具调用`));
    console.log(chalk.bgBlue(`🔍 工具调用: ${response.tool_calls.map((t) => t.name).join(', ')}`));

    // 执行工具调用
    for (const toolCall of response.tool_calls) {
      const foundTool = tools.find((t) => t.name === toolCall.name);
      if (foundTool) {
        const toolResult = await foundTool.invoke(toolCall.args);

        // 确保 content 是字符串类型
        let contentStr = '';
        if (typeof toolResult === 'string') {
          contentStr = toolResult;
        } else if (toolResult && toolResult.text) {
          // 如果返回对象有 text 字段，优先使用
          contentStr = toolResult.text;
        }

        messages.push(
          new ToolMessage({
            content: contentStr,
            tool_call_id: toolCall.id,
          })
        );
      }
    }
  }

  return messages[messages.length - 1].content;
}

// await runAgentWithTools(
//   '北京南站附近的5个酒店，以及去的路线，路线规划生成文档保存到当前项目的src目录的一个 md 文件"'
// );
await runAgentWithTools(
  '北京南站附近的酒店，最近的 3 个酒店，拿到酒店图片，打开浏览器，展示每个酒店的图片，每个 tab 一个 url 展示，并且在把那个页面标题改为酒店名'
);

await mcpClient.close();
