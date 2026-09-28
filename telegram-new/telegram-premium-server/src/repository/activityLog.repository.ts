import activityLogModel, { IActivityLog, ActivityActionType } from '../models/activityLog.model';
import logger from '../utils/logger';

export interface IGetActivityParams {
    userId: string;
    page: number;
    limit: number;
    actionTypes?: string[];
}

export interface IInsertActivityParams {
    userId: string;
    actionType: ActivityActionType;
    entityId?: string;
    entityModel?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
}

export class ActivityLogRepository {
    /**
     * Paginated activity fetch using cursor-based counting.
     * We run find + countDocuments in parallel to cut latency in half.
     * The compound index { userId, createdAt: -1 } covers both operations.
     */
    public async getActivities({ userId, page, limit, actionTypes }: IGetActivityParams) {
        const skip = (page - 1) * limit;

        const query: any = { userId };
        if (actionTypes && actionTypes.length > 0) {
            const regexStr = actionTypes.map(t => `^${t}`).join('|');
            query.actionType = { $regex: regexStr, $options: 'i' };
        }

        const [logs, total] = await Promise.all([
            activityLogModel.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            activityLogModel.countDocuments(query)
        ]);

        return {
            data: logs,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Fire-and-forget insert. Callers should .catch() to avoid unhandled rejections.
     */
    public async insertActivity(params: IInsertActivityParams): Promise<IActivityLog> {
        const log = new activityLogModel(params);
        return await log.save();
    }

    /**
     * Count login events for a specific user within a date range.
     * Useful for login history summaries.
     */
    public async countByAction(userId: string, actionType: ActivityActionType, since?: Date): Promise<number> {
        const filter: Record<string, unknown> = { userId, actionType };
        if (since) {
            filter.createdAt = { $gte: since };
        }
        return await activityLogModel.countDocuments(filter);
    }
}

// Shared singleton — import this instead of creating `new ActivityLogRepository()` everywhere.
export const activityLogRepository = new ActivityLogRepository();
