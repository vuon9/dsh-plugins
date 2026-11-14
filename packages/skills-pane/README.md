# Skills pane

A right-side **Skills** tab for DeepSeek Harness. It lists every skill loaded into the current conversation.

Part of the [dsh-plugins](https://github.com/vuon9/dsh-plugins) collection.

Each row shows the skill name, its size in the context, its extra reloads, where its loaded copies sit in the context (as a percentage, oldest to newest), and the turn of the latest copy. A skill whose instructions a compaction removed stays listed, dimmed and struck through, so you can see what the model used to have. While another copy is still in the context, the row stays live and describes that copy.

The bar above the rows maps the skill text onto the current context: each colored block is one live copy, placed where it starts and sized by its share. The percentage beside the bar is how much of the current context is skill text. Colors follow size: green under 2k tokens, amber from 2k to 6k, red from 6k.

## Install

Requires DeepSeek Harness 0.2.2-rc.3 or later in the 0.2 line, with the Web GUI.

1. Open **Plugins** in the left sidebar.
2. Choose **Add plugin**, then **Install a third-party plugin**.
3. Enter `github:vuon9/dsh-plugins#path:/packages/skills-pane`. A full commit pins the install: `github:vuon9/dsh-plugins#<40-character commit>&path:/packages/skills-pane`.
4. Install, then switch the bundle on if it is not running.

A local checkout installs the same way with its absolute directory path. An agent can install it with `plugin_manager` and `install_bundle`.

To update, install the repository again at the new commit. Installs from Git show no version list.

## Open it

1. Open the right sidebar from the conversation header.
2. If the sidebar shows the Start page, pick **Skills**. Otherwise choose **New tab** in the tab strip, then pick **Skills**.

## What it reads

The Host half folds the session log into a `skillsPane` projection: `skill` tool results, `/name` skill invocations, and compaction surface replacements. The Client half only draws the finished value. Nothing is written to the session log, and no network request is made.

Skills loaded before the pane is mounted are included, because the fold starts from the session's first event. Positions are shares of the current context, so they shrink as the conversation grows after a load; a copy that leaves the context keeps the position it had when it left.

Sizes are estimates. The pane prices text with the token meter's fixed-density heuristic: four characters per token, plus per-block and per-role overhead. Provider token counts can differ. The share denominator is the heuristic context total, not the model's context window.

## Develop

No build step and no dependencies.

```bash
node --test test/fold.test.mjs
```

To try a checkout before sharing it, link it with **Plugins** > **Add plugin** and its absolute path, then delete the link with **Remove**.

## License

MIT
