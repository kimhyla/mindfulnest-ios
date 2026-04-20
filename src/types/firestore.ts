/**
 * MindfulNest — Firestore Collection Interfaces
 * Source: CANONICAL_DATA_MODEL_v1_12.md (FROZEN April 6, 2026)
 *
 * Deviations from CDM v1.12 (Kim-approved April 15, 2026):
 * 1. `ownedItems` uses rich OwnedItem[] array from BACKPACK_STORE_DECORATION_SYSTEM v1.4
 *    (CDM's `string[]` version is superseded)
 * 2. `decorationsEarned` and `decorationsPlaced` RETIRED — all item tracking via ownedItems
 *    (Directus prod_locked_decisions ID 100, decision key DECORATION_FIELD_RETIREMENT)
 *
 * Field counts per CDM Appendix:
 *   therapists: 11 top-level
 *   parents: 8 top-level
 *   children: 39 top-level (~40 nested)
 *   bars: 16 top-level (~21 nested)
 *   completionLog: 6 top-level
 *   modules: 32 top-level (~8 nested)
 *   narrativeEvents: 18 top-level (~3 nested)
 *   therapistInvites: 8 top-level
 *   arcDefinitions: 6 top-level (~2 nested)
 *   storeItems: 8 top-level
 */

import type {
  Domain,
  CreatureId,
  CreatureMapState,
  BarEventType,
  BarStatus,
  TherapistStatus,
  DeactivationReason,
  SubscriptionStatus,
  EngagementStatus,
  InviteStatus,
  NarrativeEventType,
  ModuleSource,
  ModuleStatus,
  ProductionTier,
  DifficultyLevel,
  RescueVisualEffect,
  PhaseAPattern,
  Rarity,
  OwnedItemType,
  OwnedItemStatus,
  ClothingSlot,
  DecorableSpace,
  CarouselPage,
  StoreItemCategory,
  AvatarForm,
  StoreStatus,
} from "./enums";

// ─── Firestore Timestamp placeholder ─────────────────────────────────
// Replace with Firebase SDK's Timestamp type when Firebase is installed.
export type FirestoreTimestamp = { seconds: number; nanoseconds: number };

// ═══════════════════════════════════════════════════════════════════════
// COLLECTION: therapists/{therapistId}
// CDM field count: 11 top-level
// ═══════════════════════════════════════════════════════════════════════

export interface Therapist {
  // --- Identity (2) ---
  email: string;
  displayName: string;

  // --- Subscription (2) ---
  subscriptionStatus: SubscriptionStatus;
  subscriptionId: string | null;

  // --- Relationships (2) ---
  inviteCodes: string[];
  linkedChildren: string[];

  // --- Timestamps (2) ---
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;

  // --- Notification Preferences (3) ---
  notifyOnFirstCompletion: boolean;   // default: true
  notifyOnInactivity: boolean;        // default: true
  notifyWeeklySummary: boolean;       // default: false

  // --- Account Status (3, added for soft-delete / deactivation) ---
  // Therapist cannot delete own doc — deactivation only via Cloud Function.
  // Directus prod_locked_decisions: THERAPIST_NO_CLIENT_DELETE.
  status: TherapistStatus;                           // default: "active"
  deactivatedAt: FirestoreTimestamp | null;          // null while active
  deactivationReason: DeactivationReason | null;     // null while active

  // --- Technique Preferences (2) --- [CDM §Preferred Techniques, added v1.5]
  // NOTE: These ARE counted in the 11 — CDM Appendix says 11 for therapists.
  // But counting above gives 13. CDM Appendix note says "11" but the table
  // lists 13 fields. We include ALL fields from the CDM table.
  preferredTechniques: string[];
  defaultPreferredTechniques: string[];
}
// Actual field count: 13. CDM Appendix says 11 but table lists 13.
// preferredTechniques + defaultPreferredTechniques were added in v1.5 changelog
// but Appendix count was not updated. We include all fields from the table.

// ═══════════════════════════════════════════════════════════════════════
// COLLECTION: parents/{parentId}
// CDM field count: 8 top-level
// ═══════════════════════════════════════════════════════════════════════

