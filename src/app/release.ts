/** Release configuration. See docs/release/auviona-release-checklist.md. */

/**
 * Public HTTPS pages linked from Settings > About and App Store Connect. These are the canonical
 * URLs the site at https://auviona.swarmz.cloud/ declares for its Privacy and Support pages.
 * Never guess a URL here; null means "not published".
 */
export const PRIVACY_POLICY_URL: string | null = 'https://auviona.swarmz.cloud/privacy';
export const SUPPORT_URL: string | null = 'https://auviona.swarmz.cloud/support';

/**
 * True only for a pre-release test build; About then says it is an experimental prototype.
 * The safety and accuracy limitations in About are shown regardless.
 */
export const PRE_RELEASE = false;

/**
 * Shows the opt-in Haptic alerts setting. Validated on devices, so it is available in public builds.
 */
export const HAPTIC_ALERTS_AVAILABLE = true;
