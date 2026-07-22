import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import OSS from 'ali-oss';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envVars = dotenv.config({ path: path.resolve(__dirname, '../../../.env') }).parsed || {};
