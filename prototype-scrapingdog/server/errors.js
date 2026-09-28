// Python-named exceptions so ported code raises and catches exactly where REF does.
import { pyFixed } from './engine/pycompat.js';

export class ValueError extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}
export class ProviderError extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}
export class ProviderNotConfigured extends ProviderError {}
export class CollectionNotPermitted extends ProviderError {}
export class FetchFailed extends Error {
  constructor(message, { statusCode = null, retryAfter = null } = {}) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}
export class SourceUnavailable extends FetchFailed {
  constructor(code, message, { statusCode = null } = {}) {
    super(message, { statusCode });
    this.code = code;
  }
}
export class NotAuthorized extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}
export class NotFound extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}
export class QuotaExceeded extends Error {
  constructor(scope, window, retryAfter) {
    super(`quota exhausted for ${scope} (${window}); retry in ${pyFixed(retryAfter, 0)}s`);
    this.name = new.target.name;
    this.scope = scope;
    this.window = window;
    this.retryAfter = retryAfter;
  }
}
export class InvalidSearchCursor extends ValueError {}
export class HttpError extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail));
    this.name = new.target.name;
    this.status = status;
    this.detail = detail;
  }
}
