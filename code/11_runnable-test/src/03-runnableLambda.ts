import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';

const addOne = RunnableLambda.from((input: string | number) => {
  console.log(`输入：${input}`);
  return Number(input) + 1;
});

const multiplyTwo = RunnableLambda.from((input: string | number) => {
  console.log(`输入：${input}`);
  return Number(input) * 2;
});

const chain = RunnableSequence.from([addOne, multiplyTwo, addOne]);

const result = await chain.invoke(5);
console.log(result);
