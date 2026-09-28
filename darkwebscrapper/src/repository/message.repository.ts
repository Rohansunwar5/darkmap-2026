import { MessageModel, IMessage } from '../models/message.model';

export class MessageRepository {
  /**
   * Searches for messages strictly keeping logic inside Mongoose
   */
  async searchMessagesByText(query: string): Promise<IMessage[]> {
    const raw = await MessageModel.find(
      { $text: { $search: query } },
      { content: 1, _id: 0, date: 1, Mid: 1 }
    ).lean();
    return raw as unknown as IMessage[];
  }

  /**
   * Scraper utility: Get the maximum Mid currently in the database
   */
  async getHighestMid(): Promise<number | null> {
    const lastMsg = await MessageModel.findOne().sort({ Mid: -1 }).lean();
    return lastMsg ? lastMsg.Mid : null;
  }

  /**
   * Scraper utility: Check if message exists by Mid
   */
  async messageExists(mid: number): Promise<boolean> {
    const exists = await MessageModel.exists({ Mid: mid });
    return exists !== null;
  }

  /**
   * Scraper utility: Insert a batch of messages ignoring duplicates
   */
  async insertMessages(messages: any[]): Promise<void> {
    // ordered: false allows it to silently ignore duplicate keys and keep inserting the rest
    await MessageModel.insertMany(messages, { ordered: false });
  }
}
