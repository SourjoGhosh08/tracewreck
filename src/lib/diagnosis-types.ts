export const analysisStatuses = ["likely_failure", "no_clear_failure", "insufficient_evidence"] as const;
export type AnalysisStatus = (typeof analysisStatuses)[number];

export const diagnosisFailureClasses = [
  "incorrect_retrieval",
  "hallucinated_constraint",
  "wrong_tool_selection",
  "invalid_tool_arguments",
  "ignored_policy",
  "stale_context",
  "premature_action",
  "data_ambiguity",
  "authorization_bypass",
  "other",
  "unknown"
] as const;
export type DiagnosisFailureClass = (typeof diagnosisFailureClasses)[number];

export type EvidenceReference = {
  step_id: string;
  /** Zero-based occurrence among steps with the same recorded step_id. */
  occurrence: number;
};

export type ObservedFact = {
  statement: string;
  supporting_step_refs: EvidenceReference[];
};

export type DiagnosisHypothesis = {
  explanation: string;
  supporting_step_refs: EvidenceReference[];
  uncertainty_or_alternative: string;
};

export type RecommendedFix = {
  title: string;
  category: string;
  concrete_suggested_change: string;
  supporting_evidence_refs: EvidenceReference[];
  implementation_considerations: string;
};

export type RegressionTestIdea = {
  scenario: string;
  expected_behavior: string;
  proposed_assertions: string[];
};

/** Model-authored content. Storage and API metadata live outside this shape. */
export type DiagnosisReport = {
  schema_version: 1;
  analysis_status: AnalysisStatus;
  title: string;
  summary: string;
  failure_class: DiagnosisFailureClass;
  suspected_first_faulty_step_ref: EvidenceReference | null;
  observed_facts: ObservedFact[];
  hypotheses: DiagnosisHypothesis[];
  contributing_factors: string[];
  observed_impact: string;
  potential_impact: string;
  recommended_fixes: RecommendedFix[];
  regression_test_ideas: RegressionTestIdea[];
  missing_evidence: string[];
  limitations: string[];
};

export type DiagnosisSource = "live_model" | "demo_fixture";

export type DiagnosisTokenUsage = {
  input?: number;
  output?: number;
  total?: number;
};

export type DiagnosisMetadata = {
  report_id: string;
  run_id: string;
  source: DiagnosisSource;
  provider: string | null;
  model: string | null;
  prompt_version: string;
  schema_version: 1;
  trace_fingerprint: string;
  created_at: string;
  token_usage: DiagnosisTokenUsage | null;
  input_redacted: boolean;
  input_truncated: boolean;
  omitted_content: string[];
};

export type DiagnosisEnvelope = {
  report: DiagnosisReport;
  metadata: DiagnosisMetadata;
  attempts: number;
  cached: boolean;
};
