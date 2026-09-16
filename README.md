# Container Corral

A Firefox extension that corrals your Multi-Account Container tabs into
Firefox's native tab groups (Firefox 142+):

1. **Group tabs by container.** One native tab group per container. Open a tab
   in your "Work" container and it joins the "Work" tab group; open one in
   "Shopping" and it goes to "Shopping". The group's name and color follow the
   container. 
1. Because a tab group can't span windows, a tab is moved to the
   window that already holds its container's group. This prevents there being multiple groups with the same name in different windows, and keeps all tabs in a container together. 
2. **Inherit the container for new tabs** (optional). A blank new tab opens in the
   same container as the current tab.

Container Corral doesn't have its own "open this site in that container" rule
list — use Multi-Account Containers' own **Always Open in This Container**
per-site assignment for that. (An earlier version of Container Corral had its
own copy of this feature; it was removed because two extensions independently
reopening the same navigation into a container can race or fight each other,
and there's no way for either one to see the other's assignments.)

## Install

This extension isn't published on [addons.mozilla.org](https://addons.mozilla.org),
so pick one of these.

### Try it now (temporary)

1. Clone the repo:
   ```bash
   git clone https://github.com/ima-hima/container-corral
   ```
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and choose `manifest.json` from the clone.

It works immediately but is removed when Firefox restarts. Good for a test drive.

### Permanent (self-signed through AMO)

Release Firefox only runs signed extensions, but Mozilla signs *unlisted* builds
automatically with no review:

1. Sign in with a Firefox account and generate API credentials at
   <https://addons.mozilla.org/developers/addon/api/key/>.
2. Build and sign:
   ```bash
   npm install
   WEB_EXT_API_KEY=<issuer> WEB_EXT_API_SECRET=<secret> npm run sign
   ```
   This drops a signed `.xpi` in `web-ext-artifacts/`.
3. Install it: open `about:addons`, click the gear ⚙ → **Install Add-on From
   File…**, and pick the `.xpi` (or just drag the `.xpi` onto a Firefox window).

To update later: bump `version` in `manifest.json`, re-run `npm run sign`,
reinstall the new `.xpi`.

### Firefox Developer Edition / Nightly / ESR

Set `xpinstall.signatures.required` to `false` in `about:config`, then install
the unsigned `web-ext-artifacts/*.zip` from `npm run build` the same way as
above. This toggle has no effect on release or Beta Firefox.

## How it works

**Grouping**

- `contextualIdentities.query()` + `tab.cookieStoreId` identify a tab's container.
- One group per container is tracked in a `cookieStoreId → {groupId, windowId}`
  map persisted in `storage.local` (so it survives the background page being
  suspended and browser restarts; entries are validated on use and dropped when
  stale). This is the primary lookup.
- The fallback is matching a group by (trimmed, case-insensitive) title across
  **all** windows. The oldest group id wins as the canonical one; same-window
  duplicates are merged into it immediately, cross-window duplicates are drained
  by the next reconcile.
- On tab create / attach, the tab is moved to the canonical group's window (via
  `tabs.move()`) and added to the group (`tabs.group()`). A tab already sitting
  in a correctly-named group is left in place.
