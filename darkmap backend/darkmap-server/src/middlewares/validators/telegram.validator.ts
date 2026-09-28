import { validateRequest } from './index';
import { isRequired, isArray } from '../../utils/validator.utils';
import { check } from 'express-validator';

/**
 * The advanced keywords, shared by every route that forwards them. Both are
 * optional: a normal (non-advanced) search omits them entirely and must keep
 * working exactly as before.
 */
const keywordChecks = [
    check('include_keywords').optional().isArray().withMessage('include_keywords must be an array of strings'),
    check('include_keywords.*').optional().isString().withMessage('Each include keyword must be a string'),
    check('exclude_keywords').optional().isArray().withMessage('exclude_keywords must be an array of strings'),
    check('exclude_keywords.*').optional().isString().withMessage('Each exclude keyword must be a string'),
];

export const searchChannelsAdvancedValidator = [
    isRequired('search_query'),
    ...keywordChecks,
    ...validateRequest
];

// Only the keyword shape is checked here. These two routes had no validator
// before, so adding isRequired rules could reject calls that work today.
export const channelKeywordsValidator = [
    ...keywordChecks,
    ...validateRequest
];
