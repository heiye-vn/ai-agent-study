import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent, HumanMessage } from 'langchain';
import { createFilesystemMiddleware, FilesystemBackend } from 'deepagents';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../../.env') }).parsed || {};

const workspaceDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'workspace');

/** 先匹配先生效；未命中任何规则则默认允许 */
const permissions = [
  { operations: ['read'] as const, paths: ['/secret.txt'], mode: 'deny' as const },
  { operations: ['write'] as const, paths: ['/todo.md'], mode: 'allow' as const },
  { operations: ['write'] as const, paths: ['/**'], mode: 'deny' as const },
];

fs.rmSync(workspaceDir, { recursive: true, force: true });
fs.mkdirSync(workspaceDir);
fs.writeFileSync(path.join(workspaceDir, 'secret.txt'), '机密：不得读取', 'utf8');

const model = new ChatOpenAI({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.QWEN_MODEL_NAME ?? 'qwen-plus',
  temperature: 0,
  configuration: { baseURL: envVars.QWEN_BASE_URL },
});

const agent = createAgent({
  model,
  tools: [],
  systemPrompt:
    '工作区根路径为 /。用 ls、read_file、write_file、edit_file 操作文件，路径以 / 开头。中文回答。',
  middleware: [
    createFilesystemMiddleware({
      backend: new FilesystemBackend({ rootDir: workspaceDir, virtualMode: true }),
      permissions,
    }) as any,
  ],
});

console.log('工作区:', workspaceDir);
console.log('权限:', JSON.stringify(permissions, null, 2));

async function run(label: string, prompt: string) {
  console.log(`\n=== ${label} ===\n`, prompt, '\n');
  const { messages } = await agent.invoke(
    { messages: [new HumanMessage(prompt)] },
    { recursionLimit: 20 }
  );
  for (const m of messages) {
    for (const t of (m as any).tool_calls ?? []) console.log('→', t.name);
  }
  console.log('回复:', messages.at(-1)?.content);
}

async function expectDenied(label: string, prompt: string) {
  console.log(`\n=== ${label}（预期拒绝）===\n`, prompt, '\n');
  try {
    await agent.invoke({ messages: [new HumanMessage(prompt)] }, { recursionLimit: 5 });
    console.log('未触发拒绝（异常）');
  } catch (error) {
    const e = error as any;
    const msg = e.cause?.message ?? e.message;
    console.log('✗', msg);
  }
}

await run(
  '允许的操作',
  'write_file 创建 /todo.md（三条待办），edit_file 把第一条标为完成，ls /，一句话总结。'
);

await expectDenied('禁止读', '只调用 read_file，路径 /secret.txt。');
await expectDenied('禁止写', '只调用 write_file，路径 /hack.txt，内容 test。');
