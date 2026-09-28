import { CustomError } from './custom.error';

export class PaymentRequired extends CustomError {
  statusCode = 402;

  reason = 'Payment Required';

  constructor(message?: string) {
    super(message || 'Bad Request');
    if (message) {
      this.reason = message;
    }
    Object.setPrototypeOf(this, PaymentRequired.prototype);
  }

  serializeErrors() {
    return [{
      message: this.reason
    }];
  }
}
