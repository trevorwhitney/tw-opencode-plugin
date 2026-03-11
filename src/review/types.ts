export type PromptSet = {
  round1A: (target: string) => string;
  round1B: (target: string) => string;
  round2A: (round1A: string, round1B: string) => string;
  round2B: (round1A: string, round1B: string) => string;
  synthesis: (r1a: string, r1b: string, r2a: string, r2b: string) => string;
};

export type PhaseResult = {
  text: string;
  error?: string;
};

export type PipelineResults = {
  round1A: PhaseResult;
  round1B: PhaseResult;
  round2A: PhaseResult;
  round2B: PhaseResult;
};
