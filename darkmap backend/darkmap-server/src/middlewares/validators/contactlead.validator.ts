import { validateRequest } from '.';
import { isRequired } from '../../utils/validator.utils';

export const contactLeadValidator = [
  isRequired('fullName'),
  isRequired('email'),
  isRequired('subject'),
  isRequired('isdCode', true),
  isRequired('phoneNumber', true),
  isRequired('message'),
  isRequired('iss'),
  ...validateRequest
];
