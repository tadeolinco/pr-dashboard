import type { Actor, ReviewStatus } from "@/lib/types";

export type ReviewDecision =
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "REVIEW_REQUIRED"
  | null;

export type ReviewSnapshot = {
  reviewDecision: ReviewDecision;
  authorLogin?: string;
  requestedReviewers: Actor[];
  requestedTeams: { name: string }[];
  reviews: Array<Actor & { state: string }>;
};

/** Open GitHub review requests only. Comment reviews clear the request and are not pending. */
export function getPendingReviewerLogins(pr: ReviewSnapshot): Set<string> {
  return new Set(pr.requestedReviewers.map((reviewer) => reviewer.login));
}

function isExternalHumanReview(
  review: Actor & { state: string },
  authorLogin?: string,
) {
  if (review.isBot) return false;
  if (authorLogin && review.login === authorLogin) return false;
  return true;
}

function isReviewerParticipation(
  review: Actor & { state: string },
  authorLogin?: string,
) {
  if (!isExternalHumanReview(review, authorLogin)) return false;
  return (
    review.state === "APPROVED" ||
    review.state === "CHANGES_REQUESTED" ||
    review.state === "COMMENTED"
  );
}

/** Avatars to show: open requests plus changes-requested reviewers; else human review participants. */
export function getVisibleReviewerLogins(pr: ReviewSnapshot): Set<string> {
  const visible = getPendingReviewerLogins(pr);
  for (const review of pr.reviews) {
    if (
      review.state === "CHANGES_REQUESTED" &&
      isExternalHumanReview(review, pr.authorLogin)
    ) {
      visible.add(review.login);
    }
  }
  if (visible.size > 0 || pr.requestedTeams.length > 0) {
    return visible;
  }
  const logins = new Set<string>();
  for (const review of pr.reviews) {
    if (isReviewerParticipation(review, pr.authorLogin)) {
      logins.add(review.login);
    }
  }
  return logins;
}

export function deriveReviewStatus(pr: ReviewSnapshot): ReviewStatus {
  const humanReviews = pr.reviews.filter((review) =>
    isExternalHumanReview(review, pr.authorLogin),
  );
  const states = new Set(humanReviews.map((review) => review.state));
  const pendingReviewers = getPendingReviewerLogins(pr);

  // GitHub keeps the changes-requested review (and reviewDecision) after the
  // author re-requests review, so only count reviewers without an open request.
  const changesRequestedBy = humanReviews.filter(
    (review) => review.state === "CHANGES_REQUESTED",
  );
  const openChangesRequested = changesRequestedBy.some(
    (review) => !pendingReviewers.has(review.login),
  );
  const decisionChangesRequested =
    pr.reviewDecision === "CHANGES_REQUESTED" && changesRequestedBy.length === 0;

  if (openChangesRequested || decisionChangesRequested) {
    return "changes_requested";
  }
  if (pr.reviewDecision === "APPROVED") {
    return "approved";
  }
  if (pendingReviewers.size > 0 || pr.requestedTeams.length > 0) {
    return "review_requested";
  }
  if (states.has("APPROVED")) {
    return "approved";
  }
  if (humanReviews.length > 0) {
    return "commented";
  }
  return "awaiting_reviewer";
}

export function hasHumanReviewer(pr: ReviewSnapshot) {
  if (pr.requestedTeams.length > 0) return true;
  return getVisibleReviewerLogins(pr).size > 0;
}

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  awaiting_reviewer: "Needs reviewer",
  review_requested: "Review requested",
  commented: "Commented",
  changes_requested: "Changes requested",
  approved: "Approved",
  merged: "Merged",
};

export const STATUS_ORDER: ReviewStatus[] = [
  "awaiting_reviewer",
  "review_requested",
  "commented",
  "changes_requested",
  "approved",
  "merged",
];
