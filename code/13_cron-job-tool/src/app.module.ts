import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AiModule } from './ai/ai.module';
import { MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    AiModule,
    // 配置 ConfigModule
    ConfigModule.forRoot({
      isGlobal: true, // 设置为全局
      envFilePath: join(__dirname, '../../../.env'), // 明确指定 .env 文件路径
    }),
    // QQ 邮箱配置
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('MAIL_HOST'),
          port: Number(configService.get<string>('MAIL_PORT')),
          secure: configService.get<string>('MAIL_SECURE') === 'true',
          auth: {
            user: configService.get<string>('MAIL_USER'),
            pass: configService.get<string>('MAIL_PASS'),
          },
        },
        defaults: {
          from: configService.get<string>('MAIL_FROM'),
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
