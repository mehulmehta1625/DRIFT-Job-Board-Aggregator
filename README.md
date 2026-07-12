# DRIFT — Job Board Aggregator (Vanilla JS)

Search remote & European tech jobs with **infinite scroll**, live filters, and
saved listings. Built with **plain HTML, CSS, and JavaScript** — no React, no
framework, no build step. **One file, zero dependencies.** Data comes from the
public [Arbeitnow](https://www.arbeitnow.com) job API via `fetch` (no key, CORS-open).

## Run

Open `index.html` in a browser. That's it.

(If the browser blocks `fetch` from `file://`, serve the folder:
`python -m http.server` then open `http://localhost:8000`.)

Add `?selftest` to the URL to run the built-in assertions in the console.

## Features

- **Infinite scroll** — new pages load automatically as you approach the bottom.
- **Debounced search** — server-side query, reset cleanly on each new term.
- **Client-side filters** — Remote-only, job type, and click any tag to filter by it.
- **Saved jobs** — bookmark listings; they persist in `localStorage` and have their
  own view, available even for jobs not currently loaded.
- **Shareable search** — the query syncs to `?q=…` in the URL.
- **Full state coverage** — skeleton loading, "loading more" spinner, empty state,
  end-of-results, and an error state with a retry button.

## Interview angles (what this demonstrates)

- **IntersectionObserver for infinite scroll** — a sentinel element below the feed
  is observed; when it nears the viewport (`rootMargin: 600px`) the next page loads.
  No scroll-event listeners, no layout thrashing. *(Most students reach for a
  `scroll` handler; this is the correct, efficient pattern.)*
- **Debouncing, hand-written** — search waits 400 ms after the last keystroke before
  hitting the API, so typing doesn't fire a request per character.
- **Race-safe async** — each new search `AbortController.abort()`s the previous
  in-flight request and a monotonic request id discards any stale response, so fast
  typing can never render out-of-order results. A 15 s timeout guards hung requests.
- **XSS-safe rendering** — job data (titles, companies, HTML descriptions) is
  HTML-escaped (`esc`), descriptions are tag-stripped (`stripHtml`), and every URL is
  scheme-checked (`safeUrl` blocks `javascript:`/`data:`) — because raw `innerHTML`
  does not escape the way a framework would.
- **Efficient DOM updates** — a small state object drives rendering; new pages are
  **appended** (not a full re-render) to preserve scroll position, and event
  delegation handles every card action with one listener.
- **Offline / API errors** — offline detection, non-200 handling, and a retry path.

## How it works

1. `load(reset)` fetches a page from Arbeitnow (`?page=` / `?search=`), appends the
   jobs to state, and follows `links.next` for the next page.
2. An `IntersectionObserver` on a bottom sentinel triggers `load(false)` for the
   next page while more results exist.
3. Filters (remote / type / tag / saved) run client-side over the loaded jobs;
   changing one re-renders the feed, appending a page only re-renders the new cards.
4. Saving a job stores the full object under its slug in `localStorage`, so the
   Saved view works independently of what's currently loaded.

## Honest notes

- Arbeitnow skews toward European (often German) listings — it's a real aggregator,
  not a US-only board.
- Filters are client-side over **loaded** pages; infinite scroll keeps pulling more,
  so a narrow filter simply loads additional pages until matches fill the screen.

## Files

```
index.html   markup + CSS + all JavaScript (single self-contained file)
```

## Tech

- **Languages:** HTML, CSS, JavaScript (ES2020, no framework)
- **APIs:** Arbeitnow REST API, Fetch, IntersectionObserver, AbortController,
  localStorage, History
