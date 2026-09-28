import { NextFunction, Request, Response } from 'express';
import { BadRequestError } from '../errors/bad-request.error';
import { ConflictErrorJSON } from '../errors/conflict-custom.error';
import { ErrorButOkError } from '../errors/error-but-ok.error';
import { ForbiddenError } from '../errors/forbidden.error';
import { InternalServerError } from '../errors/internal-server.error';
import { NotFoundError } from '../errors/not-found.error';
import { TooManyRequestsError } from '../errors/too-many-request.error';
import { UnauthorizedError } from '../errors/unauthorized.error';
import { UnprocessableError } from '../errors/unprocessable.error';
import logger from './logger';
import { getLogDataFromReqObject } from './logger/index';
import { NotAllowedError } from '../errors/not-allowed.error';
import { PaymentRequired } from '../errors/payment-required.error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const asyncHandler = (fnc: (req: Request, res: Response, next: NextFunction) => void) => (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  return Promise.resolve(fnc(req, res, next)).catch((err) => {
    const reqObjectData = getLogDataFromReqObject(req);
    logger.error(`${reqObjectData} , Message -  ${JSON.stringify(err)}, Err - ${err}`);
    // config.ENV === 'development' && logger.info(err);
    let status = 500;
    let error = err.message;
    let data;
    if (err instanceof BadRequestError) {
      status = 400;
    }
    else if (err instanceof NotFoundError) {
      status = 404;
    }
    else if (err instanceof UnauthorizedError) {
      status = 401;
    }
    else if (err instanceof ForbiddenError) {
      status = 403;
    }
    else if (err instanceof UnprocessableError) {
      status = 422;
    }
    else if (err instanceof InternalServerError) {
      status = 500;
    }
    else if (err instanceof TooManyRequestsError) {
      status = 429;
    }
    else if (err instanceof ErrorButOkError) {
      status = 200;
    }
    else if (err instanceof ConflictErrorJSON) {
      status = 409;
      data = JSON.parse(err.message);
      error = 'Conflict Occured';
    }
    else if (err instanceof NotAllowedError) {
      status = 405;
    }
    else if (err instanceof PaymentRequired) {
      status = 402;
    }
    else {
      error = 'Something Unexpected Happend';
    }

    // try {
    //   // req.metrics.endTime = new Date();
    //   // const responseTimeInMs = (req.metrics.endTime.getTime() - req.metrics.startTime.getTime());
    //   // logger.info(responseTimeInMs)
    //   // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // } catch (error: any) {
    //   logger.warn(`Response Time Tracker Error - ${error.message}`);
    // }

    return res.status(status).json({
      message: error,
      data
    });
  });
};
