// PII scanner for free-text child content (zap.content, wishing_garden.response, etc.).
// Ships with a conservative regex battery + hard length cap. Not a full PII
// classifier — the product's threat model is "child accidentally types something
// identifying"; covert-channel attacks are addressed by LD-226 nesting scoping
// (only the authoring parent/child pair reads the content). Free-text scanning
// strictness graduates in a later row when reviewer ops exist.
//
// Rejection signals (per Phase 0 synthesis):
//   - length > 280 chars (forces truncation attacks to be visible)
//   - email-like, phone-like, SSN-like, street-address-number patterns
// Rejection ≠ silent strip — the CF returns violations to the client via
// the status doc so the UX can surface "try different words" rather than
// losing the child's work.

export interface PiiViolation {
  readonly reason: string;
  readonly match?: string;
}

const MAX_LENGTH = 280;

const PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { name: 'phone_us', re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { name: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'street_number', re: /\b\d{1,5}\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive|Ct|Court|Way|Pl|Place)\b/ },
  { name: 'zip_code', re: /\b\d{5}(?:-\d{4})?\b/ },
];

export function scanForPii(input: unknown): readonly PiiViolation[] {
  if (typeof input !== 'string') return [];

  const violations: PiiViolation[] = [];

  if (input.length > MAX_LENGTH) {
    violations.push({ reason: `length_${input.length}_exceeds_${MAX_LENGTH}` });
  }

  for (const { name, re } of PATTERNS) {
    const m = input.match(re);
    if (m) {
      violations.push({ reason: `pattern_${name}`, match: m[0] });
    }
  }

  return violations;
}
