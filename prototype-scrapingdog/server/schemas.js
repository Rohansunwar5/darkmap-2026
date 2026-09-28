// REF darkmap/schemas.py request models (defaults, bounds, literals) with Pydantic v2 lax coercion. A violation
// raises HttpError(422, [{type, loc, msg, input}]) in FastAPI's shape; unknown keys are ignored.
import { pyLen, pyRepr } from './engine/pycompat.js';
import { HttpError } from './errors.js';

class Invalid {
  constructor(type, msg, ctx = null) { Object.assign(this, { type, msg, ctx }); }
}
const invalid = (type, msg, ctx) => { throw new Invalid(type, msg, ctx); };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const str = ({ min = null, max = null } = {}) => value => {
  if (typeof value !== 'string') invalid('string_type', 'Input should be a valid string');
  const length = pyLen(value);
  if (min != null && length < min) invalid('string_too_short', `String should have at least ${plural(min, 'character')}`, { min_length: min });
  if (max != null && length > max) invalid('string_too_long', `String should have at most ${plural(max, 'character')}`, { max_length: max });
  return value;
};
export const int = ({ ge = null, le = null } = {}) => value => {
  let n;
  if (typeof value === 'number' && Number.isInteger(value)) n = value;
  else if (typeof value === 'number' && Number.isFinite(value)) invalid('int_from_float', 'Input should be a valid integer, got a number with a fractional part');
  else if (typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value)) n = Number(value);
  else if (typeof value === 'string') invalid('int_parsing', 'Input should be a valid integer, unable to parse string as an integer');
  else invalid('int_type', 'Input should be a valid integer');
  if (ge != null && n < ge) invalid('greater_than_equal', `Input should be greater than or equal to ${ge}`, { ge });
  if (le != null && n > le) invalid('less_than_equal', `Input should be less than or equal to ${le}`, { le });
  return n;
};
export const float = () => value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return invalid(typeof value === 'string' ? 'float_parsing' : 'float_type',
    typeof value === 'string' ? 'Input should be a valid number, unable to parse string as a number' : 'Input should be a valid number');
};
const TRUE = ['1', 'on', 't', 'true', 'y', 'yes'];
const FALSE = ['0', 'off', 'f', 'false', 'n', 'no'];
export const bool = () => value => {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 1) return value === 1;
  if (typeof value === 'string' && TRUE.includes(value.trim().toLowerCase())) return true;
  if (typeof value === 'string' && FALSE.includes(value.trim().toLowerCase())) return false;
  return invalid(typeof value === 'string' ? 'bool_parsing' : 'bool_type', 'Input should be a valid boolean');
};
export const literal = values => value => {
  if (values.includes(value)) return value;
  const shown = values.map(pyRepr);
  return invalid('literal_error', `Input should be ${shown.length > 1 ? `${shown.slice(0, -1).join(', ')} or ${shown.at(-1)}` : shown[0]}`,
    { expected: shown.join(', ') });
};
export const optional = type => value => (value == null ? null : type(value));
export const list = (type, { max = null } = {}) => value => {
  if (!Array.isArray(value)) invalid('list_type', 'Input should be a valid list');
  if (max != null && value.length > max) {
    invalid('too_long', `List should have at most ${plural(max, 'item')} after validation, not ${value.length}`,
      { field_type: 'List', max_length: max, actual_length: value.length });
  }
  return value.map(type);
};
const dict = () => value => (value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value : invalid('dict_type', 'Input should be a valid dictionary'));