export interface Parent {
  // --- Identity (2) ---
  email: string;
  displayName: string;

  // --- Relationships (2) ---
  linkedChildren: string[];
  linkedTherapist: string;

  // --- Timestamps (2) ---
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;

  // --- COPPA & Notifications (2) ---
  coppaChatConsent: boolean;     // default: false. REQUIRED before child chatEnabled = true
  dailyDigestEnabled: boolean;   // default: true

  // --- Notification Rate Limiting (1, from CDM Write Pattern §6) ---
  parentLastNotifiedAt: FirestoreTimestamp | null; // 7-day rate limit for skill notifications
}
// Field count: 9 (CDM Appendix says 8 but Write Pattern §6 adds parentLastNotifiedAt)

// ═══════════════════════════════════════════════════════════════════════
// COLLECTION: children/{childId}
// CDM field count: 39 top-level, ~40 nested
// ═══════════════════════════════════════════════════════════════════════

/** Avatar appearance — 3 fields (bodyType, skinColor, hairColor) */
export interface AvatarConfig {
  bodyType: "boy" | "girl";
  skinColor: string;    // one of 4 skin color option IDs
  hairColor: string;    // one of 4 hair color option IDs
}

/**
 * Text-UI personalization variables — 8 fields.
 *
 * Per LD-281 NO_RUNTIME_TTS_PERSONALIZATION_V1 (2026-04-18), these fields are
 * TEXT-UI ONLY (home screen greeting, progress pages, AI Parent Coach chat,
 * email/push copy). They are NOT spoken in audio — the app ships single-MP4
 * atomic deliverables with universal phrasing baked in, and never performs
 * runtime TTS or runtime audio substitution. Pronouns remain available for
 * text copy like "you meet him" / "she sent you here" where narrative clarity
 * benefits from them.
 */
export interface Personalization {
  childPronoun: "he" | "she";
  childPronounObject: "him" | "her";
  childPronounPossessive: "his" | "her";
  therapistName: string;
  therapistPronoun: "She" | "He";
  parentTitle: string;             // "Mom", "Dad", or custom
  parentName: string | null;       // optional
  parentPronoun: "She" | "He";
}

/** Rune state per domain — 6 fields */
export interface RuneStates {
  breathing: number;
  watching: number;
  kindness: number;
  courage: number;
  bodysensing: number;
  selfgrounding: number;
}

/** Per-creature state — 4 fields */
export interface CreatureState {
  discovered: boolean;
  homeClaimed: boolean;
  zoneFeatureUnlocked: boolean;
  mapState: CreatureMapState;
}

/** Module completion record */
export interface CompletionRecord {
  count: number;
  lastCompletedAt: FirestoreTimestamp;
}

/** Domain session counts for therapist dashboard — 6 fields (same shape as RuneStates) */
export interface DomainSessionCounts {
  breathing: number;
  watching: number;
  kindness: number;
  courage: number;
  bodysensing: number;
  selfgrounding: number;
}

/** Equipped cosmetics — split by avatar form */
export interface EquippedCosmetics {
  human: {
    outfit: string;
    accessory: string | null;
    heldItem: string | null;
  };
  dragon: {
    accessory: string | null;
  };
}

/**
 * Owned item entry — RICH OBJECT ARRAY
 * Source: BACKPACK_STORE_DECORATION_SYSTEM v1.4 §9.2
 * Kim-approved deviation from CDM's `string[]` (April 15, 2026)
 */
export interface OwnedItem {
  itemId: string;
  type: OwnedItemType;               // "clothing" | "decoration" | "narrative"
  slot: ClothingSlot | null;          // clothing only; null for decoration/narrative
  status: OwnedItemStatus;            // "equipped" | "carried" | "placed"
  placedIn: DecorableSpace | null;    // decoration only when placed; null otherwise
  source: "store" | "win" | "wild" | "narrative" | "milestone";
  earnedAt: FirestoreTimestamp;
}

/** Received Zap message (Pip pouch replay) */
export interface ZapMessage {
  creatureId: string;
  arcId: string;
  videoUrl: string;
  audioUrl: string;
  receivedAt: FirestoreTimestamp;
  viewed: boolean;
}

