import { Router } from 'express';
import { getActivityFeed, getTeamMembers, exportActivityFeed } from '../controllers/activityLog.controller';
import { asyncHandler } from '../utils/asynchandler';
import getAuthMiddlewareByJWTSecret from '../middlewares/auth/verify-token.middleware';
import config from '../config';

const activityLogRouter = Router();

// Apply auth middleware to all activity routes
activityLogRouter.use(getAuthMiddlewareByJWTSecret(config.JWT_SECRET));

// GET /api/v1/activity/team
activityLogRouter.get('/team', asyncHandler(getTeamMembers));

// GET /api/v1/activity/export
activityLogRouter.get('/export', asyncHandler(exportActivityFeed));

// GET /api/v1/activity?targetUserId=...&page=1&limit=50
activityLogRouter.get('/', asyncHandler(getActivityFeed));

export default activityLogRouter;
