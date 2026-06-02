import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { Milvus } from '@langchain/community/vectorstores/milvus';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

// 定义默认向量数据库集合名称以及检索时的 Top K 相似片段数量
const COLLECTION_NAME = 'ebook_collection';
const TOP_K = 5;

// 动态获取大语言模型客户端实例，规避网络并发与长连接下的 TCP socket 挂起死锁问题
function getLlm() {
  return new ChatOpenAI({
    temperature: 0,
    model: envVars.QWEN_MODEL_NAME,
    apiKey: envVars.QWEN_API_KEY,
    maxRetries: 0, // 不自动重试，防止进程长时间挂起
    configuration: {
      baseURL: envVars.QWEN_BASE_URL,
    },
  });
}

// 初始化嵌入 (Embedding) 模型，用于将用户提问向量化，从而在向量数据库中进行相似度检索
const embeddings = new OpenAIEmbeddings({
  model: envVars.EMBEDDINGS_MODEL_NAME as string,
  dimensions: 1024,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

// 1. 初始状态
interface IState {
  question: string;
  k: number;
  strategy: string;
  routeReason: string;
  subQuestions: string[];
  nextSubIdx: number;
  documents: any[];
  currentQuery: string;
  retrievalCount: number;
  maxRetrievals: number;
  plannedNext: 'retrieve' | 'generate' | 'done';
  generation: string;
}

/**
 * complex: 先拆解子问题序列，再按序检索
 */
const GraphState = Annotation.Root({
  question: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  k: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => TOP_K,
  }),
  strategy: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  routeReason: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  /** 拆解得到的有序子问题，仅用于检索 */
  subQuestions: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  /** 下一轮 retrieve 要用的下标（指向 subQuestions 中尚未检索的那一条） */
  nextSubIdx: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  documents: Annotation<any[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  currentQuery: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  retrievalCount: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  maxRetrievals: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 8,
  }),
  plannedNext: Annotation<'retrieve' | 'generate' | 'done'>({
    reducer: (_prev, next) => next,
    default: () => 'retrieve',
  }),
  generation: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
});

let vectorStore: Milvus;

/**
 * 辅助函数：根据用户提问，在 Milvus 向量数据库中检索最相似的小说片段
 */
async function retrieveRelevantContent(question: string, k: number = TOP_K) {
  try {
    // 执行相似度检索（similaritySearchWithScore），返回匹配文档的相似度得分 (score)
    const docsWithScores = await vectorStore.similaritySearchWithScore(question, k);
    return docsWithScores.map(([doc, score]: [any, number]) => ({
      score,
      content: doc.pageContent,
      id: doc.metadata?.id ?? 'unknown',
      book_id: doc.metadata?.book_id ?? '未知',
      chapter_num: doc.metadata?.chapter_num ?? '未知',
      index: doc.metadata?.index ?? '未知',
    }));
  } catch (error) {
    console.error('检索内容时出错: ', (error as any).message);
    return [];
  }
}

/** 按 id 合并：同 id 保留更高 score */
function mergeUnique(existingDocs: any, newDocs: any) {
  const map = new Map();

  for (const d of [...existingDocs, ...newDocs]) {
    const key = String(d.id);
    const prev = map.get(key);
    if (!prev || Number(d.score) > Number(prev.score)) {
      map.set(key, d);
    }
  }
  return Array.from(map.values()).sort((a, b) => Number(b.score) - Number(a.score));
}

const RouteSchema = z.object({
  strategy: z.enum(['simple', 'complex']),
  reason: z.string(),
});

const DecomposeSchema = z.object({
  sub_questions: z.array(z.string()).min(1).max(8),
  reason: z.string(),
});

const NextStepSchema = z.object({
  nextAction: z.enum(['retrieve', 'generate']),
  reason: z.string(),
});

