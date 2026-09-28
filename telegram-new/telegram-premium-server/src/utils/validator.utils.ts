import { ValidationChain, check } from 'express-validator';
import { Middleware } from 'express-validator/src/base';
import { BadRequestError } from '../errors/bad-request.error';

export const checkValidate = (validator: ValidationChain, optional = false): Middleware => {
  if (optional) return validator?.optional();
  return validator;

};

export const isMongoId = (key: string, optional?: boolean): Middleware => {
  return checkValidate(check(key).isMongoId().withMessage(`Invalid ${key}`), optional);
};

export const isNumeric = (key: string, optional?: boolean): Middleware => {
  return checkValidate(check(key).isNumeric().withMessage(`${key} should be numeric`), optional);
};

export const isIn = (key: string, values: unknown[], optional?: boolean): Middleware => {
  return checkValidate(check(key)
    .isIn(values)
    .withMessage(`${key} should be ${values.join(', ')} only.`), optional);
};

export const isBoolean = (key: string, optional?: boolean): Middleware => {
  return checkValidate(check(key)
    .isBoolean()
    .withMessage(`${key} should be boolean.`), optional);
};

export const isRequired = (key: string, optional?: boolean): Middleware => {
  return checkValidate(check(key)
    .trim()
    .notEmpty()
    .withMessage(`${key} is required.`), optional);
};

export const isMaxRequired = ({ key, limit, optional }: { key: string, limit: number, optional?: boolean }): Middleware => {
  return checkValidate(check(key)
    .trim()
    .notEmpty()
    .withMessage(`${key} is required.`)
    .isLength({ max: limit })
    .withMessage(`${key} should not exceed ${limit} characters.`), optional);
};

export const isArray = (key: string, optional?: boolean): Middleware => {
  return checkValidate(check(key)
    .isArray()
    .withMessage(`${key} should be an array.`), optional);
};

export const isGreaterThanZero = ({ key, allowZero = false, optional = false }: { key: string, allowZero?: boolean, optional?: boolean }): Middleware => {
  return checkValidate(check(key)
    .custom((value) => {
      if (isNaN(Number(value))) throw new BadRequestError(`${key} should be number only.`);
      if (allowZero ? Number(value) < 0 : Number(value) <= 0) throw new BadRequestError(`${key} should be greater than ${allowZero ? 'or equal to ' : ''}zero.`);
      return true;
    }), optional);
};

export const isValidDate = (key: string, optional?: boolean): Middleware => {
  return checkValidate(check(key)
    .custom((data) => {
      if (new Date(data).toString() === 'Invalid Date') throw new Error(`Invalid Date format for ${key}.`);
      return true;
    }), optional);
};

export const isStringOrArrayOfString = (key: string, optional?: boolean): Middleware => {
  return checkValidate(check(key).
    custom((value) => {
      if (typeof value === 'string' || (Array.isArray(value) && value.every(item => typeof item === 'string'))) {
        return true;
      } else return false;
    }).withMessage(`${key} should be a string or an array of string`), optional);
};