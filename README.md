## 项目结构

```bash
├─ README.md            # 项目说明文档
├─ package.json
├─ pnpm-workspace.yaml  # 声明 `code/*` 下的各子包为 pnpm 工作区成员
├─ pnpm-lock.yaml
├─ tsconfig.json
├─ .eslintrc.cjs
├─ prettier.config.mjs
├─ .prettierignore
├─ .gitignore
├─ .env.example         # 环境变量示例（告诉你需要哪些 `OPENAI_*`、`ANTHROPIC_*` 等配置）
├─ .vscode/             # VS Code 私有工作区设置（例如格式化/类型检查偏好）。
│  └─ settings.json
└─ code/                # 练习/项目代码目录
   ├─ chapter-01/
   ├─ chapter-02/
   └─ shared/           # 可复用的公共库包
      ├─ package.json
      └─ src/
         ├─ index.ts    # 公共库导出入口（聚合并 re-export 各模块）
         ├─ env.ts      # 加载并校验环境变量（依赖 `dotenv`，提供 `validateEnv()`）
         ├─ constants/  # 常量配置（默认模型、token 限制、端点路径、角色颜色等）
         │  └─ index.ts
         ├─ logger/     # 日志工具封装（`Logger` 与 `logger` 实例）
         │  └─ index.ts
         ├─ prompts/    # 提示词模板与模板渲染工具（如 `PromptTemplate`、系统提示词）
         │  └─ index.ts
         ├─ types/      # 公共类型定义（如消息结构、LLM 相关响应类型）
         │  └─ index.ts
         └─ utils/      # 公共工具函数（如 `sleep`、`truncateText`、`generateId` 等）
            └─ index.ts
```



## 🚀🚀🚀 code子目录说明

111
