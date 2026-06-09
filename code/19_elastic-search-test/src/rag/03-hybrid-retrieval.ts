/**
 * 基于 LangGraph 的多路混合检索与重排 RAG 系统 (03-hybrid-retrieval.ts)
 *
 * 核心架构流程 (Mermaid 拓扑结构)：
 * START ──> query_augment (LLM 查询扩写)
 *              │
 *              ├─┐
 *              │ └──> es_recall (Elasticsearch 关键词召回) ──┐
 *              │                                            ├─> merge (结果合并与去重) ──> rerank (重排模型过滤) ──> generate_answer (大模型生成回答) ──> END
 *              └────> milvus_recall (Milvus 向量语义检索) ───┘
 */

import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';
import { Document } from '@langchain/core/documents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Milvus } from '@langchain/community/vectorstores/milvus';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { DashScopeRerank } from '../rerank/01-dashscope-rerank';
import { augmentQuery, retrievalQueryStrings } from './02-query-augment';

const INDEX = 'life_notes';

// 1. 定义 LangGraph 拓扑状态图在生命周期中共享的状态对象 Schema
const HybridRetrievalState = Annotation.Root({
  query: Annotation<string>(), // 用户输入的原始提问
  queryAugmentation: Annotation<any>(), // LLM 扩写后的 3 条问句
  esHits: Annotation<any[]>(), // Elasticsearch 关键词检索到的原始候选文档
  milvusHits: Annotation<any[]>(), // Milvus 向量相似度检索到的原始候选文档
  merged: Annotation<any[]>(), // 双路合并去重后的候选文档集
  topDocuments: Annotation<any[]>(), // 经过 Reranker 重排打分后提取的 Top N 文档
  answer: Annotation<string>(), // 大语言模型基于 context 整理生成的最终答复
});

/**
 * 辅助函数：将 ES 返回的 Hit 结构转换为 LangChain 标准的 Document 格式
 */
function docFromEsHit(hit: any) {
  const s = hit._source ?? {};
  // 拼接标题和内容作为主要的检索文本块
  const text = [s.note_title ?? s.title, s.note_body ?? s.content].filter(Boolean).join('\n');
  return new Document({
    pageContent: text,
    metadata: { id: hit._id, source: 'es', ...s },
  });
}

/**
 * 融合 ES 和 Milvus 的结果，并以 metadata.id 进行去重，保留首次出现的顺序
 */
function merge(esDocs: any[], milvusDocs: any[]) {
  const combined = [...(esDocs ?? []), ...(milvusDocs ?? [])].filter((d) => d?.pageContent);
  return dedupeDocsById(combined);
}

/**
 * 去重辅助函数：只根据文档的唯一标识 (metadata.id) 滤除重复的候选文档
 */
function dedupeDocsById(docs: any[]) {
  const seen = new Set();
  const out: any[] = [];
  for (const d of docs ?? []) {
    if (!d?.pageContent) continue;
    const id = d.metadata?.id != null ? String(d.metadata.id).trim() : '';
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(d);
  }
  return out;
}

/**
 * 调试辅助函数：格式化打印候选文档集
 */
function printDocs(label: string, docs: any[]) {
  console.log(`\n=== ${label} (${docs?.length ?? 0} 条) ===`);
  for (let i = 0; i < (docs ?? []).length; i++) {
    const d = docs[i];
    const preview = (d.pageContent ?? '').slice(0, 200).replace(/\n/g, ' ');
    console.log(`[${i}] ${preview}${d.pageContent?.length > 200 ? '…' : ''}`);
    console.log(`    metadata:`, d.metadata ?? {});
  }
}

/**
 * 调试辅助函数：打印查询改写生成的结果
 */
function printQueryRewrite(original: string, augmentation: any) {
  const qs = augmentation?.queries ?? [];
  const forRetrieval = retrievalQueryStrings(original, augmentation);

  console.log(`\n--- 查询扩展（LLM 生成 ${qs.length} 条检索问句）---`);
  console.log('原始 query:', original ?? '');
  for (let i = 0; i < qs.length; i++) console.log(`  [${i + 1}] ${qs[i] ?? ''}`);
  console.log(`\n逐条 ES + Milvus（共 ${forRetrieval.length} 条检索串，含原始问题）:`);
  for (let i = 0; i < forRetrieval.length; i++) {
    console.log(`  [${i + 1}] ${forRetrieval[i] ?? ''}`);
  }
}

/**
 * 将多样的消息内容归一化为纯文本字符串
 */
