# Git bar

A slim line directly above the message composer in DeepSeek Harness. It always shows the branch of the directory the conversation is working in, and its **Path** button opens a second full-width line with that directory's absolute path.

Part of the [dsh-plugins](https://github.com/vuon9/dsh-plugins) collection.

Closed, the line is one row of chrome: a branch mark, the branch name, and **Path** with a chevron. It has the composer's width, so an ordinary branch name fits without truncation; a name too long for the window ellipsizes, and its full text stays available as a hover title. Pressing **Path** opens the path line beneath the row, inside the same width; pressing it again closes it, and the line takes a quiet surface while it is open. A detached checkout reads `Detached at <commit>`, a directory outside a Git checkout reads `Not a Git checkout`, a checkout whose files cannot be read reads `Branch unreadable`, and a route that does not answer reads `Branch unavailable` — the line itself stays put in every case.

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

The placement is deliberate. A branch name is occasionally long and a path is always long, so both need horizontal room and a home that can grow a second line; the centered statistics row below the composer has neither, which is why this is not a chip there. To keep the strip from competing with the contextual cards in the same stack (todo, worktree creation, goal, queue), the line is chrome rather than a card: transparent and borderless while closed, so only the words are visible.

## What it reads

The Host half serves one authenticated `GET /__dsh-git-bar/state?sessionId=<id>` route. For that Session it resolves the effective working directory through `sessionQuery` and `workingDirectory`, then reads the checkout's own administrative files:

- `<checkout>/.git/HEAD` for a repository checkout;
- for a linked worktree or a submodule, the `gitdir:` pointer in the checkout's `.git` file, then `HEAD` inside that Git directory.

No subprocess runs, so the line is independent of the Git executable, the sandbox policy, and subprocess configuration. The route returns the branch, the detached commit, whether the `.git` entry is a pointer file, and the checkout root. Nothing is written to the session log, and no model input is added.

The Client half reads that route when the line mounts, when the Session changes, when the window regains focus, when the tab becomes visible again, and every 20 seconds while the tab is visible. A failed read keeps the branch it already knew. The path line reads the built-in `workingDirectory` session projection first and falls back to the route's answer, so it follows a directory change immediately and works even when the route cannot be reached.

## Requirements and limits

- The Host composition needs `webServer`, `connection`, `sessionQuery`, and `workingDirectory`. Without them the Host half stays inactive and the line reads `Branch unavailable`, while the path line still works from the projection.
- The branch is read over the page's own HTTP origin with the browser session cookie. A page loaded from `file://` cannot answer the route, so only the path line works there.
- Branch and path describe the Session's working directory, not the repository that owns it. Inside a subdirectory of a checkout, the line shows the enclosing checkout's branch and the subdirectory's absolute path.
- The line re-reads on the schedule above; a branch switched in a terminal can take up to 20 seconds to appear, or appear at once when the window regains focus.
- Closed, the line holds one 26px row above the composer for as long as a conversation is open. Opened, it adds the path row inside the same width and wraps a long path instead of scrolling it.

## Develop

No build step and no dependencies.

```bash
node --test test/git.test.mjs
```

The test builds throwaway checkouts, worktrees, and detached heads in the OS temp directory; it needs no Git install and touches no real repository.

To try a checkout before sharing it, link it with **Plugins** > **Add plugin** and its absolute path, then delete the link with **Remove**.

## License

MIT
