import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import dotenv from 'dotenv';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import { Milvus } from '@langchain/community/vectorstores/milvus';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { Document } from '@langchain/core/documents';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const COLLECTION_NAME = 'rag_docs';

// 初始化 OpenAI embeddings 实例，用于将查询文本转化为高维向量
const embeddings = new OpenAIEmbeddings({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.EMBEDDINGS_MODEL_NAME ?? 'text-embedding-v3',
  configuration: { baseURL: envVars.QWEN_BASE_URL },
});

// 初始化大语言模型 (LLM)，采用 Qwen 模型，并设定 temperature 为 0 以获取最确定性的回答
const llm = new ChatOpenAI({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.QWEN_MODEL_NAME ?? 'qwen-plus',
  temperature: 0,
  configuration: { baseURL: envVars.QWEN_BASE_URL },
});

let vectorStore: Milvus | null = null;
let retriever: any = null;

/**
 * 获取并延迟初始化 Milvus 检索器 (Retriever)
 * @returns 返回配置好的向量检索器对象
 */
async function getRetriever() {
  if (!retriever) {
    // 从 Milvus 现有的集合中加载向量库
    vectorStore = await Milvus.fromExistingCollection(embeddings, {
      collectionName: COLLECTION_NAME ?? 'rag_docs',
      url: envVars.MILVUS_ADDRESS ?? 'http://localhost:19530',
    });
    // 设定检索器返回相关性最高的前 4 个文档块
    retriever = vectorStore.asRetriever({ k: 4 });
  }
  return retriever;
}

// 定义 RAG Agent 提示词模板，约束助手仅基于给定上下文作答，防止生成幻觉内容
const prompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    '你是客服助手。仅根据下面「上下文」回答；上下文没有的信息请明确说不知道，不要编造。\n\n上下文：\n{context}',
  ],
  ['human', '{question}'],
]);

// 构建底层的生成链 (RunnableSequence)：提示词 -> 大模型 -> 文本输出解析器
const chain = RunnableSequence.from([prompt, llm, new StringOutputParser()]);

// 定义 LangGraph 的状态结构，用于在节点之间传递和累积状态数据
const GraphState = Annotation.Root({
  question: Annotation<string>,    // 用户输入的提问
  context: Annotation<Document[]>,  // 检索出来的相关文档列表
  answer: Annotation<string>,       // 大模型生成并返回的回答
});

/**
 * RAG 工作流的检索节点 (Retrieve Node)
 * @param state 当前工作流状态
 * @returns 返回检索出来的文档，更新到 context 状态中
 */
async function retrieve(state: typeof GraphState.State) {
  const activeRetriever = await getRetriever();
  const docs = await activeRetriever.invoke(state.question);
  return { context: docs };
}

/**
 * RAG 工作流的生成节点 (Generate Node)
 * @param state 当前工作流状态
 * @returns 返回大模型生成的回答，更新到 answer 状态中
 */
async function generate(state: typeof GraphState.State) {
  // 将所有检索到的文档分块用换行符拼接，还原上下文语境
  const contextText = state.context.map((d) => d.pageContent).join('\n\n');
  const answer = await chain.invoke({
    context: contextText,
    question: state.question,
  });
  return { answer };
}

// 构建 LangGraph 状态图：添加检索和生成节点，并设定执行路径顺序
const workflow = new StateGraph(GraphState)
  .addNode('retrieve', retrieve)
  .addNode('generate', generate)
  .addEdge(START, 'retrieve')        // 从 START 开始路由到 retrieve
  .addEdge('retrieve', 'generate')   // retrieve 执行完后路由到 generate
  .addEdge('generate', END);         // generate 执行完后路由到 END 结束

// 编译工作流图，生成可运行的 RAG App
export const ragApp = workflow.compile();

/**
 * 对外开放的 RAG 问答函数
 * @param question 用户的提问文本
 * @returns 返回包含最终回答(answer)和检索依据文档(context)的对象
 */
export async function ask(question: string) {
  const result = await ragApp.invoke({ question });
  return {
    answer: result.answer,
    context: result.context ?? [],
  };
}

// 如果此文件被直接运行（而非作为模块导入），则执行一个简单的测试用例
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('--- 开始测试 RAG Agent ---');
  try {
    const response = await ask('什么是 Milvus？');
    console.log('Q: 什么是 Milvus？');
    console.log('A:', response.answer);
  } catch (error) {
    console.error('运行测试时发生错误：', error);
  }
}
