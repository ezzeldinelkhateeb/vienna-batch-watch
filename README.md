# Vienna Batch Watch

# Prompt for Lovable.ai — Vienna Raw Material Expiry Tracker

Build a professional, production-ready web application from scratch called

**"Vienna Expiry Tracker"** for a chocolate manufacturing company. Read this

entire brief before generating any code — it fully describes the business

context, every feature, the visual identity, and the technical requirements.

No reference files are attached; this document is the complete and only

source of truth.

---

## 1) Business Context

The user is a **Quality Assurance Engineer** at **Vienna — High Quality

Chocolate**, a chocolate and confectionery manufacturer. He manages a large

inventory of raw materials and ingredients (chocolate, sugar, cocoa butter,

etc.) and needs a system that:

- Tracks the expiry date of every raw material batch.

- Visually warns him well before anything expires, using a color-coded

  urgency system.

- Automatically sends WhatsApp alerts when an item crosses into a new

  urgency level, so he never has to check the app manually to catch a

  problem.

- Can be used by more than one team member, from more than one device

  (desktop and mobile), via a real hosted web URL.

---

## 2) Recommended Tech Stack

Use Lovable's native stack, structured as follows:

- **Frontend:** React + Vite + TypeScript + Tailwind CSS

- **Backend / Database / Auth:** Supabase (Postgres database, Supabase Auth

  for login, Supabase Edge Functions for the WhatsApp-sending logic)

- **Scheduled daily check:** Supabase Scheduled Edge Function (pg_cron or

  Supabase's built-in cron trigger) that runs once every 24 hours to check

  every item's status and send WhatsApp alerts for any item that just

  crossed into a new urgency level.

- **Hosting:** Deployable directly from Lovable; the project should also be

  exportable/pushable to a clean GitHub repository.

If you believe a different combination within Lovable's supported stack

serves these requirements better, you may propose it — but justify why.

---

## 3) Core Data Model — "Item"

Each inventory item has the following fields:

| Field | Type | Required | Notes |

|---|---|---|---|

| Name | text | Yes | The raw material / item name |

| Supplier | text | No | Supplier or vendor company name |

| Production Date | date | No | |

| Expiry Date | date | Yes | Used to compute urgency status |

| Quantity | number | No | e.g. 250 |

| Unit | text | No | e.g. kg, ton, box/carton |

| Notes | text | No | Free text |

| Last Notified Status | text (internal) | — | Used to avoid sending duplicate WhatsApp alerts for the same status |

Full CRUD is required: create, edit, delete, and list — with the list

**always sorted by expiry date, soonest first.**

---

## 4) Color-Coded Status Engine (the core feature)

Status is **computed dynamically every time the data is viewed**, based on

`(expiry_date - today's actual date)`, not stored as a fixed value. It must

recalculate automatically every day with no manual action needed.

| Status | Days remaining until expiry | Color |

|---|---|---|

| Normal | More than 90 days (3 months) | Green |

| Early warning | 90 down to 61 days | Yellow |

| Medium warning | 60 down to 31 days | Orange |

| Critical warning | 30 down to 0 days | Red |

| Expired | Less than 0 (past expiry date) | Dark gray/black |

- These thresholds (90 / 60 / 30) should be **configurable in a settings

  screen**, not hardcoded, so they can be tuned later without code changes.

- Next to every item, show a clear, human-readable countdown, e.g.

  *"2 months and 5 days left (65 days)"*, and for expired items show *"Expired

  16 days ago"*. This must also recompute live from the real current date.

- Add a small color legend above the table explaining what each color means.

---

## 5) WhatsApp Notifications

- Use the free **CallMeBot WhatsApp API** (`api.callmebot.com/whatsapp.php`)

  — a simple GET request with `phone`, `text`, and `apikey` parameters.

  CallMeBot requires the user to activate their number once by messaging a

  specific bot number on WhatsApp; the app itself does not handle that

  activation, only sends messages after the user has activated it and

  entered their phone number and API key in Settings.

- Build a **Settings** screen where the user enters and saves:

  - Their WhatsApp phone number (international format)

  - Their CallMeBot API key

  - A "Send test message" button to confirm the connection works

- The scheduled daily check must, for every item:

  1. Recompute its current status.

  2. If the status is one of yellow/orange/red/expired **and** it differs

     from that item's stored `last_notified_status`, send a WhatsApp message

     containing: item name, supplier, quantity + unit, expiry date, and days

     remaining — then update `last_notified_status` to the new status.

  3. If an item's status returns to green (e.g. its expiry date was

     updated/extended with a new batch), reset `last_notified_status` so

     future warnings can fire again.

  4. Never send a duplicate alert for a status the item was already

     notified about.

---

## 6) Multi-Language Support (Arabic / English)

- A single toggle button switches the **entire UI** between Arabic and

  English — every label, button, table header, and message.

