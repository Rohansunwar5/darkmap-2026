/* eslint-disable @typescript-eslint/no-non-null-assertion */
import dotenv from 'dotenv';
dotenv.config();

const config = {
  MONGO_URI: process.env.MONGO_URI! as string,
  NODE_ENV: process.env.NODE_ENV! as string,
  REDIS_HOST: process.env.REDIS_HOST! as string,
  REDIS_PORT: process.env.REDIS_PORT! as string,
  PORT: process.env.PORT! as string,
  JWT_SECRET: process.env.JWT_SECRET! as string,
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET! as string,
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY! as string,

  SERVER_NAME: `${process.env.SERVER_NAME}-${process.env.NODE_ENV}`! as string,
  JWT_CACHE_ENCRYPTION_KEY: process.env.JWT_CACHE_ENCRYPTION_KEY! as string,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY! as string,
  DEFAULT_COUNTRY_CODE: 'IN',

  // Channel-discovery upstream. Unset => the original ECS fleet via /tg and
  // /tg-2. Set => the Decodo-backed Lambda, which serves both the plain and the
  // keyword (dork6) paths from one route. Flipping this back is the rollback.
  SCRAPER_URL: process.env.SCRAPER_URL as string | undefined,
  SCRAPER_API_KEY: process.env.SCRAPER_API_KEY as string | undefined,
  SCRAPER_TIMEOUT_MS: Number(process.env.SCRAPER_TIMEOUT_MS || 30000),
};

export default config;
