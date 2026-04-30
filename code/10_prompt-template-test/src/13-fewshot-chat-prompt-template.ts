import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, FewShotChatMessagePromptTemplate } from '@langchain/core/prompts';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// 初始化模型
const model = new ChatOpenAI({
  temperature: 0.3,
  model: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

// few-shot 示例：每条示例是「human 问 + ai 答」的聊天片段
const EXAMPLES = [
  {
    input: '本周主要推进支付稳定性治理，做了事故处置、告警优化和演练。',
    output:
      '- 本周围绕支付链路稳定性开展治理工作：完成 1 起 P1 事故与 2 起 P2 事故的排查与修复，均在 SLA 内关闭；\n' +
      '- 梳理并合并冗余告警规则 8 条，新建 4 条基于 SLO 的告警，大幅降低无效告警噪音；\n' +
      '- 组织 1 次故障应急演练，验证支付核心链路的应急预案可行性。',
  },
  {
    input: '本周交付了新运营看板，并给业务同学做了多场分享。',
    output:
      '- 上线新一代「运营实时看板」，支持业务实时查看关键转化指标和漏斗数据；\n' +
      '- 衔接埋点、数据仓库与可视化链路，为后续精细化运营提供统一数据口径；\n' +
      '- 面向市场和运营团队组织 2 场产品培训，帮助非技术同学理解看板核心能力和使用场景。',
  },
];

// 把上面的结构映射为 FewShotChatMessagePromptTemplate 可用的 examples
const fewShotExamples = new FewShotChatMessagePromptTemplate({
  examplePrompt: ChatPromptTemplate.fromMessages([
    ['human', '下面是本周的工作概述：\n{input}\n\n请帮我整理成适合发在团队周报里的要点列表。'],
    ['ai', '{output}'],
  ]),
  examples: EXAMPLES,
  exampleSeparator: '\n\n', // 可选：示例之间的分隔符，仅影响 formatMessages 输出
  inputVariables: [], // 示例本身不依赖运行时变量
});

// 4. 把 few-shot 示例和最终用户输入组合成一个完整的 ChatPromptTemplate
const chatPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    '你是一名资深技术负责人，请根据给定的工作内容，参考上面的示例，帮我写一段结构清晰、重点突出的周报片段（使用 Markdown 列表）。',
  ],
  ['system', '下面是若干参考示例，请重点学习它们的「表达方式和结构」，而不是照搬具体内容：'],
  fewShotExamples as any,
  ['human', '这是我本周的实际工作内容，请帮我整理成周报：\n{current_work}'],
]);

const currentWork =
  '本周完成了订单模块的一轮重构，拆分了历史遗留的大文件，并补齐了核心路径的单测；' +
  '同时修复了两起线上性能问题，并把指标接入统一监控看板。';

async function main() {
  // 组装成消息
  const messages = await chatPrompt.formatMessages({
    current_work: currentWork,
  });

  console.log('\n===== 发送给模型的消息 =====\n');
  console.log(messages);

  try {
    const stream = await model.stream(messages);
    console.log('\n===== 模型输出 =====\n');
    for await (const chunk of stream) {
      const chunkStr =
        typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
      process.stdout.write(chunkStr);
    }
    console.log('\n');
  } catch (e) {
    console.log(
      '\n（提示：如需真实调用模型，请确认已配置 MODEL_NAME / OPENAI_API_KEY / OPENAI_BASE_URL）'
    );
  }
}

main();

/*
    Prompt Template 相关 API：

        - PromptTemplate：提示词模版，可以填入占位符变量
        - ChatPromptTemplate：对话形式（messages 数组）的提示词模版
        - FewShotPromptTemplate：生成带示例的提示词模版
        - FewShotChatTemplatePromptTemplate：生成带示例的提示词模版，对话形式
        - LengthBasedExampleSelector：根据长度选择合适的示例
        - SemanticSimilarityExampleSelector：选择语义相近的示例
        - PipelinePromptTemplate：合并多个 Prompt Template 成一个大的 Prompt Template
*/
