import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import {
  genericLogin, profile, signup, 
} from '../controllers/auth.controller';
import { loginValidator,signupValidator} from '../middlewares/validators/auth.validator';
import isLoggedIn from '../middlewares/isLoggedIn.middleware';
import isAdminLoggedIn from '../middlewares/isAdminLoggedIn.middleware';

const authRouter = Router();

authRouter.post('/login', loginValidator, asyncHandler(genericLogin));
authRouter.post('/signup', isAdminLoggedIn, signupValidator, asyncHandler(signup));
authRouter.get('/profile', isLoggedIn, asyncHandler(profile));

export default authRouter;