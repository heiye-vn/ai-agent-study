import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};

const apiKey = envVars.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
const ai = new GoogleGenAI({ apiKey });

/**
 * 示例 1: 使用 LangChain (@langchain/google-genai) 进行文本对话
 */
async function testLangChainChat() {
  console.log('=== 1. LangChain 文本对话示例 ===');
  try {
    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-3.6-flash',
      maxOutputTokens: 2048,
      apiKey,
    });

    const response = await model.invoke('请写一首关于人工智能的短诗（4句以内）');
    console.log('输出:\n' + response.content);
  } catch (err: any) {
    console.log('⚠️ 文本生成提示:', err.message || err);
  }
}

/**
 * 示例 2: 使用 Google 官方 SDK (@google/genai) 调用 Imagen 3 进行文生图并保存到当前目录
 */
async function testImagenTextToImage() {
  console.log('\n=== 2. Google Imagen 文生图示例 ===');

  const prompt = '生成一个手持发光水晶的可爱未来风机器人，数字艺术，细节丰富。';
  console.log(`提示词: "${prompt}"`);
  console.log('正在请求 Google Imagen 3 生成图片...');

  // 推荐使用的官方 Imagen 3 / Imagen 4 图像生成模型名称
  const imageModel = 'gemini-3.1-flash-image';

  try {
    const response = await ai.models.generateImages({
      model: imageModel,
      prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '1:1',
      },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      // 1. 获取图片 Base64 字符串
      const base64Data = response.generatedImages[0].image.imageBytes;
      const buffer = Buffer.from(base64Data, 'base64');

      // 2. 指定保存路径：保存到当前文件所在目录下的 google-imagen-output.jpeg
      const outputPath = path.resolve(__dirname, './google-imagen-output.jpeg');
      fs.writeFileSync(outputPath, buffer);

      console.log(`✅ 图片生成成功！已保存到当前目录: ${outputPath}`);
    } else {
      console.log('⚠️ 未获取到生成的图片数据');
    }
  } catch (error: any) {
    console.log(`ℹ️ 文生图提示: ${error.message || error}`);
  }
}

async function main() {
  //   await testLangChainChat();
  await testImagenTextToImage();
}

main();
