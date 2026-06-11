import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import dotenv from 'dotenv';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import { Milvus } from '@langchain/community/vectorstores/milvus';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const COLLECTION_NAME = 'rag_docs';

const embeddings = new OpenAIEmbeddings({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.EMBEDDINGS_MODEL_NAME ?? 'text-embedding-v3',
  configuration: { baseURL: envVars.QWEN_BASE_URL },
});

const llm = new ChatOpenAI({
  apiKey: envVars.QWEN_API_KEY,
  model: envVars.QWEN_MODEL_NAME ?? 'qwen-plus',
  temperature: 0,
  configuration: { baseURL: envVars.QWEN_BASE_URL },
});

const vectorStore = await Milvus.fromExistingCollection(embeddings, {
  collectionName: COLLECTION_NAME ?? 'rag_docs',
  url: envVars.MILVUS_ADDRESS ?? 'http://localhost:19530',
});

const retriever = vectorStore.asRetriever({ k: 4 });

const prompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    '你是客服助手。仅根据下面「上下文」回答；上下文没有的信息请明确说不知道，不要编造。\n\n上下文：\n{context}',
  ],
  ['human', '{question}'],
]);

const chain = RunnableSequence.from([prompt, llm, new StringOutputParser()]);

const GraphState = Annotation.Root({
  question: Annotation({
    reducer: (prev: string, add: string) => add,
    default: () => '',
  }),
  context: Annotation({
    reducer: (prev: Document[], add: Document[]) => add,
    default: () => [],
  }),
  answer: Annotation({
    reducer: (prev: string, add: string) => add,
    default: () => '',
  }),
});

async function retrieve(state: typeof GraphState.State) {
  const docs = await retriever.invoke(state.question);
  return { context: docs };
}

async function generate(state: typeof GraphState.State) {
  const contextText = state.context.map((d) => d.pageContent.join('\n\n'));
  const answer = await chain.invoke({
    context: contextText,
    question: state.question,
  });
  return { answer };
}

const workflow = new StateGraph(GraphState)
  .addNode('retrieve', retrieve)
  .addNode('generate', generate)
  .addEdge(START, 'retrieve')
  .addEdge('retrieve', 'generate')
  .addEdge('generate', END);

export const ragApp = workflow.compile();

export async function ask(question: string) {
  const result = await ragApp.invoke({ question });
  return {
    answer: result.answer,
    context: result.context ?? [],
  };
}
