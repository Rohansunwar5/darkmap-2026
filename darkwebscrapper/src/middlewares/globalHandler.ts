import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';

export const globalHandler = (
  payload: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // If the payload is an Error object (Custom AppError or native Error)
  if (payload instanceof Error) {
    console.error('💥 Error Caught By GlobalHandler:', payload);

    if ('isOperational' in payload && payload.isOperational) {
      return res.status((payload as AppError).statusCode).json({
        status: 'error',
        message: payload.message,
      });
    }

    // Programming or other unknown error
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }

  // If payload is NOT an error, format as standard success response
  return res.status(200).json(payload);
};
