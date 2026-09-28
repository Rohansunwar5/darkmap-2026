// Python 3.12 urllib.parse.urlsplit / urlunsplit, including the ValueError cases REF's helpers catch.
import { isIP } from 'node:net';
import { ValueError } from '../errors.js';

const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*$/;
const USES_NETLOC = new Set(['', 'ftp', 'http', 'gopher', 'nntp', 'telnet', 'imap', 'wais', 'file', 'mms', 'https',
  'shttp', 'snews', 'prospero', 'rtsp', 'rtsps', 'rtspu', 'rsync', 'svn', 'svn+ssh', 'sftp', 'nfs', 'git', 'git+ssh',
  'ws', 'wss', 'itms-services']);

function checkBracketedHost(hostname) {
  if (hostname.startsWith('v')) {
    if (!/^v[a-fA-F0-9]+\..+$/su.test(hostname)) throw new ValueError('IPvFuture address is invalid');
  } else if (isIP(hostname) !== 6) {
    throw new ValueError(isIP(hostname) === 4 ? 'An IPv4 address cannot be in brackets' : 'invalid IP');
  }
}
// Mirrors the splitting in SplitResult.hostname (Python _check_bracketed_netloc).
function checkBracketedNetloc(netloc) {
  const hostAndPort = netloc.slice(netloc.lastIndexOf('@') + 1);
  const open = hostAndPort.indexOf('[');
  if (open < 0) {
    checkBracketedHost(hostAndPort.split(':')[0]);
    return;
  }
  if (open > 0) throw new ValueError('Invalid IPv6 URL');
  const bracketed = hostAndPort.slice(open + 1);
  const close = bracketed.indexOf(']');
  const hostname = close < 0 ? bracketed : bracketed.slice(0, close);
  const port = close < 0 ? '' : bracketed.slice(close + 1);
  if (port && !port.startsWith(':')) throw new ValueError('Invalid IPv6 URL');
  checkBracketedHost(hostname);
}
function checkNetloc(netloc) {
  if (!netloc || /^[\x00-\x7f]*$/.test(netloc)) return;
  const n = netloc.replaceAll('@', '').replaceAll(':', '').replaceAll('#', '').replaceAll('?', '');
  const normalized = n.normalize('NFKC');
  if (n === normalized) return;
  for (const c of '/?#@:') {
    if (normalized.includes(c)) throw new ValueError(`netloc '${netloc}' contains invalid characters under NFKC normalization`);
  }
}

function hostnameOf(netloc) {
  const hostinfo = netloc.slice(netloc.lastIndexOf('@') + 1);
  const open = hostinfo.indexOf('[');
  let hostname;
  if (open >= 0) {
    const bracketed = hostinfo.slice(open + 1);
    const close = bracketed.indexOf(']');
    hostname = close < 0 ? bracketed : bracketed.slice(0, close);
  } else {
    hostname = hostinfo.split(':')[0];
  }
  if (!hostname) return null;
  const percent = hostname.indexOf('%');   // an IPv6 zone id keeps its case
  return percent < 0 ? hostname.toLowerCase() : hostname.slice(0, percent).toLowerCase() + hostname.slice(percent);
}

export function urlsplit(url) {
  let rest = String(url).replace(/^[\x00-\x20]+/, '').replace(/[\t\r\n]/g, '');
  let scheme = '';
  let netloc = '';
  let query = '';
  let fragment = '';
  const colon = rest.indexOf(':');
  if (colon > 0 && SCHEME_RE.test(rest.slice(0, colon))) {
    scheme = rest.slice(0, colon).toLowerCase();
    rest = rest.slice(colon + 1);
  }
  if (rest.startsWith('//')) {
    const tail = rest.slice(2);
    const cut = tail.search(/[/?#]/);
    netloc = cut < 0 ? tail : tail.slice(0, cut);
    rest = cut < 0 ? '' : tail.slice(cut);
    if (netloc.includes('[') !== netloc.includes(']')) throw new ValueError('Invalid IPv6 URL');
    if (netloc.includes('[')) checkBracketedNetloc(netloc);
  }
  const hash = rest.indexOf('#');
  if (hash >= 0) [rest, fragment] = [rest.slice(0, hash), rest.slice(hash + 1)];
  const question = rest.indexOf('?');
  if (question >= 0) [rest, query] = [rest.slice(0, question), rest.slice(question + 1)];
  checkNetloc(netloc);
  return { scheme, netloc, path: rest, query, fragment, hostname: hostnameOf(netloc) };
}

export function urlunsplit([scheme, netloc, path, query, fragment]) {
  let url = path;
  if (netloc) {
    if (url && url[0] !== '/') url = `/${url}`;
    url = `//${netloc}${url}`;
  } else if (url.slice(0, 2) === '//') {
    url = `//${url}`;
  } else if (scheme && USES_NETLOC.has(scheme) && (!url || url[0] === '/')) {
    url = `//${url}`;
  }
  if (scheme) url = `${scheme}:${url}`;
  if (query) url = `${url}?${query}`;
  if (fragment) url = `${url}#${fragment}`;
  return url;
}
