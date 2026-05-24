# 项目上下文 (Project Context)

## 1. 项目简介
- **项目名称**：ai-agent-study
- **定位**：AI Agent 相关技术（LangChain、MCP、RAG、向量数据库、记忆机制、语音等）的学习、练习与 Demo 演示项目。
- **当前状态**：进行中，包含多个独立的子模块/练习包。

## 2. 技术栈
- **包管理器**：pnpm (Workspace 模式)
- **运行环境**：Node.js (TypeScript)
- **主要技术与框架**：
  - TypeScript
  - LangChain (JS/TS 版本)
  - Nest.js
  - Milvus (向量数据库)
  - dotenv (环境变量管理)

## 3. 目录与包结构
项目通过 pnpm workspace 将 `code/` 下的每个子目录作为一个独立的 package 管理：

| 子目录 | 说明 |
| :--- | :--- |
| `code/01_tool-test` | LangChain 工具调用 (Tool Calling) 基础测试 |
| `code/02_mini-cursor` | 实现 mini 版 Cursor，通过文件读写 Tool 来自动创建 Todo List 应用 |
| `code/03_mcp-test` | 学习 MCP (Model Context Protocol)，自定义 MCP Server，了解 stdio/http 连接方式 |
| `code/04_rag-test` | RAG 基础，包括 Document Loader, Text Splitter, Embedding 与检索逻辑 |
| `code/05_milvus-test` | Milvus 向量数据库基础操作与基于 Milvus 的 RAG 语义检索 |
| `code/06_book-search(milvus+rag)` | 电子书语义检索助手 Demo (基于 Milvus + RAG) |
| `code/07_memory-test` | AI 记忆机制实现策略（截取、总结、检索记忆） |
| `code/08_output-parser-test` | 大模型的结构化输出 (Output Parser) 与流式输出 (Streaming) |
| `code/09_output-parser-demo` | 各种 Output Parser 应用，实现流式输出版的 mini Cursor |
| `code/10_prompt-template-test` | Prompt Template 提示词模板相关 API 的使用 |
| `code/11_runnable-test` | LangChain LCEL (Runnable) 相关 API 使用 |
| `code/12_nest-langchain` | Nest.js 与 LangChain 的集成 |
| `code/13_cron-job-tool` | 基于 Nest.js + LangChain 实现定时任务 Tool、邮件发送 Tool、网络搜索 Tool 等 |
| `code/14_tts-stt-test` | 语音与文字识别/转换 (TTS & STT) 基础测试 |
| `code/14_asr-and-tts-nest-service` | 基于 Nest.js 的 ASR (STT) 与 TTS 语音服务实现 |

## 4. 开发与运行规范
- **环境变量**：
  - 根目录下有共享的 `.env` 文件。
  - 各子包通过 `dotenv` 引入，如：`dotenv.config({ path: path.resolve(__dirname, '../../../.env') })`。
- **运行方式**：
  - 脚本类子包（如 `01_tool-test` 等）：在对应目录下使用 `npx tsx <filename>.ts` 直接运行。
  - 服务类子包（如 Nest.js 项目）：在对应目录下使用 `pnpm dev` 运行。
- **代码规范**：
  - 代码逻辑与命名使用英文。
  - 代码注释统一使用中文，保持简洁。
- **Git 提交规范**：
  - 使用中文提交信息，格式为 `<类型>: <描述>`。
  - 例如：`feat: 添加xxx功能`、`fix: 修复xxx bug`。

## 5. 当前阶段与任务
- **当前任务**：初始化项目上下文环境。
- **下一步计划**：根据用户指令进行特定章节的练习、开发或重构。
