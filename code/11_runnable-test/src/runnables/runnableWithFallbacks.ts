import { RunnableLambda } from '@langchain/core/runnables';

// 模拟三个 “翻译服务”，优先级从高到低

const premiumTranslator = RunnableLambda.from<string, string>(async (text: string) => {
  console.log('[Premium] 尝试翻译...');
  // 模拟高级服务不可用
  throw new Error('Premium 服务超时');
});

const standardTranslator = RunnableLambda.from<string, string>(async (text: string) => {
  console.log('[Standard] 尝试翻译...');
  // 模拟标准服务也挂了
  throw new Error('Standard 服务限流');
});

const loaclTranslator = RunnableLambda.from<string, string>(async (text: string) => {
  console.log('[Local] 使用本地词典翻译...');
  const dict = { hello: '你好', world: '世界', goodbye: '再见' };
  const words = text.toLocaleLowerCase().split(' ');

  return words.map((w) => dict[w] ?? w).join('');
});

// withFallbacks：依次尝试 premium -> standard -> local
const translator = premiumTranslator.withFallbacks({
  fallbacks: [standardTranslator, loaclTranslator],
});

const result = await translator.invoke('hello world goodbye');
console.log('翻译结果:', result);
