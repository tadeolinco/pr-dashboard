/** Omitted from the pending-reviews table when they have zero open requests. */
export const PENDING_REVIEWS_HIDE_WHEN_ZERO_LOGINS = new Set([
  "kevintenguc",
  "tomokolouie",
  "ViolaMK",
]);

export function showPendingReviewsTableRow(reviewer: {
  login: string;
  count: number;
}): boolean {
  if (reviewer.count > 0) return true;
  return !PENDING_REVIEWS_HIDE_WHEN_ZERO_LOGINS.has(reviewer.login);
}
