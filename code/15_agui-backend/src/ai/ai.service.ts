import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { Inject, Injectable } from '@nestjs/common';
import { UIMessage } from 'ai';
import { AIMessageChunk, createAgent } from 'langchain';

@Injectable()
export class AiService {
  private readonly agent: ReturnType<typeof createAgent>;

  constructor(
    @Inject('CHAT_MODEL') private readonly model: ChatOpenAI,
    @Inject('WEB_SEARCH_TOOL') private readonly webSearchTool: any,
    @Inject('SEND_MAIL_TOOL') private readonly sendMailTool: any
  ) {
    this.agent = createAgent({
      model: this.model,
      tools: [this.webSearchTool, this.sendMailTool],
      systemPrompt:
        '你是 AI 助手，需要最新信息、事实核查或联网信息时，请使用 web_search 工具搜索后再作答。',
    });
  }

  /**
   * 处理流式消息
   * @param messages 前端使用 useChat 传入的消息
   * @returns 流式消息返回
   */
  async stream(messages: UIMessage[]) {
    // 模型输入：UI 输入转成模型输入
    const lcMessages = await toBaseMessages(messages);
    const lgStream = await this.agent.stream(
      { messages: lcMessages },
      {
        streamMode: ['messages', 'values'],
        recursionLimit: 12,
      }
    );

    return toUIMessageStream(lgStream as AsyncIterable<AIMessageChunk>);
  }
}
