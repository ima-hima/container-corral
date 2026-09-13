/**
 * Pure, browser-free logic shared by background.js and the unit tests.
 * Nothing in here touches the `browser` API or any mutable module state.
 */

export const DEFAULT_SETTINGS = {
  // Also group tabs that have no container (the "firefox-default" store).
  groupDefaultContainer: false,
  // Keep each group's title and color matched to its container.
  syncTitleAndColor: true,
  // Where a tab lands when added to its group: "rightmost" or "leftmost".
  newTabPosition: "rightmost",
  // Open a blank new tab (Ctrl+T, "+") in the current tab's container.
  newTabInheritsContainer: false,
  // Where a brand-new container group is created: "new" window, or "current".
  newGroupWindow: "new",
};

// contextualIdentities colors -> tabGroups.Color values
export const COLOR_MAP = {
  blue: "blue",
  turquoise: "cyan",
  green: "green",
  yellow: "yellow",
  orange: "orange",
  red: "red",
  pink: "pink",
  purple: "purple",
  toolbar: "grey",
};

export const DEFAULT_STORE = "firefox-default";
export const DEFAULT_GROUP_TITLE = "No Container";
export const DEFAULT_GROUP_COLOR = "grey";

export const BLANK_URLS = new Set([
  "",
  "about:newtab",
  "about:home",
  "about:blank",
]);

export const normTitle = (s) => (s || "").trim().toLowerCase();

/** Target group title/color for a cookieStoreId, or null to skip. */
export function describe(cookieStoreId, containers) {
  if (cookieStoreId === DEFAULT_STORE) {
    return { title: DEFAULT_GROUP_TITLE, color: DEFAULT_GROUP_COLOR };
  }
  const c = containers.get(cookieStoreId);
  if (!c) return null;
  return { title: c.name, color: COLOR_MAP[c.color] || "grey" };
}

/** Should this tab be grouped at all? */
export function eligible(tab, settings) {
  if (tab.pinned) return false;
  const store = tab.cookieStoreId || DEFAULT_STORE;
  if (store.startsWith("firefox-private")) return false;
  if (store === DEFAULT_STORE && !settings.groupDefaultContainer) return false;
  return true;
}

/** Window id holding the most of `tabs`; ties broken by lowest window id. */
export function homeWindowFor(tabs) {
  const counts = new Map();
  for (const t of tabs) {
    counts.set(t.windowId, (counts.get(t.windowId) || 0) + 1);
  }
  let best = null;
  let bestN = -1;
  for (const [win, n] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (n > bestN) {
      best = win;
      bestN = n;
    }
  }
  return best;
}

/**
 * Plan for sliding `tabIds` (already members of a group whose current members
 * are `groupTabs`) to one end of the group. Returns { anchor, orderedIds } — the
 * index to repeatedly move to, and the order to feed the moves — or null when
 * there's nothing to do. The group's span doesn't change during the moves, so a
 * single anchor is valid for all of them.
 */
export function groupPositionMoves(groupTabs, tabIds, leftmost) {
  if (tabIds.length === 0 || groupTabs.length <= 1) return null;
  const sorted = [...groupTabs].sort((a, b) => a.index - b.index);
  const anchor = leftmost
    ? sorted[0].index
    : sorted[sorted.length - 1].index;
  // Inserting each tab at the left anchor pushes the previous one right, so feed
  // them in reverse there to finish in tabIds order. At the right anchor the
  // natural order already works.
  const orderedIds = leftmost ? [...tabIds].reverse() : [...tabIds];
  return { anchor, orderedIds };
}

/**
 * The container a blank new tab should inherit, or null to leave it alone.
 * `ctx` = { enabled, now, settleUntil, inheritFrom }.
 */
export function containerToInherit(newTab, ctx) {
  if (!ctx.enabled) return null;
  if (newTab.incognito) return null;
  if (ctx.now < ctx.settleUntil) return null;
  if ((newTab.cookieStoreId || DEFAULT_STORE) !== DEFAULT_STORE) return null;
  // Link-opens are already containered by Firefox; a real URL here is a
  // navigation we must not disturb.
  if (newTab.openerTabId != null) return null;
  if (!BLANK_URLS.has(newTab.url || "")) return null;
  if (!ctx.inheritFrom || ctx.inheritFrom === DEFAULT_STORE) return null;
  return ctx.inheritFrom;
}
