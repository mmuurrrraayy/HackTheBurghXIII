export type GoalSafetyDecision = 'allow' | 'block' | 'review';

export type GoalSafetyCategory =
  | 'safe_navigation'
  | 'legitimate_security_testing'
  | 'credential_theft'
  | 'unauthorized_access'
  | 'fraud_or_financial_exploitation'
  | 'sensitive_data_theft'
  | 'external_site_abuse'
  | 'safety_bypass'
  | 'ambiguous'
  | 'safety_service_unavailable';

export interface GoalSafetyResult {
  decision: GoalSafetyDecision;
  reason: string;
  category: GoalSafetyCategory;
}

export interface GoalSafetyClassifier {
  classify(goal: string): Promise<GoalSafetyResult>;
}
