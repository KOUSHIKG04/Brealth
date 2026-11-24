import type { MobileTypographyRole } from "@startup/design-tokens";

/**
 * How far each role grows with the OS text-size setting. Reading text may double
 * (WCAG 1.4.4); titles and text inside fixed-height controls grow less so
 * layouts stay intact at the largest accessibility sizes.
 */
export const appTextMaxFontScale: Record<MobileTypographyRole, number> = {
  pageHeadline: 1.4,
  screenTitle: 1.4,
  sectionHeading: 1.5,
  cardHeading: 1.6,
  bodyEmphasis: 2,
  body: 2,
  bodySmall: 2,
  label: 1.6,
  labelSmall: 1.6,
  caption: 2,
  button: 1.5,
};

export const appTextInputMaxFontScale = 1.6;
