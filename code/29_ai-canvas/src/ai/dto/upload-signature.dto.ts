import { IsOptional, IsString } from 'class-validator';

export class UploadSignatureDto {
  @IsString()
  hash: string;

  @IsOptional()
  @IsString()
  ext?: string;
}
