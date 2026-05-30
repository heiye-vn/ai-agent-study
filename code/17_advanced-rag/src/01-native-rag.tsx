/* 基于 LangGraph 和 Milvus 向量数据库 的原生 RAG (检索增强生成) 工作流系统 */

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Milvus } from '@langchain/community/vectorstores/milvus';

// 配置环境变量路径并加载 .env 配置文件
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

// 定义默认向量数据库集合名称以及检索时的 Top K 相似片段数量
const COLLECTION_NAME = 'ebook_collection';
const TOP_K = 5;

// 初始化大语言模型客户端 (用于最终的 RAG 问题生成与流式回答)
const model = new ChatOpenAI({
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
});

// 定义工作流图的状态类型接口
interface IState {
  question: string; // 用户输入的查询问题
  k: number; // 检索返回的最大文档片段数
  documents: any[]; // 检索出的相关文档片段数组
  generation: string; // 大模型最终生成的回答文本
}

// 使用 LangGraph 定义状态注解树，用以管理和持久化工作流中在各个节点之间流转的状态数据
const GraphState = Annotation.Root({
  question: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  k: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => TOP_K,
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

// 创建检索节点：执行检索并将相关文档片段存入工作流状态中
const retrieveNode = async (state: IState) => {
  const documents = await retrieveRelevantContent(state.question, state.k);
  return {
    question: state.question,
    k: state.k,
    documents,
  };
};

// 创建生成节点：根据检索出的片段上下文，调用大语言模型进行问答，并流式输出回答内容
const generateNode = async (state: IState) => {
  // 拼接检索出来的文档上下文作为提示词 (Prompt) 里的背景信息
  const context = state.documents
    .map(
      (item: any, i: number) => `[片段 ${i + 1}]
章节: 第 ${item.chapter_num} 章
内容: ${item.content}`
    )
    .join('\n\n————\n\n');

  const prompt = `你是一个专业的《天龙八部》小说助手。基于小说内容回答问题，用准确、详细的语言。

请根据以下《天龙八部》小说片段内容回答问题：
${context}

用户问题: ${state.question}

回答要求：
1. 如果片段中有相关信息，请结合小说内容给出详细、准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
4. 回答要准确，符合小说的情节和人物设定
5. 可以引用原文内容来支持你的回答

AI 助手的回答:`;

  process.stdout.write('\n【AI 回答（流式）】\n');
  let generation = '';
  // 异步流式调用模型，获得更好的用户交互体验
  const stream = await model.stream(prompt);
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
    documents: state.documents,
    generation,
  };
};

// 定义并构建状态图工作流
// 从 START 开始 -> 先执行检索 retrieve 节点 -> 再执行生成 generate 节点 -> 最终到达 END 结束
const graph = new StateGraph(GraphState)
  .addNode('retrieve', retrieveNode)
  .addNode('generate', generateNode)
  .addEdge(START, 'retrieve')
  .addEdge('retrieve', 'generate')
  .addEdge('generate', END)
  .compile();

// 入口主函数
async function main() {
  const question = '阿朱的结局是什么？';
  const kArg = 5;

  // 1. 导出并打印工作流图的 Mermaid 表示形式（可复制到 mermaid.live 等地方可视化预览图结构）
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
    documents: [],
    generation: '',
  });

  // 5. 打印最终检索到的参考片段及相关元信息
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

  // 6. 如果大语言模型生成结果为空则打印提示
  if (!result.generation) {
    console.log('\n【AI 回答】');
    console.log('模型未返回内容。');
  }
}

main();
