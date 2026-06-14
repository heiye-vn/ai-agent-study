# Document Analysis



## 01-filesystem-agent.ts

基于 **DeepAgents + LangChain** 框架的 **文件系统 Agent 演示**，核心目的是展示如何通过 **中间件（Middleware）** 对 AI Agent 的文件操作实施 **权限控制**。

**整体流程：**

```mermaid
graph LR
    A[用户 Prompt] --> B[LangChain Agent]
    B --> C[Filesystem Middleware]
    C -->|权限检查| D{允许?}
    D -->|✓| E[FilesystemBackend<br/>真实文件操作]
    D -->|✗| F[抛出拒绝异常]
    E --> G[workspace/ 目录]

```

**数据流全景：**

```mermaid
graph TB
    A["Agent 调用 write_file('/todo.md', ...)"] --> B[Filesystem Middleware]
    B --> C{"permissions 检查"}
    C -->|"✓ /todo.md → allow"| D["FilesystemBackend.write()"]
    C -->|"✗ /hack.txt → deny"| E["抛出权限拒绝异常"]
    D --> F["resolvePath('/todo.md')"]
    F --> G["virtualMode: 映射到<br/>workspace/todo.md"]
    G --> H["fs.writeFileSync(...)"]

```



这个文件演示了 **DeepAgents 框架中 Middleware 的安全能力**：在不修改 Agent 核心逻辑的前提下，通过声明式的权限规则，控制 AI 对文件系统的访问边界。这在生产环境中非常重要——防止 LLM 被 prompt injection 引导去读写敏感文件。



**API 解释：**

`createFilesystemMiddleware`：创建文件系统的中间件

`backend`：是一个实现了 BackendProtocolV2 接口的文件操作后端示例。是中间件的 **“执行引擎”**。本质是 DeepAgents 框架中的基础设施层抽象，让各种中间件可以通过统一的接口访问底层资源。

`FilesystemBackend`：是 DeepAgents 提供的本地文件系统后端，之间操作磁盘上的真实文件

---

## 02-skills-agent.ts

基于 **DeepAgents Skills 中间件** 的 Agent 演示，核心目的是展示如何让 AI Agent **加载并使用社区共享的技能（Skills）** 来完成复杂任务——这里的任务是用自然语言描述生成一张 Excalidraw 流程图。

**整体流程：**

```mermaid
graph TB
    A["用户 Prompt<br/>画一张流程图"] --> B["createAgent"]
    B --> C["createSkillsMiddleware"]
    B --> D["createFilesystemMiddleware"]
    C -->|"扫描 /.agents/skills/"| E["SKILL.md 元数据<br/>注入 systemPrompt"]
    E -->|"Agent 按需 read_file"| F["读取完整 SKILL.md<br/>学习如何生成 Excalidraw"]
    D -->|"write_file"| G["写入 .excalidraw 文件"]
    
    subgraph LocalShellBackend
        H["FilesystemBackend 继承"]
        I["+ execute() 命令执行"]
    end
    C --> LocalShellBackend
    D --> LocalShellBackend

```

---

## 03-subagent-agent.ts

基于`createSubAgentMiddleware` 中间件的演示，场景是 **小学数学应用题辅导**。一个主 Agent 充当"调度员"，将解题、讲解、出题三个任务分别委派给三个专业化的子 Agent。

**整体流程：**

```mermaid
graph TB
    User["👨‍👩‍👧 家长提问<br/>'小明有 24 块糖...'"]
    
    Main["🎯 主 Agent<br/>小学数学辅导主 Agent<br/>（不解题，只调度）"]
    
    S1["🧮 math-solver<br/>解题子 Agent"]
    S2["👩‍🏫 kid-tutor<br/>讲解子 Agent"]
    S3["📝 practice-maker<br/>出题子 Agent"]
    
    T1["🔧 calc"]
    T2["🔧 divide_evenly"]
    T3["🔧 make_similar_problem"]
    
    User --> Main
    Main -->|"① task(math-solver)"| S1
    Main -->|"② task(kid-tutor)"| S2
    Main -->|"③ task(practice-maker)"| S3
    
    S1 --> T1
    S1 --> T2
    S2 -.->|"无工具<br/>纯文本讲解"| S2
    S3 --> T3
    
    S1 -->|"解题结果"| Main
    S2 -->|"讲解文本"| Main
    S3 -->|"练习题"| Main
    Main -->|"汇总报告"| User

```

