# Changelog format

Follow [Keep a Changelog](https://keepachangelog.com/). Each release prepends a section:

```markdown
## [1.3.0] - 2026-07-18

### ⚠ Breaking Changes
- ...

### Added
- ...

### Fixed
- ...
```

Section date uses ISO `YYYY-MM-DD`.

## Conventional-commit → category

| Commit type | Section |
|-------------|---------|
| `feat` | Added |
| `fix` | Fixed |
| `perf`, `refactor`, `style` | Changed |
| `revert` | Removed |
| `security` | Security |
| `feat!` or `BREAKING CHANGE:` footer | ⚠ Breaking Changes (top of section) |
| `docs`, `chore`, `test`, `build`, `ci` | excluded by default |

**Non-conventional repos:** read each commit and bucket by meaning; anything ambiguous goes under **Changed**.

**Ticket enrichment:** when a change resolves a tracker ticket, use the ticket title and link it, e.g.
`- Add CSV export ([PROJ-142](https://acme.atlassian.net/browse/PROJ-142))`.

## Link references

Keep compare links at the bottom of the file:

```markdown
[Unreleased]: https://github.com/<owner>/<repo>/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/<owner>/<repo>/compare/v1.2.0...v1.3.0
```

The GitHub Release notes are the new section's body with the `## [x.y.z] - date` heading removed.
