import { getEncodingNameForModel, getEncoding } from 'js-tiktoken';

const modelName = 'gpt-4';
// 获取模型对应的编码名称，比如 'cl100k_base'
const encodingName = getEncodingNameForModel(modelName);
console.log(encodingName);

// 初始化解码器/分词器
const enc = getEncoding('cl100k_base');

console.log('apple', enc.encode('apple'), enc.encode('apple').length);
console.log('pineapple', enc.encode('pineapple'), enc.encode('pineapple').length);
console.log('苹果', enc.encode('苹果'), enc.encode('苹果').length);
console.log('吃饭', enc.encode('吃饭'), enc.encode('吃饭').length);
console.log('一二三', enc.encode('一二三'), enc.encode('一二三').length);
console.log('👍', enc.encode('👍'), enc.encode('👍').length);
/*
    Tiktoken（分词器）

    用于计算为本的 token 数量
*/
