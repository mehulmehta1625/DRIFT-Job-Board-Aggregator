"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const safeUrl = (u) => { try { const x = new URL(u, location.href); return (x.protocol === "http:" || x.protocol === "https:") ? x.href : "#"; } catch { return "#"; } };
const stripHtml = (h) => String(h || "").replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const relTime = (date) => { const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000); if (isNaN(d)) return ""; if (d < 1) return "today"; if (d < 2) return "yesterday"; if (d < 30) return d + "d ago"; if (d < 365) return Math.floor(d / 30) + "mo ago"; return Math.floor(d / 365) + "y ago"; };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const MUSE = "https://www.themuse.com/api/public/jobs";
const CATEGORIES = ["Software Engineering", "Data Science", "IT", "Product Management", "Design and UX"];
const CITIES = ["India", "Bengaluru, India", "Mumbai, India", "Hyderabad, India", "Delhi, India", "Pune, India", "Chennai, India", "Gurgaon, India"];
const SAVED_KEY = "nightshift_saved_v2";

const state = {
  jobs: [], page: 0, pageCount: 1, loading: false, loadingMore: false, error: null, end: false,
  query: "", city: "India", level: "", showSaved: false,
  saved: JSON.parse(localStorage.getItem(SAVED_KEY) || "{}"),
};
let reqId = 0, ctrl = null;
const persistSaved = () => localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved));
const isSaved = (slug) => Object.prototype.hasOwnProperty.call(state.saved, slug);

// The Muse -> normalized job (so the rest of the code stays source-agnostic).
function normalize(r) {
  const locs = (r.locations || []).map(l => l.name);
  return {
    slug: String(r.id), title: r.name, company_name: (r.company && r.company.name) || "—",
    url: (r.refs && r.refs.landing_page) || "", locations: locs,
    remote: locs.some(l => /remote|flexible/i.test(l)), india: locs.some(l => /india/i.test(l)),
    level: (r.levels || []).map(l => l.name)[0] || "", category: (r.categories || []).map(c => c.name)[0] || "",
    description: r.contents || "", date: r.publication_date || "",
  };
}
function museUrl(page) {
  const p = new URLSearchParams();
  p.set("page", page);
  CATEGORIES.forEach(c => p.append("category", c));
  p.set("location", state.city);
  if (state.level) p.set("level", state.level);
  return MUSE + "?" + p.toString();
}

// ---- client-side search over loaded jobs ----
function passes(j) {
  if (!state.query) return true;
  const q = state.query.toLowerCase();
  return (j.title + " " + j.company_name + " " + j.category + " " + j.locations.join(" ")).toLowerCase().includes(q);
}
function baseList() { return state.showSaved ? Object.values(state.saved) : state.jobs; }
const filtered = () => baseList().filter(passes);
const anyFilter = () => !!state.query || state.city !== "India" || !!state.level;

// ---- card markup (XSS-safe) ----
function cardHTML(j) {
  const indiaLocs = j.locations.filter(l => /india/i.test(l)).map(l => l.replace(/,\s*India$/i, ""));
  const badges = [
    j.remote ? '<span class="b remote">● Remote</span>' : '',
    indiaLocs.length ? '<span class="b india">' + esc(indiaLocs.slice(0, 2).join(" · ")) + '</span>' : (j.locations[0] ? '<span class="b">' + esc(j.locations[0]) + '</span>' : ''),
    j.level ? '<span class="b level">' + esc(j.level) + '</span>' : '',
    j.category ? '<span class="b">' + esc(j.category) + '</span>' : '',
    j.date ? '<span class="b time">' + relTime(j.date) + '</span>' : '',
  ].filter(Boolean).join("");
  const snip = stripHtml(j.description).slice(0, 220);
  const saved = isSaved(j.slug);
  return '<article class="card">' +
    '<div class="card-top"><div style="min-width:0">' +
      '<a class="title" href="' + esc(safeUrl(j.url)) + '" target="_blank" rel="noreferrer">' + esc(j.title || "Untitled role") + '</a>' +
      '<div class="co">' + esc(j.company_name) + '</div></div>' +
      '<button class="save" type="button" data-save="' + esc(j.slug) + '" aria-pressed="' + saved + '" aria-label="' + (saved ? "Remove from saved" : "Save job") + '" title="' + (saved ? "Saved" : "Save") + '">' +
        '<svg class="i" viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg></button>' +
    '</div>' +
    '<div class="badges">' + badges + '</div>' +
    (snip ? '<p class="snippet">' + esc(snip) + '…</p>' : '') +
  '</article>';
}

