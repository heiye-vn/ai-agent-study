import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    // 全局启用验证管道，自动转换和验证请求数据
    new ValidationPipe({
      transform: true,
    })
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
