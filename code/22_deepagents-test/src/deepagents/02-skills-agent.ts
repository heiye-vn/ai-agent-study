import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { existsSync, mkdirSync } from 'node:fs';
import { createFilesystemMiddleware, createSkillsMiddleware, LocalShellBackend } from 'deepagents';
import { createAgent, HumanMessage } from 'langchain';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../../.env') }).parsed || {};

const model = new ChatOpenAI({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.QWEN_MODEL_NAME ?? 'qwen-plus',
  temperature: 0,
  configuration: { baseURL: envVars.QWEN_BASE_URL },
});

const skills = '/.agents/skills/';
const output = 'src/deepagents/output/deepagents-skills-flow.excalidraw';

if (!existsSync('.agents/skills/excalidraw-diagram-generator/SKILL.md')) {
  throw new Error(
    '未找到 excalidraw-diagram-generator，请先: npx skills add github/awesome-copilot --skill excalidraw-diagram-generator -y'
  );
}

mkdirSync('src/deepagents/output', { recursive: true });

const backend = await LocalShellBackend.create({
  rootDir: '.',
  virtualMode: true,
  inheritEnv: true,
});

const agent = createAgent({
  model,
  tools: [],
  systemPrompt: [
    '按 skills 库完成任务，需要时 read_file 对应 SKILL.md。中文回答。',
    '重要：write_file 的 content 参数必须是纯字符串。',
    '如果要写入 JSON 文件（如 .excalidraw），请把整个 JSON 用 JSON.stringify 序列化为一行字符串后传入 content。',
    '禁止将 JSON 对象直接作为 content 值。',
  ].join('\n'),
  middleware: [
    createSkillsMiddleware({ backend, sources: [skills] }) as any,
    createFilesystemMiddleware({ backend }) as any,
  ],
});

const prompt = [
  '画一张流程图，描述本项目的 skills-agent 工作流：',
  '用户 Prompt → createAgent → createSkillsMiddleware → createFilesystemMiddleware → 模型回复。',
  `保存为 ${output}。要求：`,
  '- 顶部大标题 + 副标题',
  '- 每个主节点 numbered（①②…）且框内 2～3 行中文说明',
  '- 右侧一列「说明：…」补充细节',
  '- 箭头上标注阶段名（如 invoke、wrapModelCall）',
  '- 底部图例（颜色含义 + 如何运行 demo）',
].join('\n');

console.log('用户:', prompt);

function chunkText(chunk: any) {
  if (!chunk?.content) return '';
  if (typeof chunk.content === 'string') return chunk.content;
  if (Array.isArray(chunk.content)) {
    return chunk.content.map((p: any) => (typeof p === 'string' ? p : (p?.text ?? ''))).join('');
  }
  return '';
}

const stream = await agent.streamEvents(
  { messages: [new HumanMessage(prompt)] },
  { recursionLimit: 100 }
);

let skillsMetadata;
console.log('\n--- 流式输出 ---\n');

try {
  for await (const event of stream) {
    if (event.event === 'on_chat_model_stream') {
      const text = chunkText(event.data?.chunk);
      if (text) process.stdout.write(text);
    }
    if (event.event === 'on_tool_start') {
      const name = event.name?.split('/').pop() ?? event.name;
      process.stdout.write(`\n\n→ ${name}\n\n`);
    }
    if (event.event === 'on_chain_end' && event.data?.output?.skillsMetadata) {
      skillsMetadata = event.data.output.skillsMetadata;
    }
  }
} catch (e: any) {
  console.error('\n\n[错误]', e.cause?.message ?? e.message);
}

console.log('\n');
console.log(
  'skills:',
  skillsMetadata?.map((s: any) => s.name)
);
if (existsSync(output)) {
  console.log('图表:', output);
  console.log('打开: https://excalidraw.com → Open → 选择该文件');
} else {
  console.log('未生成:', output);
}

await backend.close();
