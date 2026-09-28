import decoyProfiles from '../data/decoyProfiles.json';

const normalizePhoneNumber = (phoneNumber) => String(phoneNumber ?? '').replace(/[^\d+]/g, '');

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&q=80';

const normalizeProfilePhoneNumber = (profilePhoneNumber) => normalizePhoneNumber(profilePhoneNumber);

export const getDecoyProfileByPhoneNumber = (phoneNumber) => {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  return decoyProfiles.find(
    (profile) => profile.phoneNumber && normalizeProfilePhoneNumber(profile.phoneNumber) === normalizedPhoneNumber
  ) ?? null;
};

export const buildDecoyAccountProfiles = (accounts = []) =>
  decoyProfiles
    .map((profile) => {
      const matchingAccount = accounts.find(
        (account) => normalizePhoneNumber(account.phoneNumber) === normalizeProfilePhoneNumber(profile.phoneNumber)
      );

      if (!matchingAccount) {
        return null;
      }

      return {
        ...matchingAccount,
        profile,
        normalizedPhoneNumber: normalizePhoneNumber(matchingAccount.phoneNumber),
      };
    })
    .filter(Boolean);

export const getWarningMeta = (warning) => {
  if (warning === 'high') {
    return { label: 'High load', className: 'text-amber-300 bg-amber-500/10 border-amber-500/30' };
  }

  if (warning === 'overloaded') {
    return { label: 'Overloaded', className: 'text-rose-300 bg-rose-500/10 border-rose-500/30' };
  }

  return null;
};

export const DEFAULT_PROFILE_AVATAR = DEFAULT_AVATAR;