export interface Child {
  // ─── Identity & Onboarding (6) ───
  displayName: string;               // child's real first name
  guideName: string;                 // Guide Bird name, default "Chipper" (per LD-183 lore rename 2026-04-17)
  avatarConfig: AvatarConfig;
  personalization: Personalization;   // Text-UI personalization (pronouns, therapist/parent names) per LD-281 — NOT spoken in audio
  linkedParent: string;
  linkedTherapist: string;
  onboardingComplete: boolean;

  // ─── Progression (2) ───
  coins: number;
  modulesCompleted: number;

  // ─── Rune System (1, contains 6 nested) ───
  runeStates: RuneStates;

  // ─── Creatures (1, contains 6×4 nested) ───
  creatures: Record<CreatureId, CreatureState>;

  // ─── Decorations ───
  // RETIRED: decorationsEarned and decorationsPlaced (April 15, 2026)
  // All decoration tracking now via ownedItems[] with type: "decoration"
  // Placement tracked via ownedItems[].placedIn ("myHouse" | "carriage" | "wishingGarden" | null)
  // See: prod_locked_decisions ID 100 (DECORATION_FIELD_RETIREMENT)

  // ─── Module Completions (1) ───
  completions: Record<string, CompletionRecord>;  // moduleId → CompletionRecord

  // ─── Active Narrative State (5) ───
  currentArc: number;
  completedArcs: number[];
  activeBarId: string | null;
  nextEventIndex: number;
  pendingNarrativeHook: string | null;

  // ─── Preferred Techniques (1) ───
  preferredTechniques: string[];     // clinicalLabel values

  // ─── Therapist-Facing Summary (6) ───
  totalSessions: number;
  sessionsThisWeek: number;
  weekStartDate: string;             // ISO date of current week's Monday (UTC)
  lastActivityAt: FirestoreTimestamp;
  engagementStatus: EngagementStatus;
  domainSessionCounts: DomainSessionCounts;

  // ─── Timestamps (3) ───
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  lastOpenedAt: FirestoreTimestamp;

  // ─── Notification Tracking (3) ───
  parentNotifiedSkills: string[];             // moduleIds already notified to parent
  therapistFirstCompletionNotified: boolean;  // default: false
  inactivityNotifiedAt: FirestoreTimestamp | null;

  // ─── New Systems State (13) ───
  partyMembers: string[];            // creature IDs, capped at 5
  magicTapTier: number;              // 1-5
  storeStatus: StoreStatus;          // "open" | "closed"
  chatEnabled: boolean;              // requires parent coppaChatConsent
  equippedCosmetics: EquippedCosmetics;
  currentForm: AvatarForm;           // "human" until Arc 5
  dragonUnlocked: boolean;           // default: false
  unlockedFlightVideos: string[];    // Dragon Patrol Album video IDs
  ownedItems: OwnedItem[];           // DEVIATION: rich object array (Backpack spec)
  glowDropMessages: ZapMessage[];    // Zap messages (~7-9 max)
  carriageRewardSeen: boolean;       // default: false
  carouselSwipeTutorialSeen: boolean; // default: false
  lastCarouselPage: CarouselPage;    // default: "carriage" on first unlock
}
// Field count: Let's count top-level fields:
// Identity: displayName, guideName, avatarConfig, personalization, linkedParent, linkedTherapist, onboardingComplete = 7
// Progression: coins, modulesCompleted = 2
// Runes: runeStates = 1
// Creatures: creatures = 1
// Decorations: decorationsEarned, decorationsPlaced = 2
// Completions: completions = 1
// Narrative: currentArc, completedArcs, activeBarId, nextEventIndex, pendingNarrativeHook = 5
// Techniques: preferredTechniques = 1
// Summary: totalSessions, sessionsThisWeek, weekStartDate, lastActivityAt, engagementStatus, domainSessionCounts = 6
// Timestamps: createdAt, updatedAt, lastOpenedAt = 3
// Notifications: parentNotifiedSkills, therapistFirstCompletionNotified, inactivityNotifiedAt = 3
// New Systems: partyMembers, magicTapTier, storeStatus, chatEnabled, equippedCosmetics,
//   currentForm, dragonUnlocked, unlockedFlightVideos, ownedItems, glowDropMessages,
//   carriageRewardSeen, carouselSwipeTutorialSeen, lastCarouselPage = 13
// TOTAL: 7+2+1+1+2+1+5+1+6+3+3+13 = 45
//
// CDM says 39. Difference of 6 explained:
//   +1 personalization (CDM lists as nested under Identity but counts as top-level field)
//   +1 onboardingComplete (CDM counts under Identity: 6 identity fields listed)
// Actually CDM Appendix says: "6 identity, 5 progression... = 39"
// Let me recount per CDM grouping:
//   CDM Identity = 6: displayName, guideName, avatarConfig, linkedParent, linkedTherapist, onboardingComplete
//   That makes personalization NOT counted in CDM's 39 — it's inside avatarConfig section
//   Wait, CDM lists personalization separately with its own map table.
//   CDM Appendix breakdown: "6 identity, 5 progression..." but only lists 2 progression fields.
//   The CDM Appendix field count of 39 may itself be approximate.
//   We include ALL fields from CDM tables — completeness over count matching.

