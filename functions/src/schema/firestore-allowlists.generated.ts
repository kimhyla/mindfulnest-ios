// GENERATED — DO NOT EDIT.
// source: content-lockfiles/firestore_schema.json sha256=62262f4756a89a7a8bb119974d1a6a0448350803dd3528bf622d240e2b149c62
// Regenerate via: node functions/scripts/gen-schema-lists.mjs

export interface CollectionFieldLists {
  readonly allowlist: readonly string[];
  readonly forbidden: readonly string[];
  readonly required: readonly string[];
}

export type CollectionName =
  | "children"
  | "clq_responses"
  | "coach_conversations"
  | "commission_events"
  | "gpr_entries"
  | "modules"
  | "parents"
  | "sessions"
  | "stripe_customers"
  | "therapist_summaries"
  | "therapists"
  | "wishing_garden_entries"
  | "zaps";

export const FIRESTORE_FIELD_LISTS: Readonly<Record<CollectionName, CollectionFieldLists>> = {
  "children": {
    allowlist: ["chatEnabled", "completions", "consent_scope", "consent_status", "created_at", "current_checkpoint_id", "current_module_id", "current_phase", "date_of_birth", "displayName", "domainSessionCounts", "engagementStatus", "gender", "inactivityNotifiedAt", "kws_parent_id", "lastActivityAt", "last_session_timestamp", "linkedParent", "linkedTherapist", "parentNotifiedSkills", "parental_consent_source", "parental_consent_verified", "preferredTechniques", "retention_clock_started_at", "sessionsThisWeek", "therapistFirstCompletionNotified", "totalSessions", "updated_at", "weekStartDate"],
    forbidden: ["address", "avatar_image", "childEmail", "child_email", "chosen_guide_name", "clinical_notes", "clq_score", "device_fingerprint", "device_id", "diagnosis", "email", "gpr_score", "ip_address", "ip_logs", "last_name", "phone", "photo_url", "school"],
    required: ["displayName", "kws_parent_id", "linkedParent", "linkedTherapist", "parental_consent_source", "parental_consent_verified"],
  },
  "clq_responses": {
    allowlist: ["administered_at", "administered_by", "childId", "is_baseline", "responses"],
    forbidden: [],
    required: ["administered_at", "administered_by", "childId"],
  },
  "coach_conversations": {
    allowlist: ["created_at", "messages", "monthly_message_count", "parentId"],
    forbidden: [],
    required: ["created_at", "parentId"],
  },
  "commission_events": {
    allowlist: ["amount_cents", "event_at", "parentId", "status", "therapistId"],
    forbidden: [],
    required: ["amount_cents", "event_at", "parentId", "therapistId"],
  },
  "gpr_entries": {
    allowlist: ["childId", "goal_id", "notes", "progress_delta", "recorded_at"],
    forbidden: [],
    required: ["childId", "recorded_at"],
  },
  "modules": {
    allowlist: ["arc", "creature_m_number", "id", "status", "technique_name"],
    forbidden: [],
    required: ["id", "status"],
  },
  "parents": {
    allowlist: ["coppaChatConsent", "created_at", "displayName", "email", "kws_parent_id", "linkedTherapist", "stripe_customer_id"],
    forbidden: [],
    required: ["displayName", "email", "kws_parent_id"],
  },
  "sessions": {
    allowlist: ["childId", "completionStatus", "endedAt", "moduleId", "phase", "startedAt"],
    forbidden: [],
    required: ["childId", "endedAt", "startedAt"],
  },
  "stripe_customers": {
    allowlist: ["email", "stripeId", "stripeLink"],
    forbidden: [],
    required: [],
  },
  "therapist_summaries": {
    allowlist: ["_last_source", "active_this_week", "activity_bucket", "childId", "clq_latest_at_bucket", "clq_latest_score", "garden_30d", "gpr_active_goal_count", "gpr_avg_7d", "sessions_30d", "updated_at", "zaps_30d", "zaps_7d"],
    forbidden: ["clq_responses_inline", "content_preview", "gpr_deltas_inline", "last_entry_at", "last_session_at", "last_zap_at", "message_preview", "per_day_distribution", "per_hour_distribution"],
    required: ["activity_bucket", "childId", "updated_at"],
  },
  "therapists": {
    allowlist: ["created_at", "deactivatedAt", "deactivationReason", "displayName", "email", "rewardful_affiliate_id", "status"],
    forbidden: [],
    required: ["displayName", "email"],
  },
  "wishing_garden_entries": {
    allowlist: ["childId", "created_at", "prompt", "response"],
    forbidden: [],
    required: ["childId", "created_at"],
  },
  "zaps": {
    allowlist: ["childId", "content", "creatureId", "sent_at"],
    forbidden: [],
    required: ["childId", "content", "creatureId", "sent_at"],
  },
};
