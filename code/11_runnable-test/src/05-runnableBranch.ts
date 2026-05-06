import { RunnableBranch, RunnableLambda } from '@langchain/core/runnables';

// 创建条件判断函数
const isPositive = RunnableLambda.from((input: number) => input > 0);
const isNegative = RunnableLambda.from((input: number) => input < 0);
const isEven = RunnableLambda.from((input: number) => input % 2 === 0);

// 创建分支处理函数
const handlePositive = RunnableLambda.from(
  (input: number) => `正数：${input} + 10 = ${input + 10}`
);
const handleNegative = RunnableLambda.from(
  (input: number) => `负数：${input} - 10 = ${input - 10}`
);
const handleEven = RunnableLambda.from((input: number) => `偶数：${input} * 2 = ${input * 2}`);
const handleDefault = RunnableLambda.from((input: number) => `默认：${input}`);

// 创建 RunnableBranch 实现条件分支处理
const branch = RunnableBranch.from([
  [isPositive, handlePositive],
  [isNegative, handleNegative],
  [isEven, handleEven],
  handleDefault,
]);

// 测试不同输入
const testCases = [5, -3, 4, 0];

for (const testCase of testCases) {
  const result = await branch.invoke(testCase);
  console.log(`输入：${testCase} => 输出：${result}`);
}

/*
    RunnableBranch：实现条件分支处理，类似编程中的 if-else if-else 结构。

    .from([]) 方法创建 RunnableBranch 实例，并传入条件判断函数和分支处理函数的数组。

    返回一个 Runnable 对象，调用 invoke 方法传入输入参数，返回处理结果。

    关键特点：

        1. 短路执行：一旦某个条件匹配成功，就会立即执行对应的处理函数，不再检查后续条件

        2. 顺序敏感：条件的排列顺序很重要，前面的条件优先级更高

        3. 必须有默认分支：最后一个元素是兜底的处理函数，确保所有输入都有对应的输出
*/
