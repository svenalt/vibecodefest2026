/**
 * Release values the owner must confirm (REQ-008). See docs/release/auviona-release-checklist.md.
 */

/**
 * Public HTTPS pages linked from Settings > About and App Store Connect. null until the domain
 * is confirmed and the pages in site/ are actually live; never guess a domain here.
 */
export const PRIVACY_POLICY_URL: string | null = null;
export const SUPPORT_URL: string | null = null;

/**
 * True while this build is a TestFlight pre-release that has not passed device QA (P0-D.1).
 * About then keeps saying so. Set to false only after the release candidate passes device QA.
 */
export const PRE_RELEASE = true;

/**
 * Shows the opt-in Haptic alerts setting (P1-B). On for TestFlight so it can be tested on an
 * iPhone; set to false for any public build whose haptics were not physically validated.
 */
export const HAPTIC_ALERTS_AVAILABLE = true;
