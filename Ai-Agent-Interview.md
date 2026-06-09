## Q1：RAG 中如何处理 PDF 文件？

我之前遇到一个Ai Agent岗位的面试题，大致意思是问我在 RAG 中是如何处理 pdf 文件的，我当时回答的是直接用langchain.js 中的某个文档处理 loader，然后进行文本分割，embidding，存向量数据库。但是面试官对这个回答并不满意，请问正确的回答是？

```javascript
面试官不满意的点大概率不是因为你说错了，而是你的回答太“工具层”了：
你回答的是“我用什么库”，但面试官想听的是“PDF 这种复杂文档在 RAG 里如何被可靠地解析、结构化、切分、索引和召回”。

更好的回答应该围绕 PDF 不是纯文本文件 这一点展开。
可以这样回答：

在 RAG 里处理 PDF，我不会简单地把 PDF 丢给一个 loader 然后直接 chunk。PDF 的关键问题是：它是版式文档，不是语义文档，所以第一步要先判断 PDF 类型和内容结构。

 我一般会分几步处理：
 
 1. 文档解析
先判断 PDF 是文本型还是扫描件。
	- 如果是文本型 PDF，可以用 pdf-parse、LangChain loader、Unstructured、LlamaParse、PyMuPDF 等工具提取文本。
 	- 如果是扫描件或者图片型 PDF，需要走 OCR，比如 Tesseract、PaddleOCR、Azure Document Intelligence、Google Document AI 等

2. 保留结构信息
不能只抽纯文本，还要尽量保留：
	- 页码
	- 标题层级
	- 段落
	- 表格
	- 列表
	- 图片说明
	- 页眉页脚
	- 文档章节关系
	
因为后面回答问题时，页码和章节来源很重要，也方便做 citation。
	
3. 清洗和规范化
PDF 经常会有页眉页脚、页码、断行、重复水印、目录、脚注混在正文里。
所以要做清洗，比如：
	- 去除重复页眉页脚
	- 修复跨行断句
	- 合并被错误切开的段落
	- 去掉无异议字符
	- 对表格单独处理
	- 对目录、参考文献等低价值区域做过滤或降权
	
4. 按语义切分，而不是固定长度硬切
我不会直接按 500 tokens 切。更好的方式是先按文档结构切，比如章节、标题、段落，再在过长的段落里做 token-based chunk。
每个 chunk 需要带 metadata，比如：
{
   "source": "xxx.pdf",
   "page": 12,
   "section": "3.2 风险控制",
   "chunk_index": 5
 }
 这样召回后可以告诉用户答案来自哪一页、哪一节。
 
 5. 针对表格、图片、公式做特殊处理
 表格不能简单转成一堆乱文本。常见做法是：
 	- 表格转 Markdown / HTML
	- 表格单独作为 chunk
    - 对复杂表格生成摘要后一起入库
	- 图片或图表可以用 OCR 或多模态模型生成 caption 再索引
    
6. Embeddinbg 和 索引
清洗和切分完成后，再做 embedding，写入向量数据库。
但我一般不会只依赖向量召回，还会结合：
	- keyword / BM25 检索
    - hybrid search
    - metadata filter
    - reranker
因为 PDF 里经常有专业术语、编号、条款号，纯向量召回不一定稳定。

7. 召回后的质量控制
检索出来后会做 rerank，并控制上下文拼接顺序，尽量按章节和页码恢复上下文。
最终回答时要求模型基于检索内容作答，并返回引用来源，比如文件名、页码、章节。

```

面试时可以压缩成这样一段：

  > 我不会把 PDF 简单当成纯文本处理。PDF 在 RAG 里最大的难点是版式信息和语义结构不一致，所以我会先判断它是文本型 PDF 还是扫描件，分别用文本解析或 OCR。解析时会尽量保留页码、标题、段落、表格等结构信息，并清理页眉页脚、断行、水印等噪声。之后不是直接按固定 token 切，而是优先按章节、标题、段落做语义切分，过长内容再做 token chunk，并给每个 chunk 加上 source、page、section
  > 等 metadata。表格、图片、公式会单独处理，比如表格转 markdown，图片做 OCR 或 caption。索引时除了 embedding，也会结合 BM25、metadata filter 和 reranker，提高召回质量。最后生成答案时带引用页码，保证可追溯。

> “在实际的生产项目中，我们不会直接用简单的内置 PDF Loader。因为 PDF 格式复杂，双栏排版、表格和图片的丢失都会严重破坏语义。
>
> 我们的做法是搭建一个**结构化文档解析 Pipeline**：
>
> 1. 首先，我们会采用**版面分析（Layout Analysis）**工具，比如 **Marker** 或 **MinerU**，将 PDF 还原为结构清晰的 **Markdown 格式**，保留阅读顺序并剔除页眉页脚噪音。
> 2. 针对表格，我们会单独提取并转化为 **Markdown Table** 以保留结构化信息；针对图表，我们会利用**多模态大模型**生成文本描述（Caption），与原文建立关联。
> 3. 在切分阶段，我们废弃了传统的固定长度切分，而是使用 **Layout-Aware Chunking（基于版面层级的切分）** 和 **Parent-Child Chunking（父子分块）**。计算 Embedding 时用 150 token 左右的细粒度 Child Chunk，召回时将对应的 Parent Chunk 送给大模型，保证上下文完整。
> 4. 最后，在索引端，我们会为每个 Chunk 打上页码、章节等 **Metadata**。在检索时使用 **Hybrid Search（向量 + BM25 混合检索）** 并配合 **Reranker（如 BGE-Reranker）** 进行二次精排，以实现最高的检索召回率和准确率。”

 这就比“用 LangChain loader 切分 embedding 存库”更像一个真实工程里的 RAG 答案。

  核心区别是：

  你的原回答是：

  > 工具链：loader → splitter → embedding → vector db

  更好的回答是：

  > PDF 解析质量 → 结构保留 → 清洗 → 语义切分 → 多类型内容处理 → 混合检索 → rerank → 可追溯引用

  面试官通常想听的是后者。