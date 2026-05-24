import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*', // 允许所有来源
    credentials: true, // 允许跨域携带cookie等凭证
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
