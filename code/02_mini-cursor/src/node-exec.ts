import { spawn } from 'node:child_process';
import * as os from 'node:os';

const isWindows = os.platform() === 'win32';

/* 执行 cmd 命令测试 */
// 根据操作系统选择命令
// // const command = isWindows ? 'dir' : 'ls -la';

// // const command = '(echo. & echo n & echo.) | pnpm create vite react-todo-app --template react-ts';    // Mac/Linux 兼容
// const command = 'echo -e "n\nn" | pnpm create vite react-todo-app --template react-ts'; // windows 兼容

// const cwd = process.cwd();

// // 解析命令和参数
// const [cmd, ...args] = isWindows ? ['cmd', '/c', command] : command.split(' ');

// const child = spawn(cmd, args, {
//   cwd,
//   stdio: 'inherit', // 继承父进程的 stdio
//   shell: true,
// });

// let errorMsg = '';

// child.on('error', (error) => {
//   errorMsg = error.message;
// });

// child.on('close', (code) => {
//   if (code === 0) {
//     process.exit(0);
//   } else {
//     if (errorMsg) {
//       console.error(`错误：${errorMsg}`);
//     }
//     process.exit(code || 1);
//   }
// });

/* 创建脚手架项目测试 - 跨平台通用 */
const child = spawn('pnpm', ['create', 'vite', 'react-todo-app', '--template', 'react-ts'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true,
});

const inputs = ['\n', 'n\n', '\n'];
let inputIndex = 0;

child.stdin!.on('ready', () => {
  console.log('开始自动输入...');
});

// 依次写入输入
const writeInput = () => {
  if (inputIndex < inputs.length) {
    child.stdin!.write(inputs[inputIndex]);
    inputIndex++;
    // 延迟一下，确保上一个输入被处理
    setTimeout(writeInput, 500);
  } else {
    child.stdin!.end(); // 输入结束
  }
};

// 启动输入流程
setTimeout(writeInput, 1000);

child.on('error', (error) => {
  console.error(`执行错误: ${error.message}`);
});

child.on('close', (code) => {
  if (code === 0) {
    console.log('项目创建成功！');
  } else {
    console.error(`命令退出码: ${code}`);
  }
});
