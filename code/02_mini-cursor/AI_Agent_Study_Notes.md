# AI Agent 项目学习笔记 (mini-cursor)

这份笔记基于本项目中的 `index.ts`、`all-tools.ts` 和 `node-exec.ts` 三个核心文件，归纳整理了构建简易 AI Agent（类似 Cursor）所涉及的核心机制、使用到的 API 以及模型调用流。

---

## 1. 核心概念与工作机制

在这个简易版的 AI Agent 项目中，我们构建的核心是一个**基于工具调用的循环编排系统**。

*   **Agent (智能体)**：在这里即 `runAgentWithTools` 函数，它作为大脑，持续向大模型发送对话上下文并根据意图决定是“向用户输出结果”还是“在本地执行某个工具”。
*   **Tools (工具)**：是 Agent 延伸出大模型“躯壳”去操作本地系统的爪牙，比如访问网络、读写本地文件、执行终端命令等。
*   **LLM With Tools**：通过大模型支持的 Function Calling（函数调用）能力，大模型可以“知道”自己有哪些工具可用，并在我们需要的时候仅仅返回一段结构化的指令（告诉代码去跑哪个函数），而不是返回普通对话文本。

---

## 2. 关键文件与 API 剖析

### 2.1 `index.ts`：大脑与总控编排

这是整个项目的主入口，负责配置大语言模型并控制 Agent 执行循环。

*   **关键 API：**
    *   `ChatOpenAI`: 来自 `@langchain/openai`。在此项目中通过配置 `baseURL` 等参数，将其底层对接到了 Qwen（通义千问）模型。
    *   `bindTools(tools)`: LangChain 的核心方法。它将封装好的本地函数列表转换为大模型底层原生的 Tool Schemas 并进行绑定。
    *   `SystemMessage, HumanMessage, AIMessage, ToolMessage`: LangChain 提供的标准化消息封装对象，用于管理对话历史：
        *   **SystemMessage**：给 AI 设定人设。例如在这个项目中注入了当前工作目录（`process.cwd()`），并规定了命令执行时的核心业务规则。
        *   **ToolMessage**：一旦本地工具执行完毕，产生的结果必须通过一个带有 `tool_call_id` 的 ToolMessage 塞回历史记录里，这样 AI 才知道自己上一步让系统做的操作成没成功。

### 2.2 `all-tools.ts`：工具箱与安全约束

这个文件利用 LangChain 提供的 `tool` 工厂函数创建可供调用的本地能力，并使用 `zod` 对参数进行约束。

*   **核心工具：**
    *   `readFileTool` & `writeFileTool`：基于原生 Node.js 的 `node:fs/promises` 模块。特别是写入工具运用了 `recursive: true` 来智能创建不存在的多级目录。
    *   `listDirectoryTool`：负责提供目录感知能力。它聪明地设置了 `MAX_ITEMS` (100) 阈值，以防止超大目录（如 node_modules）直接消耗尽大模型的上下文 Token。
    *   `executeCommandTool`：基于 Node.js 的 `spawn`。在这里做了大量健壮性优化：
        *   截获 stdout 和 stderr，将成功与失败信息甚至退出码完整地打包返回给 AI，让 AI 具备“自我 Debug” 能力。
        *   基于 `setTimeout` 注入了 30秒超时(`timeout: 30000`) 销毁机制，防止执行产生阻塞。
        *   使用了黑名单过滤，诸如 `rm -rf /` 等危险指令进行拦截。

*   **关键 API：**
    *   `tool(async (...) => {...}, { schema: z.object({...}) })`：将普通函数转化为 LangChain Tool。
    *   **Zod Schema (`z.object`)**：其中的 `.describe()` 至关重要。它是充当 Prompt 的一部分传入大模型的，用来指导大模型应该传怎样的参数（例如特别说明不要滥用 `cd` 命令）。

### 2.3 `node-exec.ts`：进程交互概念验证 (PoC)

这是一个独立用于探索 Node.js `child_process` 底层机制的测试文件。

*   **核心探讨：如何针对需要用户交互的命令执行脚本？**
    *   例如 `pnpm create vite` 在命令执行过程中需要用户按键盘选 Yes/No。
    *   **实现原理**：它利用了 `spawn` 并且没有直接使用 `inherit` stdio。而是利用 `child.stdin.write()` 模拟用户敲击键盘输入数据。
    *   采用 `setTimeout` 宏任务队列进行延迟写入（如 `['\n', 'n\n', '\n']`），保证 CLI 端能够在一项配置处理完毕后顺利接收下一个键入指令。这种能力为在 Agent 中彻底取代“人工输入”铺平了道路。

