import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';

@Module({
  imports: [
    AiModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '../.env'), // 1. 优先读取当前项目的 .env 文件
        join(__dirname, '../../../.env'), // 2. 再读取 ai-agent-study 项目的 .env 文件
      ],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/ai/*path'], // 排除路径，防止与API路由冲突
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
