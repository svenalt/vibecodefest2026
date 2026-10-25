/**
 * Release values confirmed by the owner (REQ-008, REQ-011). See docs/release/auviona-release-checklist.md.
 */

/**
 * Public HTTPS pages linked from Settings > About and App Store Connect. These are the canonical
 * URLs the live site at https://auviona.swarmz.cloud/ declares for its footer Privacy and Support
 * pages (verified 2026-10-25). Never guess a URL here; null means "not published".
 */
export const PRIVACY_POLICY_URL: string | null = 'https://auviona.swarmz.cloud/privacy';
export const SUPPORT_URL: string | null = 'https://auviona.swarmz.cloud/support';

/**
 * True only for a pre-release test build; About then says it is an experimental prototype.
 * False since the owner accepted the product on devices (2026-10-25, REQ-011). The safety and
 * accuracy limitations in About stay regardless.
 */
export const PRE_RELEASE = false;

/**
 * Shows the opt-in Haptic alerts setting (P1-B). Physically validated in the owner's device
 * acceptance (2026-10-25), so it stays available in public builds.
 */
export const HAPTIC_ALERTS_AVAILABLE = true;