---

## 3. 模型调用核心流程 (The Event Loop)

在 `index.ts` 中的 `runAgentWithTools` 刻画了目前大多数 AI Agent 的标准处理流：

1.  **组装初始提示词（Initialize）**：构建包含 System Prompt 和用户指令（`case1`）的 Message Array。
2.  **无限/限次循环推演（The Loop）**：最多允许它自行流转 30 次 (`maxIterations`)。
3.  **向 LLM 发起预测（Predict）**：调用 `modelWithTools.invoke(messages)` 产生响应。
4.  **是否命中工具（Condition Check）**：
    *   如果 `response.tool_calls` 为空，说明任务收敛完成或者 AI 认为到了需要回话的时刻。返回普通文本 `response.content`，停止循环。
    *   如果有 `tool_calls`，则遍历解析每个需执行的工具及参数。
5.  **本地穿透层（Execute local functions）**：本地匹配对应 `name` 的函数，并将大模型生成的 `args` 传入并执行（如发起网络请求、调用终端等）。
6.  **结果反馈回路（Push Feedback）**：封装成 `ToolMessage` 附加到 Message Array 的末尾。
7.  回到第 3 步，让大模型看到自己调用工具后的情况（报错还是成功）以决定下一步。

---

## 4. 关键依赖库与核心 API 详解 (针对初学者)

在本项目中，要完全理解大模型为什么能够调用我们在本地写的代码，需要彻底弄懂两个核心依赖库：**@langchain/core** 和 **zod**。

### 4.1 `@langchain/core` 与 `tool()` 方法

LangChain 是目前最流行的 LLM 应用开发框架。`@langchain/core` 提供了所有构建大模型应用的核心基础抽象。
其中，**`tool()`** 方法尤为关键，它是将普通本地函数转换为“大模型所能理解的工具”的桥梁。

**`tool()` 方法接收两个参数：**
1. **第一个参数：异步普通函数 (Function Logic)**
   * 例如 `async ({ filePath }) => { return ... }`。
   * 这里写的就是你要在本地真正执行的代码逻辑，大模型是看不到里面的细节的。
2. **第二个参数：配置对象 (Tool Metadata)**
   * 这包含了 **`name`**、**`description`** 和 **`schema`** 三个极为重要的属性。大模型是通过这三个属性来“认识”这个工具的。

* **`name` (工具名称)**
  * **作用**：它是工具的唯一标识符（例如 `'read_file'`），大模型决定调用工具时，返回的就是这个名字。
  * **注意点**：必须由字母、数字、下划线组成，不能有空格，且命名必须具有明显的动宾结构意图（如 `execute_command` 取代简单的 `cmd`）。

* **`description` (工具描述)**
  * **作用**：告诉大模型“这个工具是用来干嘛的”。
  * **核心点**：这也是一段给 AI 看的 Prompt（提示词）。在这个描述里你要详细写清楚它的使用场景、限制以及注意事项。描述越详尽，AI 调用它的时机就越准。

* **`schema` (参数校验格式)**
  * **作用**：定义上方的执行函数（第一个参数）需要接收什么样的数据结构。这就引出了 `zod`。

### 4.2 `zod`：类型保护与参数描述神器

`zod` 是一个广受欢迎的 TypeScript/JavaScript 模式声明和验证库。
在这里，为什么不直接用原生的 TS 类型，而要用 `zod` 呢？因为大模型返回的是一个不确定的 JSON 字符串，我们需要在运行时验证这段 JSON 是否合法，如果不合法直接阻断，以免把错误数据传给本地函数报错引起奔溃。

* **`z.object({...})`**
  * 定义一个对象结构，代表我们要传给函数的参数组合（即 `schema`）。

* **为什么 API 要写成 `z.string().describe(...)` ？**
  * `z.string()`：首先告诉 `zod` 这个参数在代码层面必须是一个字符串格式。它同时也会转换为 JSON Schema 告诉大模型：“这个参数的 Type 是 String”。
  * **核心功能 `.describe('...')`**：这是向 JSON Schema 注入描述信息的专用 API。
  * **原理**：大模型没有看穿代码本身的能力，它只能看到我们通过 JSON 传过去的结构说明。`.describe()` 里面的文本，本质上又是给大模型看的 prompt，例如当我们在 `filePath` 上写 `.describe('目标文件的完整路径（包含文件名）')`，大模型结合这个描述，就不会胡乱传一个没有后缀的名字过来。

