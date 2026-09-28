import { NextFunction, Request, Response } from 'express';
import os from 'os';
import config from '../config';
//@ts-ignore
import { default as pjson } from '../../package.json';
import { NotFoundError } from '../errors/not-found.error';
import redisClient from '../services/cache';

const instanceRandomID = Math.random().toString();

export const notFound = () => {
  throw new NotFoundError('Route not found');
};

const latestDeployedAt = new Date().toLocaleString();

export const helloWorld = (req: Request, res: Response, next: NextFunction) => {
  let all = {};
  if (req.query.all) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    all = {
      ...all,
      totalmem: os.totalmem() / 1000000000,
      freemem: os.freemem() / 1000000000,
    };
  }
  next({
    message: 'Hello World',
    env: config.NODE_ENV,
    instance: instanceRandomID,
    version: pjson.version,
    latest: pjson.version,
    latestDeployedAt,
  });
};

export const health = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const key = 'healthCheck';
  await redisClient.setEx(key, 100, 'ok');
  const cached = await redisClient.get(key);
  await redisClient.del(key);
  next({
    redis: cached,
  });
};

export const country = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const countryCode =
    req.headers['cf-ipcountry'] || config.DEFAULT_COUNTRY_CODE;
  next(countryCode);
};
