import { Schema, model, Document } from 'mongoose';

export interface IMessage extends Document {
  content: string;
  Mid: number;
  date: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    content: { type: String, required: true },
    Mid: { type: Number, unique: true, required: true },
    date: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ content: 'text' });
messageSchema.index({ date: -1 });

export const MessageModel = model<IMessage>('Message', messageSchema);
