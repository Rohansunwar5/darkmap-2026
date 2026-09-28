import mongoose, { Document, Schema } from "mongoose";

export interface IFormRequest extends Document {
  firstname: string;
  lastname: string;
  email: string;
  phone?: string;
  info?: string;
  remark?: string;
  source?: string;
  isVerified: boolean;
  createdAt: Date;
}

const FormRequestSchema: Schema = new Schema(
  {
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    info: { type: String },
    remark: { type: String },
    source: { type: String },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<IFormRequest>("FormRequest", FormRequestSchema);
