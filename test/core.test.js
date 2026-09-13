import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normTitle,
  describe as describeStore,
  eligible,
  homeWindowFor,
  groupPositionMoves,
  containerToInherit,
  DEFAULT_STORE,
} from "../core.js";

test("normTitle trims and lowercases", () => {
  assert.equal(normTitle("  Work  "), "work");
  assert.equal(normTitle(undefined), "");
});

test("describe: default store, known and unknown containers", () => {
  const containers = new Map([["c1", { name: "Work", color: "blue" }]]);
  assert.deepEqual(describeStore(DEFAULT_STORE, containers), {
    title: "No Container",
    color: "grey",
  });
  assert.deepEqual(describeStore("c1", containers), { title: "Work", color: "blue" });
  assert.equal(describeStore("c-gone", containers), null);

  const turquoise = new Map([["c2", { name: "T", color: "turquoise" }]]);
  assert.equal(describeStore("c2", turquoise).color, "cyan");
});

test("eligible: pinned, private, and default-container gating", () => {
  const on = { groupDefaultContainer: true };
  const off = { groupDefaultContainer: false };
  assert.ok(eligible({ cookieStoreId: "c1" }, off));
  assert.ok(!eligible({ cookieStoreId: "c1", pinned: true }, off));
  assert.ok(!eligible({ cookieStoreId: "firefox-private-1" }, on));
  assert.ok(!eligible({ cookieStoreId: DEFAULT_STORE }, off));
  assert.ok(eligible({ cookieStoreId: DEFAULT_STORE }, on));
});

test("homeWindowFor picks the busiest window, ties to lowest id", () => {
  assert.equal(
    homeWindowFor([{ windowId: 5 }, { windowId: 5 }, { windowId: 2 }]),
    5
  );
  assert.equal(
    homeWindowFor([{ windowId: 9 }, { windowId: 3 }]),
    3
  );
});

test("groupPositionMoves: rightmost keeps order, leftmost reverses feed", () => {
  const groupTabs = [
    { id: 1, index: 3 },
    { id: 2, index: 4 },
    { id: 10, index: 5 },
    { id: 11, index: 6 },
  ];
  assert.deepEqual(groupPositionMoves(groupTabs, [10, 11], false), {
    anchor: 6,
    orderedIds: [10, 11],
  });
  assert.deepEqual(groupPositionMoves(groupTabs, [10, 11], true), {
    anchor: 3,
    orderedIds: [11, 10],
  });
  assert.equal(groupPositionMoves([{ id: 1, index: 0 }], [1], false), null);
  assert.equal(groupPositionMoves(groupTabs, [], false), null);
});

test("containerToInherit: the whole gate", () => {
  const base = {
    enabled: true,
    now: 100,
    settleUntil: 0,
    inheritFrom: "c-work",
  };
  const blankTab = {
    cookieStoreId: DEFAULT_STORE,
    url: "about:newtab",
    openerTabId: null,
    incognito: false,
  };

  assert.equal(containerToInherit(blankTab, base), "c-work");
  assert.equal(containerToInherit(blankTab, { ...base, enabled: false }), null);
  assert.equal(containerToInherit(blankTab, { ...base, now: 5, settleUntil: 10 }), null);
  assert.equal(containerToInherit({ ...blankTab, incognito: true }, base), null);
  assert.equal(containerToInherit({ ...blankTab, openerTabId: 7 }, base), null);
  assert.equal(containerToInherit({ ...blankTab, url: "https://x.com" }, base), null);
  assert.equal(containerToInherit({ ...blankTab, cookieStoreId: "c2" }, base), null);
  assert.equal(containerToInherit(blankTab, { ...base, inheritFrom: DEFAULT_STORE }), null);
  assert.equal(containerToInherit(blankTab, { ...base, inheritFrom: undefined }), null);
});