// ═══════════════════════════════════════════════════════════════════════
// SUBCOLLECTION: children/{childId}/bars/{barId}
// CDM field count: 16 top-level, ~21 nested
// ═══════════════════════════════════════════════════════════════════════

/** Single circle within a measuring bar */
export interface Circle {
  moduleId: string;
  domain: Domain;
  completed: boolean;
  isInjected: boolean;
  completedAt: FirestoreTimestamp | null;
}

/** AI-generated Guide Bird dialogue cache */
export interface AiNarrativeCache {
  callDialogue: string[];         // Step 1 — one per circle
  buyInDialogue: string[];        // Step 2 — one per circle
  rescueTransition: string[];     // Step 4 — one per circle
  tomorrowHook: string[];         // Step 5 — one per circle
  winCelebration: string[];       // Step 5 — one per circle
  nudgeLine: string;              // single string, NOT array — one per bar
  bridgeDialogue: string | null;  // null if no injected circle
  generatedAt: FirestoreTimestamp;
}

export interface Bar {
  creatureId: CreatureId;
  secondaryCreatureId: CreatureId | null;  // BOND events only
  domain: Domain;
  secondaryDomain: Domain | null;          // BOND events only
  eventType: BarEventType;
  label: string;
  arcNumber: number;
  narrativeEventId: string;
  circles: Circle[];
  totalCircles: number;
  completedCircles: number;
  status: BarStatus;
  resolutionDescription: string;
  aiNarrativeCache: AiNarrativeCache;
  createdAt: FirestoreTimestamp;
  completedAt: FirestoreTimestamp | null;
}
// Field count: 16 ✓ matches CDM Appendix

// ═══════════════════════════════════════════════════════════════════════
// SUBCOLLECTION: children/{childId}/completionLog/{logId}
// CDM field count: 6 top-level
// ═══════════════════════════════════════════════════════════════════════

export interface CompletionLogEntry {
  moduleId: string;
  domain: Domain;
  barId: string | null;            // null for standalone modules (Arc 1 M1-M6)
  circleIndex: number | null;      // null for standalone modules
  durationSeconds: number;
  completedAt: FirestoreTimestamp;
}
// Field count: 6 ✓ matches CDM

// ═══════════════════════════════════════════════════════════════════════
// COLLECTION: modules/{moduleId}
// CDM field count: 32 top-level, ~8 nested
// ═══════════════════════════════════════════════════════════════════════

/** Instruction cue within phaseAConfig */
export interface InstructionCue {
  trigger: string;           // pattern-specific: "on_start", "after_cloud_3", etc.
  text: string;              // human-authored, age 7-10 vocabulary
  audioRef: string | null;   // optional pre-recorded voiceover
}

/** Technique card for therapist + parent dashboards */
export interface TechniqueCard {
  techniqueName: string;
  summary: string;
  steps: string[];           // 3-5 numbered steps
  visualType: "diagram" | "animation";
  visualRef: string;
}

