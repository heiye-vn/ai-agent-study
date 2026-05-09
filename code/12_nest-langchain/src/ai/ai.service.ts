import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import type { Runnable } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';

@Injectable()
export class AiService {
  private readonly chain: Runnable;

  constructor() {
    const prompt = PromptTemplate.fromTemplate(`请回答以下问题：\n\n{query}`);

    const model = new ChatOpenAI({
      temperature: 0.7,
      model: 'glm-5.1',
      apiKey: 'sk-e590913424f24ab48840c207a1f54e95',
      configuration: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
    });
    this.chain = prompt.pipe(model).pipe(new StringOutputParser());
  }

  async runChain(query: string): Promise<string> {
    return this.chain.invoke({ query });
  }
}
