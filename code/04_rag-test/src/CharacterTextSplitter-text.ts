import 'cheerio';
import { CharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { getEncoding } from 'js-tiktoken';
const logDocument = new Document({
  pageContent: `[2024-01-15 10:00:00] INFO: Application started
[2024-01-15 10:00:05] DEBUG: Loading configuration file
[2024-01-15 10:00:10] INFO: Database connection established
[2024-01-15 10:00:15] WARNING: Rate limit approaching
[2024-01-15 10:00:20] ERROR: Failed to process request
[2024-01-15 10:00:25] INFO: Retrying operation
[2024-01-15 10:00:30] SUCCESS: Operation completed`,
});

// 虽然设置的 chunkSize，但是 splitter 会优先保证语义完整，所以会存在 chunk 的大小没到 200 的情况
const logTextSplitter = new CharacterTextSplitter({
  separator: '\n',
  chunkSize: 200,
  chunkOverlap: 20,
});

const splitDocuments = await logTextSplitter.splitDocuments([logDocument]);

// console.log(splitDocuments);

const enc = getEncoding('cl100k_base');
splitDocuments.forEach((document) => {
  console.log(document);
  console.log('charater length:', document.pageContent.length);
  console.log('token length:', enc.encode(document.pageContent).length);
});
