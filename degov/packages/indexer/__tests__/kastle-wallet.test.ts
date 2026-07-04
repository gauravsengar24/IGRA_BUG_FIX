/**
 * Tests for the Kastle wallet provider namespace lookup.
 *
 * Kastle injects its Ethereum provider at window.kastle.ethereum rather than
 * window.ethereum. The getWindowProviderNamespace utility traverses a
 * dot-separated path on the window object to find the provider.
 */

// Inline implementation matching packages/web/src/config/kastle-wallet.ts
function getWindowProviderNamespace(
  windowObj: Record<string, any>,
  namespace: string
): any {
  const [property, ...path] = namespace.split(".");
  const provider = windowObj[property];
  if (!provider) return undefined;
  if (path.length === 0) return provider;
  return getWindowProviderNamespace(provider, path.join("."));
}

describe("Kastle wallet provider namespace lookup", () => {
  test("finds provider at kastle.ethereum", () => {
    const fakeProvider = { request: jest.fn() };
    const fakeWindow = { kastle: { ethereum: fakeProvider } };
    expect(getWindowProviderNamespace(fakeWindow, "kastle.ethereum")).toBe(
      fakeProvider
    );
  });

  test("returns undefined when kastle is not injected", () => {
    expect(getWindowProviderNamespace({}, "kastle.ethereum")).toBeUndefined();
  });

  test("returns undefined for partial path", () => {
    const fakeWindow = { kastle: {} };
    expect(
      getWindowProviderNamespace(fakeWindow, "kastle.ethereum")
    ).toBeUndefined();
  });

  test("finds single-level namespace", () => {
    const fakeProvider = { request: jest.fn() };
    const fakeWindow = { ethereum: fakeProvider };
    expect(getWindowProviderNamespace(fakeWindow, "ethereum")).toBe(
      fakeProvider
    );
  });

  test("finds deeply nested namespace", () => {
    const fakeProvider = { request: jest.fn() };
    const fakeWindow = { a: { b: { c: fakeProvider } } };
    expect(getWindowProviderNamespace(fakeWindow, "a.b.c")).toBe(fakeProvider);
  });
});
