import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { Runnable } from '@langchain/core/runnables';
import { tool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { Inject, Injectable } from '@nestjs/common';
import z from 'zod';

const database = {
  users: {
    '001': { id: '001', name: '张三', email: 'zhangsan@example.com', role: 'admin' },
    '002': { id: '002', name: '李四', email: 'lisi@example.com', role: 'user' },
    '003': { id: '003', name: '王五', email: 'wangwu@example.com', role: 'user' },
  },
};

const queryUserArgsSchema = z.object({
  userId: z.string().describe('用户 ID，例如: 001, 002, 003'),
});

type QueryUserArgs = {
  userId: string;
};

// 定义查询用户 tool
const queryUserTool = tool(
  async ({ userId }: QueryUserArgs) => {
    const user = database.users[userId];

    if (!user) {
      return `用户 ID ${userId} 不存在，可用的 ID: 001, 002, 003`;
    }

    return `用户信息：\n- ID: ${user.id}\n- 姓名: ${user.name}\n- 邮箱: ${user.email}\n- 角色: ${user.role}`;
  },
  {
    name: 'query_user',
    description: '查询数据库中的用户信息，输入用户 ID, 返回该用户的详细信息（姓名、邮箱、角色）。',
    schema: queryUserArgsSchema,
  }
);

@Injectable()
export class AiService {
  private readonly modelWithTools: Runnable<BaseMessage[], AIMessage>;

  constructor(
    @Inject('CHAT_MODEL') model: ChatOpenAI,
    @Inject('QUERY_DATABASE_USER_TOOL') private readonly queryDatabaseUserTool: any,
    @Inject('SEND_MAIL_TOOL') private readonly sendMailTool: any,
    @Inject('WEB_SEARCH_TOOL') private readonly webSearchTool: any,
    @Inject('DB_USERS_CRUD_TOOL') private readonly dbUsersCrudTool: any
  ) {
    this.modelWithTools = model.bindTools([
      this.queryDatabaseUserTool,
      this.sendMailTool,
      this.webSearchTool,
      this.dbUsersCrudTool,
    ]);
  }

  // 执行工具调用
  private async executeToolCall(toolCall: any): Promise<ToolMessage> {
    const toolCallId = toolCall.id || '';
    const toolName = toolCall.name;

    let result: string;

    switch (toolName) {
      case 'query_user':
        const args = queryUserArgsSchema.parse(toolCall.args);
        result = await this.queryDatabaseUserTool.invoke(args);
        break;
      case 'send_mail':
        result = await this.sendMailTool.invoke(toolCall.args);
        break;
      case 'web_search':
        result = await this.webSearchTool.invoke(toolCall.args);
        break;
      case 'db_users_crud':
        result = await this.dbUsersCrudTool.invoke(toolCall.args);
      default:
        result = `未知的工具: ${toolName}`;
    }

    return new ToolMessage({
      tool_call_id: toolCallId,
      content: result,
      name: toolName,
    });
  }

  async runChain(query: string): Promise<string> {
    const messages: BaseMessage[] = [
      new SystemMessage(
        '你是一个智能助手，可以在需要时调用工具（如 query_user）来查询用户信息，再用结果回答用户的问题。'
      ),
      new HumanMessage(query),
    ];

    while (true) {
      const aiMessage = await this.modelWithTools.invoke(messages);
      messages.push(aiMessage);

      const toolCalls = aiMessage.tool_calls ?? [];

      console.log(toolCalls, '----toolCalls');

      // 如果没有要调用的工具，直接把回答返回给调用方
      if (!toolCalls.length) {
        // 处理兼容 string 格式
        const contentStr =
          typeof aiMessage.content === 'string'
            ? aiMessage.content
            : JSON.stringify(aiMessage.content);
        return contentStr;
      }

      // 依次执行本轮需要调用的工具
      for (const toolCall of toolCalls) {
        const toolMessage = await this.executeToolCall(toolCall);
        messages.push(toolMessage);
      }
    }
  }

  async *runChainStream(query: string): AsyncGenerator<string> {
    const messages: BaseMessage[] = [
      new SystemMessage(
        '你是一个智能助手，可以在需要时调用工具（如 query_user）来查询用户信息，再用结果回答用户的问题。'
      ),
      new HumanMessage(query),
    ];

    while (true) {
      // 一轮对话：让模型思考并（可能）提出工具调用
      const stream = await this.modelWithTools.stream(messages);

      let fullAIMessage: AIMessageChunk | null = null;

      for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
        // 使用 contact 持续拼接，得到本轮完整的 AIMessageChunk
        fullAIMessage = fullAIMessage ? fullAIMessage.concat(chunk) : chunk;

        const hasToolCallChunk =
          !!fullAIMessage.tool_call_chunks && fullAIMessage.tool_call_chunks.length > 0;

        // 只要当前轮次还没出现 tool 调用的 chunk，就可以把文本内容流式往外推
        if (!hasToolCallChunk && chunk.content) {
          yield chunk.content as string;
        }
      }

      if (!fullAIMessage) {
        return;
      }

      messages.push(fullAIMessage);

      const toolCalls = fullAIMessage.tool_calls ?? [];

      // 没有工具调用：说明这一轮就是最终回答，已经在上面的 for-await 中输出完
      if (!toolCalls.length) {
        return;
      }

      // 有工具调用：本轮不在额外输出内容，直接执行工具，生成 ToolMessage，进入下一轮
      for (const toolCall of toolCalls) {
        const toolMessage = await this.executeToolCall(toolCall);
        messages.push(toolMessage);
      }
    }
  }
}
