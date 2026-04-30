## LangChain 中的 Runnable

**Runnable** 是 LangChain 中的核心抽象接口，代表**任何可以被"运行"的组件**。它是 LangChain Expression Language (LCEL) 的基础，让不同组件可以用统一的方式组合和调用。可以理解为：

> 👉 **“一个可以被执行（run）的标准化任务单元”**
>
> Runnable = **输入 → 处理 → 输出**
>
> Runnable = `统一接口` + `管道组合` + `流式/批量/异步支持`

简单来说，LangChain 中的绝大多数组件（甚至是你自己写的函数）都可以被视为一个 `Runnable`。

它本质上是 LangChain 用来统一各种处理步骤（LLM调用、Prompt处理、数据转换等）的 **通用接口**。

### 核心思想

所有实现了 `Runnable` 接口的组件都拥有相同的调用方式，因此可以像"积木"一样自由拼接。

常见的 Runnable 组件包括：

- `ChatModel` / `LLM` — 语言模型本身就是 `Runnable`，接收消息列表，输出模型响应
- `PromptTemplate` — 提示词模板，负责将变量填充到模板中，生成标准的消息格式，也是一个 `Runnable`
- `OutputParser` — 输出解析器，用于解析模型的原始输出，将其转换为更结构化的数据
- `Retriever` — 检索器，用于从向量数据库中检索相关文档

### 统一的调用方法

| 方法                                | 说明                   |
| ----------------------------------- | ---------------------- |
| .invoke(input)                      | 同步调用，返回单个结果 |
| .stream(input)                      | 流式输出，逐步返回结果 |
| .batch(inputs)                      | 批量处理多个输入       |
| .ainvoke() / .astream() / .abatch() | 以上三者的异步方法     |

### Runnable 常用类型



