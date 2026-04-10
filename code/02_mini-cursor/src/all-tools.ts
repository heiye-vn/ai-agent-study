import { tool } from '@langchain/core/tools';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import * as os from 'node:os';

const isWindows = os.platform() === 'win32';

// 1. 读取文件工具
const readFileTool = tool(
  async ({ filePath }) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(`   [工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字节`);
      return `文件内容:\n${content}`;
    } catch (error: any) {
      console.log(`   [工具调用] read_file("${filePath}") - 错误: ${error.message}`);
      return `读取文件失败: ${error.message}`;
    }
  },
  {
    name: 'read_file',
    description: '读取指定路径的文件内容',
    schema: z.object({
      /*
            describe 是对前面变量（filePath）的一个描述，描述的越清楚，AI 就会更精准执行
        */
      filePath: z.string().describe('要读取的文件路径（相对于当前工作目录，例如 "package.json"）'),
      //   filePath: z.string().describe('目标文件的路径，例如 "src/main.ts"'),
    }),
  }
);

// 2. 写入文件工具
const writeFileTool = tool(
  async ({ filePath, content }) => {
    try {
      const dir = path.dirname(filePath); // 提取目录路径
      await fs.mkdir(dir, { recursive: true }); // 递归创建目录（如果不存
      await fs.writeFile(filePath, content, 'utf-8'); // 写入文件
      console.log(`   [工具调用] write_file("${filePath}") - 成功写入 ${content.length} 字节`);
      return `文件写入成功：${filePath}`;
    } catch (error: any) {
      console.log(`   [工具调用] write_file("${filePath}") - 错误: ${error.message}`);
      return `写入文件失败: ${error.message}`;
    }
  },
  {
    name: 'write_file',
    description: '向指定路径写入文件内容，自动创建目录',
    schema: z.object({
      // 优化点1：告诉 AI 可以包含目录，且目录不存在也没关系
      filePath: z
        .string()
        .describe('目标文件的完整路径（包含文件名）。如果目录不存在，工具会自动创建。'),
      // 优化点2：明确内容格式，防止 AI 混淆
      content: z.string().describe('要写入文件的完整文本内容。'),
    }),
  }
);

// 3. 执行命令工具
// const executeCommandTool = tool(
//   async ({ command, workingDirectory }) => {
//     const cwd = workingDirectory || process.cwd();
//     console.log(
//       `   [工具调用] execute_command("${command}")${workingDirectory ? ` - 工作目录:${workingDirectory}` : ''}`
//     );
//     return new Promise((resolve, reject) => {
//       // 解析命令和参数
//       const [cmd, ...args] = isWindows ? ['cmd', '/c', command] : command.split(' ');

//       const child = spawn(cmd, args, {
//         cwd,
//         stdio: 'inherit', // 实时输出到控制台
//         shell: true,
//       });

//       let errorMsg = '';

//       child.on('error', (error) => {
//         errorMsg = error.message;
//       });

//       child.on('close', (code) => {
//         if (code === 0) {
//           console.log(`  [工具调用] execute_command("${command}") - 执行成功`);
//           const cwdInfo = workingDirectory
//             ? `\n\n重要提示：命令在目录 "${workingDirectory}" 中执行成功。如果需要在这个项目目录中继续执行命令，请使用 workingDirectory: "${workingDirectory}" 参数，不要使用 cd 命令。`
//             : '';
//           resolve(`命令执行成功。${command}${cwdInfo}`);
//         } else {
//           console.log(`   [工具调用] execute_command("${command}") - 执行失败，退出码：${code}`);
//           resolve(`命令执行失败，退出码: ${code}${errorMsg ? '\n错误: ' + errorMsg : ''}`);
//         }
//       });
//     });
//   },
//   {
//     name: 'execute_command',
//     description: '执行系统命令，支持指定工作目录，实时显示输出',
//     schema: z.object({
//       command: z
//         .string()
//         .describe('要执行的命令，例如 "windows系统的 dir, mac/linux系统的 ls -al"'),
//       workingDirectory: z.string().optional().describe('工作目录（推荐指定）'),
//     }),
//   }
// );

