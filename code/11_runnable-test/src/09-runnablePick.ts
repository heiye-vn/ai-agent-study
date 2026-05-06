import { RunnablePick, RunnableSequence } from '@langchain/core/runnables';

const inputData = {
  name: '王麻子',
  age: 30,
  city: '王家村',
  country: '赵国',
  email: 'wangmazi@example.com',
  phone: '+86-13800138000',
};

const chain = RunnableSequence.from([
  (input: any) => ({
    ...input,
    fullInfo: `${input.name}, ${input.age}岁，来自${input.city}`,
  }),
  new RunnablePick(['name', 'fullInfo']),
]);

const result = await chain.invoke(inputData);
console.log(result);
