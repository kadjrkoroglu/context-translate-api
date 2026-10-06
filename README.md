# Context Translate API

Backend for **Context Translate & Flashcards**, an iOS app (Flutter) for AI translation, photo translation, real-time speech translation and AI vocabulary study.

**Stack:** Node.js 22 · Express 5 · Prisma · PostgreSQL (Supabase) · Firebase (Functions, Auth, Firestore, Hosting) · Google Gemini API

## What it does

- **Translation:** text and on-device-read photo text, with Standard / Formal / Slang variants
- **Live translation:** mints short-lived Gemini Live tokens so the API key never leaves the server; unused minutes are refunded
- **Study with AI:** 10-card tutoring sessions with answer checking, hints, resumable progress and a cooldown
- **Plans and quotas:** Free / Standard / Premium + trials; daily limits, token buckets and time-based quotas, all editable in the database
- **Account deletion:** removes database rows, synced data and the login

## Highlights

- Every request is authenticated (Firebase ID token); plans and limits are enforced only on the server
- Prompt-injection hardening: user text sent as data, fixed JSON replies, server-verified AI decisions
- Race-safe sessions (row locks, optimistic concurrency), rate limits and input validation
- Photos never leave the device; explicit consent before data goes to the AI provider

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/translate` | Text translation |
| `POST` | `/translate/photo` | Photo text translation + word list |
| `GET` | `/entitlements` | Plan and remaining quotas |
| `POST` | `/live/session` · `/live/session/end` | Start / end a Live session |
| `GET` `POST` | `/study` · `/study/start` · `/study/answer` | Study with AI |
| `DELETE` | `/account` | Delete the account |
