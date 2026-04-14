import 'cheerio';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const cheerioLoader = new CheerioWebBaseLoader(
  // "https://juejin.cn/post/7233327509919547452",
  'https://juejin.cn/post/7208036915015467066',
  {
    selector: '.main-area p',
  }
);

const documents = await cheerioLoader.load();

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 400, // 每个分开的字符数
  chunkOverlap: 20, // 分块之间的重叠字符数
  separators: ['。', '！', '？'], // 分割符，优先使用段落分割
});

const splitDocuments = await textSplitter.splitDocuments(documents);

// console.log(documents);
console.log(splitDocuments);
