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
import { Inject, Injectable, Logger } from '@nestjs/common';
import z from 'zod';
import { JobService } from 'src/job/job.service';

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
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject('CHAT_MODEL') model: ChatOpenAI,
    @Inject('QUERY_DATABASE_USER_TOOL') private readonly queryDatabaseUserTool: any,
    @Inject('SEND_MAIL_TOOL') private readonly sendMailTool: any,
    @Inject('WEB_SEARCH_TOOL') private readonly webSearchTool: any,
    @Inject('DB_USERS_CRUD_TOOL') private readonly dbUsersCrudTool: any,
    @Inject('CRON_JOB_TOOL') private readonly cronJobTool: any,
    @Inject('TIME_NOW_TOOL') private readonly timeNowTool: any,
    private readonly jobService: JobService
  ) {
    this.modelWithTools = model.bindTools([
      this.queryDatabaseUserTool,
      this.sendMailTool,
      this.webSearchTool,
      this.dbUsersCrudTool,
      this.cronJobTool,
      this.timeNowTool,
    ]);

    // 注册定时任务触发的回调函数，将要执行的指令交给 AI 执行
    this.jobService.onJobTrigger = async (job) => {
      this.logger.log(`定时任务已触发，开始执行任务 ID 为 ${job.id} 的指令: "${job.instruction}"`);
      try {
        // 异步运行大模型 chain
        const res = await this.runChain(job.instruction);
        this.logger.log(`定时任务 ID 为 ${job.id} 执行完毕。AI 输出结果: "${res}"`);
      } catch (error) {
        this.logger.error(`定时任务 ID 为 ${job.id} 执行失败: ${(error as Error).message}`, (error as Error).stack);
      }
    };
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
        break;
      case 'cron_job':
        result = await this.cronJobTool.invoke(toolCall.args);
        break;
      case 'time_now':
        result = await this.timeNowTool.invoke(toolCall.args);
        break;
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
        `你是一个通用任务助手，可以根据用户的目标规划步骤，并在需要时调用工具：\`query_user\` 查询或校验用户信息、\`send_mail\` 发送邮件、\`web_search\` 进行互联网搜索、\`db_users_crud\` 读写数据库 users 表、\`cron_job\` 创建和管理定时/周期任务（\`list\`/\`add\`/\`toggle\`），从而实现提醒、定期任务、数据同步等各种自动化需求。

定时任务类型选择规则（非常重要）：
- 用户说“X分钟/小时/天后”“在某个时间点”“到点提醒”（一次性）=> 用 \`cron_job\` + \`type=at\`（执行一次后自动停用），\`at\`=当前时间+X 或解析出的时间点
- 用户说“每X分钟/每小时/每天”“定期/循环/一直”（重复执行）=> 用 \`cron_job\` + \`type=every\`（每次执行），\`everyMs\`=X换算成毫秒
- 用户给出 Cron 表达式或明确说“用 cron 表达式”（重复执行）=> 用 \`cron_job\` + \`type=cron\`

在调用 \`cron_job.add\` 创建任务时，需要把用户原始自然语言拆成两部分：一部分是“什么时候执行”（用来决定 type/at/everyMs/cron），另一部分是“要做什么任务本身”。\`instruction\` 字段只能填“要做什么”的那部分文本（保持原语言和原话），不能再改写、翻译或总结。

当用户请求“在未来某个时间点执行某个动作”（例如“1分钟后给我发一个笑话到邮箱”）时，本轮对话只需要使用 \`cron_job\` 设置/更新定时任务，不要在当前轮直接完成这个动作本身：不要直接调用 \`send_mail\` 给他发邮件，也不要在当前轮就真正“执行”指令，只需把要执行的动作写进 \`instruction\` 里，交给将来的定时任务去跑。

注意：像“\`1分钟后提醒我喝水\`”，时间相关信息用于计算下一次执行时间，而 \`instruction\` 应该是“提醒我喝水”；本轮不需要立刻提醒。`
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
