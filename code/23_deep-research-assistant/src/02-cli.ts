import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { HumanMessage } from '@langchain/core/messages';

import { createIntelligenceDeskAgent, projectDir } from './01-agent.js';

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const envVars: Record<string, string> =
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const recursionLimit: number = Number(envVars.RECURSION_LIMIT) || 300;

const FILE_TOOLS: Set<string> = new Set([
  'write_file',
  'edit_file',
  'read_file',
  'ls',
  'glob',
  'grep',
]);

const EVAL_TOOL: string = 'eval';
const PREVIEW_LEN: number = 100;
const RESULT_PREVIEW_LEN: number = 120;

// ─── LangGraph stream 输出的数据结构类型定义 ─────────────────

/** tool_calls 中的单个工具调用描述 */
interface ToolCallInfo {
  id?: string;
  name: string;
  args: string | Record<string, unknown>;
}

/** stream chunk 中的消息结构 */
interface StreamMessage {
  type?: string;
  name?: string;
  content?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallInfo[];
}

/** stream chunk 中单个 node 的数据 */
interface ChunkData {
  messages?: StreamMessage[];
}

/** 暂存的文件工具调用信息 */
interface FileCallInfo {
  name: string;
  path: string;
}

/** pathFromArgs 接收的参数对象 */
interface ToolArgs {
  file_path?: string;
  path?: string;
  pattern?: string;
  [key: string]: unknown;
}

// ─── 工具函数 ─────────────────────────────────────────────

function printBanner(): void {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║              深度调研助手              ║');
  console.log('╚══════════════════════════════════════════╝\n');
}

async function readQuery(): Promise<string> {
  const fromArgs: string = process.argv.slice(2).join(' ').trim();
  if (fromArgs) return fromArgs;

  const rl: readline.Interface = readline.createInterface({ input, output });
  try {
    return (await rl.question('请输入调研主题: ')).trim();
  } finally {
    rl.close();
  }
}

function stepLabel(namespace: string[], node: string): string {
  if (namespace.length === 0) return `[主 Agent] ${node}`;
  const id: string = namespace[0]?.replace(/^tools:/, 'subagent:') ?? namespace[0];
  return `[${id}] ${node}`;
}

function displayPath(p: string): string {
  return p.startsWith('/workspace/') ? p.slice(1) : p.replace(/^\/+/, '');
}

function pathFromArgs(name: string, args: ToolArgs | string | null): string | null {
  if (!args || typeof args !== 'object') return null;
  if (name === 'write_file' || name === 'edit_file' || name === 'read_file') {
    return typeof args.file_path === 'string' ? args.file_path : null;
  }
  if (name === 'ls') return typeof args.path === 'string' ? args.path : null;
  if (name === 'glob' || name === 'grep') {
    const dir: string = typeof args.path === 'string' ? args.path : '/';
    const pattern: string = typeof args.pattern === 'string' ? args.pattern : '';
    return pattern ? `${pattern} @ ${dir}` : dir;
  }
  return null;
}

function parseArgs(args: string | Record<string, unknown>): ToolArgs | string {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as ToolArgs;
    } catch {
      return args;
    }
  }
  return args as ToolArgs;
}

function previewText(text: unknown, maxLen: number): string {
  const oneLine: string = String(text).replace(/\s+/g, ' ').trim();
  if (!oneLine) return '(empty)';
  return oneLine.length <= maxLen ? oneLine : `${oneLine.slice(0, maxLen - 1)}…`;
}

function trackEvalCalls(data: ChunkData, pendingEval: Map<string, string>): void {
  for (const msg of data?.messages ?? []) {
    for (const tc of msg.tool_calls ?? []) {
      if (!tc.id || tc.name !== EVAL_TOOL) continue;
      const args: ToolArgs | string = parseArgs(tc.args);
      const code: string =
        args && typeof args === 'object' && typeof args.code === 'string' ? args.code : '';
      pendingEval.set(tc.id, code);
      console.log(`  🧮 eval: ${previewText(code, PREVIEW_LEN)}`);
    }
  }
}

