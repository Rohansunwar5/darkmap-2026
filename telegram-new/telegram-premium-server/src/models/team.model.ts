import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

teamSchema.index({ adminId: 1 });
teamSchema.index({ members: 1 });

export interface ITeam extends mongoose.Document {
  _id: string;
  name: string;
  adminId: string | mongoose.Types.ObjectId;
  members: (string | mongoose.Types.ObjectId)[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<ITeam>('Team', teamSchema);
