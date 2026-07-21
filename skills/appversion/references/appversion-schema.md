# appversion.json schema

The skill maintains a single `appversion.json` at the repo root.

```json
{
  "version": { "major": 0, "minor": 0, "patch": 0 },
  "status":  { "stage": null, "number": 0 },
  "build":   { "date": null, "number": 0, "total": 0 },
  "commit":  null,
  "config":  { "appversion": "1.0.0", "markdown": [], "json": [], "ignore": [], "tracker": null }
}
```

| Field | Meaning |
|-------|---------|
| `version.major/minor/patch` | Semver core. `bump major` zeroes minor+patch; `bump minor` zeroes patch. |
| `status.stage` | One of `stable`, `rc`, `beta`, `alpha` (stored lowercase). `null` = unset (treated as stable). |
| `status.number` | Iteration within a pre-release stage (e.g. `rc.2`). |
| `build.date` | Last build date, formatted `DD.MM.YYYY`. |
| `build.number` | Builds of the **current** version. Reset to `0` on any version bump. |
| `build.total` | Cumulative builds across all versions. Never reset. |
| `commit` | Short git hash stamped at bump time (the last code commit). |
| `config.appversion` | Schema version of this file (`1.0.0`), used to detect an out-of-date file. |
| `config.markdown` | Markdown files whose shields.io version/status badges are kept in sync. |
| `config.json` | Extra JSON files whose top-level `version` is kept in sync (besides `package.json`). |
| `config.ignore` | Folders to skip when searching. |
| `config.tracker` | Issue-tracker config: one object or an array; `null` disables enrichment. See `tracker-integration.md`. |

**Distinct concepts:** a *version bump* (`bump`) changes `version.*` and resets `build.number`; a *build* (`build`) increments `build.number`/`build.total` and stamps `build.date`. They are separate commands.