**总结这几个参数如何共同协作产生魔法：**
开发人员使用 `tool()` 包裹函数逻辑，通过参数 `name` 赐名，利用 `description` 告诉 AI 作用，最后靠 `zod` 定义 `schema` 并配合 `describe()` 细化讲解每个变量该如何传参。这四者最终会被抽离组合成一大串包含说明的 JSON Schema 数据结构发给大模型平台（如 Qwen），从而让大模型完全搞懂你的本地函数！

---

## 5. 消息驱动系统 (Message Hierarchy) 解析

LangChain 采用了极其标准化的消息类型来控制大模型，您可以通过理解这四种基本消息来彻底掌握对话流：

### 5.1 消息的四大护法
1. **`SystemMessage` (系统消息)**
   * **作用**：通常放在整个数组的最开头（只放一次）。相当于给 AI 洗脑：“你是一个资深前端工程师...”。
   * **特征**：AI 会将其视为最高指导原则（指令优先级极高）。在我们的 `index.ts` 中，我们把当前工作目录、可用工具以及不能用 `cd` 的严厉规则都写在了这里。

2. **`HumanMessage` (用户消息)**
   * **作用**：代表使用者下发的任务或随时补充的提问。比如：`“帮我写一个 TodoList 并跑起来”`。

3. **`AIMessage` (AI 消息)**
   * **作用**：大模型预测后返回给你的内容。
   * **特殊性**：这不仅能包含纯文本对话，它可能还携带了一个隐秘属性：**`response.tool_calls`**。当大模型认为它需要调工具时，文本可能为空，但 `tool_calls` 数组里记录了它要唤起的本地函数名及生成好的 JSON 参数。

4. **`ToolMessage` (工具回执消息)**
   * **作用**：本地函数执行完之后，你必须把结果（报错了还是成功了，以及返回值）包装进 `ToolMessage` 里塞回数组。
   * **关键绑定**：它必须传入 `tool_call_id`。因为 AI 一次性可能会抛出3个工具调用请求，你得用 `tool_call_id` 明确告诉 AI：“这是刚才那个读取 utils.js 的结果”。

---

## 6. LLM 的初始化与方法解析

在 `index.ts` 开头，我们使用了 `ChatOpenAI` 来实例化模型，这是很多初学者容易迷惑的地方：

### 6.1 `ChatOpenAI` 类
虽然名称里带了 `OpenAI`，但由于行业标准 API 结构几乎全兼容了 OpenAI 的风格，所以只要你在 `configuration: { baseURL: "..." }` 处换成了 Qwen 或其他厂商的代理地址，它就能直接无缝去请求国内大模型了。
* **`temperature: 0`**：表示**创意随机性**。在写代码/发指令的严谨 Agent 场景下，设为 0 是必须的，我们希望它严格且保守地按命令行事，不要去自己脑补瞎编。

### 6.2 `.bindTools(tools)` 方法
我们创建了 LLM 实例（如 `model`），再创建了本地函数数组（如 `tools = [readFileTool, ...]`），但这两者此时本质上互不相干。
大模型其实只能接收 JSON API 请求。通过 `.bindTools(tools)`，LangChain 会在底层暗中遍历这 4 个工具的 `name` / `description` / `schema`，并将它们提取成一份标准化涵盖全部限制说明的 JSON Schema 工具纲要。随后每次跟 AI 聊天时，都会静默地把这份纲要顺带发往 AI 服务器。AI 引擎解析这份纲要之后，也就获得了“了解自己具备本地超能力”的错觉。

### 6.3 `.invoke(messages)` 方法
* 这是引擎运转的**触发器**。
* 此方法接收前文推演生成的庞杂消息大军（ `[ SystemMessage, HumanMessage, ToolMessage ... ]` 消息积木树）。
* 当你 `await` 它时，它拿着全部过往积木找远端大模型求签，并拉回最新那块 `AIMessage` 积木。
* 我们的无限循环的本质就是不断的复读拼积木：**发一堆积木 -> 收最新那块 -> 将它装载落地 -> 得到执行后的新回执红利块 -> 拼在一起再发给远端...** 周而复始，直到任务大功告成。

---

💡 **进阶思考（待优化的点）：**
*   **长下文遗忘问题**：随着循环次数增加，`messages` 会不可避免地过度膨胀。在真实的复杂场景（如现在的 Cursor），需要对历史 Tool 结果截断总结或者引入记忆库（RAG/Memory）。
*   **安全与沙箱隔离**：虽然在 ExecuteCommand 里对危险命令做了字符级拦截，但最好的方式是将其放进 Docker 容器级沙箱处理。
