import { validateRequest } from '.';
import { isRequired } from '../../utils/validator.utils';

export const adminSignupValidator = [
    isRequired('name'),
    isRequired('number'),
    isRequired('email'),
    isRequired('password'),
    ...validateRequest
];

export const adminLoginValidator = [
    isRequired('email'),
    isRequired('password'),
    ...validateRequest
];
