import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

interface IState {
  text: string;
}

// 状态定义，使用 LangGraph 定义一个状态注解，用于管理图执行过程中的状态
const StateAnnotation = Annotation.Root({
  text: Annotation({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
});

const step1 = (state: IState) => ({ text: `${state.text} -> step1` });
const step2 = (state: IState) => ({ text: `${state.text} -> step2` });

const graph = new StateGraph(StateAnnotation)
  .addNode('step1', step1)
  .addNode('step2', step2)
  .addEdge(START, 'step1')
  .addEdge('step1', 'step2')
  .addEdge('step2', END)
  .compile();

// 导出为 Mermaid：可赋值到 https://mermaid.live 或 Markdown 的 ```mermaid 代码块中预览
const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({ withStyles: true });
console.log(mermaid);

const result = await graph.invoke({ text: 'hello' });
console.log('resule: ', result);
