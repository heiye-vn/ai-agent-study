import { from, map, Observable } from 'rxjs';
import { Controller, Get, Inject, Query, Sse } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Inject('SEND_MAIL_TOOL')
  private readonly sendMailTool: any;

  @Get('chat')
  async chat(@Query('query') query: string) {
    const anwser = await this.aiService.runChain(query);

    return { anwser };
  }

  @Sse('chat-stream')
  chatStream(@Query('query') query: string): Observable<MessageEvent> {
    const stream = this.aiService.runChainStream(query);

    return from(stream).pipe(
      map(
        (chunk) =>
          ({
            data: chunk,
            id: String(Date.now()),
            type: 'message',
          }) as unknown as MessageEvent
      )
    );
  }
}
