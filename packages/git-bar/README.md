# Git bar

A slim line directly above the message composer in DeepSeek Harness. It shows, side by side, the branch of the directory the conversation is working in and that directory's absolute path — no button, nothing to open.

Part of the [dsh-plugins](https://github.com/vuon9/dsh-plugins) collection.

The line is one raised row: a branch mark, the branch name, a separator, then the path in monospace. It takes the composer card's own fill, hairline, and soft elevation, and matches its width and 12px inner padding, so it reads as the input area's top edge rather than as floating text. Being the composer's width, the usual branch and path fit together without truncation; when the window is narrower, the path ellipsizes from the right and its full value stays available as a hover title. A detached checkout reads `Detached at <commit>`, a directory outside a Git checkout reads `Not a Git checkout`, a checkout whose files cannot be read reads `Branch unreadable`, and a route that does not answer reads `Branch unavailable` — the path stays visible in every case.

## Install

Requires DeepSeek Harness 0.2.2-rc.3 or later in the 0.2 line, with the Web GUI.

1. Open **Plugins** in the left sidebar.
2. Choose **Add plugin**, then **Install a third-party plugin**.
3. Enter `github:vuon9/dsh-plugins#path:/packages/git-bar`. A full commit pins the install: `github:vuon9/dsh-plugins#<40-character commit>&path:/packages/git-bar`.
4. Install, then switch the bundle on if it is not running.

A local checkout installs the same way with its absolute directory path. An agent can install it with `plugin_manager` and `install_bundle`.

To update, install the repository again at the new commit. Installs from Git show no version list.

## Where it sits

The line registers in `conversation.input.dock`, the full-width strip directly above the composer card, at order 19 — below the goal and worktree cards and above the queued-message strip, so it reads as the composer's own edge. It appears in every conversation and needs no setup.

The placement is deliberate. A branch name is occasionally long and a path is always long, so both need horizontal room; a full-width line gives that, while a chip in the centered statistics row below the composer competes with the activity and usage readings for the same few hundred pixels.

The bar is one fixed 28px row with no states to change its height, and it borrows the composer card's geometry rather than the dock cards' inset width: `--dsh-composer-side-clearance` on each side plus `--dsh-composer-card-max-width`, the same two values the card uses. That is what keeps its edges on the chatbox's edges at every window size, while the todo, goal, and queue cards stay inset by the dock's own margin above it.

Because both facts are always shown, there is no disclosure control: the line never opens, never grows, and never moves the composer.

## What it reads

The Host half serves one authenticated `GET /__dsh-git-bar/state?sessionId=<id>` route. For that Session it resolves the effective working directory through `sessionQuery` and `workingDirectory`, then reads the checkout's own administrative files:

- `<checkout>/.git/HEAD` for a repository checkout;
- for a linked worktree or a submodule, the `gitdir:` pointer in the checkout's `.git` file, then `HEAD` inside that Git directory.

No subprocess runs, so the line is independent of the Git executable, the sandbox policy, and subprocess configuration. The route returns the branch, the detached commit, whether the `.git` entry is a pointer file, and the checkout root. Nothing is written to the session log, and no model input is added.

The Client half reads that route when the line mounts, when the Session changes, when the window regains focus, when the tab becomes visible again, and every 20 seconds while the tab is visible. A failed read keeps the branch it already knew. The path reads the built-in `workingDirectory` session projection first and falls back to the route's answer, so it follows a directory change immediately and works even when the route cannot be reached.

## Requirements and limits

- The Host composition needs `webServer`, `connection`, `sessionQuery`, and `workingDirectory`. Without them the Host half stays inactive and the line reads `Branch unavailable`, while the path still comes from the projection.
- The branch is read over the page's own HTTP origin with the browser session cookie. A page loaded from `file://` cannot answer the route, so only the path shows there.
- Branch and path describe the Session's working directory, not the repository that owns it. Inside a subdirectory of a checkout, the line shows the enclosing checkout's branch and the subdirectory's absolute path.
- A window too narrow for the whole path ellipsizes it from the right; hover the path to read it in full. The branch yields up to 45% of the line before it ellipsizes in turn.
- The line holds one 28px row above the composer for as long as a conversation is open.
- The line re-reads on the schedule above; a branch switched in a terminal can take up to 20 seconds to appear, or appear at once when the window regains focus.

## Develop

No build step and no dependencies.

```bash
node --test test/git.test.mjs
```

The test builds throwaway checkouts, worktrees, and detached heads in the OS temp directory; it needs no Git install and touches no real repository.

To try a checkout before sharing it, link it with **Plugins** > **Add plugin** and its absolute path, then delete the link with **Remove**.

## License

MIT