// 3. 执行命令工具(优化改进版)
const executeCommandTool = tool(
  async ({ command, workingDirectory }) => {
    const cwd = workingDirectory || process.cwd();

    // 简单的安全过滤（示例：禁止 rm -rf /）
    // 在实际生产环境中，这里需要更复杂的白名单或沙箱机制
    const dangerousPatterns = ['rm -rf /', 'format', 'deltree'];
    if (dangerousPatterns.some((p) => command.toLowerCase().includes(p))) {
      return `安全拦截：检测到危险命令模式，禁止执行。`;
    }

    console.log(`   [工具调用] execute_command("${command}") - 目录: ${cwd}`);

    return new Promise((resolve) => {
      // 注意：这里不再 reject，而是统一 resolve 错误信息给 AI
      const [cmd, ...args] = isWindows ? ['cmd', '/c', command] : command.split(' ');

      const child = spawn(cmd, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'], // 修改：捕获 stdout 和 stderr
        shell: isWindows, // 修改：保持与之前逻辑一致，Windows 下使用 shell
        timeout: 30000, // 新增：30秒超时，防止 AI 卡死进程
      });

      let stdoutData = '';
      let stderrData = '';

      // 监听标准输出
      child.stdout?.on('data', (data) => {
        const str = data.toString();
        stdoutData += str;
        // 可选：如果想在服务端控制台实时看，可以取消下面这行的注释
        process.stdout.write(str);
      });

      // 监听错误输出
      child.stderr?.on('data', (data) => {
        const str = data.toString();
        stderrData += str;
        // process.stderr.write(str);
      });

      child.on('error', (err) => {
        resolve(`命令执行出错: ${err.message}`);
      });

      child.on('close', (code) => {
        // 构建返回给 AI 的信息
        let resultMessage = '';

        if (code === 0) {
          // 成功：返回输出内容
          // 如果输出为空，给个提示
          const output = stdoutData.trim() || '(命令执行成功，无标准输出)';
          resultMessage = `命令执行成功。\n输出内容:\n${output}`;
        } else {
          // 失败：返回错误信息，这对 AI 调试很重要
          resultMessage = `命令执行失败 (退出码: ${code})。\n错误输出:\n${stderrData || stdoutData}`;
        }

        // 附加路径提示
        if (workingDirectory) {
          resultMessage += `\n\n[提示] 此命令是在目录 "${workingDirectory}" 下执行的。后续相关操作请继续指定此工作目录。`;
        }

        resolve(resultMessage);
      });

      // 处理超时
      child.on('timeout', () => {
        child.kill();
        resolve(`命令执行超时 (超过 30 秒)，已强制终止。请检查命令是否包含死循环或交互式操作。`);
      });
    });
  },
  {
    name: 'execute_command',
    description:
      '在系统终端执行 Shell 命令。适用于文件操作、运行脚本、安装依赖等。注意：不要用于启动交互式程序（如 vim, python 控制台）。',
    schema: z.object({
      command: z
        .string()
        .describe(
          '要执行的 Shell 命令字符串。注意区分操作系统：Windows 系统使用 "dir", "type" 等命令；Mac/Linux 系统使用 "ls", "cat" 等命令。不要用于启动交互式程序。'
        ),
      workingDirectory: z
        .string()
        .optional()
        .describe('命令执行的工作目录路径。强烈建议指定此参数，而不是在命令中使用 "cd"。'),
    }),
  }
);

// 4. 列出目录内容工具
const listDirectoryTool = tool(
  async ({ directoryPath }) => {
    try {
      // 1. 读取目录，withFileTypes: true 可以同时获取文件名和类型（文件/目录）
      const entries = await fs.readdir(directoryPath, { withFileTypes: true });

      // 2. 排序：让目录排在前面，或者按字母排序，方便 AI 阅读
      entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1; // 目录在前
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name); // 同名类型下按字母排序
      });

      // 3. 限制数量：防止 node_modules 等超大目录撑爆上下文
      const MAX_ITEMS = 100;
      const truncated = entries.length > MAX_ITEMS;
      const displayEntries = truncated ? entries.slice(0, MAX_ITEMS) : entries;

      // 4. 格式化输出：加上 [DIR] 或 [FILE] 前缀
      const formattedList = displayEntries
        .map((entry) => {
          const type = entry.isDirectory() ? 'DIR' : 'FILE';
          return `- [${type}] ${entry.name}`;
        })
        .join('\n');

      const result = `目录内容 (${directoryPath}):\n${formattedList}${truncated ? `\n\n... 还有 ${entries.length - MAX_ITEMS} 个项目未显示（数量过多已截断）。` : ''}`;

      console.log(
        `   [工具调用] list_directory("${directoryPath}") - 找到 ${entries.length} 个项目`
      );
      return result;
    } catch (error: any) {
      console.log(`   [工具调用] list_directory("${directoryPath}") - 错误: ${error.message}`);
      return `列出目录失败: ${error.message}`;
    }
  },
  {
    name: 'list_directory',
    description:
      '列出指定目录下的文件和子文件夹（包含类型标记）。注意：如果目录包含大量文件（如 node_modules），结果会被截断。',
    schema: z.object({
      directoryPath: z
        .string()
        .describe('要查看的目录路径。建议使用绝对路径或相对于工作区的根路径。'),
    }),
  }
);

export { readFileTool, writeFileTool, executeCommandTool, listDirectoryTool };
