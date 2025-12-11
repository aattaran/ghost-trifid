# Ghost Trifid - Project Notes

> Last updated: 2025-12-10 @ 1:17 PM CST

---

## 🔴 Current Status (READ THIS FIRST)

| Item | Value |
|------|-------|
| **Monitoring repo** | `aattaran/tiktok` |
| **Twitter quota** | 0/17 (exhausted) |
| **Quota resets** | 2:34 PM CST - Dec 10, 2025 |
| **Autopilot state** | Paused - waiting for quota reset |
| **Last successful post** | Code feature thread about React Hook Form |
| **Posted features** | 3/4 (1 remaining: "API interaction using Axios") |

### Current Blockers

- Twitter daily limit hit - resets at 2:34 PM CST

### Next Steps

- Wait for quota reset, then autopilot will resume automatically
- Or: start new session after 2:34 PM

---

## Current Features ✅

### AutoPilot System

- **Remote repo monitoring** - Watches GitHub repos for new commits
- **Smart content generation** - Uses Gemini to generate threads based on commits
- **Code screenshots** - Shiki + Canvas for beautiful local code images
- **Code-image alignment** - Tweet text describes the actual code shown
- **Storyline continuity** - Posts build on previous content ("Chapter N of your journey")
- **Posting schedule** - Only posts 9 AM - 8 PM CST
- **Daily limit** - 17 posts/day (matches free X API quota)
- **Backfill mode** - Posts about historical commits when idle
- **Feature fallback** - Analyzes code features when commits exhausted

### Integrations

- **Twitter/X API** - Posting tweets, threads with media
- **GitHub API** - Fetch commits, file contents, repo structure
- **Gemini AI** - Content generation (gemini-2.5-flash)
- **Supabase** - Logging and state persistence
- **Mermaid Chart** - Flow diagram integration (SDK installed)

---

## Feature Ideas 💡

### 1. Reply to Mentions About Your Repo

**Status:** Blocked by API limits  
**Problem:** Free X API only allows ~1 search/15 min and 50-100 reads/month  
**Workaround:** Would need Basic tier ($100/mo) for 10K reads/month  
**Alternative:** Manual search + reply via X's native UI

### 2. Generated Flowcharts/Diagrams

**Status:** Partially implemented  
**Notes:** Mermaid SDK installed, tested. Could auto-generate architecture diagrams from code structure.

### 3. Engagement Analytics

**Status:** Not started  
**Idea:** Track which posts perform best, learn patterns

### 4. Multi-Repo Support

**Status:** Not started  
**Idea:** Monitor multiple repos, rotate between them

---

## X API Free Tier Limits (2024)

| Feature | Limit |
|---------|-------|
| Posts (tweets, replies, threads) | 500/month (~17/day) |
| Media uploads | Allowed |
| Read tweets | 50-100/month |
| Search | ~1 req/15 min |
| Likes | ❌ Not allowed |
| Follows | ❌ Not allowed |

---

## Tech Stack

- **Framework:** Next.js 14
- **Styling:** Tailwind CSS
- **AI:** Google Gemini (gemini-2.5-flash)
- **Code Screenshots:** Shiki + @napi-rs/canvas
- **Database:** Supabase
- **APIs:** Twitter v2, GitHub REST

---

## Commands

```bash
# Start dev server
npm run dev

# Run autopilot (headless)
npm run autopilot -- owner/repo

# Test code screenshots
npx tsx test-code-screenshot.ts
```

---

## Recent Changes

### 2025-12-10

- **Code-image alignment** - Tweets now describe the exact code shown in images
- **Storyline continuity** - Added "Chapter N" context for narrative flow
- **ESLint cleanup** - Fixed errors, relaxed overly strict rules
- **Shiki verification** - Confirmed code screenshot generation working
