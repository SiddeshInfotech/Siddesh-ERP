# Project Directory Structure & File Information

This document provides a comprehensive overview of the files and directories inside the **Siddesh ERP** monorepo.

---

## 📂 Root Directory

* **`.env.example`**
  Template containing placeholders for project-wide environment variables (e.g., `SUPABASE_URL`, `SUPABASE_ANON_KEY`).
* **`.gitignore`**
  Tells Git which files and directories to ignore (e.g., `node_modules`, build outputs, actual `.env` files).
* **`package.json`**
  Monorepo root configuration. It defines NPM Workspaces (`apps/*`, `packages/*`) and shared project-wide dependencies.
* **`package-lock.json`**
  Locked down exact versions of installed node dependencies to ensure reproducible builds.
* **`README.md`**
  General overview and starting instructions for the repository.

---

## 📂 `Document/` (Project Docs)

Stores architectural blueprints, sprint goals, rules, and requirement sheets:
* **`Contract.md`**
  The locked-down API/RPC contract between frontend and backend. Defines function signatures and response schemas.
* **`Plan.md`**
  Architectural plan and security decisions (e.g., avoiding direct DB access, handling race conditions).
* **`Tech-Stack.md`**
  Comprehensive list of technologies, frameworks, and packages chosen for mobile, desktop, and backend.
* **`directory_Info.md`** *(This file)*
  Explains the purpose of each file and folder in the codebase.
* **`m.md`**
  Task list and timeline for Mahim (Backend / Supabase Sprint).
* **`s.md`**
  Task list and timeline for Shrusti (Mobile / Expo Sprint).
* **`Software Requirement Document (SRD) - Inventory Management.pdf`**
  The official requirement sheet provided by the client detailing ERP specifications.

---

## 📂 `supabase/` (Backend Schema)

Contains local Supabase configuration and database schemas:
* **`seed.sql`**
  SQL script containing seed data (e.g., pre-populated offices, test products, starting stock) for local setup.
* **`migrations/`**
  Directory to hold incremental SQL database migration files tracking schema evolution (tables, functions, policies).
* **`.temp/`**
  Local cache or scratch folder managed by the Supabase CLI.

---

## 📂 `packages/` (Shared Monorepo Workspace)

Packages shared across different frontend apps:

### 📁 `packages/shared/`
* **`package.json`**
  Defines this directory as a workspace package (`@siddesh-erp/shared`).
* **`tsconfig.json`**
  TypeScript compiler settings for sharing code safely.
* **`index.ts`**
  Main entry file exporting utility functions, constants, or types.
* **`database.types.ts`**
  Type definitions automatically generated from the Supabase Postgres schema. Shared by both mobile and desktop.

---

## 📂 `apps/` (Application Workspaces)

Contains individual deployable application sub-projects:

### 📁 `apps/desktop/` (Electron App)
* **`package.json`**
  Package metadata, startup scripts, and dependencies for the Electron application.
* **`tsconfig.json`**
  TypeScript settings for the Electron app processes.
* **`electron.vite.config.ts`**
  Vite configuration file tailored for Electron (`electron-vite`), orchestrating separate bundles for main, preload, and renderer processes.

#### 📁 `apps/desktop/src/` (Source Files)
* **`main/index.ts`**
  The **Main Process** entry point. Runs in a Node.js environment; controls application lifecycle, window instantiation, OS integrations, and IPC event listeners.
* **`preload/index.ts`**
  The **Preload Process** script. Runs before the renderer loads; acts as a secure bridge exposing selective APIs (via `contextBridge`) from Main to Renderer.
* **`renderer/index.html`**
  Base HTML shell loaded by the Electron Browser Window. Hosts the React bundle.
* **`renderer/src/main.tsx`**
  React entry script that mounts the application into the HTML DOM.
* **`renderer/src/App.tsx`**
  Main React Application component configuring views, state providers, and layouts.
* **`renderer/src/styles.css`**
  App-wide stylesheet containing Tailwind CSS directives.
* **`renderer/src/env.d.ts`**
  TypeScript helper definitions to recognize Vite environment variables.
* **`renderer/src/components/`**
  Reusable React components (buttons, inputs, cards) specific to desktop.
* **`renderer/src/lib/`**
  Utilities and API clients (e.g., Supabase client configuration).
* **`renderer/src/routes/`**
  Page-level React components representing different application routes.
