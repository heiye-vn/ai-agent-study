import { BaseDocumentCompressor } from '@langchain/core/retrievers/document_compressors';
import { Document } from '@langchain/core/documents';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export interface DashScopeRerankParams {
  apiKey?: string;
  model?: string;
  topN?: number;
  baseUrl?: string;
}

export class DashScopeRerank extends BaseDocumentCompressor {
  apiKey?: string;
  model: string;
  topN: number;
  baseUrl: string;

  constructor(fields?: DashScopeRerankParams) {
    super();
    this.apiKey = fields?.apiKey ?? process.env.QWEN_API_KEY;
    this.model = fields?.model ?? process.env.QWEN_RERANK_MODEL_NAME ?? 'gte-rerank';
    this.topN = fields?.topN ?? 3;
    this.baseUrl =
      fields?.baseUrl ??
      process.env.QWEN_RERANK_URL ??
      'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank';
  }

  async compressDocuments(
    documents: Document[],
    query: string,
    _callbacks?: any
  ): Promise<Document[]> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: {
          query,
          documents: documents.map((d) => d.pageContent),
        },
        parameters: {
          return_documents: false,
          top_n: this.topN,
        },
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(`DashScope rerank ${res.status}: ${JSON.stringify(json)}`);
    }

    const results = json?.output?.results;
    if (!Array.isArray(results)) {
      throw new Error(`unexpected rerank response: ${JSON.stringify(json)}`);
    }

    return results.map((r: { index: number }) => documents[r.index]);
  }
}
