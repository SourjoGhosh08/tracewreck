import { analysisStatuses, diagnosisFailureClasses, type DiagnosisReport, type EvidenceReference } from "./diagnosis-types";

const MAX_TEXT = 4_000;
const MAX_ITEMS = 32;

export class DiagnosisValidationError extends Error {
  constructor(message = "The diagnosis response did not match the required schema.") {
    super(message);
    this.name = "DiagnosisValidationError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, field: string, max = MAX_TEXT): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new DiagnosisValidationError(`Invalid diagnosis field: ${field}`);
  }
  return value.trim();
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, field);
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new DiagnosisValidationError(`Invalid diagnosis field: ${field}`);
  return value;
}

function textArray(value: unknown, field: string): string[] {
  return array(value, field).map((item, index) => text(item, `${field}[${index}]`));
}

function first(value: Record<string, unknown>, keys: string[]): unknown {
  return keys.map((key) => value[key]).find((candidate) => candidate !== undefined);
}

function referenceKey(reference: EvidenceReference): string {
  return `${reference.step_id}\u0000${reference.occurrence}`;
}

export type ReferenceValidation = {
  references: ReadonlySet<string>;
  duplicateIds: ReadonlySet<string>;
};

function parseReference(value: unknown, field: string, validation?: ReferenceValidation): EvidenceReference {
  const item = record(value);
  if (!item) throw new DiagnosisValidationError(`Invalid evidence reference: ${field}`);
  const stepId = text(first(item, ["step_id", "stepId"]), `${field}.step_id`, 300);
  const rawOccurrence = first(item, ["occurrence", "step_occurrence", "stepOccurrence"]);
  if (rawOccurrence === undefined && validation?.duplicateIds.has(stepId)) throw new DiagnosisValidationError("Diagnosis reference is ambiguous.");
  const occurrence = rawOccurrence === undefined ? 0 : rawOccurrence;
  if (typeof occurrence !== "number" || !Number.isInteger(occurrence) || occurrence < 0 || occurrence > 10_000) {
    throw new DiagnosisValidationError(`Invalid evidence reference: ${field}.occurrence`);
  }
  const reference = { step_id: stepId, occurrence };
  const key = referenceKey(reference);
  // A plain step_id is accepted for unique traces as a compatibility convenience,
  // but duplicate IDs must carry an explicit occurrence to remain unambiguous.
  if (validation && !validation.references.has(key)) {
    throw new DiagnosisValidationError("Diagnosis referenced an unknown step.");
  }
  return reference;
}

function references(value: unknown, field: string, validation?: ReferenceValidation): EvidenceReference[] {
  return array(value, field).map((item, index) => parseReference(item, `${field}[${index}]`, validation));
}

