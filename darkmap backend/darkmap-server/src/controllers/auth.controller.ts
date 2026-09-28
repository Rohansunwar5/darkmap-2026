import { NextFunction, Request, Response } from 'express';
import authService from '../services/auth.service';
import adminService from '../services/admin.service';
import { NotFoundError } from '../errors/not-found.error';

export const genericLogin = async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;
  try {
    const response = await authService.login({ email, password });
    next(response);
  } catch (error) {
    if (error instanceof NotFoundError) {
      try {
        const adminResponse = await adminService.login({ email, password });
        next(adminResponse);
      } catch (adminError) {
        next(adminError);
      }
    } else {
      next(error);
    }
  }
};

export const signup = async (req: Request, res: Response, next: NextFunction) => {
  const { firstName, lastName, email, password } = req.body;
  const response = await authService.signup({ firstName, lastName, email, password });

  next(response);
};

export const profile = async (req: Request, res: Response, next: NextFunction) => {
  const { _id } = req.user;
  const response = await authService.profile(_id);

  next(response);
};
