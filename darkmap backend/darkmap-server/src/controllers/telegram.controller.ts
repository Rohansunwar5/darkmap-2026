import { NextFunction, Request, Response } from "express";
import telegramService from "../services/telegram.service";
import aiService from "../services/ai.service";
import axios from "axios";

export const searchChannels = async (req: Request, res: Response, next: NextFunction) => {
    const { search_query } = req.body;
    const response = await telegramService.searchChannels(search_query as string);

    // Rank by the scraped channel descriptions before returning. Fails open.
    next(await aiService.rankChannels(search_query as string, response));
}

export const searchChannelsAdvanced = async (req: Request, res: Response, next: NextFunction) => {
    const { search_query, include_keywords, exclude_keywords } = req.body;
    const response = await telegramService.searchChannelsAdvanced(
        search_query as string,
        include_keywords as string[],
        exclude_keywords as string[]
    );

    next(await aiService.rankChannels(search_query as string, response));
}

export const additionalChannel = async (req: Request, res: Response, next: NextFunction) => {
    const { search_query, channel_name, include_keywords, exclude_keywords } = req.body;
    const response = await telegramService.additionalChannel(
        search_query, channel_name,
        include_keywords as string[], exclude_keywords as string[]
    );

    next(response);
}
export const channelMessages = async (req: Request, res: Response, next: NextFunction) => {
    const { search_query, channel_name, include_keywords, exclude_keywords } = req.body;
    const response = await telegramService.channelMessages(
        search_query, channel_name,
        include_keywords as string[], exclude_keywords as string[]
    );

    next(response);
}

export const startFirstServices = async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;
    const response = await telegramService.startFirstService(email);

    next(response);
}

export const startSecondServices = async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;
    const response = await telegramService.startSecondService(email);

    next(response);
}

export const rankMessages = async (req: Request, res: Response, next: NextFunction) => {
    const { search_query, messages } = req.body;
    const response = await aiService.rankMessages(search_query, messages);

    next(response);
}

export const analyzeChannel = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { channel_username } = req.body;
        if (!channel_username) {
            return res.status(400).json({ error: 'Channel username is required' });
        }

        const response = await telegramService.analyzeChannel(channel_username);
        res.json(response);
    } catch (error) {
        next(error);
    }
};

