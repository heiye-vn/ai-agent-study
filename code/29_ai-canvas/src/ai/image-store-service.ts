import { Injectable, NotFoundException } from '@nestjs/common';
import { ImageRecord } from './image-record-interface';
import { randomUUID } from 'node:crypto';

@Injectable()
export class ImageStoreService {
  private readonly items: ImageRecord[] = [];

  list(): ImageRecord[] {
    return [...this.items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  add(record: Omit<ImageRecord, 'id' | 'createdAt'>): ImageRecord {
    const item: ImageRecord = {
      ...record,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.items.unshift(item);
    return item;
  }

  remove(id: string): void {
    const index = this.items.findIndex((t: ImageRecord) => t.id === id);
    if (index === -1) {
      throw new NotFoundException(`Image record ${id} not found`);
    }
    this.items.splice(index, 1);
  }
}
