import { NextFunction, Request, Response } from 'express';
import authService from '../services/auth.service';

export const genericLogin = async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;
  const response = await authService.login({ email, password });

  next(response);
};

export const verify2FA = async (req: Request, res: Response, next: NextFunction) => {
  const { challengeId, code } = req.body;
  const response = await authService.verify2FA({ challengeId, code });

  next(response);
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

// export const deleteAccount = async (req: Request, res: Response, next: NextFunction) => {
//   const { code } = req.body;
//   const { _id } = req.user;
//   const response = await authService.deleteAccount(code, _id);

//   next(response);
// };
