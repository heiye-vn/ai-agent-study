import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { AiService } from './ai.service';
import { ImageDto } from './dto/image.dto';
import { UploadSignatureDto } from './dto/upload-signature.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  /**
   * @description 获取 oss 上传签名
   */
  @Post('oss/upload-signature')
  getUploadSignature(@Body() dto: UploadSignatureDto) {
    return this.aiService.getUploadSignature(dto.hash, dto.ext);
  }

  /**
   * @description 获取图片列表
   */
  @Get('image/list')
  listImage() {
    return this.aiService.listImages();
  }

  @Post('image')
  createImage(@Body() dto: ImageDto) {
    return this.aiService.createImage(dto);
  }

  @Delete('image/:id')
  deleteImage(@Param('id') id: string) {
    this.aiService.deleteImage(id);
    return { ok: true };
  }

  @Post('/image/list')
  async getImageList() {}
}
