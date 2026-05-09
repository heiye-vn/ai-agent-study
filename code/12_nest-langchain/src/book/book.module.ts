import { Module } from '@nestjs/common';
import { BookService } from './book.service';
import { BookController } from './book.controller';

@Module({
  controllers: [BookController],
  providers: [
    BookService,
    {
      provide: 'BOOK_REPOSITORY',
      useFactory() {
        // 内存 mock 仓库，适合测试，无需外部依赖
        const books: { id: number; title: string }[] = [
          { id: 1, title: '《哈利·波特》' },
          { id: 2, title: '《哈利·波特与魔法石》' },
          { id: 3, title: '《哈利·波特与凤凰社》' },
          { id: 4, title: '《哈利·波特与死神stone》' },
        ];

        return {
          findAll: () => [...books],
        };
      },
    },
  ],
})
export class BookModule {}
