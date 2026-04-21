# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

Bespoke internal tools for a small RV/boat storage business. Favor pragmatic, shippable solutions over polished abstractions — this is a one-operator toolbox, not a product.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — type-check (`tsc -b`) then production build
- `npm run lint` — ESLint over the repo
- `npm run format` / `npm run format:check` — Prettier write / check
- `npm run deploy` — build + publish `dist/` to GitHub Pages via `gh-pages`

No test runner is configured yet.

## Architecture

- **Entry:** `src/main.tsx` mounts `<App />` inside `<MantineProvider defaultColorScheme="auto">`. Mantine CSS is imported here — don't re-import per component.
- **UI library:** Mantine v9 (`@mantine/core`, `@mantine/hooks`). Use Mantine primitives (`AppShell`, `Container`, `Title`, etc.) rather than introducing raw HTML + CSS or a second UI system.
- **Layout shell:** `src/components/App.tsx` holds the `AppShell` with header + main. New tools should slot into `AppShell.Main`.
- **Styling:** Mantine + PostCSS (`postcss.config.cjs` with `postcss-preset-mantine` and `postcss-simple-vars`). Prefer Mantine style props and theme tokens over ad-hoc CSS.
- **Deploy target:** GitHub Pages. `vite.config.ts` sets `base: "/outdoor-storage-tools/"` — keep this in mind for any asset paths or client routing.
