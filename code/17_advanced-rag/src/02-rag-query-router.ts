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

// 初始化大语言模型客户端 (用于最终的 RAG 问题生成与流式回答)
const llm = new ChatOpenAI({
  temperature: 0,
  model: envVars.QWEN_MODEL_NAME,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

// 初始化嵌入 (Embedding) 模型，用于将用户提问向量化，从而在向量数据库中进行相似度检索
const embeddings = new OpenAIEmbeddings({
  model: envVars.EMBEDDINGS_MODEL_NAME as string,
  dimensions: 1024,
  apiKey: envVars.QWEN_API_KEY,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

const RouteSchema = z.object({
  strategy: z.enum(['simple', 'complex']),
  reason: z.string(),
});

// 定义工作流图的状态类型接口
interface IState {
  question: string; // 用户输入的查询问题
  k: number; // 检索返回的最大文档片段数
  strategy: string; // 工作流策略类型
  routeReason: string; // 策略选择原因
  documents: any[]; // 检索出的相关文档片段数组
  generation: string; // 大模型最终生成的回答文本
}

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
  documents: Annotation<any[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  generation: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
});

let vectorStore;

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

const routeQuestionNode = async (state: IState) => {
  console.log('---ROUTE_QUESTION---');
  const router = llm.withStructuredOutput(RouteSchema, {
    method: 'jsonMode',
  });
  const route = await router.invoke(`
        你是问答路由器。请判断用户问题是否需要外部检索。请输出符合 JSON 格式的路由策略。
        
        你必须返回一个 JSON 对象，结构如下：
        {
          "strategy": "simple" 或 "complex",
          "reason": "进行此策略选择的具体原因说明"
        }

规则：
- simple: 常识问答、简短定义、无需特定小说细节即可回答。
- complex: 需要《天龙八部》具体情节、人物关系、章节事实、原文细节或证据支持。

用户问题：${state.question}`);

  console.log(`路由策略: ${route.strategy} (${route.reason})`);

  return {
    question: state.question,
    k: state.k,
    strategy: route.strategy,
    routeReason: route.reason,
  };
};

// 检索节点
const retrieveNode = async (state: IState) => {
  console.log('---RETRIEVE---');
  const documents = await retrieveRelevantContent(state.question, state.k);

  if (documents.length === 0) {
    console.log('RETRIEVE 结果: 未命中文档');
  } else {
    console.log(`RETRIEVE 结果: 命中 ${documents.length} 条`);
    documents.forEach((item: any, i: number) => {
      const preview =
        item.content.length > 120 ? `${item.content.substring(0, 120)}...` : item.content;
      console.log(
        `[R${i + 1}] score=${Number(item.score).toFixed(4)} chapter=${item.chapter_num} index=${item.index}`
      );
      console.log(`    ${preview}`);
    });
  }

  return {
    question: state.question,
    k: state.k,
    strategy: state.strategy,
    routeReason: state.routeReason,
    documents,
  };
};
// 直接回答问题节点
const directAnswerNode = async (state: IState) => {
  console.log('---DIRECT_ANSWER---');
  process.stdout.write('\n【AI 回答（流式）】\n');
  let generation = '';
  const stream = await llm.stream(`你是一个中文问答助手，请直接简洁回答问题。

问题：${state.question}
`);
  for await (const chunk of stream) {
    const text = typeof chunk.content === 'string' ? chunk.content : '';
    if (!text) continue;
    generation += text;
    process.stdout.write(text);
  }
  process.stdout.write('\n');
  return {
    question: state.question,
    k: state.k,
    strategy: state.strategy,
    routeReason: state.routeReason,
    documents: [],
    generation,
  };
};

// RAG 回答节点
const ragGenerateNode = async (state: IState) => {
  console.log('---RAG_GENERATE---');
  const context = state.documents
    .map(
      (item: any, i: number) => `[片段 ${i + 1}]
章节: 第 ${item.chapter_num} 章
内容: ${item.content}`
    )
    .join('\n\n━━━━━\n\n');
  process.stdout.write('\n【AI 回答（流式）】\n');
  let generation = '';
  const stream =
    await llm.stream(`你是一个专业的《天龙八部》小说助手。基于小说内容回答问题，用准确、详细的语言。

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

  return {
    question: state.question,
    k: state.k,
    strategy: state.strategy,
    routeReason: state.routeReason,
    documents: state.documents,
    generation,
  };
};

// 路由决策：根据策略决定下一步执行哪个节点
function decideNext(state: IState) {
  return state.strategy === 'simple' ? 'direct_answer' : 'retrieve';
}

const graph = new StateGraph(GraphState)
  .addNode('route_question', routeQuestionNode)
  .addNode('direct_answer', directAnswerNode)
  .addNode('retrieve', retrieveNode)
  .addNode('rag_generate', ragGenerateNode)
  .addEdge(START, 'route_question')
  .addConditionalEdges('route_question', decideNext, {
    direct_answer: 'direct_answer',
    retrieve: 'retrieve',
  })
  .addEdge('retrieve', 'rag_generate')
  .addEdge('direct_answer', END)
  .addEdge('rag_generate', END)
  .compile();

// 入口主函数
async function main() {
  // const question = '阿朱的结局是什么？';
  const question = '里脊肉如何做才好吃？';
  const kArg = 5;

  // 1. 导出为 Mermaid：可复制到 https://mermaid.live 或 Markdown 的 ```mermaid 代码块
  const drawable = await graph.getGraphAsync();
  const mermaid = drawable.drawMermaid({ withStyles: true });
  console.log(mermaid);

  // 2. 连接到已经存在的 Milvus 向量库集合
  console.log('连接到 Milvus...');
  vectorStore = await Milvus.fromExistingCollection(embeddings, {
    collectionName: COLLECTION_NAME,
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
  // 配置余弦相似度距离度量和检索参数
  vectorStore.indexSearchParams = { metric_type: 'COSINE', params: JSON.stringify({ ef: 64 }) };
  console.log('✓ 已连接\n');

  // 3. 加载向量集合进 Milvus 内存，保证可以检索
  try {
    await vectorStore.client.loadCollection({ collection_name: COLLECTION_NAME });
    console.log(`✓ 集合 ${COLLECTION_NAME} 已加载\n`);
  } catch (error) {
    if (!(error as any).message.includes('already loaded')) {
      throw error;
    }
    console.log(`✓ 集合 ${COLLECTION_NAME} 已处于加载状态\n`);
  }

  console.log('='.repeat(80));
  console.log(`问题: ${question}`);
  console.log('='.repeat(80));

  // 4. 执行工作流图：传入初始状态，并在节点间按序执行
  const result = await graph.invoke({
    question,
    k: Number.isFinite(kArg) ? kArg : TOP_K,
    strategy: '',
    routeReason: '',
    documents: [],
    generation: '',
  });

  // 5. 打印最终检索到的参考片段及相关元信息
  if (result.strategy === 'complex') {
    console.log('\n【检索相关内容】');
    if (result.documents.length === 0) {
      console.log('未找到相关内容');
      console.log('\n【AI 回答】');
      console.log('抱歉，我没有找到相关的《天龙八部》内容。');
      return;
    } else {
      result.documents.forEach((item: any, i: number) => {
        console.log(`\n[片段 ${i + 1}] 相似度: ${item.score.toFixed(4)}`);
        console.log(`书籍: ${item.book_id}`);
        console.log(`章节: 第 ${item.chapter_num} 章`);
        console.log(`片段索引: ${item.index}`);
        console.log(
          `内容: ${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}`
        );
      });
    }
  }

  console.log(`\n最终策略: ${result.strategy}`);

  // 6. 如果大语言模型生成结果为空则打印提示
  if (!result.generation?.trim()) {
    console.log('\n【AI 回答】');
    console.log('模型未返回内容。');
  }
}

main();
