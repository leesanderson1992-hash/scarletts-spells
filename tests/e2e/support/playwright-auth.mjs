import { expect } from "@playwright/test";

const DASHBOARD_MARKERS = [
  { kind: "text", value: "Today's Training" },
  { kind: "text", value: "To review" },
  { kind: "text", value: "No active children" },
  { kind: "link", value: "Review work" },
];

async function isReactHydrated(locator) {
  return locator
    .evaluate((element) =>
      Object.keys(element).some(
        (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactProps$"),
      ),
    )
    .catch(() => false);
}

async function hasVisibleDashboardMarker(page) {
  for (const marker of DASHBOARD_MARKERS) {
    const locator =
      marker.kind === "link"
        ? page.getByRole("link", { name: marker.value }).first()
        : page.getByText(marker.value, { exact: false }).first();
    if (await locator.isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

async function getAuthCookieNames(page) {
  const cookies = await page.context().cookies();

  return cookies
    .map((cookie) => cookie.name)
    .filter(
      (name) =>
        name.startsWith("sb-") ||
        name.includes("supabase") ||
        name.includes("auth-token"),
    )
    .sort();
}

async function readAuthState(page) {
  const currentUrl = page.url();
  const loginError = page.locator("p.text-rose-600").first();
  const submitButton = page.getByRole("button", { name: /sign in|signing in/i }).first();
  const dashboardMarkerVisible = await hasVisibleDashboardMarker(page);
  const loginErrorVisible = await loginError.isVisible().catch(() => false);
  const loginErrorText = loginErrorVisible
    ? (await loginError.textContent())?.trim() || "unknown_login_error"
    : null;
  const buttonText = (await submitButton.textContent().catch(() => ""))?.trim() || "missing";
  const authCookieNames = await getAuthCookieNames(page);
  const dashboardUrl = /\/dashboard(?:\?|$)/.test(currentUrl);
  const loginUrl = /\/login(?:\?|$)/.test(currentUrl);
  const dashboardReady = dashboardUrl && dashboardMarkerVisible && authCookieNames.length > 0;

  return {
    currentUrl,
    dashboardUrl,
    loginUrl,
    dashboardMarkerVisible,
    loginErrorText,
    buttonText,
    authCookieNames,
    dashboardReady,
  };
}

function formatPendingAuthState(state) {
  return [
    `pending:${state.currentUrl}`,
    `button=${state.buttonText}`,
    `cookies=${state.authCookieNames.join(",") || "none"}`,
    `dashboardMarker=${state.dashboardMarkerVisible ? "yes" : "no"}`,
  ].join(":");
}

async function waitForLoginFormHydration(page) {
  const loginForm = page.locator("form").first();
  const submitButton = page.getByRole("button", { name: "Sign in" }).first();

  await expect
    .poll(
      async () => (await isReactHydrated(loginForm)) && (await isReactHydrated(submitButton)),
      {
        timeout: 10_000,
        message: "Expected the login form to finish client hydration before submitting.",
      },
    )
    .toBe(true);
}

async function waitForAuthenticatedDashboard(page, { timeout, message, allowDashboardNudge }) {
  let dashboardNudged = false;
  const deadline = Date.now() + timeout;
  let lastState = null;

  while (Date.now() < deadline) {
    const state = await readAuthState(page);
    lastState = state;

    if (state.dashboardReady) {
      await expect(page).toHaveURL(/\/dashboard/);
      return;
    }

    if (state.loginErrorText) {
      throw new Error(`${message}\nReceived login error: ${state.loginErrorText}`);
    }

    if (
      allowDashboardNudge &&
      !dashboardNudged &&
      state.loginUrl &&
      state.authCookieNames.length > 0
    ) {
      dashboardNudged = true;
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    }

    await page.waitForTimeout(250);
  }

  throw new Error(
    `${message}\nLast observed auth state: ${formatPendingAuthState(lastState ?? {
      currentUrl: page.url(),
      buttonText: "missing",
      authCookieNames: [],
      dashboardMarkerVisible: false,
    })}`,
  );
}

export async function assertStoredDashboardAccess(page, timeout = 15_000) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  try {
    await waitForAuthenticatedDashboard(page, {
      timeout,
      allowDashboardNudge: false,
      message:
        "Expected stored authenticated state to replay into a usable dashboard session.",
    });
  } catch (error) {
    const state = await readAuthState(page);
    const visibleText = await page.locator("body").textContent().catch(() => "") || "";
    const documentCookie =
      (await page.evaluate(() => document.cookie).catch(() => "unavailable")) || "none";
    const diagnostic = [
      "Stored authenticated state replay failed.",
      `authState=${formatPendingAuthState(state)}`,
      `documentCookie=${documentCookie || "none"}`,
      `body=${visibleText.replace(/\s+/g, " ").trim().slice(0, 200) || "empty"}`,
    ].join("\n");

    throw new Error(
      `${diagnostic}\n\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function loginAsE2EParent(page, config) {
  void config;
  await assertStoredDashboardAccess(page, 30_000);
}
