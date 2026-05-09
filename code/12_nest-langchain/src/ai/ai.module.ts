import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ChatOpenAI } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    // 将 ai.service.ts 中的 ChatModel 拆离，实现 model 和业务的解耦，可以动态切换
    {
      provide: 'CHAT_MODEL',
      useFactory: (configService: ConfigService) => {
        return new ChatOpenAI({
          temperature: 0.7,
          model: configService.get('QWEN_MODEL_NAME'),
          apiKey: configService.get('QWEN_API_KEY'),
          configuration: {
            baseURL: configService.get('QWEN_BASE_URL'),
          },
        });
      },
      // 注入 ConfigService 给 useFactory 工厂函数，否则参数(configService)为 undefined
      inject: [ConfigService],
    },
  ],
})
export class AiModule {}