const routeQuestionNode = async (state: IState) => {
  console.log('---ROUTE_QUESTION---');
  let response;
  try {
    response = await getLlm().invoke(`
你是问答路由器。请判断用户问题是否需要外部检索。

你必须只返回一个 JSON 对象，**禁止**包含任何 Markdown 标记或多余的解释，格式如下：
{
  "strategy": "simple" 或 "complex",
  "reason": "进行此策略选择的具体原因说明"
}

规则：
- simple: 常识问答、简短定义、无需特定小说细节即可回答。
- complex: 需要《天龙八部》具体情节、人物关系、章节事实原文细节或证据支持。

用户问题：${state.question}
`);
  } catch (err) {
    console.error('路由节点 invoke 发生错误:', (err as any).message);
    throw err;
  }

  let strategy = 'complex';
  let routeReason = '';
  try {
    const text = response.content
      .toString()
      .trim()
      .replace(/```json|```/g, '');
    const route = JSON.parse(text);
    strategy = route.strategy ?? 'complex';
    routeReason = route.reason ?? '';
  } catch (e) {
    console.error('解析路由策略 JSON 失败，回退到 complex:', e);
  }

  console.log(`路由策略: ${strategy} (${routeReason})`);
  return {
    strategy,
    routeReason,
    retrievalCount: 0,
    maxRetrievals: state.maxRetrievals ?? 8,
    documents: [],
    subQuestions: [],
    nextSubIdx: 0,
    currentQuery: '',
  };
};

const decomposeQuestionNode = async (state: IState) => {
  console.log('---DECOMPOSE_QUESTION---');
  console.log('等待 1.5 秒以规避网络并发限制...');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  let response;
  try {
    response = await getLlm().invoke(`你是《天龙八部》多跳问答的「子问题拆解器」。

任务：将问题拆成**有序**子问题列表 sub_questions，用于**依次向量检索**。

你必须只返回一个 JSON 对象，**禁止**包含任何 Markdown 标记或多余的解释，格式如下：
{
  "sub_questions": ["子问题1", "子问题2", ...],
  "reason": "子问题拆解的理由说明"
}

用户原始问题：
${state.question}

要求：
1. 链式推理、多层关系、因果先后的问题，必须拆成多条；单跳即可答的也可只输出 1 条。
2. 每条子问题必须是**可独立检索**的完整中文问句，**禁止**使用「他/她/此人/上文」等指代；可写全人物名与事件名。
3. 顺序必须符合推理链：先搞清前置实体/事实，再查后续结论。
4. **不要**把整句原题原样复制成唯一一条（除非确实无法拆分）；不要拆成过碎的关键词列表。
5. 输出 1～8 条即可。`);
  } catch (err) {
    console.error('子问题拆解 invoke 发生错误:', (err as any).message);
    throw err;
  }

  let out = { sub_questions: [state.question], reason: '' };
  try {
    const text = response.content
      .toString()
      .trim()
      .replace(/```json|```/g, '');
    out = JSON.parse(text);
  } catch (e) {
    console.error('解析子问题拆解 JSON 失败，回退到原句:', e);
  }

  const subQuestions = (out.sub_questions || [state.question]).map((s) => s.trim()).filter(Boolean);
  if (subQuestions.length === 0) {
    throw new Error('decompose_question: sub_questions 为空');
  }

  console.log(`拆解 ${subQuestions.length} 条子问题 (${out.reason || '无原因'})`);
  subQuestions.forEach((q, i) => {
    console.log(`  [${i + 1}] ${q}`);
  });

  return {
    subQuestions,
    nextSubIdx: 0,
    currentQuery: subQuestions[0],
  };
};

const retrieveNode = async (state: IState) => {
  const subs = state.subQuestions ?? [];
  const idx = state.nextSubIdx ?? 0;
  const q = subs[idx]?.trim();
  if (!q) {
    throw new Error(`retrieve: 子问题下标 ${idx} 无有效文本（共 ${subs.length} 条）`);
  }

  const round = state.retrievalCount + 1;
  console.log(`---RETRIEVE (第 ${round} 轮，子问题 ${idx + 1}/${subs.length})---`);
  console.log(`查询: ${q}`);

  const newDocs = await retrieveRelevantContent(q, state.k);
  const merged = mergeUnique(state.documents ?? [], newDocs);

  if (newDocs.length === 0) {
    console.log('本轮未命中文档');
  } else {
    console.log(`本轮命中 ${newDocs.length} 条，累计去重后 ${merged.length} 条`);
    newDocs.forEach((item, i) => {
      const preview =
        item.content.length > 120 ? `${item.content.substring(0, 120)}...` : item.content;
      console.log(
        `[R${i + 1}] score=${Number(item.score).toFixed(4)} chapter=${item.chapter_num} index=${item.index}`
      );
      console.log(`      ${preview}`);
    });
  }

  return {
    documents: merged,
    retrievalCount: round,
    nextSubIdx: idx + 1,
    currentQuery: q,
  };
};

