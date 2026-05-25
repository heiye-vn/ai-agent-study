import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

interface IState {
  tries: number;
  ok: boolean;
  message: string;
}

const StateAnnotation = Annotation.Root({
  tries: Annotation({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  ok: Annotation({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  message: Annotation({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
});

const attempt = (state: IState) => {
  //   console.log(state, '---打印的state');

  const tries = state.tries + 1;
  const ok = tries >= 3;
  return {
    tries,
    ok,
    message: ok ? `第 ${tries} 次成功` : `第 ${tries} 次失败，继续重试`,
  };
};

const graph = new StateGraph(StateAnnotation)
  .addNode('attempt', attempt)
  .addEdge(START, 'attempt')
  .addConditionalEdges('attempt', (state: IState) => (state.ok ? 'done' : 'retry'), {
    retry: 'attempt',
    done: END,
  })
  .compile();

const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({ withStyles: true });
console.log(mermaid);

const result = await graph.invoke({ tries: 0 });
console.log('result: ', result);
