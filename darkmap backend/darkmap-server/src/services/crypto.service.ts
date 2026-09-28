import crypto from 'crypto';

export const encode = async (value: string, key: Buffer) => {
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  let encryptedData = cipher.update(value, 'utf8', 'hex');
  encryptedData += cipher.final('hex');

  return { iv: iv.toString('hex'), encryptedData };
};

export const decode = async (encodedData: { iv: string, encryptedData: string }, key: Buffer) => {
  const iv = Buffer.from(encodedData.iv, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

  let decryptedData = decipher.update(encodedData.encryptedData, 'hex', 'utf8');
  decryptedData += decipher.final('utf8');

  return decryptedData;
};

export const generateKey = async () => {
  return crypto.randomBytes(32);
};

export const encryptionKey = async (encryptionKeyHex: string) => {
  return Buffer.from(encryptionKeyHex, 'hex');
};