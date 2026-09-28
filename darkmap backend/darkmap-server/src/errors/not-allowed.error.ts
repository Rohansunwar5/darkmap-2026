import { CustomError } from './custom.error';

export class NotAllowedError extends CustomError {
  statusCode = 405;

  reason = 'Not Allowed';

  constructor(message?: string) {
    super(message || 'Not Allowed');
    if (message) {
      this.reason = message;
    }
    Object.setPrototypeOf(this, NotAllowedError.prototype);
  }

  serializeErrors() {
    return [{
      message: this.reason
    }];
  }
}
