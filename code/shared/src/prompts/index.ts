// Prompt 模板
export class PromptTemplate {
  constructor(private template: string) {}

  render(variables: Record<string, string>): string {
    return Object.entries(variables).reduce(
      (result, [key, value]) => result.replace(new RegExp(`{{${key}}}`, 'g'), value),
      this.template
    );
  }
}

export function createPrompt(template: string): PromptTemplate {
  return new PromptTemplate(template);
}

export const SYSTEM_PROMPTS = {
  ASSISTANT: createPrompt('你是一个有帮助的 AI 助手。{{context}}'),

  CODE_REVIEWER: createPrompt(`你是一个专业的代码审查员。请审查以下代码：

\`\[\](file://d:\ZSP\Study\Ai%20Agent\code\shared\src\index.ts)
{{code}}
\[\](file://d:\ZSP\Study\Ai%20Agent\code\shared\src\index.ts)\`

请从以下几个方面进行审查：
1. 代码质量
2. 潜在 bug
3. 性能优化
4. 最佳实践`),

  TRANSLATOR: createPrompt(
    '你是一个专业的翻译。请将以下文本从{{sourceLang}}翻译成{{targetLang}}：{{text}}'
  ),

  SUMMARIZER: createPrompt('请总结以下内容，要求简洁明了：{{content}}'),

  EXTRACTOR: createPrompt(`请从以下文本中提取关键信息：{{text}} 提取的信息包括：
    - 主要主题
    - 关键实体
    - 重要日期
    - 核心观点`),
};
