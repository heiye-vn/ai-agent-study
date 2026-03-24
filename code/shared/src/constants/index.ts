// 常量配置
export const DEFAULT_MODEL = 'gpt-4';
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 2048;
export const MAX_TOKENS_LIMIT = 8192;

export const API_ENDPOINTS = {
  CHAT: '/v1/chat/completions',
  EMBEDDINGS: '/v1/embeddings',
  MODELS: '/v1/models',
};

export const MODEL_FAMILIES = {
  GPT_3: 'gpt-3.5-turbo',
  GPT_4: 'gpt-4',
  GPT_4_TURBO: 'gpt-4-turbo',
  GPT_4O: 'gpt-4o',
};

export const ROLE_COLORS = {
  system: '\x1b[31m', // 红色
  user: '\x1b[32m',   // 绿色
  assistant: '\x1b[34m', // 蓝色
  reset: '\x1b[0m',
};

export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
};