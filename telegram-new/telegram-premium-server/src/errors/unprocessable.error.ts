import { CustomError } from './custom.error';

export class UnprocessableError extends CustomError {
  statusCode = 422;

  reason = 'Unprocessable Error';

  constructor(message?: string) {
    super(message || 'Unprocessable Error');
    if (message) {
      this.reason = message;
    }
    Object.setPrototypeOf(this, UnprocessableError.prototype);
  }


  serializeErrors() {
    return [{ message: 'Unprocessable Error' }];
  }
}