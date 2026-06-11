import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Neo4jGraph } from '@langchain/community/graphs/neo4j_graph';
import { ChatOpenAI } from '@langchain/openai';
import { StateGraph, END, START } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

// 连接 Neo4j 图数据库
const neo4jGraph = new Neo4jGraph({
  url: 'bolt://localhost:7687',
  username: 'neo4j',
  password: '12345678',
});

// llm
const llm = new ChatOpenAI({
  model: envVars.QWEN_MODEL_NAME,
  temperature: 0,
  configuration: {
    baseURL: envVars.QWEN_BASE_URL,
  },
});

// 定义状态
const state = {
  messages: {
    value: (left: any, right: any) => left.concat(Array.isArray(right) ? right : [right]),
    default: () => [],
  },
  query: null,
  cypher: null,
  context: null,
  answer: null,
};

// 步骤1：解析问题
async function parseQuestion(state: any) {
  const lastMessage = state.messages[state.messages.length - 1];
  return { query: lastMessage.content };
}

// 步骤2：生成 Cypher
async function generateCypher(state: any) {
  const prompt = `
    你是一个专业的 Neo4j Cypher 生成器。
    严格按照下面的结构生成正确语句，只返回纯 Cypher 代码，不要任何解释、不要标点、不要 markdown。

    节点：
    - Product: 奶茶产品
    - Ingredient: 配料
    - Type: 奶茶类型
    - Method: 制作工艺
    - People: 适合人群

    关系方向（必须严格遵守）：
    - (Product)-[:属于]->(Type)
    - (Product)-[:包含]->(Ingredient)
    - (Product)-[:适合]->(People)
    - (Ingredient)-[:使用]->(Method)

    规则：
    - 关系方向绝对不能反
    - 多跳查询请使用多个 MATCH，不要连错路径
    - 只返回最终可运行的 Cypher 语句

    用户问题：${state.query}`;

  const res = await llm.invoke([new HumanMessage(prompt)]);
  return { cypher: res.content };
}

// 步骤3： 执行图查询
async function executeGraphQuery(state: any) {
  try {
    const res = await neo4jGraph.query(state.cypher);
    return { context: JSON.stringify(res) };
  } catch (error) {
    return { context: '未查询到相关知识' };
  }
}

// 步骤4：生成答案
async function generateAnswer(state: any) {
  const prompt = `
    你是奶茶专家，根据下方「检索结果」回答用户问题；检索结果为空或不足时简要说明无法从图谱得到答案，不要编造。
    回答要求：
    - 直接列出事实，不要推断图谱里未出现的配料（如水、冰、添加剂等）。

    检索结果：${state.context}
    用户问题：${state.query}`;

  const res = await llm.invoke([new HumanMessage(prompt)]);
  return { answer: res.content };
}

// 构建 LangGrapg 工作流
const workflow = new StateGraph({ channels: state })
  .addNode('parse', parseQuestion)
  .addNode('generate_cypher', generateCypher)
  .addNode('execute_graph_query', executeGraphQuery)
  .addNode('generate_answer', generateAnswer)
  .addEdge(START, 'parse')
  .addEdge('parse', 'generate_cypher')
  .addEdge('generate_cypher', 'execute_graph_query')
  .addEdge('execute_graph_query', 'generate_answer')
  .addEdge('generate_answer', END);

const app = workflow.compile();

async function printWorkflowMermaid() {
  const drawable = await app.getGraphAsync();
  const mermaid = drawable.drawMermaid({ withStyles: true });
  console.log('--- LangGrapg 工作流（Mermaid）---');
  console.log(mermaid);
  console.log('------------------------------------------------');
}

// 运行 GraphRAG
async function runGraphRAG(question: string) {
  const res = await app.invoke({
    messages: [new HumanMessage(question)],
  });

  console.log('======================================');
  console.log('用户问题：', question);
  console.log('生成 Cypher：', res.cypher);
  console.log('检索结果：', res.context);
  console.log('最终回答：', res.answer);
  console.log('======================================');
}

// 测试
(async () => {
  await printWorkflowMermaid();
  await Promise.all([
    runGraphRAG('我们这款珍珠奶茶有哪些配料？'),
    runGraphRAG('台式奶茶的饮品都有哪些配料？'),
    runGraphRAG('珍珠奶茶适合哪些人群饮用？'),
  ]);
})().catch(console.error);
