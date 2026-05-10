import { ChatOpenAI } from '@langchain/openai';
import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    {
      provide: 'CHAT_MODEL',
      useFactory: (configService: ConfigService) => {
        return new ChatOpenAI({
          temperature: 0.7,
          model: configService.get('QINIU_MODEL_NAME'),
          apiKey: configService.get('QINIU_ACCESS_KEY'),
          configuration: {
            baseURL: configService.get('QINIU_BASE_URL'),
          },
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class AiModule {}
