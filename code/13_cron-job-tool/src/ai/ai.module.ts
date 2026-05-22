import { MailerService } from '@nestjs-modules/mailer';
import { join } from 'path';
import { config } from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ConfigService } from '@nestjs/config';
import { UserService } from './user.service';
import z from 'zod';
import { tool } from '@langchain/core/tools';
import { UsersModule } from 'src/users/users.module';
import { UsersService } from 'src/users/users.service';
import { JobService } from 'src/job/job.service';
import { JobModule } from 'src/job/job.module';
import { ToolModule } from 'src/tool/tool.module';

@Module({
  imports: [UsersModule, ToolModule, JobModule],
  controllers: [AiController],
  providers: [
    AiService,
    UserService,
    {
      provide: 'QUERY_DATABASE_USER_TOOL',
      useFactory: (userService: UserService) => {
        const queryUserArgsSchema = z.object({
          userId: z.string().describe('用户 ID，例如: 001, 002, 003'),
        });

        return tool(
          async ({ userId }: { userId: string }) => {
            const user = userService.findOne(userId);

            if (!user) {
              const availableIds = userService
                .findAll()
                .map((u) => u.id)
                .join(', ');

              return `用户ID ${userId} 不存在，可用的 ID: ${availableIds}`;
            }

            return `用户信息：\n- ID: ${user.id}\n- 姓名: ${user.name}\n- 邮箱: ${user.email}\n- 角色: ${user.role}`;
          },
          {
            name: 'query_user',
            description:
              '查询数据库中的用户信息，输入用户 ID，返回该用户的详细信息（姓名、邮箱、角色）。',
            schema: queryUserArgsSchema,
          }
        );
      },
      inject: [UserService],
    },
  ],
})
export class AiModule {}
