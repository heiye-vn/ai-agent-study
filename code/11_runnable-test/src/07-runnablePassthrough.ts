import {
  RunnablePassthrough,
  RunnableLambda,
  RunnableSequence,
  RunnableMap,
} from '@langchain/core/runnables';

const chain = RunnableSequence.from([
  RunnableLambda.from((input: any) => ({ concept: input })),
  RunnableMap.from({
    original: new RunnablePassthrough(),
    processed: RunnableLambda.from((obj: any) => ({
      concept: input,
      upper: obj.concept.toUpperCase(),
      length: obj.concept.length,
    })),
  }),
]);

const input = 'Hello World';
const result = await chain.invoke(input);
console.log(result);