const planNextStepNode = async (state: IState) => {
  console.log('---PLAN_NEXT_STEP---');
  const subs = state.subQuestions ?? [];
  const nextIdx = state.nextSubIdx ?? 0;
  const remaining = subs.length - nextIdx;

  const subList = subs
    .map(
      (s, i) =>
        `${i + 1}. ${s}${i < nextIdx ? ' （已检索）' : i === nextIdx ? ' （下一轮将检索，若选择继续）' : ' （未检索）'}`
    )
    .join('\n');

  const docStr =
    state.documents.length === 0
      ? '（尚无检索结果）'
      : state.documents
          .slice(0, 6)
          .map(
            (d, i) =>
              `[${i + 1}] score=${Number(d.score).toFixed(4)} 第${d.chapter_num}章: ${d.content.slice(0, 200)}${d.content.length > 200 ? '...' : ''}`
          )
          .join('\n\n');

  const prompt = `你是多跳 RAG 规划器。检索查询已由前置步骤拆解为**有序子问题**；若需继续检索，下一轮将自动使用「下一条子问题」做向量检索，你**不要**自拟新的检索句。

你必须只返回一个 JSON 对象，**禁止**包含任何 Markdown 标记或多余的解释，格式如下：
{
  "nextAction": "retrieve" 或 "generate",
  "reason": "进行此决策的具体理由说明"
}

用户原始问题：${state.question}

子问题序列：
${subList || '（无）'}

已检索轮数：${state.retrievalCount}；剩余未检索子问题条数：${remaining}
最大检索轮数上限：${state.maxRetrievals}

已召回文档摘要：
${docStr}

请判断下一步：
1) 已有足够依据回答用户原始问题 → nextAction=generate
2) 仍缺关键事实、且仍存在未检索的子问题、且未超过轮数上限 → nextAction=retrieve

硬性规则：
- 若剩余未检索子问题条数为 0，必须 nextAction=generate。
- 若已检索轮数已达到或超过最大检索轮数，必须 nextAction=generate。`;

  let response;
  try {
    response = await getLlm().invoke(prompt);
  } catch (err) {
    console.error('规划下一步决策 invoke 发生错误:', (err as any).message);
    throw err;
  }

  let nextAction = 'generate';
  let reason = '';
  try {
    const text = response.content
      .toString()
      .trim()
      .replace(/```json|```/g, '');
    const resObj = JSON.parse(text);
    nextAction = resObj.nextAction;
    reason = resObj.reason;
  } catch (e) {
    console.error('解析下一步决策 JSON 失败，回退到 generate:', e);
  }

  let finalNext = nextAction;
  if (state.retrievalCount >= state.maxRetrievals) finalNext = 'generate';
  if (remaining <= 0) finalNext = 'generate';

  console.log(`[决策] plannedNext=${finalNext} (模型建议=${nextAction}) (${reason})`);

  return {
    plannedNext: finalNext,
  };
};

function afterRoute(state: IState) {
  return state.strategy === 'simple' ? 'direct_answer' : 'decompose_question';
}

function afterPlan(state: IState) {
  return state.plannedNext === 'retrieve' ? 'retrieve' : 'generate';
}

const directAnswerNode = async (state: IState) => {
  console.log('---DIRECT_ANSWER---');
  process.stdout.write('\n【AI 回答（流式）】\n');
  let generation = '';
  try {
    const stream = await getLlm().stream(`你是一个中文问答助手，请直接简洁回答问题。

问题：${state.question}
`);
    for await (const chunk of stream) {
      const text = typeof chunk.content === 'string' ? chunk.content : '';
      if (!text) continue;
      generation += text;
      process.stdout.write(text);
    }
    process.stdout.write('\n');
  } catch (error) {
    console.error('\n直接回答出错:', (error as any).message);
  }
  return { generation };
};

