# 大模型的输出解析器

## 前言

在 LangChain 中，**Output Parser（输出解析器）** 是一个非常核心的组件，它的主要作用是**将大语言模型（LLM）输出的非结构化纯文本字符串，转换为程序可以直接处理的结构化数据**。



大语言模型的默认输出永远是纯文本（String）。当你只做聊天机器人时，这没有问题；但如果你在构建一个复杂的 AI 应用（比如从简历中提取信息存入数据库、根据用户输入自动调用某个 API），你就需要 JSON、列表、日期对象或特定的类实例，这时候就需要 Output Parser 介入



`code/08_output-parser-test/src` 这一组 12 个例子，核心是在对比 “让模型按指定格式输出 + 程序端如何解析/校验/流式处理” 的几种路线：

- 纯提示词 + 手动 JSON.parse（最脆弱）
- OutputParser 系列（Json / Structured / XML：通过格式指令 + parser.parse）
- Zod Schema（更强的结构定义与校验）
- Tool Calling / withStructuredOutput（让“结构化结果”走工具调用通道，更稳、更像 API）
- Streaming（流式文本、流式结构化、流式工具调用参数的“增量拼接/解析”）



## 逐文件解析

- 01-normal.ts
  - 主题：最基础的“要求 JSON 返回”，但不使用解析器。
  - 做法：`model.invoke(question)` 拿到 `response.content` 后直接 `JSON.parse(...)`。
  - 要点：完全依赖模型“乖乖输出纯 JSON”，容易出现前后缀文本导致解析失败。
- 02-json-output-parser.ts
  - 主题：使用 `JsonOutputParser` 生成格式约束指令。
  - 做法：把 `parser.getFormatInstructions()` 拼进 prompt；拿到结果后依旧 `JSON.parse`（代码里并没有 `parser.parse`）。
  - 要点：增强提示词约束，但程序端仍是“手动 parse”，健壮性提升有限（本质还是赌模型输出是合法 JSON）。
- 03-structured-output-parser.ts
  - 主题：`StructuredOutputParser.fromNamesAndDescriptions`（用字段名+描述定义结构）。
  - 做法：prompt 中加入 `parser.getFormatInstructions()`；最后 `await parser.parse(contentStr)` 得到结构化对象。
  - 要点：相比纯 `JSON.parse`，这里把“容错/提取”交给 parser（通常会要求模型输出特定包裹格式再解析）。
- 04-structured-output-parser2.ts
  - 主题：`StructuredOutputParser.fromZodSchema`（用 Zod 定义复杂嵌套结构并校验）。
  - 做法：定义 `scientistSchema`（数组、对象、optional 等），`parser.getFormatInstructions()` 约束输出；`parser.parse` 后再做结构化展示；遇到 `ZodError` 打印校验详情。
  - 要点：这是“结构化输出”的进阶形态：不仅解析，还验证类型/必填/可选/嵌套形状。
- 05-tool-call-args.ts
  - 主题：Tool Calling 获取结构化结果（从 `response.tool_calls[0].args` 取）。
  - 做法：`model.bindTools([{ name, description, schema: zodSchema }])`，然后 `invoke('介绍一下爱因斯坦')`；直接读 `response.tool_calls`。
  - 要点：结构化数据不再走“让模型吐 JSON 文本”，而是走工具调用的 args 通道，通常更稳定、可控。
- 06-with-structured-output.ts
  - 主题：`model.withStructuredOutput(zodSchema)` 的最简结构化调用。
  - 做法：`const structuredModel = model.withStructuredOutput(schema);` 然后 `structuredModel.invoke(...)` 直接得到对象。
  - 要点：这是对 `bindTools/解析器` 的进一步封装：你只关心 schema 与结果对象。
- 07-stream-normal.ts
  - 主题：普通文本 流式输出（不结构化）。
  - 做法：`model.stream(prompt)`，`for await` 逐 chunk 拼接 `fullContent`，并实时 `stdout.write`。
  - 要点：展示流式 API 的基本用法：chunk 计数、拼接全文、实时打印。
- 08-stream-with-structured-output.ts
  - 主题：`withStructuredOutput` 的 流式结构化输出。
  - 做法：`structuredModel.stream(prompt)`，逐 chunk 打印 `JSON.stringify(chunk)`；最后用“最后一个 chunk”当最终结果做格式化输出。
  - 要点：这里把“结构化”也带入 streaming；chunk 可能是逐步完善的对象（不同模型/实现可能表现不同）。
- 09-stream-structured-partial.ts
  - 主题：流式拿到的是文本，最后再一次性解析成结构化对象。
  - 做法：用 `StructuredOutputParser.fromZodSchema(schema)` 生成格式指令；`model.stream(prompt+instructions)` 收集 `fullContent`；最终 `await parser.parse(fullContent)`。
  - 要点：这是一个很实用的折中：流式展示给用户看，同时在末尾做一次“结构化落盘”。
- 10-stream-tool-calls-raw.ts
  - 主题：流式 Tool Calling 的底层形态：直接看 `tool_call_chunks`。
  - 做法：`modelWithTool.stream(...)`，在每个 chunk 里如果存在 `chunk.tool_call_chunks`，就 `stdout.write(chunk.tool_call_chunks[0].args)`。
  - 要点：你会看到 `args` 可能是被拆成很多片段的字符串（增量 JSON 片段），需要你自己处理“拼接/去重/何时完成”。
- 11-stream-tool-calls-parser.ts
  - 主题：用 `JsonOutputToolsParser` 把 tool calls 解析成更好用的结构。
  - 做法：`const chain = modelWithTool.pipe(new JsonOutputToolsParser())`；然后 `chain.stream(...)`；每个 chunk 里拿 `chunk[0].args` 打印。
  - 要点：把“增量 tool_call_chunks → 结构化 toolCall”这步交给 parser/chain，避免自己手搓拼接逻辑（代码里也保留了一个“按长度增量输出”的注释方案）。
- 12-xml-output-parser.ts
  - 主题：`XMLOutputParser`：让模型输出 XML，再解析。
  - 做法：prompt 加 `parser.getFormatInstructions()`；`await parser.parse(contentStr)` 得到解析结果。
  - 要点：除 JSON 外的另一种“结构化文本协议”。适合某些更偏标记语言/强分隔的场景。



## 不同方式选择

- 只做 demo：`01/07`
- 要结构化但能容忍偶发格式问题：`03/12`
- 要强校验、复杂嵌套：`04`
- 要最稳定的结构化（像 API）：`06`（或 `05`）
- 要流式 + 最终可用结构化结果：`09`（工具调用流式则倾向 `11`）