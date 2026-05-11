import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AiModule } from './ai/ai.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { ServeStaticModule } from '@nestjs/serve-static';

@Module({
  imports: [
    AiModule,
    // 静态资源访问
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
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
          host: configService.get<string>('QQ_MAIL_HOST'),
          port: Number(configService.get<string>('QQ_MAIL_PORT')),
          secure: configService.get<string>('QQ_MAIL_SECURE') === 'true',
          auth: {
            user: configService.get<string>('QQ_MAIL_USER'),
            pass: configService.get<string>('QQ_MAIL_PASS'),
          },
        },
        defaults: {
          from: configService.get<string>('QQ_MAIL_FROM'),
          // from: `No Reply <${configService.get('QQ_MAIL_FROM')}>`,
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
