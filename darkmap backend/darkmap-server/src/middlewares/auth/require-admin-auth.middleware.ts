import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../errors/unauthorized.error';

const requireAdminAuth = (
    req: Request,
    _res: Response,
    next: NextFunction,
) => {
    if (!req.admin) {
        throw new UnauthorizedError();
    }
    next();
};

export default requireAdminAuth;
