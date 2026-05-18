import tencentcloud from 'tencentcloud-sdk-nodejs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsed: envVars } = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const SECRET_ID = envVars.TENCENT_SECRET_ID;
const SECRET_KEY = envVars.TENCENT_SECRET_KEY;

const AsrClient = tencentcloud.asr.v20190614.Client;
const AUDIO_FILE = path.resolve(__dirname, '../recording01.mp3');

const client = new AsrClient({
  credential: {
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
  },
  region: 'ap-shanghai',
  profile: {
    httpProfile: {
      reqMethod: 'POST',
      reqTimeout: 60,
    },
  },
});

async function run() {
  const audioBase64 = fs.readFileSync(AUDIO_FILE).toString('base64');

  const params = {
    EngSerViceType: '16k_zh',
    SourceType: 1,
    Data: audioBase64,
    DataLen: Buffer.byteLength(audioBase64),
    VoiceFormat: 'mp3',
  };

  try {
    const data = await client.SentenceRecognition(params);
    console.log('识别结果：', data.Result);
  } catch (error) {
    console.error('识别失败：', error);
  }
}

run();
