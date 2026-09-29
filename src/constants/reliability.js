import colors from './colors';

// The one place the reliability rule lives. Five screens show it and they must
// never disagree.
//
// Only resolved forfeits count: done (proof approved) plus ducked (no proof in 7
// days). A forfeit still inside its 7 days counts nowhere. Never shown as a
// percentage, 2 of 3 would read as 67% when it is one missed forfeit.
export const PROOF_DAYS = 7;

const LEVELS = {
  new:      { key: 'new',      label: 'New',      emoji: '⚪', color: colors.textSecondary },
  reliable: { key: 'reliable', label: 'Reliable', emoji: '✅', color: colors.reliable },
  mixed:    { key: 'mixed',    label: 'Mixed',    emoji: '⚠️', color: colors.mixed },
  risky:    { key: 'risky',    label: 'Risky',    emoji: '⛔', color: colors.unreliable },
};

export function getReliability(done = 0, ducked = 0) {
  const resolved = done + ducked;
  // Checked first, otherwise someone who ducked 2 of 2 hides behind New.
  if (ducked >= 2) return LEVELS.risky;
  if (resolved < 3) return LEVELS.new;
  const rate = done / resolved;
  if (rate >= 0.8) return LEVELS.reliable;
  if (rate >= 0.5) return LEVELS.mixed;
  return LEVELS.risky;
}

export function reliabilityDetail(done = 0, ducked = 0) {
  const resolved = done + ducked;
  if (resolved === 0) return 'No forfeits resolved yet';
  return `Delivered ${done} of ${resolved} forfeit${resolved === 1 ? '' : 's'}`;
}

// PROOF_DAYS after a moment: the loser's deadline counts from settled_at, the
// winner's review deadline from proof_submitted_at. The database uses the same.
export function daysAfter(timestamp, days = PROOF_DAYS) {
  if (!timestamp) return null;
  return new Date(new Date(timestamp).getTime() + days * 24 * 60 * 60 * 1000);
}

// A rejection gives the loser at least this long to send new proof, so one on
// day 6 is not an instant missed forfeit. After MAX_REJECTIONS the winner can
// only approve. Both mirror 20260929000000_reject_proof.sql.
export const REJECT_GRACE_DAYS = 2;
export const MAX_REJECTIONS = 2;

// The loser's deadline: the later of PROOF_DAYS after the match and
// REJECT_GRACE_DAYS after the last rejection.
export function proofDeadline(challenge) {
  const base = daysAfter(challenge.settled_at);
  const grace = daysAfter(challenge.proof_rejected_at, REJECT_GRACE_DAYS);
  if (!base || !grace) return base || grace;
  return grace > base ? grace : base;
}
