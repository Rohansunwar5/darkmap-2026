import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from config.env
dotenv.config({ path: path.resolve(__dirname, '../../config.env') });

export const config = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  database: process.env.DATABASE!,
};