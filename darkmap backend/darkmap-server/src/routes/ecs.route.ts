import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import isAdminLoggedIn from '../middlewares/isAdminLoggedIn.middleware';
import {
    deleteInfrastructure,
    createInfrastructure,
    startServices,
    deleteInfrastructure2,
    createInfrastructure2,
} from '../controllers/ecs.controller';

const ecsRouter = Router();

// All routes protected by admin middleware
ecsRouter.post('/delete', isAdminLoggedIn, asyncHandler(deleteInfrastructure));
ecsRouter.post('/create', isAdminLoggedIn, asyncHandler(createInfrastructure));

ecsRouter.post('/delete-2', isAdminLoggedIn, asyncHandler(deleteInfrastructure2));
ecsRouter.post('/create-2', isAdminLoggedIn, asyncHandler(createInfrastructure2));

ecsRouter.post('/start-services', isAdminLoggedIn, asyncHandler(startServices));

export default ecsRouter;
