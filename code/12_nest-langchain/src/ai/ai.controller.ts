import { Controller, Get, Inject, Query, Sse } from '@nestjs/common';
import { AiService } from './ai.service';
import { from, map, Observable } from 'rxjs';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('chat')
  async chat(@Query('query') query: string) {
    const anwser = await this.aiService.runChain(query);

    return { anwser };
  }

  /* Next 中使用 rxjs 来处理异步流 */
  @Sse('chat/stream')
  chatStream(@Query('query') query: string): Observable<{ data: string }> {
    return from(this.aiService.streamChain(query)).pipe(map((chunk: any) => ({ data: chunk })));
  }
}
