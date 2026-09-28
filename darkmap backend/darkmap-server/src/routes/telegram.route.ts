import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import isLoggedIn from '../middlewares/isLoggedIn.middleware';

import { additionalChannel, analyzeChannel, channelMessages, rankMessages, searchChannels, searchChannelsAdvanced, startFirstServices, startSecondServices } from '../controllers/telegram.controller';
import { channelKeywordsValidator, searchChannelsAdvancedValidator } from '../middlewares/validators/telegram.validator';

const telegramRouter = Router();

telegramRouter.post('/search-channels', isLoggedIn, asyncHandler(searchChannels));
telegramRouter.post('/search-channels-advanced', isLoggedIn, searchChannelsAdvancedValidator, asyncHandler(searchChannelsAdvanced));
telegramRouter.post('/additional-channel', isLoggedIn, channelKeywordsValidator, asyncHandler(additionalChannel));
telegramRouter.post('/channel-messages', isLoggedIn, channelKeywordsValidator, asyncHandler(channelMessages));
telegramRouter.post('/rank-messages', isLoggedIn, asyncHandler(rankMessages));
telegramRouter.post('/start-services1', asyncHandler(startFirstServices));
telegramRouter.post('/start-services2', asyncHandler(startSecondServices));
telegramRouter.post('/analyze-channel', isLoggedIn, asyncHandler(analyzeChannel));

export default telegramRouter;