// Fields in model order (a subclass keeps its parent's positions, as Pydantic does). `fieldsSet` mirrors
// model_fields_set for PATCH semantics.
function model(fields, { optionalBody = false } = {}) {
  return body => {
    if (body === undefined || body === null) {
      if (optionalBody) body = {};
      else throw new HttpError(422, [{ type: 'missing', loc: ['body'], msg: 'Field required', input: null }]);
    }
    if (typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(422, [{ type: 'model_attributes_type', loc: ['body'],
        msg: 'Input should be a valid dictionary or object to extract fields from', input: body }]);
    }
    const out = {};
    const errors = [];
    const fieldsSet = new Set();
    for (const [name, spec] of Object.entries(fields)) {
      if (Object.hasOwn(body, name)) {
        fieldsSet.add(name);
        try {
          out[name] = spec.type(body[name]);
        } catch (error) {
          if (!(error instanceof Invalid)) throw error;
          errors.push({ type: error.type, loc: ['body', name], msg: error.msg, input: body[name],
            ...(error.ctx ? { ctx: error.ctx } : {}) });
        }
      } else if (Object.hasOwn(spec, 'default')) {
        out[name] = typeof spec.default === 'function' ? spec.default() : spec.default;
      } else {
        errors.push({ type: 'missing', loc: ['body', name], msg: 'Field required', input: body });
      }
    }
    if (errors.length) throw new HttpError(422, errors);
    Object.defineProperty(out, 'fieldsSet', { value: fieldsSet });
    return out;
  };
}

const stringList = { type: list(str()), default: () => [] };
export const parseBrandIn = model({ name: { type: str() }, official_handles: stringList, official_domains: stringList,
  keywords: stringList });

const SCRAPE_FIELDS = {
  provider: { type: literal(['auto', 'meta', 'bright_data']), default: 'auto' },
  mode: { type: literal(['account', 'owned', 'hashtag_recent', 'hashtag_top', 'keyword', 'tagged']), default: 'account' },
  query: { type: str({ max: 200 }), default: '' },
  brand_id: { type: optional(int()), default: null },
  max_items: { type: int({ ge: 1, le: 500 }), default: 100 },
  page_size: { type: int({ ge: 1, le: 100 }), default: 50 },
  max_pages: { type: int({ ge: 1, le: 20 }), default: 10 },
  include_comments: { type: bool(), default: true },
  comments_per_post: { type: int({ ge: 1, le: 100 }), default: 50 },
  profile_limit: { type: int({ ge: 0, le: 50 }), default: 25 },
  analyze: { type: bool(), default: true },
  fresh: { type: bool(), default: false },
};
export const parseScrapeIn = model(SCRAPE_FIELDS);
export const parseSearchPageIn = model({
  ...SCRAPE_FIELDS,
  mode: { type: literal(['keyword']), default: 'keyword' },
  // A result page can contain as many as 50 accounts; request metadata for the whole page.
  profile_limit: { type: int({ ge: 0, le: 50 }), default: 50 },
  batch_size: { type: literal([50]), default: 50 },
  continuation: { type: optional(str({ max: 1_800_000 })), default: null },
});
export const parseAnalyzeIn = model({ brand_id: { type: optional(int()), default: null },
  media_analysis: { type: optional(list(dict())), default: null }, inline: { type: bool(), default: false } },
{ optionalBody: true });

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const artifactIds = { type: list(int(), { max: 500 }), default: () => [] };
export const parseCaseIn = model({
  title: { type: str({ min: 2, max: 300 }) },
  campaign_id: { type: optional(int()), default: null },
  assessment_id: { type: optional(int()), default: null },
  priority: { type: literal(PRIORITIES), default: 'high' },
  assignee: { type: optional(str({ max: 200 })), default: null },
  notes: { type: optional(str({ max: 5000 })), default: null },
  artifact_ids: artifactIds,
});
export const parseCaseUpdate = model({
  status: { type: optional(literal(['open', 'investigating', 'takedown_submitted', 'resolved', 'false_positive'])),
    default: null },
  priority: { type: optional(literal(PRIORITIES)), default: null },
  assignee: { type: optional(str({ max: 200 })), default: null },
  disposition: { type: optional(str({ max: 80 })), default: null },
  notes: { type: optional(str({ max: 5000 })), default: null },
  artifact_ids: artifactIds,
});
