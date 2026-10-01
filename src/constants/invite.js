import { Share } from 'react-native';

// Where the share text points people. Change it here once the app is in the
// stores, or once duelfit.io has a download page.
export const INVITE_LINK = 'https://duelfit.io';

// The invite code is the inviter's username. Register sends it as invite_code
// and 20261001000001_referrals.sql records who invited whom.
export async function shareInvite(username) {
  const code = username ? `\n\nSign up with my invite code: ${username}` : '';
  try {
    await Share.share({
      message: `Join me on DuelFit! Pick a side on a real match, and the loser does the forfeit. No money, just pride.${code}\n\n${INVITE_LINK}`,
    });
  } catch (_) {
    // Closing the share sheet is not an error worth showing
  }
}
