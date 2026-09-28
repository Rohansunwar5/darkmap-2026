import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import {
  genericLogin, profile, signup, verify2FA,
} from '../controllers/auth.controller';
import { loginValidator, signupValidator, verify2FAValidator } from '../middlewares/validators/auth.validator';
import isLoggedIn from '../middlewares/isLoggedIn.middleware';
import { authLimiter, twoFaLimiter } from '../middlewares/rate-limit.middleware';


const authRouter = Router();

authRouter.post('/login', authLimiter, loginValidator, asyncHandler(genericLogin));
authRouter.post('/login/verify-2fa', twoFaLimiter, verify2FAValidator, asyncHandler(verify2FA));
authRouter.post('/signup', authLimiter, signupValidator, asyncHandler(signup));
authRouter.get('/profile', isLoggedIn, asyncHandler(profile));
// authRouter.post('/delete-account', isLoggedIn, deleteAccountValidator, asyncHandler(deleteAccount));

export default authRouter;