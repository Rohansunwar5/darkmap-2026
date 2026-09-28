import { MessageRepository } from '../repository/message.repository';
import { BadRequestError } from '../errors';

export class MessageService {
  constructor(private readonly _messageRepository: MessageRepository) { }

  async search(query: string) {
    if (!query || query.trim() === '') {
      throw new BadRequestError('Search query must be provided');
    }
    // Business rule: Only return content if you want, but repo currently returns full minimal objects
    return await this._messageRepository.searchMessagesByText(query);
  }
}
