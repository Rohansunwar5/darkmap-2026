import { ActivityLogRepository, activityLogRepository as defaultRepo } from '../repository/activityLog.repository';
import { TeamRepository } from '../repository/team.repository';
import { ForbiddenError } from '../errors/forbidden.error';
import { ActivityActionType } from '../models/activityLog.model';
import redisClient from './cache/index';
import config from '../config';
import logger from '../utils/logger';

export default class ActivityLogService {
    constructor(
        private activityLogRepository: ActivityLogRepository,
        private teamRepository: TeamRepository
    ) {}

    public async getUserActivityLog(
        requestUserId: string, 
        targetUserId: string, 
        teamRole: string, 
        teamId: string | null, 
        isSuperAdmin: boolean = false,
        page: number = 1, 
        limit: number = 100,
        actionTypesFilter?: string
    ) {
        // Enforce visibility limits
        if (requestUserId !== targetUserId && !isSuperAdmin) {
            // Only Admins can query other users' data
            if (teamRole !== 'admin') {
                throw new ForbiddenError('You can only view your own activity.');
            }
            
            if (!teamId) {
                throw new ForbiddenError('You are not associated with any team.');
            }

            // Verify the target user is actually a spawn of this Admin
            const team = await this.teamRepository.findById(teamId);
            if (!team) {
                throw new ForbiddenError('Team not found.');
            }

            const memberIds = team.members.map(id => id.toString());
            if (!memberIds.includes(targetUserId)) {
                throw new ForbiddenError('Target user is not a member of your team.');
            }
        }

        // Fetch paginated data
        return await this.activityLogRepository.getActivities({
            userId: targetUserId,
            page,
            limit,
            actionTypes: actionTypesFilter ? actionTypesFilter.split(',') : undefined
        });
    }

    // Helper for internal use to track activities seamlessly
    public async trackActivity(userId: string, actionType: ActivityActionType, metadata: Record<string, unknown> = {}, entityId?: string, entityModel?: string) {
        try {
            await this.activityLogRepository.insertActivity({
                userId,
                actionType,
                metadata,
                entityId,
                entityModel
            });
        } catch (error) {
            // Log error but don't fail the primary request since activity logging shouldn't break core flow
            logger.error('[ActivityLogService] Failed to track activity:', error);
        }
    }

    /**
     * Count how many team users currently have an active JWT session in Redis.
     *
     * Uses SCAN (non-blocking, O(1) per iteration) instead of KEYS (O(N) full
     * keyspace scan that blocks the Redis event loop in production).
     *
     * Key format produced by CacheManager: `${SERVER_NAME}_encoded-JWT_${sessionId}_${userId}`
     * The userId is always the last segment after the final underscore, but since
     * sessionId can also contain underscores we match with a broader pattern and
     * then check the userId in-memory.
     */
    public async getActiveUsersCount(teamId: string | null, requestUserId: string): Promise<number> {
        let userIdsToCheck: string[] = [requestUserId];
        
        if (teamId) {
            const team = await this.teamRepository.findById(teamId);
            if (team && team.adminId.toString() === requestUserId) {
                userIdsToCheck = [requestUserId, ...team.members.map(id => id.toString())];
            }
        }

        const activeUserIds = new Set<string>();
        const keyPrefix = `${config.SERVER_NAME}_encoded-JWT_`;

        try {
            // SCAN is O(1) per call and never blocks the Redis event loop, unlike KEYS
            for await (const key of redisClient.scanIterator({ MATCH: `${keyPrefix}*`, COUNT: 100 })) {
                for (const uid of userIdsToCheck) {
                    if (key.includes(uid)) {
                        activeUserIds.add(uid);
                    }
                }
                // Early exit: if all users are accounted for, stop scanning
                if (activeUserIds.size === userIdsToCheck.length) break;
            }
        } catch (error) {
            logger.error('[ActivityLogService] Failed to fetch active users count from Redis:', error);
            // Fallback to 0 active users instead of crashing the activity feed
            return 0;
        }
        
        return activeUserIds.size;
    }
}
