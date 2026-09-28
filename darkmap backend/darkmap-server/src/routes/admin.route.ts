import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import {
    adminLogin,
    adminProfile,
    adminSignup,
    getAllUsers,
} from '../controllers/admin.controller';
import { adminLoginValidator, adminSignupValidator } from '../middlewares/validators/admin.validator';
import isAdminLoggedIn from '../middlewares/isAdminLoggedIn.middleware';

const adminRouter = Router();

adminRouter.post('/login', adminLoginValidator, asyncHandler(adminLogin));
adminRouter.post('/signup', isAdminLoggedIn, adminSignupValidator, asyncHandler(adminSignup));
adminRouter.get('/profile', isAdminLoggedIn, asyncHandler(adminProfile));
adminRouter.get('/users', isAdminLoggedIn, asyncHandler(getAllUsers));

export default adminRouter;