function stringifyMessageContent(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');
  return content
    .map((c) => (typeof c === 'string' ? c : typeof c?.text === 'string' ? c.text : ''))
    .join('');
}

/**
 * 将召回的文档格式化为大模型的上下文提示词（context）
 */
function formatDocsAsContext(docs: any[]) {
  return (docs ?? [])
    .map((d: any, i: number) => {
      const meta = d.metadata ?? {};
      const src = meta.source ?? '';
      const id = meta.id != null ? String(meta.id) : '';
      const head = id ? `[${i + 1}] id=${id}${src ? ` source=${src}` : ''}` : `[${i + 1}]`;
      return `${head}\n${d.pageContent ?? ''}`;
    })
    .join('\n\n---\n\n');
}

// 包含知识库上下文的最终提问 Prompt 模板
const ANSWER_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `你是阅读用户「生活笔记」知识库并作答的助手。
规则：
- 只根据下方「检索片段」推断答案；片段里没有的信息不要编造。
- 若片段不足以回答，明确说明「笔记里未提到」，并可给出一句保守建议。
- 回答简洁有条理，可使用简短列表；口吻自然中文。`,
  ],
  [
    'human',
    `用户问题：{query}
 
检索片段：
{context}`,
  ],
]);

// 未检索到任何知识库文档时的保底 Prompt 模板
const NO_CONTEXT_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `你是阅读用户「生活笔记」知识库并作答的助手。当前没有检索到任何片段。
请用一两句话说明无法从笔记中回答，并礼貌询问用户是否换个说法或补充关键词。`,
  ],
  ['human', '用户问题：{query}'],
]);

/**
 * 构造并编译 LangGraph 混合检索工作流状态图
 *
 * @param esClient Elasticsearch 客户端
 * @param milvus Milvus LangChain 封装实例
 * @param reranker 阿里百炼 Rerank 服务实例
 * @param chatModel 大语言对话模型
 */
export function compileHybridRetrievalGraph(
  esClient: any,
  milvus: any,
  reranker: any,
  chatModel: any
) {
  const ES_K = 15; // ES 总召回数量上限
  const MILVUS_K = 15; // Milvus 总召回数量上限

  return (
    new StateGraph(HybridRetrievalState)
      // Node 1: 查询扩写节点。调用 LLM 将原始问句扩写出另外 3 条多角度检索句子。
      .addNode('query_augment', async (state: any) => ({
        queryAugmentation: await augmentQuery(chatModel, state.query ?? ''),
      }))
      // Node 2: ES 召回节点。将 4 条检索句（包含原始问题）分发，并行执行 MultiMatch 查询，合并去重。
      .addNode('es_recall', async (state: any) => {
        const qs = retrievalQueryStrings(state.query, state.queryAugmentation);
        const n = Math.max(1, qs.length);
        const kEach = Math.max(2, Math.ceil(ES_K / n)); // 动态划分每条扩写检索句分摊的召回数
        const batches = await Promise.all(
          qs.map((q) =>
            esClient.search({
              index: INDEX,
              size: kEach,
              query: {
                multi_match: {
                  query: q,
                  fields: ['note_title^2', 'note_body', 'title', 'content'], // 标题赋予 2 倍检索权重
                  type: 'best_fields',
                  analyzer: 'ik_smart', // 使用粗粒度的 IK 分词进行搜索匹配
                },
              },
            })
          )
        );
        const flat = batches.flatMap((res: any) => (res.hits?.hits ?? []).map(docFromEsHit));
        return { esHits: dedupeDocsById(flat) };
      })
      // Node 3: Milvus 召回节点。将 4 条检索句并行进行向量相似度搜索，合并去重。
      .addNode('milvus_recall', async (state: any) => {
        const qs = retrievalQueryStrings(state.query, state.queryAugmentation);
        const n = Math.max(1, qs.length);
        const kEach = Math.max(2, Math.ceil(MILVUS_K / n));
        const batches = await Promise.all(qs.map((q) => milvus.similaritySearch(q, kEach)));
        const flat = batches.flat();
        return { milvusHits: dedupeDocsById(flat) };
      })
      // Node 4: 合并节点。将 ES (关键字) 和 Milvus (向量语义) 召回的文档集合并并进行唯一性去重。
      .addNode('merge', async (state: any) => ({
        merged: merge(state.esHits, state.milvusHits),
      }))
      // Node 5: 重排节点。利用 DashScopeRerank 重排模型对合并后的候选文档进行精打分重排，筛选出最具关联度的 Top 3 文档。
      .addNode('rerank', async (state: any) => {
        const merged = state.merged ?? [];
        if (!merged.length) return { topDocuments: [] };
        const topDocuments = await reranker.compressDocuments(merged, state.query);
        return { topDocuments };
      })
      // Node 6: 回答生成节点。组装上下文并通过 LLM 生成最终答案。
      .addNode('generate_answer', async (state: any) => {
        const query = state.query ?? '';
        const docs = state.topDocuments ?? [];
        if (!docs.length) {
          const chain = NO_CONTEXT_PROMPT.pipe(chatModel);
          const msg: any = await chain.invoke({ query });
          return { answer: stringifyMessageContent(msg.content).trim() };
        }
        const chain = ANSWER_PROMPT.pipe(chatModel);
        const msg: any = await chain.invoke({
          query,
          context: formatDocsAsContext(docs),
        });
        return { answer: stringifyMessageContent(msg.content).trim() };
      })
      // 编排工作流的有向无环图（DAG）拓扑结构与并行分发收拢路径
      .addEdge(START, 'query_augment')
      .addEdge('query_augment', 'es_recall') // query_augment 执行完后，分发执行 es_recall
      .addEdge('query_augment', 'milvus_recall') // 同时分发执行 milvus_recall
      .addEdge(['es_recall', 'milvus_recall'], 'merge') // 等待两路召回皆执行完毕后，收拢合并到 merge 节点
      .addEdge('merge', 'rerank')
      .addEdge('rerank', 'generate_answer')
      .addEdge('generate_answer', END)
      .compile()
  );
}

