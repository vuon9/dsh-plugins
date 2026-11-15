# AGENTS.md

Guidance for DSH agents working in this repository. It holds DSH plugins, one per directory under `packages/`.

## Install a plugin

Ask the user first. Installing a bundle changes the profile for every session.

1. Read `packages/<name>/README.md` for requirements and the surface to check.
2. Call `plugin_manager` with `action: install_bundle` and this target:

   ```text
   github:vuon9/dsh-plugins#path:/packages/<name>
   ```

   Pin the current commit when the install should be reproducible:

   ```text
   github:vuon9/dsh-plugins#<40-character commit>&path:/packages/<name>
   ```

3. Accept only `application: applied`. Report `restart-required` to the user and stop. A successful package install alone is not a working plugin.
4. Ask the user to refresh the Web GUI, then check the plugin's surface.

The call may ask for approval. If `plugin_manager` is not available, give the user the manual steps instead of editing files:

1. Open **Plugins** in the left sidebar.
2. Choose **Add plugin**, then **Install a third-party plugin**.
3. Enter the same target and install.
4. Confirm the bundle is on.

A local checkout installs as a link:

```text
/absolute/path/to/dsh-plugins/packages/<name>
```

Use that only while developing. A link follows the working tree, so code changes reach the running plugin after a refresh or restart.

## Update a plugin

Install the new commit again. When the manager reports `already-installed`, remove the bundle first with `plugin_manager` `remove_bundle` and the package name, then install the new target.

## Rules

- Do not edit the profile's `package.json` or `cordis.patch.yml`, and do not run package managers in the profile directory.
- Keep each package plain JavaScript with no build step. Add a test under `test/` and run it with `node --test packages/*/test/*.test.mjs`.
- Use made-up names and values in tests. Never commit a machine path, a token, or a real advisory.

## Packages

| Package | Directory | Install target |
| --- | --- | --- |
| `dsh-git-bar` | `packages/git-bar` | `github:vuon9/dsh-plugins#path:/packages/git-bar` |
| `dsh-skills-pane` | `packages/skills-pane` | `github:vuon9/dsh-plugins#path:/packages/skills-pane` |
