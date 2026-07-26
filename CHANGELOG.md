# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] - 2026-07-25

### Added

- `bump --auto` — infer the SemVer level from Conventional Commits since the last tag
  (`feat`→minor, `fix`→patch, `feat!` or a `BREAKING CHANGE:` footer→major) and apply it.
- `check` — exit non-zero when `package.json` or any configured JSON file drifts from
  `appversion.json`. Suitable for CI.
- `sync` — repair drifted files to the current version without bumping.
- `install-hook` — install a pre-push hook that runs `check`, so a forgotten version sync
  fails the push instead of shipping. Honors `core.hooksPath` and linked worktrees.
- `tag [--push] [--message]` — create the annotated `v<version>` tag from `appversion.json`;
  refuses to overwrite an existing tag.
- `release [--notes|--notes-file] [--dry-run]` — push the tag and create the GitHub Release
  via `gh`; `--dry-run` previews the exact command without running it.
- Eight namespaced slash commands, organized by the system they act on:
  `/appversion:package`, `:github`, `:release`, and one per tracker (`:jira`, `:linear`,
  `:plane`, `:shortcut`, `:clickup`).
- `CONTRIBUTING.md` with setup, ground rules, and a walkthrough for adding a tracker adapter.

### Fixed

- **`--dry-run` could be bypassed.** A value flag consumed the next token unconditionally, so
  a typo such as `release --notes-file --dry-run` swallowed the safety flag and performed a
  real tag push and GitHub Release. Value flags now error when the value is missing or looks
  like a flag, support `--flag=value`, and never leak into positional arguments.
- **`install-hook --dry-run` wrote the hook** instead of previewing it.
- **A failed tag push could delete a tag it did not create.** Cleanup now happens only on a
  genuine ref rejection, and only for a tag created in the same invocation; any other failure
  keeps the tag and surfaces git's own error.
- **The pre-push hook blocked every push when `appversion.json` was absent.** A missing file
  is no longer treated as drift.
- **`BREAKING CHANGE` in prose forced a major bump.** It must now appear as a footer, so a
  branch name or sentence mentioning the phrase no longer changes the version.
- All `git`/`gh` invocations use `execFileSync` with argument arrays — no shell strings.

### Changed

- The skill resolves its helper script from its own directory, so it works when installed
  outside the project it is versioning.
- Restructured to a single source of truth in `skills/appversion/`, with thin per-agent
  adapters for Claude Code, Gemini CLI, Codex, Cursor, opencode, and GitHub Copilot.
- This repository now tracks its own version with `appversion.json`, and keeps all five
  plugin manifests in sync through `config.json`.

## [1.0.0] - 2026-07-22

### Added

- Initial release: `init`, `show`, `bump`, `build`, `status`, and `tickets` commands over an
  `appversion.json` source of truth, with propagation to `package.json`, configured JSON
  files, and markdown badges.
- Read-only issue-tracker enrichment for Jira, Plane, Shortcut, ClickUp, and Linear, with
  multi-tracker routing by key prefix and tokens read only from environment variables.
- `SKILL.md` release procedure with three confirmation gates.

[Unreleased]: https://github.com/AmirrezaJolani/appversion-skill/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/AmirrezaJolani/appversion-skill/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/AmirrezaJolani/appversion-skill/releases/tag/v1.0.0