/** Validate model output and reject fabricated or ambiguous evidence citations. */
export function validateDiagnosisReport(
  value: unknown,
  allowedReferences?: ReferenceValidation | ReadonlySet<string>
): DiagnosisReport {
  const root = record(value);
  if (!root) throw new DiagnosisValidationError();
  const validation: ReferenceValidation | undefined = allowedReferences
    ? ("references" in allowedReferences ? allowedReferences : { references: allowedReferences, duplicateIds: new Set<string>() })
    : undefined;
  const schemaVersion = root.schema_version ?? root.schemaVersion ?? root.version;
  if (schemaVersion !== undefined && schemaVersion !== 1) throw new DiagnosisValidationError("Unsupported diagnosis schema version.");

  const analysisStatus = first(root, ["analysis_status", "analysisStatus"]);
  if (typeof analysisStatus !== "string" || !analysisStatuses.includes(analysisStatus as (typeof analysisStatuses)[number])) {
    throw new DiagnosisValidationError("Invalid diagnosis analysis_status.");
  }
  const failureClass = first(root, ["failure_class", "failureClass"]);
  if (typeof failureClass !== "string" || !diagnosisFailureClasses.includes(failureClass as (typeof diagnosisFailureClasses)[number])) {
    throw new DiagnosisValidationError("Invalid diagnosis failure_class.");
  }

  const rawSuspect = first(root, ["suspected_first_faulty_step_ref", "suspectedFirstFaultyStepRef"]);
  const suspect = rawSuspect === null || rawSuspect === undefined ? null : parseReference(rawSuspect, "suspected_first_faulty_step_ref", validation);

  const rawFacts = array(first(root, ["observed_facts", "observedFacts"]), "observed_facts");
  const observedFacts = rawFacts.map((value, index) => {
    const item = record(value);
    if (!item) throw new DiagnosisValidationError(`Invalid observed_facts[${index}]`);
    return {
      statement: text(first(item, ["statement", "fact"]), `observed_facts[${index}].statement`),
      supporting_step_refs: references(first(item, ["supporting_step_refs", "supportingStepRefs", "evidence"]), `observed_facts[${index}].supporting_step_refs`, validation)
    };
  });

  const rawHypotheses = array(first(root, ["hypotheses", "alternatives"]), "hypotheses");
  const hypotheses = rawHypotheses.map((value, index) => {
    const item = record(value);
    if (!item) throw new DiagnosisValidationError(`Invalid hypotheses[${index}]`);
    return {
      explanation: text(first(item, ["explanation", "hypothesis"]), `hypotheses[${index}].explanation`),
      supporting_step_refs: references(first(item, ["supporting_step_refs", "supportingStepRefs", "evidence"]), `hypotheses[${index}].supporting_step_refs`, validation),
      uncertainty_or_alternative: text(first(item, ["uncertainty_or_alternative", "uncertaintyOrAlternative", "uncertainty"]), `hypotheses[${index}].uncertainty_or_alternative`)
    };
  });

  const rawFixes = array(first(root, ["recommended_fixes", "recommendedFixes"]), "recommended_fixes");
  const recommendedFixes = rawFixes.map((value, index) => {
    const item = record(value);
    if (!item) throw new DiagnosisValidationError(`Invalid recommended_fixes[${index}]`);
    return {
      title: text(item.title, `recommended_fixes[${index}].title`),
      category: text(item.category, `recommended_fixes[${index}].category`),
      concrete_suggested_change: text(first(item, ["concrete_suggested_change", "concreteSuggestedChange", "suggested_change"]), `recommended_fixes[${index}].concrete_suggested_change`),
      supporting_evidence_refs: references(first(item, ["supporting_evidence_refs", "supportingEvidenceRefs", "evidence"]), `recommended_fixes[${index}].supporting_evidence_refs`, validation),
      implementation_considerations: text(first(item, ["implementation_considerations", "implementationConsiderations", "considerations"]), `recommended_fixes[${index}].implementation_considerations`)
    };
  });

  const rawTests = array(first(root, ["regression_test_ideas", "regressionTestIdeas"]), "regression_test_ideas");
  const regressionTests = rawTests.map((value, index) => {
    const item = record(value);
    if (!item) throw new DiagnosisValidationError(`Invalid regression_test_ideas[${index}]`);
    return {
      scenario: text(item.scenario, `regression_test_ideas[${index}].scenario`),
      expected_behavior: text(first(item, ["expected_behavior", "expectedBehavior"]), `regression_test_ideas[${index}].expected_behavior`),
      proposed_assertions: textArray(first(item, ["proposed_assertions", "proposedAssertions"]), `regression_test_ideas[${index}].proposed_assertions`)
    };
  });

  return {
    schema_version: 1,
    analysis_status: analysisStatus as DiagnosisReport["analysis_status"],
    title: text(root.title, "title"),
    summary: text(root.summary, "summary"),
    failure_class: failureClass as DiagnosisReport["failure_class"],
    suspected_first_faulty_step_ref: suspect,
    observed_facts: observedFacts,
    hypotheses,
    contributing_factors: textArray(first(root, ["contributing_factors", "contributingFactors"]), "contributing_factors"),
    observed_impact: text(first(root, ["observed_impact", "observedImpact"]), "observed_impact"),
    potential_impact: text(first(root, ["potential_impact", "potentialImpact"]), "potential_impact"),
    recommended_fixes: recommendedFixes,
    regression_test_ideas: regressionTests,
    missing_evidence: textArray(first(root, ["missing_evidence", "missingEvidence"]), "missing_evidence"),
    limitations: textArray(root.limitations, "limitations")
  };
}

export function evidenceReferenceKey(reference: EvidenceReference): string {
  return referenceKey(reference);
}
