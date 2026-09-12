import { DEFAULT_SETTINGS } from "./core.js";

const CHECKBOX_FIELDS = [
  "groupDefaultContainer",
  "syncTitleAndColor",
  "newTabInheritsContainer",
];

// radio group name -> allowed values, default first
const RADIO_FIELDS = {
  newTabPosition: ["rightmost", "leftmost"],
  newGroupWindow: ["new", "current"],
};

/* ------------------------------- settings ------------------------------- */

async function restoreSettings() {
  const stored = await browser.storage.local.get("settings");
  const s = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  for (const id of CHECKBOX_FIELDS) {
    document.getElementById(id).checked = Boolean(s[id]);
  }
  for (const [name, values] of Object.entries(RADIO_FIELDS)) {
    const v = values.includes(s[name]) ? s[name] : values[0];
    const radio = document.querySelector(
      `input[name="${name}"][value="${v}"]`
    );
    if (radio) radio.checked = true;
  }
}

async function saveSettings() {
  const s = {};
  for (const id of CHECKBOX_FIELDS) {
    s[id] = document.getElementById(id).checked;
  }
  for (const [name, values] of Object.entries(RADIO_FIELDS)) {
    const picked = document.querySelector(`input[name="${name}"]:checked`);
    s[name] = picked && values.includes(picked.value) ? picked.value : values[0];
  }
  await browser.storage.local.set({ settings: s });
}

/* --------------------------------- init -------------------------------- */

async function init() {
  await restoreSettings();

  for (const id of CHECKBOX_FIELDS) {
    document.getElementById(id).addEventListener("change", saveSettings);
  }
  for (const name of Object.keys(RADIO_FIELDS)) {
    for (const radio of document.querySelectorAll(`input[name="${name}"]`)) {
      radio.addEventListener("change", saveSettings);
    }
  }
}

document.addEventListener("DOMContentLoaded", init);
