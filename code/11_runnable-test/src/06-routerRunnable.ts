import { RouterRunnable, RunnableLambda } from '@langchain/core/runnables';

// 创建两个简单的 RunnableLambda
const toUpperCase = RunnableLambda.from((text: string) => text.toUpperCase());
const reverseText = RunnableLambda.from((text: string) => text.split('').reverse().join(''));

// 创建 RouterRunnable，根据 key 选择要调用的 runnable
const router = new RouterRunnable({
  runnables: {
    toUpperCase,
    reverseText,
  },
});

// test
const result1 = await router.invoke({ key: 'reverseText', input: 'Hello World' });
console.log(`reverseText 结果：${result1}`);

const result2 = await router.invoke({ key: 'toUpperCase', input: 'Hello World' });
console.log(`toUpperCase 结果：${result2}`);
