import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../errors/unauthorized.error';

const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    throw new UnauthorizedError();
  }
  next();
};

export default requireAuth;