- When no group for that container exists yet, one is created. By default the
  tab is first popped out into its **own new window** (`windows.create`); the
  options page can switch this to the current window. A tab that's already alone
  in its window stays where it is either way. (Bulk reconcile always creates in
  the window that already holds the most of that container's tabs.)
- If the moved tab was the active one in its old window, focus follows it: the
  destination window is raised (`windows.update({focused:true})`) and the tab is
  selected there. Bulk reconciles never steal focus.
- A tab added to a group is slid to the **rightmost** end of that group by
  default; the options page can switch this to leftmost. Existing tabs already
  in the group aren't reordered.
- Group title/color are synced from the container (`tabGroups.update()`) and
  re-synced when a container is renamed or recolored.
- On startup / install / container add·remove / settings change, everything is
  reconciled: tabs are gathered from every window into one group per container.
- During session restore, per-tab handling is paused for ~12 s (with a few
  delayed reconciles) so Firefox finishes re-creating windows, tabs and groups
  before the extension moves anything.

The only time a tab *isn't* pulled into its container's window is when that
would empty Firefox's last remaining window.

**New-tab container inheritance** (off by default)

- `tabs.onActivated` keeps a `windowId → active cookieStoreId` map.
- A new blank, opener-less, default-container tab is *not* touched right away —
  Firefox reports `about:blank` at `onCreated` even for a tab opened *for a URL*
  (`tabs.create({url})`, an external-app link, `window.open`), and re-creating it
  then would drop the URL. Instead the extension waits for one of two signals:
  - the tab settles on `about:newtab` / `about:home` → it's a genuine idle new
    tab, so it's re-created in the active container now (`tabs.onUpdated`);
  - the tab makes a top-level navigation → a blocking `webRequest.onBeforeRequest`
    listener reopens it in the active container **carrying that URL**, so
    nothing is lost.
- A blank tab you open and never navigate stays in no container. If your new-tab
  page is set to a blank page (not Firefox Home), a fresh `Ctrl+T` tab isn't
  moved into the container until you navigate it somewhere.
- Links from other Firefox tabs are untouched (Firefox already opens them in
  their opener's container).

**Tab right-click menu**

- *Reopen tab without a container* — shown only when the tab is in a container;
  reopens it in no container right now.
- *Move tab to its container's group* — re-runs the grouper for that one tab
  (useful after you've dragged a tab out of its group).

## Permissions

`tabs`, `tabGroups`, `contextualIdentities`, `cookies`, `storage`, `menus`,
`webRequest`, `webRequestBlocking`, and `<all_urls>` host access (needed to see
navigations for the new-tab inheritance feature).

## Limitations & known edge cases

- **Requires Firefox 142+.**
- Private windows are ignored (containers don't apply there).
- Pinned tabs are left alone by the grouper.
- Consolidation moves tabs between windows. A window whose last tab gets pulled
  into another window will close.
- If you manually drag a tab out of its group, the extension won't fight you
  until the next create/attach/reconcile event.
- A container renamed while the background page is cold *and* has no cached
  mapping yet may keep its old group name until the next reconcile touches it.
- "No Container" grouping is opt-in via the options page.
- **Reopening a tab into a different container drops its back/forward
  history** (new-tab inheritance, and the right-click "Reopen tab without a
  container", both reopen the tab). This is a Firefox platform limit, not
  something this extension can work around: a tab's history belongs to its
  cookie store, and there's no WebExtension API to carry it to a new one —
  only to close the tab and open a fresh one at the target URL. Mozilla's own
  Multi-Account Containers has the same tradeoff. (We could preload the
  referring page first so Back goes one step, but that means a visible flash
  of that page loading under the new container's cookies — not worth it for
  one step of history, so we left it out.)
- **A short list of Mozilla's own domains are invisible to every extension,
  including this one** — `addons.mozilla.org`, `accounts.firefox.com`, and a
  handful of related properties. Firefox never calls `webRequest` listeners
  (or injects content scripts) for navigations to them, by design, so this
  extension has no way to see or act on a link to one of those sites: new-tab
  inheritance won't apply, and neither would Multi-Account Containers' own
  per-site assignment. There's no workaround from an extension. The list is
  controlled by the `extensions.webextensions.restrictedDomains` preference —
  view it yourself by opening `about:config` and searching for that name.

## Development

```bash
npm install
npm start          # launches a scratch Firefox with the extension loaded
npm test           # unit + integration tests (node:test, no browser)
npm run lint       # web-ext lint
npm run build      # produces web-ext-artifacts/*.zip
npm run sign       # signed .xpi via AMO (needs WEB_EXT_API_KEY / _SECRET)
```

See [Install](#install) for loading it into your everyday Firefox.

### Layout

| File | Role |
|---|---|
| `core.js` | pure decision logic — no `browser` API, no mutable state |
| `background.js` | ES-module background: state, `browser` calls, event wiring |
| `options.html` / `options.js` | preferences page |
| `test/core.test.js` | unit tests for `core.js` |
| `test/fake-browser.js` | in-memory fake of the WebExtension surface used here |
| `test/integration.test.js` | drives `background.js` against the fake (grouping, consolidation, inheritance, rename) |

Tests import `background.js` with a cache-busting query string so each test gets
a fresh module instance and a fresh fake browser. CI (`.github/workflows/ci.yml`)
runs `npm test` and `npm run lint` on every push and PR.

## License

MIT
