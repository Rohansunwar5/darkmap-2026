import crypto from 'crypto';

export const sha1 = (text: string): string => {
  const hash = crypto.createHash('sha1').update(text).digest('hex');
  return hash;
};