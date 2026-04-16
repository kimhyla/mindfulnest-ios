/**
 * MindfulNest — Firestore Enums
 * Source: CANONICAL_DATA_MODEL_v1_12.md (FROZEN April 6, 2026)
 * Cross-referenced: CLAUDE.md terminology table, Bible v13.10
 *
 * All enum values are lowercase Firestore string literals.
 * DO NOT rename without a CDM migration.
 */

// ─── Core Domain Enums ───────────────────────────────────────────────

/** The Six Ancient Arts — skill domains */
export type Domain =
  | "breathing"      // Breath Awareness (creature: tessa, stone: Breath Stone)
  | "watching"       // Present-Moment Awareness (creature: luna, stone: Watching Stone)
  | "kindness"       // Kindness (creature: ember, stone: Heart Stone)
  | "courage"        // Courage (creature: benson, stone: Courage Stone)
  | "bodysensing"    // Body Awareness (creature: bramble, stone: Body Stone)
  | "selfgrounding"; // Self-Grounding (creature: mo, stone: Grounding Stone)

/** Creature identifiers — M-numbers are FIXED (M1=Tessa, M2=Luna, M3=Benson, M4=Ember, M5=Bork/Mo, M6=Bramble) */
export type CreatureId =
  | "tessa"    // M1 — turtle
  | "luna"     // M2 — owl
  | "benson"   // M3 — bear
  | "ember"    // M4 — fox
  | "mo"       // M5 — creature (was "Bork" in narrative, "mo" in Firestore)
  | "bramble"; // M6 — hedgehog

/** Creature map sprite state */
export type CreatureMapState = "distressed" | "idle" | "happy";

// ─── Rune System ─────────────────────────────────────────────────────

// NOTE: Rune layer names (dark/flicker/glow/radiance/resonance/transcendent)
// are config thresholds derived at runtime, NOT stored in Firestore.
// No type needed — see CDM §Rune System for threshold table.

// ─── Bar / Measuring Bar Enums ───────────────────────────────────────

export type BarEventType = "rescue" | "bond";
export type BarStatus = "active" | "completed";

// ─── User & Subscription Enums ───────────────────────────────────────

/** Therapist account status — soft-delete model (no hard delete allowed) */
export type TherapistStatus = "active" | "deactivated" | "suspended";

/** Reason for therapist deactivation */
export type DeactivationReason = "account_closed" | "subscription_lapsed" | "manual_request";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export type EngagementStatus = "active" | "moderate" | "inactive";

// ─── Invite System ───────────────────────────────────────────────────

export type InviteStatus = "pending" | "claimed" | "expired";

// ─── Narrative Event Enums ───────────────────────────────────────────

export type NarrativeEventType =
  | "rescue"
  | "bond"
  | "discovery"
  | "vignette"
  | "milestone"
  | "village";

// ─── Module Enums ────────────────────────────────────────────────────

export type ModuleSource = "official" | "therapist";
export type ModuleStatus = "draft" | "published" | "private" | "submitted" | "approved";
export type ProductionTier = "seed" | "ai_drafted" | "therapist_custom";
export type DifficultyLevel = "introductory" | "intermediate" | "advanced";

/** Domain-specific visual effect during Step 4 (rescue resolution) */
export type RescueVisualEffect =
  | "storm_clearing"
  | "clouds_dissolving"
  | "flowers_blooming"
  | "lights_brightening"
  | "roots_settling"
  | "stars_dimming";

/**
 * Phase A interaction patterns — TBD during Phase 0.4 (Interaction Pattern Inventory).
 * Placeholder type until ~6-8 patterns are defined.
 */
export type PhaseAPattern = string;

// ─── Store / Item Enums ──────────────────────────────────────────────

export type Rarity = "common" | "rare" | "heroic" | "legendary" | "eternal";

/** Item types in the backpack (from BACKPACK_STORE_DECORATION_SYSTEM v1.4) */
export type OwnedItemType = "clothing" | "decoration" | "narrative";

/** Item status in the backpack/world */
export type OwnedItemStatus = "equipped" | "carried" | "placed";

/** Avatar clothing slots */
export type ClothingSlot = "accessory" | "outfit";

/** Decorable spaces (carousel pages) */
export type DecorableSpace = "myHouse" | "carriage" | "wishingGarden";

/** Carousel page identifiers */
export type CarouselPage = "myHouse" | "carriage" | "wishingGarden";

/** Store item category */
export type StoreItemCategory = "decoration" | "clothing" | "wand" | "special";

/** Avatar form */
export type AvatarForm = "human" | "dragon";

/** Store availability status */
export type StoreStatus = "open" | "closed";
