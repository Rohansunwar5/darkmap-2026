import { validateRequest } from '.';
import { isRequired } from '../../utils/validator.utils';

export const signupValidator = [
  isRequired('firstName'),
  isRequired('lastName'),
  isRequired('isdCode', true),
  isRequired('phoneNumber', true),
  isRequired('email'),
  isRequired('password'),
  ...validateRequest
];

export const loginValidator = [
  isRequired('email'),
  isRequired('password'),
  ...validateRequest
];
