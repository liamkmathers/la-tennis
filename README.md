# LA Court Watch

Prototype for aggregating Los Angeles tennis court availability into one manual-booking dashboard.

## What works now

- Next.js app at `/`
- Availability API at `/api/availability`
- Live LA Parks WebTrac provider for Cheviot Hills and Westwood
- Opt-in Colorado Park provider through MyiClub credentials
- Filters for date, area, start time, and lights
- Manual booking links for each result

## Private provider setup

TriFit/MyiClub requires a member login. Keep credentials out of source control and pass them through environment variables when starting the dev server:

```sh
TRIFIT_USERNAME="your-username" TRIFIT_PASSWORD="your-password" npm run dev
```

Without those variables, the app still searches the public LA Parks sources and shows a warning for TriFit.

## Adapter contract

Each provider scraper should return normalized slots with this shape:

```js
{
  id: "provider-specific-stable-id",
  sourceId: "laparks",
  venue: "Griffith Park Riverside Courts",
  neighborhood: "Los Feliz",
  address: "3401 Riverside Dr, Los Angeles, CA",
  date: "2026-05-26",
  startTime: "17:00",
  endTime: "18:00",
  courts: 2,
  price: "$12",
  surface: "Hard",
  lights: true,
  indoor: false,
  bookingUrl: "https://..."
}
```

## Next implementation step

Replace the sample slots in `lib/availability.js` with provider adapters. The first websites to send are the ones you already check most often; we can inspect each one and choose the least brittle extraction path, usually in this order:

1. Public JSON/API calls already used by the site
2. Static HTML parsing
3. Browser automation for login-heavy or JavaScript-heavy booking pages
