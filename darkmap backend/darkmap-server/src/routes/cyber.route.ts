import { Router } from 'express';
import isLoggedIn from '../middlewares/isLoggedIn.middleware';
import { asyncHandler } from '../utils/asynchandler';

import { ransomwareSearch, darkwebSearch, breachforumsSearch, hackcheckSearch } from '../controllers/cyber.controller';

const cyberRouter = Router();

cyberRouter.post('/ransomware', isLoggedIn, asyncHandler(ransomwareSearch));
cyberRouter.post('/darkweb', isLoggedIn, asyncHandler(darkwebSearch));
cyberRouter.post('/breachforums', isLoggedIn, asyncHandler(breachforumsSearch));
cyberRouter.post('/hackcheck', isLoggedIn, asyncHandler(hackcheckSearch));

export default cyberRouter;