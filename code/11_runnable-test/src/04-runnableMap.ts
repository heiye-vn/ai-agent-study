import { RunnableMap, RunnableLambda } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';

const addOne = RunnableLambda.from((input: any) => input.num + 1);
const multiplyTwo = RunnableLambda.from((input: any) => input.num * 2);
const square = RunnableLambda.from((input: any) => input.num ** 2);

const greetTemplate = PromptTemplate.fromTemplate('你好，{name}！');
const weatherTemplate = PromptTemplate.fromTemplate('今天天气{weather}。');

// 创建 RunnableMap，并执行多个 runnables
const runnableMap = RunnableMap.from({
  // 数学运算
  add: addOne,
  multipy: multiplyTwo,
  square: square,

  // prompt 格式化
  greeting: greetTemplate,
  weather: weatherTemplate,
});

// test
const input = {
  name: '王麻子',
  weather: '晴天',
  num: 5,
};

// 执行 RunnableMap
const result = await runnableMap.invoke(input);
console.log(result);
