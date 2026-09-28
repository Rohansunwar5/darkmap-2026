import { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
//@ts-ignore
import xss from 'xss-clean';
import mongoSanitize from 'express-mongo-sanitize';
import { asyncHandler } from '../../utils/asynchandler';

export const validateRequest = [xss(), mongoSanitize(), asyncHandler((req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      message: errors?.array()?.[0]?.msg || 'Validation failed',
    });
  }
  else {
    next();
  }
})];