function trackFileCalls(data: ChunkData, pending: Map<string, FileCallInfo>): void {
  for (const msg of data?.messages ?? []) {
    for (const tc of msg.tool_calls ?? []) {
      if (!tc.id || !tc.name || !FILE_TOOLS.has(tc.name)) continue;
      const p: string | null = pathFromArgs(tc.name, parseArgs(tc.args));
      if (p) pending.set(tc.id, { name: tc.name, path: p });
    }
  }
}

function logToolResults(
  data: ChunkData,
  pending: Map<string, FileCallInfo>,
  pendingEval: Map<string, string>
): void {
  for (const msg of data?.messages ?? []) {
    if (msg.type !== 'tool') continue;

    if (msg.name === 'task') {
      const preview: string = String(msg.content).slice(0, 120).replace(/\n/g, ' ');
      console.log(`  task done: ${preview}...`);
      continue;
    }

    if (msg.name === EVAL_TOOL) {
      console.log(`  🧮 eval → ${previewText(msg.content, RESULT_PREVIEW_LEN)}`);
      if (msg.tool_call_id) pendingEval.delete(msg.tool_call_id);
      continue;
    }

    if (!msg.name || !FILE_TOOLS.has(msg.name)) continue;

    const op: FileCallInfo | undefined = msg.tool_call_id
      ? pending.get(msg.tool_call_id)
      : undefined;
    const filePath: string | null | undefined =
      op?.path ?? String(msg.content).match(/['`](\/[^'`]+)['`]/)?.[1] ?? null;

    console.log(filePath ? `  ${msg.name}: ${displayPath(filePath)}` : `  ${msg.name}`);
    if (msg.tool_call_id) pending.delete(msg.tool_call_id);
  }
}

// ─── 主流程 ───────────────────────────────────────────────

async function run(query: string): Promise<void> {
  console.log(`query: ${query}`);
  console.log(`recursionLimit: ${recursionLimit}\n`);
  console.log('─'.repeat(50));

  const agent: ReturnType<typeof createIntelligenceDeskAgent> = createIntelligenceDeskAgent();
  const pending: Map<string, FileCallInfo> = new Map();
  const pendingEval: Map<string, string> = new Map();

  for await (const [namespace, chunk] of await agent.stream(
    { messages: [new HumanMessage(query)] },
    { streamMode: 'updates', subgraphs: true, recursionLimit }
  )) {
    for (const [node, data] of Object.entries(chunk) as [string, ChunkData][]) {
      if (node === 'model_request') {
        trackFileCalls(data, pending);
        trackEvalCalls(data, pendingEval);
        console.log(stepLabel(namespace as string[], node));
      } else if (node === 'tools') {
        logToolResults(data, pending, pendingEval);
      } else if (node === 'todoListMiddleware.after_model') {
        console.log(stepLabel(namespace as string[], node));
      }
    }
  }

  console.log('─'.repeat(50));
}

function listMd(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f: string) => f.endsWith('.md'))
    .map((f: string) => path.join(dir, f))
    .sort((a: string, b: string) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function printOutputs(): void {
  const sources: string[] = listMd(path.join(projectDir, 'workspace/sources'));
  const reports: string[] = listMd(path.join(projectDir, 'workspace/reports'));

  if (sources.length) {
    console.log('\n sources:');
    for (const f of sources.slice(0, 8)) {
      console.log(`   ${path.relative(projectDir, f)}`);
    }
  }
  if (reports.length) {
    console.log('\n reports:');
    for (const f of reports.slice(0, 5)) {
      console.log(`   ${path.relative(projectDir, f)}`);
    }
  }
}

async function main(): Promise<void> {
  printBanner();

  if (!envVars.QWEN_API_KEY?.trim()) {
    console.error('Missing QWEN_API_KEY — copy .env.example to .env');
    process.exit(1);
  }

  const query: string = await readQuery();
  if (!query) {
    console.error('请提供调研主题');
    process.exit(1);
  }

  try {
    await run(query);
    printOutputs();
    console.log('\n✅ done');
  } catch (err: unknown) {
    const msg: string = err instanceof Error ? err.message : String(err);
    if (msg.includes('Recursion limit')) {
      console.error(`\n❌ recursion limit (${recursionLimit}) — set RECURSION_LIMIT in .env`);
    } else {
      console.error('\n❌', err);
    }
    printOutputs();
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
