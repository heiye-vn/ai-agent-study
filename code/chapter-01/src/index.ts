import { env } from '@ai-agent/shared';

console.log('环境变量加载成功:');
console.log(`  Model: ${env.OPENAI_MODEL_NAME}`);
console.log(`  Base URL: ${env.OPENAI_BASE_URL}`);
console.log(`  API Key: ${env.OPENAI_API_KEY}`);