// 全局客户端与向量组件初始化
const esClient = new Client({ node: 'http://localhost:9200' });
const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBEDDINGS_MODEL_NAME ?? 'text-embedding-v4',
  apiKey: process.env.QWEN_API_KEY,
  configuration: {
    baseURL: process.env.QWEN_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
});

// 测试样本问题：用以演示混合检索对错字、俗语、多维度语义关联的检索能力
const SAMPLE_QUERIES = [
  // '家里无线老是断断续续的咋整啊',
  // '明火炖太久汤汁又黏又涩，起锅前要怎么处理才不腻',
  // 'P0-20250409-K9 滤芯订单',
  'iPhone 手机 和 Android 手机的区别'
];

/**
 * 混合 RAG 主运行程序
 */
async function main() {
  const milvusAddress = process.env.MILVUS_ADDRESS ?? 'localhost:19530';
  const milvusUrl = milvusAddress.startsWith('http') ? milvusAddress : `http://${milvusAddress}`;

  const milvus = await Milvus.fromExistingCollection(embeddings, {
    url: milvusUrl,
    collectionName: INDEX,
    textField: 'doc_text',
    vectorField: 'embedding',
  });

  // 2. 初始化重排模型服务类
  const reranker = new DashScopeRerank({
    apiKey: process.env.QWEN_API_KEY,
    model: process.env.QWEN_RERANK_MODEL_NAME ?? 'gte-rerank',
    topN: 3,
    baseUrl:
      process.env.QWEN_RERANK_URL ??
      'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank',
  });

  // 3. 初始化 LLM
  const chatModel = new ChatOpenAI({
    model: process.env.QWEN_MODEL_NAME,
    apiKey: process.env.QWEN_API_KEY,
    temperature: 0.2,
    configuration: {
      baseURL: process.env.QWEN_BASE_URL,
    },
  });

  // 4. 构建并编译 RAG 状态工作流图
  const graph = compileHybridRetrievalGraph(esClient, milvus, reranker, chatModel);

  // 5. 打印工作流的 Mermaid 结构图以进行可视化
  const drawable = await graph.getGraphAsync();
  console.log(drawable.drawMermaid());
  console.log();

  // 6. 遍历测试问题，执行端到端混合检索与大模型作答
  for (const query of SAMPLE_QUERIES) {
    console.log(`query: ${query}`);

    const state = await graph.invoke({ query });

    // 格式化打印整个工作流中的中间状态与结果数据
    printQueryRewrite(state.query, state.queryAugmentation);
    console.log('\n（原始 JSON）', JSON.stringify(state.queryAugmentation));

    printDocs('Elasticsearch 检索', state.esHits);
    printDocs('Milvus 检索', state.milvusHits);
    printDocs('重排后保留', state.topDocuments ?? []);

    console.log('\n=== 大模型生成回答 ===\n');
    console.log(state.answer ?? '');
  }
}

main().catch((err) => {
  console.error(err);
});
