## 项目结构

```bash
├─ README.md            # 项目说明文档
├─ package.json
├─ pnpm-workspace.yaml  # 声明 `code/*` 下的各子包为 pnpm 工作区成员
├─ pnpm-lock.yaml
├─ tsconfig.json        # 公共 TypeScript 基础配置（各子包 extends 继承）
├─ .eslintrc.cjs
├─ prettier.config.mjs
├─ .prettierignore
├─ .gitignore
├─ .env.example         # 环境变量示例
├─ .env                 # 环境变量（git 忽略，各子包直接读取此文件）
├─ .vscode/
│  └─ settings.json
└─ code/                # 练习/项目代码目录
   ├─ 01_tool-test/     # 工具调用测试
   ├─ chapter-01/       # 第一章练习
   └─ chapter-02/       # 第二章练习
```

## 🔑 环境变量

`.env` 文件位于项目根目录，所有子项目共享。各子包通过 `dotenv` 直接加载：

```js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// 使用 process.env.OPENAI_API_KEY 等
```

> ⚠️ 注意：`path.resolve` 中的 `../../../.env` 需根据当前文件相对于根目录的层级调整。

## 🚀 如何创建新子项目

### 方式一：手动创建（简单项目 / Node.js 脚本）

```bash
# 1. 创建目录
mkdir code/my-project

# 2. 初始化 package.json
cd code/my-project
pnpm init

# 3. 安装依赖（可在node环境中运行 ts 文件：npx tsx 脚本.ts）
pnpm add -D tsx typescript

# 3. 编辑 package.json，确保包含以下字段
#    "name": "@ai-agent/my-project"
#    "private": true
#    "type": "module"

# 4. 使用 npx tsc --init 创建 tsconfig.json（TypeScript 项目）
# 内容参考：
# {
#   "extends": "../../tsconfig.json",
#   "compilerOptions": { "baseUrl": "." },
#   "include": ["src"]
# }

# 5. 回到根目录安装依赖
cd ../..
pnpm install
```

### 方式二：Vite 脚手架创建（前端项目）

```bash
# 1. 在 code/ 目录下用 Vite 创建项目
cd code
npx create-vite my-vite-app

# 2. 编辑 my-vite-app/package.json
#    将 name 改为 "@ai-agent/my-vite-app"
#    添加 "private": true

# 3. 回到根目录安装依赖
cd ..
pnpm install
```

## 🚀🚀🚀 code 子目录说明

| 子目录                                                       | 说明                                                         |
| :----------------------------------------------------------- | :----------------------------------------------------------- |
| [01_tool-test](code/01_tool-test)                            | LangChain 工具调用测试                                       |
| [02_mini-cursor](./code/02_mini-cursor)                      | 实现 mini 版cursor，通过文件读写tool来创建一个 todolist 应用 |
| [03_mcp-test](./code/03_mcp-test)                            | 学习 MCP 相关知识，自定义 MCP Server，使用第三方 MCP Server，了解 MCP 客户端的两种连接方式（http、stdio）的区别 |
| [04_rag-test](./code/04_rag-test)                            | RAG(Retrieval Augmented Generation)，检索增强生成，loader、splitter 等概念的理解，实现一个简单的 RAG |
| [05_milvus-test](.code/05_milvus-test)                       | 学习 milvus 向量数据库及相关操作，使用 milvus实现 rag 语义检索 |
| [06_book-search(milvus+rag)](./code/06_book-search(milvus+rag)) | **Demo**：基于 milvus + rag 实现电子书语义检索助手           |
| [07_memory-test)](./code/07_memory-test)                     | Memory 的实现策略：截取、总结、检索                          |



