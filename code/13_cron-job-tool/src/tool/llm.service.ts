import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LlmService {
  constructor(private readonly configService: ConfigService) {}

  getModel() {
    return new ChatOpenAI({
      temperature: 0.7,
      model: this.configService.get('QINIU_MODEL_NAME'),
      apiKey: this.configService.get('QINIU_ACCESS_KEY'),
      configuration: {
        baseURL: this.configService.get('QINIU_BASE_URL'),
      },
    });
  }
}
