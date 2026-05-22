import { tool } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TimeNowToolService {
  readonly tool;

  constructor() {
    this.tool = tool(
      async () => {
        const now = new Date();
        // 需要返回一个字符串，非对象，否则 langchain 的 ToolMessage 会报错（ToolMessage 的 content 要求为字符串）
        return JSON.stringify({
          iso: now.toISOString(),
          timestamp: now.getTime(),
        });
      },
      {
        name: 'time_now',
        description:
          '获取当前服务器时间，返回 JSON 格式的当前时间，包含 ISO 字符串（iso）和毫秒级时间戳（timestamp）',
      }
    );
  }
}