- Arabic must render **RTL** (right-to-left) layout; English must render

  **LTR**. The toggle must flip the whole page direction, not just translate

  text.

- Implement this with a proper i18n approach (e.g. a translation dictionary

  + React context), not scattered hardcoded strings.

- Default language on first load: Arabic.

---

## 7) Multi-User Access

- Simple email/password authentication via Supabase Auth — this app will be

  hosted on a public URL, so it must not be open to anyone without login.

- All authenticated users share **one common inventory** (this is a shared

  company system, not per-user private data) — the goal is multiple team

  members tracking the same stock together.

- Nice-to-have (implement if straightforward): a basic role field

  (`admin` vs `member`) where only admins can edit WhatsApp/threshold

  settings, while all logged-in users can add/edit/delete items.

---

## 8) Visual Identity / Branding

Recreate this exact brand feel (this is the company's own branding, to be

used for their own internal tool):

- **Header background:** dark cocoa-brown gradient, from `#3c2415` to

  `#2a1810`, with a **3px solid burnt-orange border** (`#c1621f`) along the

  bottom edge.

- **Logo/company name "Vienna":** rendered in a cursive/script font (use a

  Google Font like `Great Vibes` or similar), in burnt-orange `#c1621f`,

  roughly 40-44px.

- **Tagline "HIGH QUALITY CHOCOLATE":** directly below the name, uppercase,

  small (~13px), letter-spaced, same burnt-orange color, bold weight.

- **System subtitle:** below the tagline, small light beige text (~13px),

  saying "Raw Material Expiry Tracking System" (or its Arabic translation

  when in Arabic mode).

- **General page background:** warm off-white `#f5f1ea`.

- **Body font:** a clean modern sans-serif (e.g. `Poppins` or `Inter`) for

  everything except the script-font brand name.

- **Status colors** (used for badges/pills and table row tinting):

  - Green `#3fa34d`

  - Yellow `#e6b800`

  - Orange `#e2792d`

  - Red `#d63b2f`

  - Expired/dark gray `#4a4a4a`

- Table rows should have a subtle background tint matching their status

  color (very light tint, not full saturation) so the whole table is

  scannable at a glance.

- Status shown as a rounded "pill" badge with white text in the status

  color, placed in the first column of each row.

---

## 9) Pages / Screens Required

1. **Login** — email + password (Supabase Auth).

2. **Main Dashboard / Inventory page:**

   - "Add new item" form (all fields from section 3).

   - Color legend.

   - Items table with all fields, computed status pill, computed countdown,

     and Edit/Delete actions per row.

   - Language toggle + Settings button in the header.

3. **Settings modal/page:**

   - WhatsApp phone number + CallMeBot API key fields, Save button, Send

     Test Message button, with clear success/failure feedback.

   - (Optional, admin-only) Editable urgency thresholds (90/60/30 days).

---

## 10) Non-Functional Requirements

- Fully **responsive** — this will be used heavily from phones, not just

  desktop.

- Clear loading states and error messages for every action (add, edit,

  delete, save settings, send test message).

- Input validation: item name and expiry date are required; quantity must

  be a non-negative number if provided.

- No secrets (API keys, DB credentials) hardcoded anywhere in the frontend

  code — WhatsApp credentials are stored per-account in the database (via

  Settings), not as environment secrets, since they belong to the business

  user, not the developer.

- Clean, well-organized project structure (components, hooks, types,

  Supabase client, Edge Functions clearly separated).

---

## 11) Natural Future Enhancements (implement if time allows, without cutting any requirement above)

- Search/filter bar above the table (filter by name, supplier, or status

  color).

- Export the current inventory table to Excel/CSV.

- A small stats dashboard at the top: count of items in each status

  (green/yellow/orange/red/expired).

- A "Notifications Log" page showing a history of WhatsApp alerts that were

  sent and when.

- Dark mode toggle.

---

## 12) Definition of Done

- [ ] Login works and blocks unauthenticated access to the inventory.

- [ ] Full CRUD on items works and persists in Supabase.

- [ ] Status colors and countdowns are computed live from the real current

      date — not hardcoded or stale.

- [ ] A test WhatsApp message can be sent successfully via CallMeBot from

      the Settings screen.

- [ ] The scheduled daily check is configured and will fire real alerts

      automatically once deployed.

- [ ] Language toggle correctly switches all text and page direction

      (RTL/LTR) with no leftover untranslated strings.

- [ ] The visual identity (colors, header, script logo, fonts) matches

      section 8 exactly.

- [ ] The app is fully usable on a mobile screen.

Build this as a complete, coherent application — not a partial prototype.

Start with the Supabase schema and auth, then the core inventory CRUD and

status engine, then the WhatsApp integration and scheduled function, then

polish the branding and responsiveness last.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://goodie-guard.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/052f8aee-90dd-47a3-95c1-59bc08e5da39).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
