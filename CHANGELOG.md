# Changelog

## 1.0.1 (2026-10-23)

- The settings tab says what the last check found: "up to date", "1.2.0 available", or, for a theme that doesn't match its published file, which version was held back ("so 4.1.0 was not installed"). A current theme used to read "not updated yet", as if an update were waiting, and a theme not checked yet now says so.
- The Roll back link in a notice takes the notice's text colour. Notices are dark in both modes, and a theme's light-mode link colour could be unreadable on them: Tela's measured 2.29:1.
- The README opens with why the plugin exists, shows the notices and the settings tab, and has a section for theme authors. Each paragraph is one line, because the community directory renders every line break.
- Checked: 31 unit tests, including the settings tab's status line in every state; a run on Obsidian 1.14.5 with Tela 1.1.1, Minimal 9.1.3, a locally edited Baseline 4.0.0 and a current Things 2.2.4: Tela and Minimal updated with a notice each, Baseline was held back with its notice, Things read "up to date", and after rolling Minimal back its row offered Install 9.1.4. The Roll back link measured the notice's text colour in dark and light mode.

## 1.0.0 (2026-10-23)

First version, built on 2026-10-19 against Obsidian 1.14.4.

- Checks installed community themes at startup and installs the version
  Obsidian's own updater would, following the rules read from Obsidian 1.14.4's
  `checkForUpdate` and `installTheme`. The installer is the plugin's own rather
  than Obsidian's: Obsidian's swallows failures and shows its own notices, so
  it offers nothing to back up before or restore after.
- Backs up `theme.css` and `manifest.json` before every write, verifies the
  backup, and restores the previous files if the write fails.
- Skips a theme whose `theme.css` cannot be matched to a published file (the
  plugin's own record, the release asset of the installed version, or the
  default branch when it is still at that version), with one notice per
  version.
- One-click rollback from the notice or the settings tab; the version rolled
  back from is skipped until a newer one appears, or until **Install** in the
  settings tab brings it back through the same checked update.
- Notify-only when the running Obsidian does not expose its theme registry in
  the expected shape.
- Settings tab built on the 1.13 setting definitions API, so `minAppVersion`
  is 1.13.0.

Verified: 27 unit tests over an in-memory vault; a real run on Obsidian 1.14.4
(Windows) with a throwaway vault holding Minimal 9.1.1, Tela 1.0.0 and a
locally edited Things 2.2.3. Minimal and Tela updated at startup with backups
written first, the active theme reloaded without a restart, Things was skipped
with a notice, rollback worked from the notice link and from the settings
button and skipped the rolled-back version on the next check, the same flow
ran under mobile emulation, and notify-only mode engaged when the registry was
hidden. Not yet verified: a real phone, two synced devices updating at once,
and a failed write on a real disk (covered by unit tests only).
