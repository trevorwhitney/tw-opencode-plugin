/** Label assigned to a reviewer, e.g. "Reviewer A", "Critic B". */
export type ReviewerLabel = string;

/** A single reviewer's output from one round paired with their label. */
export type LabeledReview = {
  label: ReviewerLabel;
  text: string;
};

export type PromptSet = {
  /** Generate the Round 1 (independent review) prompt for one reviewer. */
  round1: (label: ReviewerLabel, target: string) => string;

  /**
   * Generate the Round 2 (cross-review) prompt for one reviewer.
   * `ownReview` is their Round 1 text; `otherReviews` are all other reviewers'.
   */
  round2: (
    label: ReviewerLabel,
    ownReview: string,
    otherReviews: LabeledReview[],
  ) => string;

  /** Build the synthesis prompt from all rounds. */
  synthesis: (results: { label: ReviewerLabel; round1: string; round2: string }[]) => string;
};

export type PhaseResult = {
  text: string;
  error?: string;
};
