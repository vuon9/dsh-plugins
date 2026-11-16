# DSH plugins

Plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), one package per directory under `packages/`.

| Plugin | What it does |
| --- | --- |
| [git-bar](packages/git-bar) | A slim line above the message composer showing the current Git branch and the working directory's absolute path side by side. |
| [skills-pane](packages/skills-pane) | Right-side Skills tab listing every skill loaded into the conversation, with its size, reload count, context positions, and turn. Skills a compaction removed stay listed struck through. |

## Install

Open **Plugins** in the left sidebar, choose **Add plugin**, then **Install a third-party plugin**, and enter a Git address with the plugin's subdirectory:

```text
github:vuon9/dsh-plugins#path:/packages/skills-pane
```

A full commit pins the install:

```text
github:vuon9/dsh-plugins#<40-character commit>&path:/packages/skills-pane
```

Each package README has its own requirements, usage notes, and update steps.

## Develop

No build step and no root dependencies.

```bash
node --test packages/*/test/*.test.mjs
```

Add a plugin as a new directory under `packages/`. A bundle needs a `package.json` with a `dsh.bundle.patch`, the patch file, and its runtime files.

## License

MIT
