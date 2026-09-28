import mongoose, { Document, Schema } from "mongoose";

export interface IOTP extends Document {
    email: string;
    otp: string;
    createdAt: Date;
}

const OTPSchema: Schema = new Schema(
    {
        email: { type: String, required: true },
        otp: { type: String, required: true },
        createdAt: { type: Date, default: Date.now, expires: 300 }, // Expires in 5 minutes (300 seconds)
    },
    { timestamps: true }
);

export default mongoose.model<IOTP>("OTP", OTPSchema);
