import { query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../errors';

export const validateSearchQuery = [
  query('query')
    .isString()
    .notEmpty()
    .withMessage('Search query cannot be empty'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new BadRequestError(errors.array()[0].msg));
    }
    next();
  },
];
