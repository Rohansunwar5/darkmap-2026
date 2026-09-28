import { NextFunction, Request, Response } from 'express';
import { activityLogRepository } from '../repository/activityLog.repository';
import { TeamRepository } from '../repository/team.repository';
import ActivityLogService from '../services/activityLog.service';
import User from '../models/user.model';
import { ForbiddenError } from '../errors/forbidden.error';

const teamRepository = new TeamRepository();
const activityLogService = new ActivityLogService(activityLogRepository, teamRepository);

export const getActivityFeed = async (req: Request, res: Response, next: NextFunction) => {
    // These come from the verify-token.middleware.ts
    const { _id: requestUserId, teamRole, teamId, isSuperAdmin } = req.user as any;
    
    // Admin can pass ?targetUserId=... to view a spawn's activity.
    // Normal/Spawn users default to their own ID.
    const targetUserId = (req.query.targetUserId as string) || requestUserId.toString();
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const actionTypesFilter = req.query.actionTypes as string | undefined;

    try {
        const response = await activityLogService.getUserActivityLog(
            requestUserId.toString(),
            targetUserId,
            teamRole || 'none',
            teamId || null,
            isSuperAdmin,
            page,
            Math.min(limit, 100), // Ensure limit never exceeds 100
            actionTypesFilter
        );

        const activeUsersCount = await activityLogService.getActiveUsersCount(
            null, // Only check the specific target user, not the whole team
            targetUserId 
        );
        
        // This project uses 'next(response)' pattern for sending standard success responses in controllers
        next({ ...response, activeUsersCount, statusCode: 200, msg: 'Activity feed fetched' });
    } catch (error) {
        next(error);
    }
};

export const exportActivityFeed = async (req: Request, res: Response, next: NextFunction) => {
    const { _id: requestUserId, teamRole, teamId, isSuperAdmin } = req.user as any;
    const targetUserId = (req.query.targetUserId as string) || requestUserId.toString();
    
    try {
        const response = await activityLogService.getUserActivityLog(
            requestUserId.toString(),
            targetUserId,
            teamRole || 'none',
            teamId || null,
            isSuperAdmin,
            1,
            10000,
            undefined
        );

        next({ ...response, statusCode: 200, msg: 'Activity feed exported' });
    } catch (error) {
        next(error);
    }
};

export const getTeamMembers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { _id: requestUserId, teamRole, teamId, isSuperAdmin } = req.user as any;
        
        if (isSuperAdmin) {
            const accounts = await User.find({}).select('_id firstName lastName email').lean();
            return next({ accounts, statusCode: 200, msg: 'Team members fetched successfully' });
        }

        // Fetch the user's own profile first
        const user = await User.findById(requestUserId).select('_id firstName lastName email').lean();
        if (!user) throw new ForbiddenError('User not found');
        
        const accounts = [user];

        // If the user is an admin of a team, fetch all their spawn accounts
        if (teamRole === 'admin' && teamId) {
            const team = await teamRepository.findById(teamId);
            if (team && team.members.length > 0) {
                const members = await User.find({ _id: { $in: team.members } })
                    .select('_id firstName lastName email')
                    .lean();
                accounts.push(...members);
            }
        }

        next({ accounts, statusCode: 200, msg: 'Team members fetched successfully' });
    } catch (error) {
        next(error);
    }
};