const generateNode = async (state: IState) => {
  console.log('---GENERATE---');
  const context = state.documents
    .map(
      (item, i) => `[片段 ${i + 1}]
章节: 第 ${item.chapter_num} 章
内容: ${item.content}`
    )
    .join('\n\n━━━━━\n\n');
  process.stdout.write('\n【AI 回答（流式）】\n');
  let generation = '';
  try {
    const stream = await getLlm()
      .stream(`你是一个专业的《天龙八部》小说助手。基于小说内容回答问题，用准确、详细的语言。

请根据以下《天龙八部》小说片段内容回答问题：
${context || '（未检索到相关内容）'}

用户问题: ${state.question}

回答要求：
1. 如果片段中有相关信息，请结合小说内容给出详细、准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
4. 回答要准确，符合小说的情节和人物设定
5. 可以引用原文内容来支持你的回答

AI 助手的回答:`);
    for await (const chunk of stream) {
      const text = typeof chunk.content === 'string' ? chunk.content : '';
      if (!text) continue;
      generation += text;
      process.stdout.write(text);
    }
    process.stdout.write('\n');
  } catch (error) {
    console.error('\n生成回答时出错:', (error as any).message);
  }
  return { generation };
};

const graph = new StateGraph(GraphState)
  .addNode('route_question', routeQuestionNode)
  .addNode('direct_answer', directAnswerNode)
  .addNode('decompose_question', decomposeQuestionNode)
  .addNode('retrieve', retrieveNode)
  .addNode('plan_next_step', planNextStepNode)
  .addNode('generate', generateNode)
  .addEdge(START, 'route_question')
  .addConditionalEdges('route_question', afterRoute, {
    direct_answer: 'direct_answer',
    decompose_question: 'decompose_question',
  })
  .addEdge('decompose_question', 'retrieve')
  .addEdge('retrieve', 'plan_next_step')
  .addConditionalEdges('plan_next_step', afterPlan, {
    retrieve: 'retrieve',
    generate: 'generate',
  })
  .addEdge('direct_answer', END)
  .addEdge('generate', END)
  .compile();

async function main() {
  const question =
    '《天龙八部》中「四大恶人」排行第二的是谁？此人之子在身世揭晓前，其生父在武林中的公开身份是什么？';
  const k = 5;

  const drawable = await graph.getGraphAsync();
  console.log(drawable.drawMermaid({ withStyles: true }));

  console.log('连接到 Milvus...');
  vectorStore = await Milvus.fromExistingCollection(embeddings, {
    collectionName: 'ebook_collection',
    url: envVars.MILVUS_ADDRESS,
    textField: 'content',
    primaryField: 'id',
    vectorField: 'vector',
    indexCreateOptions: {
      metric_type: 'COSINE',
      index_type: 'HNSW',
      params: { M: 16, efConstruction: 200 },
      search_params: { ef: 64 },
    },
  });
  vectorStore.indexSearchParams = { metric_type: 'COSINE', params: JSON.stringify({ ef: 64 }) };
  console.log('✓ 已连接\n');

  try {
    await vectorStore.client.loadCollection({ collection_name: 'ebook_collection' });
    console.log('✓ 集合 ebook_collection 已加载\n');
  } catch (error) {
    if (!(error as any).message.includes('already loaded')) {
      throw error;
    }
    console.log('✓ 集合 ebook_collection 已处于加载状态\n');
  }

  console.log('='.repeat(80));
  console.log(`问题: ${question}`);
  console.log('='.repeat(80));

  const result = await graph.invoke({
    question,
    k: Number.isFinite(k) ? k : 5,
    strategy: '',
    routeReason: '',
    subQuestions: [],
    nextSubIdx: 0,
    documents: [],
    currentQuery: '',
    retrievalCount: 0,
    maxRetrievals: 8,
    plannedNext: 'retrieve',
    generation: '',
  });

  if (result.strategy === 'complex') {
    if (result.subQuestions?.length) {
      console.log('\n【子问题序列】');
      result.subQuestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    }
    console.log('\n【检索相关内容（累计）】');
    if (result.documents.length === 0) {
      console.log('未找到相关内容');
    } else {
      result.documents.forEach((item, i) => {
        console.log(`\n[片段 ${i + 1}] 相似度: ${Number(item.score).toFixed(4)}`);
        console.log(`书籍: ${item.book_id}`);
        console.log(`章节: 第 ${item.chapter_num} 章`);
        console.log(`片段索引: ${item.index}`);
        console.log(
          `内容: ${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}`
        );
      });
    }
    console.log(`\n检索轮数: ${result.retrievalCount} / ${result.maxRetrievals}`);
  }

  console.log(`\n最终策略: ${result.strategy}`);
  if (!result.generation?.trim()) {
    console.log('模型未返回内容。');
  }
}

main().catch((err) => {
  console.error('运行失败:', err);
  process.exit(1);
});
