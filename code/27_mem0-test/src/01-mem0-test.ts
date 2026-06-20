import dotenv from 'dotenv';
import { MemoryClient, type Message } from 'mem0ai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const USER_ID = 'demo-user';

function log(title: string, data: any) {
  console.log(`\n=== ${title} ===`);
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

async function main() {
  const client = new MemoryClient({ apiKey: envVars.MEM0_API_KEY });

  //   const conversation: Message[] = [
  //     { role: 'user', content: '我是素食主义者，而且对坚果过敏。' },
  //     { role: 'assistant', content: '好的，我会记住你的饮食偏好。' },
  //     { role: 'user', content: '我住在北京，平时喜欢跑步。' },
  //     { role: 'assistant', content: '已记录：北京、爱好跑步。' },
  //   ];

  //   const added = await client.add(conversation, { userId: USER_ID });
  //   log('添加记忆', added);

  //   const searchResult = await client.search('用户的饮食限制是什么？中文回答', {
  //     filters: { user_id: USER_ID },
  //     topK: 5,
  //   });
  //   log('搜索记忆', searchResult);

  //   const allMemories = await client.getAll({
  //     filters: { user_id: USER_ID },
  //     pageSize: 10,
  //   });
  //   log('获取所有记忆', allMemories);

  //   const firstMemory = allMemories.results?.[0] ?? searchResult.results?.[0];
  //   if (firstMemory?.id) {
  //     const memory = await client.get(firstMemory.id);
  //     log('获取单个记忆', memory);

  //     const updated = await client.update(firstMemory.id, {
  //       text: `${memory.memory ?? firstMemory.memory}（已通过示例脚本更新）`,
  //     });
  //     log('更新记忆', updated);

  //     const history = await client.history(firstMemory.id);
  //     log('记忆变更历史', history);
  //   }

  if (process.argv.includes('--cleanup')) {
    const deleted = await client.deleteAll({ userId: USER_ID });
    log('清理测试数据', deleted);
  } else {
    console.log('\n请运行：tsx src/01-mem0-test.ts --cleanup 以清理测试数据。');
  }
}

main().catch((error) => {
  console.error(`\n执行失败：${error.message ?? error}`);
  if (error.suggestion) {
    console.error(`\n建议：${error.suggestion}`);
  }
  process.exit(1);
});
