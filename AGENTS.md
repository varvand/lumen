# Working on Lumen

Rules for every contributor and coding agent working in this repository.

## Branches

| Branch           | Purpose                                                       | How changes arrive                     |
| ---------------- | ------------------------------------------------------------- | -------------------------------------- |
| `main`           | Releases. Every merge publishes a new version to all users.   | Pull request from `dev` only           |
| `dev`            | Integration. Collects work that is done and passes CI.        | Direct push, or merge of a feature     |
| `feature/<name>` | Large or risky work that is not ready to share with `dev` yet | Direct push by whoever owns the branch |

- **Never push to `main`.** It is protected: changes need a pull request with passing CI. A merge to `main` triggers the Main build, which publishes a tagged release and an in-app update to every installed copy.
- **Default: work on `dev`.** Commit there and push when the change works and the checks below pass.
- **Big feature you are building on your own:** push the finished work to `dev`, then open a pull request from `dev` to `main` and merge it once CI passes, so it ships as its own release.
- **Really big or risky work:** use a `feature/<name>` branch from `dev`. When it works end to end, merge it into `dev`. Let `dev` collect several working changes, then merge `dev` into `main` as one bigger release.
- Never force-push `main` or `dev`, and never delete `dev`. Merge with merge commits (`gh pr merge --merge`), and do not pass `--delete-branch` when merging `dev`.
- Another session may be working in the same checkout. Run `git status` before committing, and stage only your own files.

```sh
# Ship dev to main
gh pr create --base main --head dev --title "<release summary>" --body "<what changed>"
gh pr checks --watch
gh pr merge --merge
```

## Before pushing

CI runs these on every push to `dev` and on pull requests; `main` requires them to pass.

```sh
npx prettier --check src e2e docs README.md vite.config.ts playwright.config.ts
npm run check
npm test
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features
```

The Linux release job builds the desktop app on Ubuntu 22.04, so platform-specific Rust must compile on macOS and Linux.

## Commits and GitHub

- No AI-assistant attribution anywhere: no co-author trailers, "generated with" lines, or assistant names in commit messages, pull requests, code comments, or docs. Product names for integrations the app supports are fine in the app's UI and user docs.
- Use plain `git` and `gh` commands for GitHub work.
- Never commit secrets. The updater signing key lives outside the repository and in the `TAURI_SIGNING_PRIVATE_KEY` repository secrets; only its public key belongs in `src-tauri/tauri.conf.json`.

## Versions

CI numbers builds `<major>.<minor>.<run number>` (see `scripts/build-version.sh`). To mark a bigger release, bump the minor or major version in `src-tauri/tauri.conf.json`; a patch bump has no effect.