---

## 04-memory-agent.ts

基于`createMemoryMiddleware` 中间件的演示，展示如何让 AI Agent 拥有 **跨轮次持久化记忆**——Agent 能记住用户告诉它的信息，并在后续对话中自动回忆。

**整体流程：**

```mermaid
graph TB
    subgraph "workspace-memory/"
        F1["/AGENTS.md<br/>项目记忆"]
        F2["/memory/preferences.md<br/>用户偏好"]
    end

    subgraph "Agent 启动流程"
        M["createMemoryMiddleware"]
        M -->|"读取 sources"| F1
        M -->|"读取 sources"| F2
        M -->|"注入 &lt;agent_memory&gt;<br/>到 systemPrompt"| A["Agent"]
    end

    subgraph "多轮对话"
        U1["Q1: 项目是做什么的？"] -->|"Agent 查阅记忆回答"| A
        U2["Q2: 记住我用 pnpm"] -->|"Agent edit_file 写入"| F2
        U3["Q3: 记住主入口脚本路径"] -->|"Agent edit_file 写入"| F1
        U4["Q4: 我用什么包管理器？"] -->|"Agent 从记忆回答"| A
    end

```

```mermaid
sequenceDiagram
    participant U as 用户
    participant MW as MemoryMiddleware
    participant A as Agent
    participant FS as FilesystemMiddleware
    
    Note over MW: 每次 invoke 前自动触发
    MW->>MW: 读取 /AGENTS.md
    MW->>MW: 读取 /memory/preferences.md
    MW->>A: 注入 <agent_memory> 到 systemPrompt
    U->>A: "记住我用 pnpm"
    A->>FS: edit_file(/memory/preferences.md, ...)
    Note over FS: 写入磁盘

```

> 这种"分类记忆"设计很实用——项目记忆可以团队共享（提交到 Git），而用户偏好是个人私有的（加入 `.gitignore`）

**Agent 既是记忆的消费者也是生产者**。Memory Middleware 负责"回忆"（读取并注入），Filesystem Middleware 负责"记忆"（Agent 主动写入）。两者通过共享同一个 `backend` 实例形成闭环。

---

## 05-summarization-agent.ts

文件演示了 **DeepAgents 的 `createSummarizationMiddleware`** —— 一个自动压缩长对话历史的中间件。核心思路是：当对话消息数超过阈值时，自动将早期对话摘要为一段精简文本，以控制上下文窗口长度。

**整体流程：**

```mermaid
sequenceDiagram
    participant U as 用户
    participant MW as SummarizationMiddleware
    participant LLM as 模型
    participant FS as Backend（磁盘）

    Note over MW: 每次 invoke 前检查消息数
    
    loop 前 4 轮对话
        U->>MW: 新消息
        MW->>MW: 消息数 < 8，不触发
        MW->>LLM: 正常处理
    end
    
    Note over MW: 第 5 轮：消息数 ≥ 8（每轮含用户+AI=2条）
    U->>MW: 新消息
    MW->>MW: 消息数 ≥ 8，触发摘要！
    
    rect rgb(255, 240, 230)
        MW->>FS: 将旧消息归档写入<br/>/conversation_history/xxx.json
        MW->>LLM: 用 summaryPrompt 摘要旧消息
        LLM-->>MW: 返回摘要文本
        MW->>MW: 替换消息列表：<br/>摘要 + 最近 4 条消息
    end
    
    MW->>LLM: 用精简后的消息继续处理

```