export interface Module {
  // ─── Child-Facing (17) ───
  title: string;
  spellName: string;                    // Spell Book display name
  domain: Domain;
  creatureId: CreatureId;
  sampleScenario: string;              // authoring aid only
  phaseAPattern: PhaseAPattern;
  phaseAConfig: Record<string, unknown> & { instructionCues: InstructionCue[] };
  phaseBTransitionCue: string;         // Guide Bird Phase A→B bridge
  guidedAudioRef: string;
  phaseBVisualRef: string;
  backgroundRef: string;
  rescueCreatureVisual: string;
  rescueVisualEffect: RescueVisualEffect;
  rescueDurationSeconds: number;       // default: 25
  coinReward: number;
  decorationReward: string;            // always earned — never null (Kim-confirmed April 16, 2026)
  isFirstModule: boolean;              // default: false

  // ─── Adult-Facing (7) ───
  clinicalLabel: string;
  clinicalDescription: string;
  parentSkillSummary: string;
  parentTips: string[];                // 2-3 tips
  techniqueId: string;
  techniqueCard: TechniqueCard;
  narrativeContextHint: string;

  // ─── Metadata (8) ───
  source: ModuleSource;
  productionTier: ProductionTier;
  difficultyLevel: DifficultyLevel;
  estimatedDurationSeconds: number;
  createdBy: string | null;            // therapist UID or null for official
  status: ModuleStatus;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}
// Field count: 17 + 7 + 8 = 32 ✓ matches CDM Appendix

// ═══════════════════════════════════════════════════════════════════════
// COLLECTION: narrativeEvents/{eventId}
// CDM field count: 18 top-level, ~3 nested
// ═══════════════════════════════════════════════════════════════════════

export interface TriggerCondition {
  type: "modulesCompleted" | "barCompleted";
  value: number | string;
  creatureId: CreatureId | null;
}

export interface NarrativeEvent {
  arcNumber: number;
  sequenceOrder: number;
  type: NarrativeEventType;
  creatureId: CreatureId | null;           // null for VILLAGE events
  secondaryCreatureId: CreatureId | null;  // BOND events
  domain: Domain | null;                   // null for non-module events
  secondaryDomain: Domain | null;          // BOND events
  triggerCondition: TriggerCondition;
  title: string;
  description: string;
  createsBar: boolean;
  barLabel: string | null;
  circleCount: number | null;              // 2-5 if createsBar
  circleModuleIds: string[] | null;
  resolutionDescription: string | null;
  videoAssetRef: string | null;
  isPreAuthored: boolean;
  preAuthoredDialogue: Record<string, unknown> | null;
}
// Field count: 18 ✓ matches CDM Appendix

// ═══════════════════════════════════════════════════════════════════════
// COLLECTION: therapistInvites/{inviteCode}
// CDM field count: 8 top-level
// ═══════════════════════════════════════════════════════════════════════

export interface TherapistInvite {
  therapistId: string;
  childDisplayName: string;
  status: InviteStatus;
  claimedByParent: string | null;
  childId: string | null;
  createdAt: FirestoreTimestamp;
  expiresAt: FirestoreTimestamp;
  claimedAt: FirestoreTimestamp | null;
}
// Field count: 8 ✓ matches CDM

// ═══════════════════════════════════════════════════════════════════════
// COLLECTION: storeItems/{itemId}
// CDM field count: 8 top-level
// ═══════════════════════════════════════════════════════════════════════

export interface StoreItem {
  name: string;
  category: StoreItemCategory;
  price: number;
  rarity: Rarity;
  imageRef: string;
  availableAfterModule: number | null;
  slot: string | null;                    // clothing slot; null for decorations
  sparkleFirst: boolean;                  // Sparkle-First Rule for Rare+ items
}
// Field count: 8 ✓ matches CDM

// ═══════════════════════════════════════════════════════════════════════
// COLLECTION: arcDefinitions/{arcId}
// CDM field count: 6 top-level, ~2 nested
// ═══════════════════════════════════════════════════════════════════════

export interface ArcDefinition {
  arcNumber: number;
  title: string;
  premise: string;
  emotionalCore: string;
  moduleRange: { start: number; end: number };
  totalEvents: number;
}
// Field count: 6 ✓ matches CDM
