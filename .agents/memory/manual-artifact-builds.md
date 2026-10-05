---
name: Manual artifact builds
description: Environment values required when building the web artifact outside its managed workflow.
---

When building the Douz Academy Vite artifact directly from the shell, provide `PORT` and `BASE_PATH`; the managed workflow injects both automatically. For the root-mounted app, use `BASE_PATH=/`.

**Why:** a direct build without the workflow environment exits before Vite starts.

**How to apply:** prefer the managed workflow; if a standalone production build is needed, set `PORT` and the artifact's configured `BASE_PATH`.
