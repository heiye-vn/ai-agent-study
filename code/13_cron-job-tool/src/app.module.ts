import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    // 配置 ConfigModule
    ConfigModule.forRoot({
      isGlobal: true, // 设置为全局
      envFilePath: join(__dirname, '../../../.env'), // 明确指定 .env 文件路径
    }),
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
