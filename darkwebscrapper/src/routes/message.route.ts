import { Router } from 'express';
import { searchMessages } from '../controllers/message.controller';
import { validateSearchQuery } from '../middlewares/validator';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/search', validateSearchQuery, asyncHandler(searchMessages));

export default router;
