import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

interface IState {
  query: string;
  route: string;
  answer: string;
}

const StateAnnotation = Annotation.Root({
  query: Annotation({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  route: Annotation({
    reducer: (_prev, next) => next,
    default: () => 'chat',
  }),
  answer: Annotation({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
});

const router = (state: IState) => {
  const isMath = /[+\-*/]/.test(state.query);
  return { route: isMath ? 'math' : 'chat' };
};

const mathNode = (state: IState) => {
  try {
    return { answer: String(eval(state.query)) };
  } catch (error) {
    return { answer: '表达式无法计算' };
  }
};

const chatNode = (state: IState) => ({ answer: `你说的是：${state.query}` });

const graph = new StateGraph(StateAnnotation)
  .addNode('router', router)
  .addNode('math', mathNode)
  .addNode('chat', chatNode)
  .addEdge(START, 'router')
  // 使用 addConditionalEdges 添加分支
  .addConditionalEdges('router', (state: IState) => state.route, {
    math: 'math',
    chat: 'chat',
  })
  .addEdge('math', END)
  .addEdge('chat', END)
  .compile();

const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({ withStyles: true });
console.log(mermaid);

console.log('result: ', await graph.invoke({ query: '你好' }));

console.log('result: ', await graph.invoke({ query: '10 + 888' }));
