import mongoose from 'mongoose';

export type ActivityActionType = 
  | 'BOOKMARK_CREATED' 
  | 'BOOKMARK_UPDATED'
  | 'BOOKMARK_DELETED'
  | 'BOOKMARK_SCRAPED'
  | 'DECOY_SESSION_STARTED' 
  | 'DECOY_INTERVENTION'
  | 'DECOY_CHAT_OPENED'
  | 'AI_ANALYSIS_RUN' 
  | 'GROUP_SEARCHED' 
  | 'LOGIN';

const activityLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actionType: {
      type: String,
      required: true,
      enum: [
        'BOOKMARK_CREATED',
        'BOOKMARK_UPDATED',
        'BOOKMARK_DELETED',
        'BOOKMARK_SCRAPED',
        'DECOY_SESSION_STARTED',
        'DECOY_INTERVENTION',
        'DECOY_CHAT_OPENED',
        'AI_ANALYSIS_RUN',
        'GROUP_SEARCHED',
        'LOGIN',
      ],
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    entityModel: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Optimize for fetching a user's chronological activity feed quickly
activityLogSchema.index({ userId: 1, createdAt: -1 });

// TTL Index: Automatically delete documents 30 days (2592000 seconds) after their creation
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export interface IActivityLog extends mongoose.Document {
  _id: string;
  userId: string | mongoose.Types.ObjectId;
  actionType: ActivityActionType;
  entityId: string | mongoose.Types.ObjectId | null;
  entityModel: string | null;
  metadata: any;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);