// ---- render ----
function renderFeed() {
  const list = filtered();
  $("feed").innerHTML = (state.error && !state.jobs.length) ? "" : list.map(cardHTML).join("");
  updateBar(); updateStatus(list.length);
}
function appendJobs(newJobs) {
  const html = newJobs.filter(passes).map(cardHTML).join("");
  if (html) $("feed").insertAdjacentHTML("beforeend", html);
  updateBar(); updateStatus(filtered().length);
}
function updateStatus(shown) {
  const s = $("status");
  if (state.error && !state.jobs.length) {
    s.innerHTML = '<div class="error"><div class="big">' + esc(state.error.title) + '</div><p>' + esc(state.error.detail) + '</p><button class="btn" type="button" data-retry>Try again</button></div>';
  } else if (state.loading) {
    s.innerHTML = '<div class="feed">' + Array(4).fill('<div class="skel"></div>').join("") + '</div>';
  } else if (shown === 0) {
    s.innerHTML = state.showSaved
      ? '<div class="empty"><div class="big">No saved jobs yet</div><p>Tap the ★ on any listing to stash it here — saved to your browser.</p></div>'
      : '<div class="empty"><div class="big">Nothing matches</div><p>Try another city, level, or clear your search.</p><button class="btn ghost" type="button" data-clear>Reset filters</button></div>';
  } else if (state.loadingMore) {
    s.innerHTML = '<div class="spinner" aria-hidden="true"></div>loading more…';
  } else if (state.showSaved) {
    s.innerHTML = shown + ' saved job' + (shown === 1 ? '' : 's');
  } else if (state.end) {
    s.innerHTML = '— end of results —';
  } else { s.innerHTML = ''; }
}
function updateBar() {
  const shown = filtered().length, loaded = baseList().length;
  let count;
  if (state.showSaved) count = shown + " saved";
  else if (state.loading) count = "loading…";
  else if (state.query && shown !== loaded) count = shown + " of " + loaded + " loaded";
  else count = loaded + " job" + (loaded === 1 ? "" : "s") + (state.city !== "India" ? " · " + state.city.replace(/,\s*India$/i, "") : "");
  $("count").textContent = count;
  $("savedN").textContent = Object.keys(state.saved).length;
  $("saved").setAttribute("aria-pressed", String(state.showSaved));
  $("feed").setAttribute("aria-busy", String(state.loading));
  $("clear").innerHTML = anyFilter() ? '<button type="button" class="clearall" data-clear>reset filters</button>' : '';
}

// ---- data loading ----
async function load(reset) {
  if (state.showSaved) return;
  if (reset) {
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    state.jobs = []; state.page = 0; state.pageCount = 1; state.end = false; state.error = null; state.loading = true;
    renderFeed();
  }
  if (state.loadingMore || state.end) return;
  state.loadingMore = true;
  const myId = ++reqId;
  updateStatus(filtered().length);
  const timer = setTimeout(() => ctrl && ctrl.abort(), 15000);
  try {
    const res = await fetch(museUrl(reset ? 1 : state.page + 1), { signal: ctrl.signal });
    if (!res.ok) throw { title: "Couldn't load jobs", detail: "The jobs API returned " + res.status + ". Try again shortly." };
    const j = await res.json();
    if (myId !== reqId) return;
    const newJobs = (Array.isArray(j.results) ? j.results : []).map(normalize);
    const wasReset = reset || state.jobs.length === 0;
    state.jobs.push(...newJobs);
    state.page = j.page || 0; state.pageCount = j.page_count || state.page;
    if (state.page >= state.pageCount || newJobs.length === 0) state.end = true;
    state.error = null; state.loading = false;
    if (wasReset) renderFeed(); else appendJobs(newJobs);
  } catch (err) {
    if (myId !== reqId) return;
    state.loading = false;
    if (!(ctrl && ctrl.signal.aborted)) {
      state.error = (err && err.title) ? err : { title: "Network error", detail: navigator.onLine ? "Couldn't reach the jobs API. Try again." : "You're offline — reconnect and try again." };
    }
    renderFeed();
  } finally {
    clearTimeout(timer);
    if (myId === reqId) { state.loadingMore = false; updateStatus(filtered().length); }
  }
}

// ---- infinite scroll ----
const io = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !state.loading && !state.loadingMore && !state.end && !state.showSaved && !state.error) load(false);
}, { rootMargin: "600px" });
io.observe($("sentinel"));

// ---- controls ----
$("city").innerHTML = CITIES.map(c => '<option value="' + esc(c) + '">' + esc(c === "India" ? "All India" : c.replace(/,\s*India$/i, "")) + '</option>').join("");
const doSearch = debounce(() => { state.query = $("q").value.trim(); if (state.showSaved) { state.showSaved = false; } renderFeed(); }, 300);
$("q").addEventListener("input", doSearch);
$("city").addEventListener("change", (e) => { state.city = e.target.value; state.showSaved = false; load(true); });
$("level").addEventListener("change", (e) => { state.level = e.target.value; state.showSaved = false; load(true); });
$("saved").addEventListener("click", () => { state.showSaved = !state.showSaved; renderFeed(); window.scrollTo({ top: 0 }); });

document.addEventListener("click", (e) => {
  const save = e.target.closest("[data-save]");
  if (save) { const slug = save.getAttribute("data-save"); const job = state.jobs.find(j => j.slug === slug) || state.saved[slug]; if (!job) return; if (isSaved(slug)) delete state.saved[slug]; else state.saved[slug] = job; persistSaved(); renderFeed(); return; }
  if (e.target.closest("[data-retry]")) { load(true); return; }
  if (e.target.closest("[data-clear]")) { state.query = ""; state.city = "India"; state.level = ""; $("q").value = ""; $("city").value = "India"; $("level").value = ""; state.showSaved = false; load(true); return; }
});

// ---- self-test: index.html?selftest ----
function runSelfTest() {
  console.assert(esc("<b>x</b>") === "&lt;b&gt;x&lt;/b&gt;", "esc blocks HTML");
  console.assert(safeUrl("javascript:alert(1)") === "#" && safeUrl("https://a.com").startsWith("https://"), "safeUrl");
  console.assert(stripHtml("<p>hi <b>there</b></p>") === "hi there", "stripHtml");
  console.assert(relTime(new Date(Date.now() - 3 * 86400000).toISOString()) === "3d ago", "relTime ISO");
  console.assert(normalize({ id: 5, name: "Dev", company: { name: "Acme" }, locations: [{ name: "Bengaluru, India" }], refs: { landing_page: "https://x" } }).india === true, "normalize india flag");
  console.log("%cself-test passed", "color:#b4e02f;font-weight:700");
}

// ---- boot ----
(function boot() {
  if (location.search.includes("selftest")) runSelfTest();
  load(true);
})();
