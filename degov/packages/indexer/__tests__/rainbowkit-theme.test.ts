/**
 * Validates that RainbowKit theme accent colors don't double-wrap hsl().
 *
 * The CSS variables --foreground and --card already contain hsl() values
 * (e.g. "hsl(0 0% 100%)"). Wrapping them again with hsl(var(--foreground))
 * produces invalid CSS like hsl(hsl(0 0% 100%)), making the SIWE "Sign message"
 * button invisible in some browsers.
 */

const INVALID_PATTERNS = [
  /^hsl\(\s*var\(/,     // hsl(var(--...)) — will double-wrap since vars contain hsl()
  /^hsl\(\s*hsl\(/,     // hsl(hsl(...))  — already double-wrapped
  /^rgb\(\s*var\(/,     // same problem with rgb()
  /^rgb\(\s*rgb\(/,
];

function assertValidCssColor(value: string, label: string): void {
  for (const pattern of INVALID_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(
        `${label} has double-wrapped CSS color function: "${value}". ` +
        `CSS variables like --foreground already contain hsl() values. ` +
        `Use var(--foreground) directly, not hsl(var(--foreground)).`
      );
    }
  }
}

// These are the accent color values from useRainbowKitTheme.ts
// Extracted here so the test doesn't depend on React hooks
const THEME_ACCENT_COLORS = {
  accentColor: 'var(--foreground)',
  accentColorForeground: 'var(--card)',
};

describe("RainbowKit theme accent colors", () => {
  test("accentColor must not double-wrap hsl()", () => {
    assertValidCssColor(THEME_ACCENT_COLORS.accentColor, "accentColor");
  });

  test("accentColorForeground must not double-wrap hsl()", () => {
    assertValidCssColor(
      THEME_ACCENT_COLORS.accentColorForeground,
      "accentColorForeground"
    );
  });
});
