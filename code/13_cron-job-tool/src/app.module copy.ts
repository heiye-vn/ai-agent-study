import { Module, Inject, OnApplicationBootstrap } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AiModule } from './ai/ai.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { User } from './users/entities/user.entity';
import { CronExpression, ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { JobModule } from './job/job.module';
import { Job } from './job/entities/job.entity';

@Module({
  imports: [
    // 定时任务模块
    ScheduleModule.forRoot(),
    // 数据库配置
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('MYSQL_HOST'),
        port: Number(configService.get<string>('MYSQL_PORT')),
        username: configService.get<string>('MYSQL_USER'),
        password: configService.get<string>('MYSQL_PASSWORD'),
        database: 'cron_job_tool',
        synchronize: true,
        connectorPackage: 'mysql2',
        logging: true,
        entities: [User, Job],
      }),
    }),
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
    AiModule,
    UsersModule,
    JobModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

// 测试三种定时任务
// export class AppModule implements OnApplicationBootstrap {
//   @Inject(SchedulerRegistry)
//   schedulerRegistry: SchedulerRegistry;

//   async onApplicationBootstrap() {
//     const job = new CronJob(CronExpression.EVERY_SECOND, () => {
//       console.log('run job');
//     });
//     this.schedulerRegistry.addCronJob('job1', job);
//     job.start();
//     setTimeout(() => {
//       this.schedulerRegistry.deleteCronJob('job1');
//     }, 5000);

//     const intervalRef = setInterval(() => {
//       console.log('run interval job');
//     }, 1000);
//     this.schedulerRegistry.addInterval('interval1', intervalRef);
//     setTimeout(() => {
//       this.schedulerRegistry.deleteInterval('interval1');
//     }, 5000);

//     const timeoutRef = setTimeout(() => {
//       console.log('run timeout job');
//     }, 3000);
//     this.schedulerRegistry.addTimeout('timeout1', timeoutRef);
//     setTimeout(() => {
//       this.schedulerRegistry.deleteTimeout('timeout1');
//     }, 5000);
//   }
// }
