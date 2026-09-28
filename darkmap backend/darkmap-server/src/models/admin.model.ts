import mongoose from 'mongoose';

const PASSWORD_MIN_LENGTH = 8;

const adminSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxLength: 100,
        },
        number: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            minLength: 2,
        },
        password: {
            type: String,
            required: true,
            minLength: PASSWORD_MIN_LENGTH,
        },
    },
    { timestamps: true }
);

adminSchema.index({ email: 1 });

export interface IAdmin extends mongoose.Schema {
    _id: string;
    name: string;
    number: string;
    email: string;
    password: string;
    createdAt: Date;
    updatedAt: Date;
}

export default mongoose.model<IAdmin>('Admin', adminSchema);
