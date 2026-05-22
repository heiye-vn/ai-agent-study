import { tool } from '@langchain/core/tools';
import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import z from 'zod';

@Injectable()
export class SendMailToolService {
  readonly tool;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService
  ) {
    const sendMailArgsSchema = z.object({
      to: z
        .string()
        .refine(
          (value) => {
            // 支持单个邮箱或多个邮箱（用逗号分隔）
            const emails = value.split(',').map((email) => email.trim());
            return emails.every((email) => {
              // 使用正则表达式验证邮箱格式
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              return emailRegex.test(email);
            });
          },
          {
            message: '收件人邮箱地址格式不正确，请确保每个邮箱都符合标准格式',
          }
        )
        .describe('收件人邮箱地址，可以是单个邮箱或多个邮箱（用逗号分隔）'),
      subject: z.string().describe('邮件主题'),
      text: z.string().optional().describe('纯文本内容，可选'),
      html: z.string().optional().describe('HTML 内容，可选'),
    });

    this.tool = tool(
      async ({
        to,
        subject,
        text,
        html,
      }: {
        to: string;
        subject: string;
        text?: string;
        html?: string;
      }) => {
        const fallbackFrom = this.configService.get<string>('QQ_MAIL_FROM');

        // 将多个邮箱地址拆分成数组
        const toEmails = to.split(',').map((email) => email.trim());

        await this.mailerService.sendMail({
          to: toEmails,
          subject,
          text: text ?? '（无文本内容）',
          html: html ?? `<p>${text ?? '（无 HTML 内容）'}</p>`,
          from: fallbackFrom,
        });

        return `邮件已发送到 ${toEmails.join(', ')}，主题为「${subject}」`;
      },
      {
        name: 'send_mail',
        description: '发送电子邮件，需要提供收件人邮箱、主题，可选文本内容和 HTML 内容。',
        schema: sendMailArgsSchema,
      }
    );
  }
}
