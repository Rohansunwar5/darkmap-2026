import mongoose from 'mongoose';

const PASSWORD_MIN_LENGTH = 8;

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxLength: 40,
    },
    lastName: {
      type: String,
      trim: true,
      maxLength: 40,
    },
    email: {
      type: String,
      required: true,
      minLength: 2,
    },

    password: {
      type: String,
      minLength: PASSWORD_MIN_LENGTH,
    },
    credits: {
      type: Number,
      default: 0,
    },
    clickCount: {
      type: [{
        year: Number,
        month: Number,
        count: { type: Number, default: 0 },
        resetAt: Date,
      }],
      default: [],
    },
    is2faEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      // AES-256-CBC encrypted TOTP secret: { iv, encryptedData }
      type: {
        iv: String,
        encryptedData: String,
      },
      select: false, // Never returned by default in queries
    },
    recoveryCodes: {
      type: [String],
      select: false, // Hashed backup codes, never returned by default
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },
    teamRole: {
      type: String,
      enum: ['admin', 'member', 'none'],
      default: 'none',
    },
    isSuperAdmin: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Email is the login key — must be unique. NOTE: if legacy duplicate emails exist
// in production, this index build will fail until they are de-duplicated.
userSchema.index({ email: 1 }, { unique: true });
// Sparse: only indexes users that actually belong to a team, keeping the index small.
userSchema.index({ teamId: 1 }, { sparse: true });

export interface IUser extends mongoose.Schema {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  credits: number;
  clickCount: Array<{
    year: number;
    month: number;
    count: number;
    resetAt: Date;
  }>;
  is2faEnabled: boolean;
  twoFactorSecret?: {
    iv: string;
    encryptedData: string;
  };
  recoveryCodes?: string[];
  teamId: string | mongoose.Types.ObjectId | null;
  teamRole: 'admin' | 'member' | 'none';
  isSuperAdmin: boolean;
}

export default mongoose.model<IUser>('User', userSchema);
