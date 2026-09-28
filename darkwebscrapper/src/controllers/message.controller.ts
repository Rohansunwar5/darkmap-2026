import { Request, Response, NextFunction } from 'express';
import { MessageRepository } from '../repository/message.repository';
import { MessageService } from '../services/message.service';

const messageRepo = new MessageRepository();
export const messageService = new MessageService(messageRepo);

export const searchMessages = async (req: Request, res: Response, next: NextFunction) => {
  const query = req.query.query as string;
  const response = await messageService.search(query);
  next(response);
};
