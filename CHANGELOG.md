# Changelog

## 1.0.0 (unreleased)

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
  back from is skipped until a newer one appears.
- Notify-only when the running Obsidian does not expose its theme registry in
  the expected shape.
- Settings tab built on the 1.13 setting definitions API, so `minAppVersion`
  is 1.13.0.

Verified: 26 unit tests over an in-memory vault; a real run on Obsidian 1.14.4
(Windows) with a throwaway vault holding Minimal 9.1.1, Tela 1.0.0 and a
locally edited Things 2.2.3. Minimal and Tela updated at startup with backups
written first, the active theme reloaded without a restart, Things was skipped
with a notice, rollback worked from the notice link and from the settings
button and skipped the rolled-back version on the next check, the same flow
ran under mobile emulation, and notify-only mode engaged when the registry was
hidden. Not yet verified: a real phone, two synced devices updating at once,
and a failed write on a real disk (covered by unit tests only).
