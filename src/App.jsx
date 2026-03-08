// ============================================================
// NEW HARMONY LIFE EVENTS &mdash; FULL BUNDLED SINGLE-FILE VERSION
// For review purposes. Production uses the modular src/ layout.
// ============================================================

import React, { createContext, useContext, useState, useRef, useEffect } from "react";

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
// Load jsQR for QR scanning
if (typeof window !== "undefined" && !window.jsQR) {
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
  document.head.appendChild(s);
}
// Load Recharts for analytics charts
if (typeof window !== "undefined" && !window.Recharts) {
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/recharts/2.12.7/Recharts.min.js";
  document.head.appendChild(s);
}

const SUPABASE_URL = "https://eaiutiqyrggihrunezjc.supabase.co";
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhaXV0aXF5cmdnaWhydW5lempjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDM5NDgsImV4cCI6MjA4ODM3OTk0OH0.zbtmgrt4ou1JxMe4O5givGu-Z1W42I__quQD2Z4aa2o";

// Lightweight Supabase client &mdash; no npm needed
const supabase = (() => {
  // REST API headers (PostgREST) — never sent to Auth endpoints
  const restHeaders = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
  // Auth headers — no Prefer header, Auth server doesn't understand it
  const authHeaders = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  const url = (table, query = "") => `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const authUrl = (path) => `${SUPABASE_URL}/auth/v1${path}`;

  const req = async (method, endpoint, body, extraHeaders = {}) => {
    const res = await fetch(endpoint, { method, headers: { ...restHeaders, ...extraHeaders }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || err.error_description || `HTTP ${res.status}`); }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
  const authReq = async (method, endpoint, body) => {
    // Use auth-specific headers — no Prefer header, clean JSON only
    const res = await fetch(endpoint, { method, headers: { ...authHeaders }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      const rawText = await res.text().catch(() => "");
      console.error("[NH authReq] HTTP", res.status, endpoint, rawText);
      let err = {};
      try { err = JSON.parse(rawText); } catch (e) {}
      throw new Error(err.message || err.error_description || err.msg || rawText || `HTTP ${res.status}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  // Auth token management
  let _session = null;
  const getSession = () => _session;
  const setSession = (s) => {
    _session = s;
    const token = s?.access_token || SUPABASE_ANON_KEY;
    restHeaders["Authorization"] = `Bearer ${token}`;
    authHeaders["Authorization"] = `Bearer ${token}`;
    if (s) localStorage.setItem("nh_session", JSON.stringify(s));
    else localStorage.removeItem("nh_session");
  };
  // Restore session from localStorage on load
  try { const s = localStorage.getItem("nh_session"); if (s) setSession(JSON.parse(s)); } catch (e) {}

  return {
    getSession, setSession,
    auth: {
      signUp: async ({ email, password, options }) => {
        // Supabase Auth v2 REST /signup payload.
        // "phone" is a reserved top-level Auth field — passing it inside `data` causes 422.
        // Rename phone -> phone_number inside metadata to avoid the conflict.
        const meta = options?.data ? { ...options.data } : {};
        if (meta.phone !== undefined) { meta.phone_number = meta.phone; delete meta.phone; }

        // Try 3 payloads in order — most to least data — stopping on first success.
        // Retries on 500 (server error) but not 422/400 (bad request — different payload won't fix).
        const attempts = [
          { email, password, data: meta },   // with renamed metadata
          { email, password },                // bare minimum if metadata still causes issues
        ];
        let lastError = null;
        for (const payload of attempts) {
          try {
            console.log("[NH signup] trying payload keys:", Object.keys(payload));
            const raw = await authReq("POST", authUrl("/signup"), payload);
            console.log("[NH signup] success:", JSON.stringify(raw).slice(0, 200));
            const user = raw?.user ?? (raw?.id ? { id: raw.id, email: raw.email, user_metadata: meta } : null);
            const session = raw?.access_token ? { access_token: raw.access_token, refresh_token: raw.refresh_token } : null;
            if (session) setSession({ ...session, user });
            return { data: { user, session }, error: null };
          } catch (e) {
            console.error("[NH signup] attempt failed:", e.message);
            lastError = e;
            if (!e.message.includes("500")) break; // 422/400 = bad request, retrying won't help
          }
        }
        return { data: { user: null, session: null }, error: lastError };
      },
      signInWithPassword: async ({ email, password }) => {
        try {
          const raw = await authReq("POST", authUrl("/token?grant_type=password"), { email, password });
          const user = raw?.user ?? (raw?.id ? { id: raw.id, email: raw.email, user_metadata: raw.user_metadata || {} } : null);
          const session = raw?.access_token ? { access_token: raw.access_token, refresh_token: raw.refresh_token } : null;
          if (session) setSession({ ...session, user });
          return { data: { user, session }, error: null };
        } catch (e) { return { data: { user: null, session: null }, error: e }; }
      },
      signOut: async () => { try { await authReq("POST", authUrl("/logout"), {}); } catch (e) {} setSession(null); return { error: null }; },
      getUser: () => _session ? { data: { user: _session.user }, error: null } : { data: { user: null }, error: null },
    },
    from: (table) => ({
      select: (cols = "*") => ({
        _table: table, _cols: cols, _filters: [], _order: null, _limit: null,
        eq(col, val) { this._filters.push(`${col}=eq.${val}`); return this; },
        neq(col, val) { this._filters.push(`${col}=neq.${val}`); return this; },
        order(col, { ascending = true } = {}) { this._order = `${col}.${ascending ? "asc" : "desc"}`; return this; },
        limit(n) { this._limit = n; return this; },
        single() { this._single = true; return this; },
        async then(resolve, reject) {
          try {
            let q = `?select=${this._cols}`;
            if (this._filters.length) q += "&" + this._filters.join("&");
            if (this._order) q += `&order=${this._order}`;
            if (this._limit) q += `&limit=${this._limit}`;
            const data = await req("GET", url(this._table, q));
            resolve({ data: this._single ? (data?.[0] || null) : data, error: null });
          } catch (e) { resolve({ data: null, error: e }); }
        },
      }),
      insert: async (body) => { try { const data = await req("POST", url(table), Array.isArray(body) ? body : [body]); return { data, error: null }; } catch (e) { return { data: null, error: e }; } },
      update: (body) => ({
        _table: table, _filters: [],
        eq(col, val) { this._filters.push(`${col}=eq.${val}`); return this; },
        async then(resolve) {
          try {
            let q = "?" + this._filters.join("&");
            const data = await req("PATCH", url(this._table, q), body);
            resolve({ data, error: null });
          } catch (e) { resolve({ data: null, error: e }); }
        },
      }),
      delete: () => ({
        _table: table, _filters: [],
        eq(col, val) { this._filters.push(`${col}=eq.${val}`); return this; },
        async then(resolve) {
          try {
            let q = "?" + this._filters.join("&");
            await req("DELETE", url(this._table, q));
            resolve({ data: null, error: null });
          } catch (e) { resolve({ data: null, error: e }); }
        },
      }),
      upsert: async (body) => { try { const data = await req("POST", url(table), Array.isArray(body) ? body : [body], { "Prefer": "resolution=merge-duplicates,return=representation" }); return { data, error: null }; } catch (e) { return { data: null, error: e }; } },
    }),
  };
})();

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const T = {
  bg: "#F7F5F0", bgCard: "#FFFFFF", bgDeep: "#1C2B1A", bgMid: "#2D3E2A",
  green1: "#2D6A4F", green2: "#40916C", green3: "#74C69D", green4: "#B7E4C7", green5: "#D8F3DC",
  earth: "#8B6F47", earthL: "#C4A882", cream: "#FAF6EF",
  stone: "#6B7280", stoneL: "#9CA3AF", border: "#DDE8D8",
  text: "#1C2B1A", textMid: "#3D5A38", textSoft: "#6B7280",
  warn: "#C0392B", gold: "#B7860B",
};

const CATEGORIES = [
  "Community", "Workshop", "Festival", "Music", "Food & Drink",
  "Arts & Crafts", "Wellness", "Sports & Nature", "Charity", "Other",
];

const VIBE_TAGS = [
  { id: "dog-friendly",   emoji: "🐾", label: "Dog-Friendly" },
  { id: "kid-friendly",   emoji: "👶", label: "Kid-Friendly" },
  { id: "bring-a-blanket",emoji: "🧺", label: "Bring a Blanket" },
  { id: "limited-spots",  emoji: "⚡", label: "Limited Spots" },
  { id: "rain-or-shine",  emoji: "🌦️", label: "Rain or Shine" },
  { id: "all-ages",       emoji: "👨‍👩‍👧", label: "All Ages" },
  { id: "21-plus",        emoji: "🍺", label: "21+" },
  { id: "outdoors",       emoji: "🌿", label: "Outdoors" },
  { id: "indoor",         emoji: "🏠", label: "Indoor" },
  { id: "free-parking",   emoji: "🅿️", label: "Free Parking" },
  { id: "wheelchair",     emoji: "♿", label: "Accessible" },
  { id: "bring-your-own", emoji: "🎒", label: "Bring Your Own" },
];

const ADMIN_PASSWORD = process.env.REACT_APP_ADMIN_PASSWORD || "harmony2026";

const VENDOR_TYPES = [
  "Produce & Vegetables", "Fruits & Berries", "Herbs & Plants", "Baked Goods",
  "Honey & Preserves", "Dairy & Eggs", "Meat & Poultry", "Flowers",
  "Handmade Crafts", "Prepared Foods", "Beverages", "Candles & Soaps",
  "Health & Wellness", "Art & Photography", "Other",
];

const BOOTH_SIZES = [
  "Small &ndash; 3 ft table", "Standard &ndash; 6 ft table", "10x10 ft tent space",
  "10x20 ft tent space", "10x30 ft tent space", "20x20 ft tent space", "Other",
];

const DISCLAIMERS = [
  { key: "d1", text: "I understand this is a rain or shine event and I am responsible for providing my own table(s), chair(s), tent, and any necessary equipment." },
  { key: "d2", text: "Vendors participate at their own risk. New Harmony Life, and Loess Hills Elysian Prairie Restoration and Conservation Project are not responsible for lost, stolen, or damaged items, or for personal injury." },
  { key: "d3", text: "Vendors are responsible for obtaining any required permits, licenses, food certifications, or sales tax collection." },
  { key: "d4", text: "By registering, you grant permission for New Harmony Life to use your business name, logo and/or photos for event promotions." },
  { key: "d5", text: "Vendors agree to conduct themselves professionally and respectfully. New Harmony Life reserves the right to remove any vendor engaging in unsafe or inappropriate behavior or activities." },
];


const INITIAL_EVENTS = [
  {
    id: "1", title: "Harvest Moon Festival", category: "Festival",
    startDate: "2026-09-12", endDate: "2026-09-14", time: "10:00", endTime: "21:00",
    location: "Harmony Meadows Farm", address: "1402 Countryside Rd, Moville, IA",
    description: "Three days of music, local food, artisan markets, and community celebration beneath the harvest moon. Bring the whole family for an unforgettable autumn gathering.",
    capacity: 600, registered: 421, photos: [], color: "#8B6F47",
    organizer: "New Harmony Life", tags: ["family", "outdoor", "music", "food"],
    online: false, vendorInvite: true, showVendors: true,
    vendorDeadline: "2026-08-01", profitModel: "sharing", hostPct: 15,
    vendorInfo: "We welcome local farmers, artisan producers, and craft vendors. Booth spaces are 10x10 ft. Limited spaces &mdash; apply early!",
    waitlist: [],
    ticketTiers: [
      { id: "t1", name: "Weekend Pass", price: 35, capacity: 400, sold: 280, description: "Full 3-day access" },
      { id: "t2", name: "Day Pass", price: 15, capacity: 150, sold: 120, description: "Single day entry" },
      { id: "t3", name: "Family Bundle (4)", price: 110, capacity: 50, sold: 21, description: "2 adults + 2 children" },
    ],
    vendors: [
      { id: "v1", businessName: "Sunrise Acres", contactName: "Mary Kowalski", email: "mary@sunriseacres.com", phone: "712-555-0101", vendorType: "Produce & Vegetables", description: "Certified organic heirloom vegetables grown right here in Woodbury County.", spaceNeeded: "10x10", yearsInBusiness: "8", hasPermit: true, electricNeeded: false, tentOwned: true, website: "", instagram: "@sunriseacres", comments: "", city: "Moville", state: "IA", status: "approved" },
      { id: "v2", businessName: "Prairie Honey Co.", contactName: "Dale Foss", email: "dale@prairiehoney.com", phone: "712-555-0188", vendorType: "Honey & Preserves", description: "Raw wildflower honey, infused honeys, and seasonal jams from our family apiary.", spaceNeeded: "10x10", yearsInBusiness: "14", hasPermit: true, electricNeeded: false, tentOwned: true, website: "prairiehoney.com", instagram: "", comments: "", city: "Sioux City", state: "IA", status: "approved" },
      { id: "v3", businessName: "Heartland Blooms", contactName: "Sofia Ramos", email: "sofia@heartlandblooms.com", phone: "712-555-0244", vendorType: "Flowers", description: "Fresh-cut seasonal bouquets and dried flower arrangements from our cut flower farm.", spaceNeeded: "10x20", yearsInBusiness: "3", hasPermit: true, electricNeeded: false, tentOwned: false, website: "", instagram: "@heartlandblooms", comments: "Will need to borrow a tent if available.", city: "Moville", state: "IA", status: "pending" },
    ],
  },
  {
    id: "2", title: "Forest Bathing & Mindfulness Walk", category: "Wellness",
    startDate: "2026-04-18", endDate: "2026-04-18", time: "08:00", endTime: "11:00",
    location: "Loess Hills State Forest", address: "Preparation Canyon, IA",
    description: "A guided morning walk through ancient bluffs and native prairie. Learn the Japanese practice of shinrin-yoku &mdash; forest bathing &mdash; and return home feeling restored.",
    capacity: 40, registered: 34, photos: [], color: "#2D6A4F",
    organizer: "Prairie Roots Wellness", tags: ["nature", "mindfulness", "free", "outdoor"],
    online: false, vendorInvite: false, showVendors: false, vendorDeadline: "", vendorInfo: "", profitModel: "vendor-keeps", hostPct: 0,
    waitlist: [],
    ticketTiers: [
      { id: "t1", name: "General Admission", price: 0, capacity: 40, sold: 34, description: "Free &mdash; limited to 40 participants" },
    ],
    vendors: [],
  },
  {
    id: "3", title: "Seed-to-Table Cooking Workshop", category: "Workshop",
    startDate: "2026-05-02", endDate: "2026-05-03", time: "09:00", endTime: "16:00",
    location: "Community Kitchen, Moville", address: "210 Main St, Moville, IA",
    description: "A two-day hands-on experience covering garden planning, seasonal harvesting, fermentation, and preparing whole-food meals from scratch with local ingredients.",
    capacity: 24, registered: 19, photos: [], color: "#40916C",
    organizer: "Heartland Kitchen Collective", tags: ["cooking", "gardening", "local food"],
    online: false, vendorInvite: false, showVendors: false, vendorDeadline: "", vendorInfo: "", profitModel: "vendor-keeps", hostPct: 0,
    waitlist: [],
    ticketTiers: [
      { id: "t1", name: "Standard", price: 85, capacity: 20, sold: 17, description: "Two-day workshop access" },
      { id: "t2", name: "Early Bird", price: 65, capacity: 4, sold: 2, description: "Discounted early registration" },
    ],
    vendors: [],
  },
];

const EMPTY_VENDOR_APP = {
  businessName: "", contactName: "", email: "", phone: "", city: "", state: "",
  vendorType: "Produce & Vegetables", otherType: "",
  description: "", spaceNeeded: "Small &ndash; 3 ft table", yearsInBusiness: "",
  hasPermit: false, electricNeeded: false, tentOwned: false,
  boothNeighborPref: "", website: "", instagram: "", comments: "", photo: null, photos: [],
  d1: false, d2: false, d3: false, d4: false, d5: false,
  communityOptIn: false,
};

const EMPTY_EVENT_FORM = {
  title: "", category: "Community", startDate: "", endDate: "", time: "09:00", endTime: "17:00",
  location: "", address: "", description: "", capacity: 50,
  organizer: "", tags: "", online: false, color: "#2D6A4F", photos: [],
  vendorInvite: false, showVendors: false, vendorDeadline: "", vendorInfo: "",
  profitModel: "vendor-keeps", hostPct: 20,
  ticketTiers: [{ id: "t1", name: "General Admission", price: 0, capacity: 50, sold: 0, description: "" }],
  waitlist: [],
  // New fields
  isPublic: true,
  isPrivate: false,
  privatePassword: "",
  inviteToken: "",
  recurring: false,
  recurringType: "weekly", // "weekly" | "monthly-date" | "monthly-position"
  recurringDay: "0", // 0=Sun..6=Sat for weekly
  recurringMonthDate: "1", // 1-28 for monthly-date
  recurringWeekNum: "1", // 1-5 for monthly-position
  recurringWeekDay: "5", // 0-6 for monthly-position
  recurringEndDate: "",
  customQuestions: [], // [{id, label, type: "text"|"select"|"checkbox", options: [], required: false}]
  vibeTags: [],       // array of vibeConfig ids
  eventTypes: [],     // array of eventTypeConfig ids
  refundPolicy: "none", // "none" | "partial" | "full"
  refundDeadlineDays: 7, // days before event for partial/full refunds
  showAttendanceBar: true, // show/hide the registered count & capacity bar on event cards
};

const PAYPAL_CLIENT_ID = "REPLACE_WITH_YOUR_PAYPAL_CLIENT_ID";

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmt = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
};
const fmtPhone = (val) => {
  // Strip everything except digits
  const digits = (val || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0,3)}-${digits.slice(3)}`;
  return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
};
const fmtShort = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr % 12 === 0 ? 12 : hr % 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
};
const dateRange = (ev) => {
  if (!ev.startDate) return "";
  if (!ev.endDate || ev.startDate === ev.endDate) return fmt(ev.startDate);
  return `${fmtShort(ev.startDate)} &ndash; ${fmt(ev.endDate)}`;
};
const multiDay = (ev) => ev.endDate && ev.endDate !== ev.startDate;
const isExpired = (ev) => {
  const end = ev.endDate || ev.startDate;
  if (!end) return false;
  return end < new Date().toISOString().split("T")[0];
};
const spotsLeft = (ev) => {
  // Always use the single event-level capacity minus total sold (shared pool across all tiers)
  const cap = ev.capacity || totalCapacity(ev);
  const sold = totalSold(ev);
  return Math.max(0, cap - sold);
};

// ─── RECURRING EVENT HELPERS ──────────────────────────────────────────────────
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const WEEK_NUMS = ["1st","2nd","3rd","4th","5th"];

const getRecurringDescription = (form) => {
  if (!form.recurring) return null;
  if (form.recurringType === "weekly") {
    return `Every ${DAY_NAMES[parseInt(form.recurringDay)]}`;
  } else if (form.recurringType === "monthly-date") {
    const d = parseInt(form.recurringMonthDate);
    const suffix = d === 1 || d === 21 ? "st" : d === 2 || d === 22 ? "nd" : d === 3 || d === 23 ? "rd" : "th";
    return `Monthly on the ${d}${suffix}`;
  } else if (form.recurringType === "monthly-position") {
    return `${WEEK_NUMS[parseInt(form.recurringWeekNum)-1]} ${DAY_NAMES[parseInt(form.recurringWeekDay)]} of each month`;
  }
  return null;
};

const getShareUrls = (ev) => {
  const url = typeof window !== "undefined" ? window.location.href : "";
  const text = encodeURIComponent(`Check out "${ev.title}"`);
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    twitter: `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`,
    copy: url,
  };
};

const totalCapacity = (ev) => {
  if (ev.ticketTiers && ev.ticketTiers.length > 0) return ev.ticketTiers.reduce((s, t) => s + t.capacity, 0);
  return ev.capacity;
};
const totalSold = (ev) => {
  if (ev.ticketTiers && ev.ticketTiers.length > 0) return ev.ticketTiers.reduce((s, t) => s + t.sold, 0);
  return ev.registered;
};
// Generate a simple deterministic QR-like SVG pattern from a string seed
// Load qrcode.js for real scannable QR codes
if (typeof window !== "undefined" && !window.QRCodeLib) {
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
  s.onload = () => { window.QRCodeLib = window.QRCode; };
  document.head.appendChild(s);
}

const QRCode = ({ value, size = 100 }) => {
  const containerRef = useRef(null);
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    const tryRender = (attempts = 0) => {
      if (window.QRCodeLib) {
        try {
          new window.QRCodeLib(containerRef.current, {
            text: value, width: size, height: size,
            colorDark: T.bgDeep, colorLight: "#ffffff",
            correctLevel: window.QRCodeLib.CorrectLevel?.M || 1,
          });
        } catch (e) {
          // fallback: show ticket ID as text if QRCodeLib fails
          containerRef.current.style.cssText = `width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:0.55rem;color:${T.textSoft};word-break:break-all;text-align:center;padding:4px;`;
          containerRef.current.textContent = value;
        }
      } else if (attempts < 20) {
        setTimeout(() => tryRender(attempts + 1), 150);
      } else {
        // Final fallback after timeout
        containerRef.current.style.cssText = `width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:0.55rem;color:${T.textSoft};word-break:break-all;text-align:center;padding:4px;`;
        containerRef.current.textContent = value;
      }
    };
    tryRender();
  }, [value, size]);
  return <div ref={containerRef} style={{ width: size, height: size, display: "block" }} />;
};
const genTicketId = () => "TKT-" + Math.random().toString(36).substr(2,10).toUpperCase();
const catEmoji = (c) => ({ "Music": "🎵", "Community": "🌿", "Workshop": "🛠️", "Food & Drink": "🍽️", "Sports & Nature": "⛰️", "Arts & Crafts": "🎨", "Festival": "🎪", "Charity": "💚", "Wellness": "🧘", "Other": "🗓️" }[c] || "🗓️");
const fileToDataUrl = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

// ── Local photo store — persists event photos in localStorage keyed by event id ──
// Bypasses Supabase column-type issues entirely for photo storage
const LS_PHOTOS_KEY = "nh_event_photos_v1";
const localPhotosLoad = () => { try { return JSON.parse(localStorage.getItem(LS_PHOTOS_KEY) || "{}"); } catch { return {}; } };
const localPhotosSave = (map) => { try { localStorage.setItem(LS_PHOTOS_KEY, JSON.stringify(map)); } catch {} };
const localPhotosGet = (eventId) => { const m = localPhotosLoad(); return m[eventId] || []; };
const localPhotosSet = (eventId, photos) => { const m = localPhotosLoad(); m[eventId] = photos; localPhotosSave(m); };

// Compress + resize an image file to a max width/height, returning a JPEG data URL
// This keeps photos small enough to store in Supabase (typically under 150KB)
const compressImage = (file, maxPx = 1200, quality = 0.75) => new Promise((res, rej) => {
  const reader = new FileReader();
  reader.onerror = rej;
  reader.onload = (e) => {
    const img = new Image();
    img.onerror = rej;
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      res(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// ─── CALENDAR LINK GENERATORS ─────────────────────────────────────────────────
const toCalDate = (dateStr, timeStr) => {
  if (!dateStr) return "";
  const d = dateStr.replace(/-/g, "");
  if (!timeStr) return d;
  const t = timeStr.replace(/:/g, "").slice(0, 4) + "00";
  return `${d}T${t}`;
};
const makeCalLinks = (ev) => {
  const start = toCalDate(ev.startDate, ev.time);
  const end = toCalDate(ev.endDate || ev.startDate, ev.endTime || ev.time);
  const title = encodeURIComponent(ev.title || "");
  const loc = encodeURIComponent(ev.location || "");
  const desc = encodeURIComponent((ev.description || "").slice(0, 200));
  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end || start}&location=${loc}&details=${desc}`,
    apple: `data:text/calendar;charset=utf8,BEGIN:VCALENDAR%0AVERSION:2.0%0ABEGIN:VEVENT%0ADTSTART:${start}%0ADTEND:${end || start}%0ASUMMARY:${title}%0ALOCATION:${loc}%0ADESCRIPTION:${desc}%0AEND:VEVENT%0AEND:VCALENDAR`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${ev.startDate}${ev.time ? "T"+ev.time : ""}&enddt=${ev.endDate || ev.startDate}${ev.endTime ? "T"+ev.endTime : ""}&location=${loc}&body=${desc}`,
  };
};

const initials = (u) => {
  if (!u) return "";
  const first = u.firstName || u.first_name || "";
  const last = u.lastName || u.last_name || "";
  return `${first[0] || ""}${last[0] || ""}`.toUpperCase();
};

// ─── COUNTDOWN TIMER ──────────────────────────────────────────────────────────
function CountdownTimer({ ev }) {
  const calcTime = () => {
    const target = new Date(`${ev.startDate}T${ev.time || "00:00"}:00`);
    const diff = target - Date.now();
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { d, h, m, s, diff };
  };
  const [time, setTime] = useState(calcTime);
  useEffect(() => {
    const interval = setInterval(() => setTime(calcTime()), 1000);
    return () => clearInterval(interval);
  }, [ev.startDate, ev.time]);
  if (!time) return null;
  const Box = ({ val, label }) => (
    <div style={{ textAlign: "center", minWidth: "52px" }}>
      <div style={{ background: T.bgDeep, color: T.green3, borderRadius: "10px", padding: "10px 8px", fontFamily: "'Lora',serif", fontSize: "1.6rem", fontWeight: 700, lineHeight: 1, minWidth: "52px" }}>{String(val).padStart(2, "0")}</div>
      <div style={{ color: T.stoneL, fontSize: "0.65rem", marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
    </div>
  );
  return (
    <div style={{ background: `linear-gradient(135deg,${T.bgDeep},${T.bgMid})`, borderRadius: "14px", padding: "16px 20px", marginBottom: "18px", border: `1px solid ${T.green1}30` }}>
      <div style={{ color: T.green4, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>⏳ Event Starts In</div>
      <div style={{ display: "flex", gap: "10px", alignItems: "center", justifyContent: "center" }}>
        {time.d > 0 && <Box val={time.d} label="Days" />}
        {time.d > 0 && <div style={{ color: T.green3, fontSize: "1.4rem", fontWeight: 300, marginBottom: "18px" }}>:</div>}
        <Box val={time.h} label="Hours" />
        <div style={{ color: T.green3, fontSize: "1.4rem", fontWeight: 300, marginBottom: "18px" }}>:</div>
        <Box val={time.m} label="Min" />
        <div style={{ color: T.green3, fontSize: "1.4rem", fontWeight: 300, marginBottom: "18px" }}>:</div>
        <Box val={time.s} label="Sec" />
      </div>
    </div>
  );
}


const inp = (err) => ({
  width: "100%", padding: "11px 14px", background: T.cream,
  border: `1px solid ${err ? T.warn : T.border}`, borderRadius: "10px",
  color: T.text, fontSize: "0.9rem", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
});
function Field({ label, error, children }) {
  return (
    <div>
      <label style={{ display: "block", color: T.textMid, fontSize: "0.8rem", fontWeight: 600, marginBottom: "6px" }}>{label}</label>
      {children}
      {error && <div style={{ color: T.warn, fontSize: "0.75rem", marginTop: "4px" }}>⚠ {error}</div>}
    </div>
  );
}

// Reusable password input with show/hide eyeball toggle
function PasswordInput({ value, onChange, onKeyDown, placeholder, style, error }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{ ...style, paddingRight: "42px" }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        style={{
          position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
          color: visible ? T.green1 : T.stoneL, fontSize: "1.05rem", lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        title={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible
          ? /* eye-slash */ (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          )
          : /* eye */ (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )
        }
      </button>
    </div>
  );
}

// ─── CONTEXT ──────────────────────────────────────────────────────────────────
const AppContext = createContext(null);

function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authModal, setAuthModal] = useState(null);
  const [authForm, setAuthForm] = useState({ firstName: "", lastName: "", email: "", phone: "", city: "", state: "", password: "", confirm: "" });
  const [authErrors, setAuthErrors] = useState({});
  const [authMode, setAuthMode] = useState("login");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutInfo, setCheckoutInfo] = useState({ firstName: "", lastName: "", email: "", phone: "", address: "", city: "", state: "", zip: "" });
  const [customAnswers, setCustomAnswers] = useState({});
  const [resendApiKey, setResendApiKey] = useState(localStorage.getItem("nh_resend_key") || "");

  // ── Site-wide configurable vibe tags ──────────────────────────────────────
  const _defaultVibeConfig = {
    enabled: true,
    items: [
      { id: "dog-friendly",    emoji: "🐾", label: "Dog-Friendly" },
      { id: "kid-friendly",    emoji: "👶", label: "Kid-Friendly" },
      { id: "bring-a-blanket", emoji: "🧺", label: "Bring a Blanket" },
      { id: "limited-spots",   emoji: "⚡", label: "Limited Spots" },
      { id: "rain-or-shine",   emoji: "🌦️", label: "Rain or Shine" },
      { id: "all-ages",        emoji: "👨‍👩‍👧", label: "All Ages" },
      { id: "21-plus",         emoji: "🍺", label: "21+" },
      { id: "outdoors",        emoji: "🌿", label: "Outdoors" },
      { id: "indoor",          emoji: "🏠", label: "Indoor" },
      { id: "free-parking",    emoji: "🅿️", label: "Free Parking" },
      { id: "wheelchair",      emoji: "♿", label: "Accessible" },
      { id: "bring-your-own",  emoji: "🎒", label: "Bring Your Own" },
    ],
  };
  const [vibeConfig, setVibeConfig] = useState(() => {
    try { const s = localStorage.getItem("nh_vibe_config"); return s ? JSON.parse(s) : _defaultVibeConfig; } catch { return _defaultVibeConfig; }
  });
  const saveVibeConfig = (cfg) => { setVibeConfig(cfg); localStorage.setItem("nh_vibe_config", JSON.stringify(cfg)); };

  // ── Discover sort / filter buttons config ─────────────────────────────────
  const _defaultSortConfig = {
    enabled: true,
    items: [
      { id: "date-today",  label: "Today",      group: "date" },
      { id: "date-week",   label: "This Week",  group: "date" },
      { id: "date-month",  label: "This Month", group: "date" },
      { id: "price-free",  label: "🎁 Free",    group: "price" },
    ],
  };
  const [sortConfig, setSortConfig] = useState(() => {
    try { const s = localStorage.getItem("nh_sort_config"); return s ? JSON.parse(s) : _defaultSortConfig; } catch { return _defaultSortConfig; }
  });
  const saveSortConfig = (cfg) => { setSortConfig(cfg); localStorage.setItem("nh_sort_config", JSON.stringify(cfg)); };

  // ── Site-wide configurable event categories ───────────────────────────
  const _defaultCategoryConfig = {
    enabled: true,
    items: [
      "Community", "Workshop", "Festival", "Music", "Food & Drink",
      "Arts & Crafts", "Wellness", "Sports & Nature", "Charity", "Other",
    ],
  };
  const [categoryConfig, setCategoryConfig] = useState(() => {
    try { const s = localStorage.getItem("nh_category_config"); return s ? JSON.parse(s) : _defaultCategoryConfig; } catch { return _defaultCategoryConfig; }
  });
  const saveCategoryConfig = (cfg) => { setCategoryConfig(cfg); localStorage.setItem("nh_category_config", JSON.stringify(cfg)); };

  // ── Site-wide configurable event types ────────────────────────────────
  const _defaultEventTypeConfig = {
    enabled: true,
    items: [
      { id: "in-person",    emoji: "📍", label: "In-Person" },
      { id: "online",       emoji: "💻", label: "Online" },
      { id: "hybrid",       emoji: "🔀", label: "Hybrid" },
      { id: "ticketed",     emoji: "🎟️", label: "Ticketed" },
      { id: "free-entry",   emoji: "🆓", label: "Free Entry" },
      { id: "family",       emoji: "👨‍👩‍👧", label: "Family-Friendly" },
      { id: "adults-only",  emoji: "🔞", label: "Adults Only" },
      { id: "drop-in",      emoji: "🚶", label: "Drop-In" },
      { id: "registration-required", emoji: "📋", label: "Registration Required" },
      { id: "recurring",    emoji: "🔁", label: "Recurring" },
    ],
  };
  const [eventTypeConfig, setEventTypeConfig] = useState(() => {
    try { const s = localStorage.getItem("nh_event_type_config"); return s ? JSON.parse(s) : _defaultEventTypeConfig; } catch { return _defaultEventTypeConfig; }
  });
  const saveEventTypeConfig = (cfg) => { setEventTypeConfig(cfg); localStorage.setItem("nh_event_type_config", JSON.stringify(cfg)); };
  const [checkoutErrors, setCheckoutErrors] = useState({});
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [paymentForm, setPaymentForm] = useState({ cardName: "", cardNum: "", expiry: "", cvv: "" });
  const [paymentErrors, setPaymentErrors] = useState({});
  const [orderComplete, setOrderComplete] = useState(null);
  const [payMethod, setPayMethod] = useState("stripe");
  const [paypalLoaded, setPaypalLoaded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [events, setEvents] = useState([]);
  const [view, setView] = useState("discover");
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [filterDate, setFilterDate] = useState("all");
  const [filterPrice, setFilterPrice] = useState("all");
  const [filterVibe, setFilterVibe] = useState([]);
  const [myTickets, setMyTickets] = useState([]);
  const [toast, setToast] = useState(null);
  const [registerQty, setRegQty] = useState(1);
  const [selectedTierId, setSelectedTierId] = useState(null);
  const [calendarModal, setCalendarModal] = useState(null);
  const [vendorModal, setVendorModal] = useState(null);
  const [vendorForm, setVendorForm] = useState(EMPTY_VENDOR_APP);
  const [vendorErrors, setVendorErrors] = useState({});
  const [vendorSubmitted, setVendorSubmitted] = useState(false);
  const [dashUnlocked, setDashUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [form, setForm] = useState(EMPTY_EVENT_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [checkinModal, setCheckinModal] = useState(null);
  // ─── SOCIAL STATE ────────────────────────────────────────────────────────────
  const [reviews, setReviews] = useState({}); // { eventId: [{id,userId,userName,rating,text,createdAt}] }
  const [qaItems, setQaItems] = useState({}); // { eventId: [{id,userId,userName,question,answer,createdAt,answeredAt}] }
  const [interests, setInterests] = useState(() => { try { return JSON.parse(localStorage.getItem("nh_interests") || "{}"); } catch { return {}; } });
  const [following, setFollowing] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("nh_following") || "[]")); } catch { return new Set(); } });
  const [swRegistered, setSwRegistered] = useState(false);
  // ─── NEW FEATURE STATE ───────────────────────────────────────────────────────
  const [eventPhotos, setEventPhotos] = useState({}); // { eventId: [{id, url, caption, uploadedBy, uploadedAt}] }
  const [referralStats, setReferralStats] = useState({}); // { eventId: { refCode: count } }
  const [badges, setBadges] = useState([]); // earned badge objects
  const [activityFeed, setActivityFeed] = useState([]); // global feed items
  const [notifPrefs, setNotifPrefs] = useState(() => { try { return JSON.parse(localStorage.getItem("nh_notif_prefs") || "{}"); } catch { return {}; } }); // { eventId: { reminder: bool, waitlist: bool } }
  const [pushSubscription, setPushSubscription] = useState(null);
  // PWA install state
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia?.("(display-mode: standalone)").matches || false);
  const [isOnline, setIsOnline] = useState(navigator.onLine !== false);
  const toastRef = useRef();
  const fileRef = useRef();
  const vendorPhotoRef = useRef();

  // ─── LOAD DATA FROM SUPABASE ON MOUNT ─────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        // Restore session
        const { data: { user } } = supabase.auth.getUser();
        if (user) {
          // Try to load profile &mdash; fall back to user metadata if RLS causes issues
          try {
            const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
            if (profile) {
              setCurrentUser({ ...profile, email: user.email });
            } else {
              // Fallback: build profile from auth metadata
              const meta = user.user_metadata || {};
              setCurrentUser({
                id: user.id, email: user.email,
                first_name: meta.first_name || "", last_name: meta.last_name || "",
                phone: meta.phone || "", city: meta.city || "", state: meta.state || "",
                avatar_color: "#40916C", is_admin: false,
              });
            }
          } catch (profileErr) {
            console.warn("Profile fetch failed, using metadata fallback:", profileErr);
            const meta = user.user_metadata || {};
            setCurrentUser({
              id: user.id, email: user.email,
              first_name: meta.first_name || "", last_name: meta.last_name || "",
              phone: meta.phone || "", city: meta.city || "", state: meta.state || "",
              avatar_color: "#40916C", is_admin: false,
            });
          }
        }
        // Load events with tiers and vendors
        await loadEvents();
        // Load tickets if logged in
        if (user) await loadMyTickets(user.id);
      } catch (e) { console.error("Init error:", e); }
      setLoading(false);
    };
    init();
  }, []);

  const loadEvents = async () => {
    const { data: evData } = await supabase.from("events").select("*").order("start_date", { ascending: true });
    if (!evData) return;
    // Diagnostic: log first event's photos field to confirm Supabase is returning it
    if (evData.length > 0) console.log("[NH] First event photos field:", evData[0].photos, "| type:", typeof evData[0].photos);
    // Load locally-stored photos and extended fields (fallback for missing Supabase columns)
    const localPhotosMap = localPhotosLoad();
    const localExtMap = (() => { try { return JSON.parse(localStorage.getItem("nh_event_extended_v1") || "{}"); } catch { return {}; } })();
    const { data: tiers } = await supabase.from("ticket_tiers").select("*").order("sort_order", { ascending: true });
    const { data: vendors } = await supabase.from("vendors").select("*");
    const { data: waitlist } = await supabase.from("waitlist").select("*");
    const mapped = evData.map(ev => ({
      id: ev.id,
      title: ev.title, category: ev.category,
      startDate: ev.start_date, endDate: ev.end_date,
      time: ev.time, endTime: ev.end_time,
      location: ev.location, address: ev.address,
      description: ev.description, capacity: ev.capacity,
      registered: ev.registered, color: ev.color,
      organizer: ev.organizer, tags: ev.tags || [],
      online: ev.online, photos: (ev.photos && ev.photos.length > 0) ? ev.photos : (localPhotosMap[ev.id] || []),
      vendorInvite: ev.vendor_invite, showVendors: ev.show_vendors,
      vendorDeadline: ev.vendor_deadline, vendorInfo: ev.vendor_info,
      profitModel: ev.profit_model, hostPct: ev.host_pct,
      isPublic: ev.is_public !== false, // default true
      isPrivate: ev.is_private === true || ev.is_private === "true" || false,
      privatePassword: ev.private_password || "",
      inviteToken: ev.invite_token || "",
      recurring: ev.recurring || false,
      recurringType: ev.recurring_type || localExtMap[ev.id]?.recurring_type || "weekly",
      recurringDay: String(ev.recurring_day ?? localExtMap[ev.id]?.recurring_day ?? "0"),
      recurringMonthDate: String(ev.recurring_month_date ?? localExtMap[ev.id]?.recurring_month_date ?? "1"),
      recurringWeekNum: String(ev.recurring_week_num ?? localExtMap[ev.id]?.recurring_week_num ?? "1"),
      recurringWeekDay: String(ev.recurring_week_day ?? localExtMap[ev.id]?.recurring_week_day ?? "5"),
      recurringEndDate: ev.recurring_end_date || localExtMap[ev.id]?.recurring_end_date || "",
      customQuestions: ev.custom_questions || localExtMap[ev.id]?.custom_questions || [],
      vibeTags: ev.vibe_tags || localExtMap[ev.id]?.vibe_tags || [],
      eventTypes: ev.event_types || localExtMap[ev.id]?.event_types || [],
      refundPolicy: ev.refund_policy || localExtMap[ev.id]?.refund_policy || "none",
      refundDeadlineDays: ev.refund_deadline_days ?? localExtMap[ev.id]?.refund_deadline_days ?? 7,
      showAttendanceBar: ev.show_attendance_bar ?? localExtMap[ev.id]?.show_attendance_bar ?? true,
      ticketTiers: (tiers || []).filter(t => t.event_id === ev.id).map(t => ({
        id: t.id, name: t.name, description: t.description,
        price: parseFloat(t.price), capacity: t.capacity, sold: t.sold,
      })),
      vendors: (vendors || []).filter(v => v.event_id === ev.id).map(v => ({
        id: v.id, businessName: v.business_name, contactName: v.contact_name,
        email: v.email, phone: v.phone, city: v.city, state: v.state,
        vendorType: v.vendor_type, description: v.description,
        spaceNeeded: v.space_needed, yearsInBusiness: v.years_in_business,
        hasPermit: v.has_permit, electricNeeded: v.electric_needed,
        tentOwned: v.tent_owned, website: v.website, instagram: v.instagram,
        comments: v.comments, photo: v.photo, status: v.status,
        communityOptIn: v.community_opt_in || false,
      })),
      waitlist: (waitlist || []).filter(w => w.event_id === ev.id).map(w => ({
        id: w.id, name: w.name, email: w.email, joinedAt: w.joined_at,
      })),
    }));
    setEvents(mapped);
  };

  const loadMyTickets = async (userId) => {
    const { data } = await supabase.from("tickets").select("*").eq("user_id", userId);
    if (!data) return;
    setMyTickets(data.map(t => ({
      id: t.id, ticketId: t.ticket_id, orderId: t.order_id,
      eventId: t.event_id, tierId: t.tier_id,
      tierName: t.tier_name || "", eventTitle: t.event_title || "",
      buyerName: t.buyer_name, buyerEmail: t.buyer_email,
      qty: t.quantity, total: parseFloat(t.total),
      orderNum: t.order_number || "", bookedOn: t.created_at?.split("T")[0] || "",
      status: t.status, checkedIn: t.checked_in, checkinTime: t.checkin_time,
    })));
  };

  // ─── DERIVED STATE ─────────────────────────────────────────────────────────
  const selectedEvent = events.find(e => e.id === selectedId) || null;
  const activeEvents = events.filter(ev => !isExpired(ev));
  const archivedEvents = events.filter(ev => isExpired(ev));
  const cartTotal = cart.reduce((s, item) => s + (item.tier.price * item.qty), 0);
  const cartCount = cart.reduce((s, item) => s + item.qty, 0);
  const isInCart = (evId, tierId) => tierId ? cart.some(i => i.event.id === evId && i.tier.id === tierId) : cart.some(i => i.event.id === evId);
  const isReg = id => myTickets.some(t => t.eventId === id && t.status !== "cancelled");
  const isOnWaitlist = (evId) => {
    const ev = events.find(e => e.id === evId);
    return ev && (ev.waitlist || []).some(w => w.email === (currentUser?.email || ""));
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3500);
  };

  // ─── CART ──────────────────────────────────────────────────────────────────
  const addToCart = (ev, qty, tier) => {
    const useTier = tier || (ev.ticketTiers && ev.ticketTiers[0]) || { id: "t0", name: "General Admission", price: 0, capacity: ev.capacity, sold: ev.registered || 0 };
    setCart(prev => {
      const existing = prev.find(i => i.event.id === ev.id && i.tier.id === useTier.id);
      if (existing) return prev.map(i => (i.event.id === ev.id && i.tier.id === useTier.id) ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { event: ev, tier: useTier, qty }];
    });
    setCartOpen(true);
    showToast(`🛒 Added ${qty} × ${useTier.name}`);
  };
  const removeFromCart = (evId, tierId) => setCart(prev => prev.filter(i => !(i.event.id === evId && i.tier.id === tierId)));
  const updateCartQty = (evId, tierId, qty) => {
    if (qty < 1) { removeFromCart(evId, tierId); return; }
    setCart(prev => prev.map(i => (i.event.id === evId && i.tier.id === tierId) ? { ...i, qty } : i));
  };

  // ─── WAITLIST ──────────────────────────────────────────────────────────────
  const joinWaitlist = async (evId) => {
    if (!currentUser) { openAuth("login"); return; }
    const { error } = await supabase.from("waitlist").insert({
      event_id: evId, user_id: currentUser.id,
      name: `${currentUser.first_name} ${currentUser.last_name}`,
      email: currentUser.email,
    });
    if (error) { showToast("Already on waitlist or error occurred.", "warn"); return; }
    await loadEvents();
    showToast("🌿 You've been added to the waitlist!");
  };
  const leaveWaitlist = async (evId) => {
    if (!currentUser) return;
    await supabase.from("waitlist").delete().eq("event_id", evId).eq("user_id", currentUser.id);
    await loadEvents();
    showToast("Removed from waitlist.", "warn");
  };

  // ─── TICKETS ───────────────────────────────────────────────────────────────
  const cancelTicket = async (ticketId) => {
    const ticket = myTickets.find(t => t.ticketId === ticketId);
    if (!ticket) return;
    const ev = events.find(e => e.id === ticket.eventId);
    const refundPolicy = ev?.refundPolicy || "none";
    const deadlineDays = ev?.refundDeadlineDays ?? 7;
    // Check if within refund window for partial/full policies
    let refundMessage = "This registration will be removed. No refund will be issued per event policy.";
    if (ticket.total > 0) {
      if (refundPolicy === "full") {
        const eventDate = ev?.startDate ? new Date(ev.startDate) : null;
        const now = new Date();
        const daysUntil = eventDate ? Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24)) : 999;
        if (daysUntil >= deadlineDays) {
          refundMessage = `A full refund will be processed in 5&ndash;7 business days.`;
        } else {
          refundMessage = `The refund window (${deadlineDays} days before event) has passed. No refund will be issued.`;
        }
      } else if (refundPolicy === "partial") {
        const eventDate = ev?.startDate ? new Date(ev.startDate) : null;
        const now = new Date();
        const daysUntil = eventDate ? Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24)) : 999;
        if (daysUntil >= deadlineDays) {
          refundMessage = `A partial refund will be processed in 5&ndash;7 business days.`;
        } else {
          refundMessage = `The refund window (${deadlineDays} days before event) has passed. No refund will be issued.`;
        }
      } else {
        refundMessage = "No refund will be issued &mdash; this event is rain or shine, no refunds.";
      }
    }
    await supabase.from("tickets").update({ status: "cancelled" }).eq("id", ticket.id);
    // Fetch fresh sold count from DB to avoid race condition with concurrent purchases
    const { data: freshTier } = await supabase.from("ticket_tiers").select("sold").eq("id", ticket.tierId).single();
    const newSold = Math.max(0, (freshTier?.sold ?? 0) - ticket.qty);
    await supabase.from("ticket_tiers").update({ sold: newSold }).eq("id", ticket.tierId);
    // Auto-promote first waitlist entry &mdash; send a real email via Resend if configured
    const { data: waitlistEntries } = await supabase.from("waitlist").select("*").eq("event_id", ticket.eventId).order("created_at", { ascending: true }).limit(1);
    if (waitlistEntries && waitlistEntries.length > 0) {
      const first = waitlistEntries[0];
      const ev = events.find(e => e.id === ticket.eventId);
      const rKey = localStorage.getItem("nh_resend_key");
      if (rKey && first.email && ev) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${rKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "New Harmony Life <tickets@newharmonylife.com>",
              to: [first.email],
              subject: `A spot just opened up &mdash; ${ev.title}`,
              html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#1C2B1A;padding:28px 32px;text-align:center">
    <h1 style="color:#74C69D;margin:0;font-size:1.4rem">🌿 New Harmony Life</h1>
    <p style="color:#9CA3AF;margin:8px 0 0;font-size:0.9rem">Waitlist Update</p>
  </div>
  <div style="padding:28px 32px">
    <h2 style="color:#1C2B1A;margin:0 0 8px">Good news, ${first.name?.split(" ")[0] || "there"}! 🎉</h2>
    <p style="color:#6B7280;margin:0 0 20px;line-height:1.6">A spot has just opened up for <strong>${ev.title}</strong> on ${fmt(ev.startDate)}. As the next person on the waitlist, you have first priority &mdash; grab your ticket before it's gone!</p>
    <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:16px 20px;margin-bottom:20px">
      <div style="color:#166534;font-weight:700;font-size:0.9rem;margin-bottom:4px">📍 ${ev.location}</div>
      <div style="color:#4B7C5A;font-size:0.85rem">${dateRange(ev)}${ev.time ? " · " + fmtTime(ev.time) : ""}</div>
    </div>
    <p style="color:#6B7280;font-size:0.85rem;margin:0">Visit the event page to register. This spot may not last long!</p>
  </div>
  <div style="background:#F7F5F0;padding:16px 32px;text-align:center">
    <p style="color:#9CA3AF;font-size:0.78rem;margin:0">New Harmony Life · Sioux City, IA</p>
  </div>
</div>`,
            }),
          });
          showToast(`✉️ Waitlist email sent to ${first.name}!`);
        } catch (emailErr) {
          console.warn("Waitlist email failed (non-fatal):", emailErr);
          showToast(`⚠️ Waitlist email failed for ${first.name} &mdash; notify them manually.`, "warn");
        }
      } else {
        showToast(`✉️ ${first.name} is next on the waitlist &mdash; notify them manually if Resend isn't configured.`);
      }
    }
    setMyTickets(prev => prev.map(t => t.ticketId === ticketId ? { ...t, status: "cancelled" } : t));
    await loadEvents();
    showToast(`Ticket cancelled. ${refundMessage}`, refundPolicy === "none" ? "warn" : "warn");
  };

  const checkinAttendee = async (evId, ticketId) => {
    const now = new Date().toISOString();
    await supabase.from("tickets").update({ checked_in: true, checkin_time: now }).eq("id", ticketId);
    // ticketId here is the UUID row id &mdash; match against t.id (not t.ticketId which is TKT-xxx)
    setMyTickets(prev => prev.map(t => t.id === ticketId ? { ...t, checkedIn: true, checkinTime: new Date().toLocaleTimeString() } : t));
    showToast("✅ Attendee checked in!");
  };
  const undoCheckin = async (ticketId) => {
    await supabase.from("tickets").update({ checked_in: false, checkin_time: null }).eq("id", ticketId);
    setMyTickets(prev => prev.map(t => t.id === ticketId ? { ...t, checkedIn: false, checkinTime: null } : t));
    showToast("Check-in undone.", "warn");
  };

  // ─── AUTH ──────────────────────────────────────────────────────────────────
  const openAuth = (mode = "login") => {
    setAuthMode(mode);
    setAuthForm({ firstName: "", lastName: "", email: "", phone: "", city: "", state: "", password: "", confirm: "", emailOptIn: true, agreedToTerms: false });
    setAuthErrors({});
    setAuthModal(true);
  };
  const validateAuth = () => {
    const e = {};
    if (authMode === "signup") {
      if (!authForm.firstName.trim()) e.firstName = "First name required";
      if (!authForm.lastName.trim()) e.lastName = "Last name required";
      if (!authForm.phone.trim()) e.phone = "Phone required";
    }
    if (authMode === "signup" && !authForm.agreedToTerms) e.agreedToTerms = "You must agree to the Terms & Privacy Policy to continue";
    if (!authForm.email.includes("@")) e.email = "Valid email required";
    if (!authForm.password || authForm.password.length < 6) e.password = "Password must be 6+ characters";
    if (authMode === "signup" && authForm.password !== authForm.confirm) e.confirm = "Passwords do not match";
    setAuthErrors(e);
    return !Object.keys(e).length;
  };
  const handleLogin = async () => {
    if (!validateAuth()) return;
    const { data, error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password });
    if (error) { setAuthErrors({ email: "Email or password is incorrect" }); return; }
    const user = data?.user;
    if (!user) { setAuthErrors({ email: "Login failed. Please try again." }); return; }
    try {
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (profile) {
        setCurrentUser({ ...profile, email: user.email });
        await loadMyTickets(user.id);
        setAuthModal(null);
        showToast(`🌿 Welcome back, ${profile.first_name || ""}!`);
        return;
      }
    } catch (e) { console.warn("Profile fetch on login failed:", e); }
    // Fallback to metadata
    const meta = user.user_metadata || {};
    setCurrentUser({ id: user.id, email: user.email, first_name: meta.first_name || "", last_name: meta.last_name || "", phone: meta.phone || "", city: meta.city || "", state: meta.state || "", avatar_color: "#40916C", is_admin: false });
    await loadMyTickets(user.id);
    setAuthModal(null);
    showToast(`🌿 Welcome back!`);
  };
  const handleSignup = async () => {
    if (!validateAuth()) return;
    setAuthErrors({});
    const { data, error } = await supabase.auth.signUp({
      email: authForm.email, password: authForm.password,
      options: { data: { first_name: authForm.firstName, last_name: authForm.lastName, phone: authForm.phone, city: authForm.city, state: authForm.state } },
    });

    if (error) {
      const msg = error.message || "Signup failed. Please try again.";
      console.error("[NH handleSignup] error:", msg);
      // Only override message for one unambiguous case — duplicate account
      const isExisting = msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("user already exists");
      setAuthErrors({ email: isExisting ? "An account with this email already exists. Try signing in instead." : msg });
      return;
    }

    const user = data?.user;
    const hasSession = !!(data?.session?.access_token);

    if (!user) {
      setAuthErrors({ email: "Something went wrong creating your account. Please try again." });
      return;
    }

    const profile = {
      id: user.id,
      first_name: authForm.firstName, last_name: authForm.lastName,
      email: authForm.email, phone: authForm.phone,
      city: authForm.city, state: authForm.state,
      avatar_color: "#40916C", is_admin: false,
      email_opt_in: authForm.emailOptIn,
    };

    if (hasSession) {
      const { error: profileError } = await supabase.from("profiles").insert(profile);
      if (profileError) console.warn("Profile insert failed (non-fatal):", profileError.message);
      setCurrentUser(profile);
      setAuthModal(null);
      showToast(`🌿 Welcome to New Harmony, ${authForm.firstName}!`);
    } else {
      setAuthModal(null);
      showToast(`📬 Almost there! Check your email and click the confirmation link to activate your account.`);
    }
  };
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setMyTickets([]);
    showToast("Signed out successfully.");
  };

  const updateProfile = async (updates) => {
    if (!currentUser?.id) return;
    const { error } = await supabase.from("profiles").update({
      first_name: updates.firstName,
      last_name: updates.lastName,
      phone: updates.phone,
      city: updates.city,
      state: updates.state,
      email_opt_in: updates.emailOptIn,
    }).eq("id", currentUser.id);
    if (error) { showToast("Could not save profile: " + error.message, "warn"); return; }
    setCurrentUser(prev => ({ ...prev, first_name: updates.firstName, last_name: updates.lastName, phone: updates.phone, city: updates.city, state: updates.state, email_opt_in: updates.emailOptIn }));
    showToast("Profile updated ✓");
  };

  // ─── SOCIAL &mdash; REVIEWS ──────────────────────────────────────────────────────
  const loadReviews = async (eventId) => {
    const { data } = await supabase.from("reviews").select("*").eq("event_id", eventId).order("created_at", { ascending: false });
    if (data) setReviews(prev => ({ ...prev, [eventId]: data.map(r => ({ id: r.id, userId: r.user_id, userName: r.user_name, rating: r.rating, text: r.review_text, createdAt: r.created_at })) }));
  };
  const submitReview = async (eventId, rating, text) => {
    if (!currentUser) { showToast("Sign in to leave a review", "warn"); return; }
    const name = `${currentUser.first_name || ""} ${currentUser.last_name || ""}`.trim() || currentUser.email;
    await supabase.from("reviews").insert({ event_id: eventId, user_id: currentUser.id, user_name: name, rating, review_text: text });
    await loadReviews(eventId);
    showToast("Review posted ✓");
  };
  const deleteReview = async (reviewId, eventId) => {
    await supabase.from("reviews").delete().eq("id", reviewId);
    await loadReviews(eventId);
    showToast("Review removed.", "warn");
  };

  // ─── SOCIAL &mdash; Q&A ──────────────────────────────────────────────────────────
  const loadQA = async (eventId) => {
    const { data } = await supabase.from("event_qa").select("*").eq("event_id", eventId).order("created_at", { ascending: true });
    if (data) setQaItems(prev => ({ ...prev, [eventId]: data.map(q => ({ id: q.id, userId: q.user_id, userName: q.user_name, question: q.question, answer: q.answer, createdAt: q.created_at, answeredAt: q.answered_at })) }));
  };
  const submitQuestion = async (eventId, question) => {
    if (!currentUser) { showToast("Sign in to ask a question", "warn"); return; }
    const name = `${currentUser.first_name || ""} ${currentUser.last_name || ""}`.trim() || currentUser.email;
    await supabase.from("event_qa").insert({ event_id: eventId, user_id: currentUser.id, user_name: name, question, answer: null });
    await loadQA(eventId);
    showToast("Question posted ✓");
  };
  const answerQuestion = async (qaId, eventId, answer) => {
    await supabase.from("event_qa").update({ answer, answered_at: new Date().toISOString() }).eq("id", qaId);
    await loadQA(eventId);
    showToast("Answer posted ✓");
  };
  const deleteQuestion = async (qaId, eventId) => {
    await supabase.from("event_qa").delete().eq("id", qaId);
    await loadQA(eventId);
  };

  // ─── SOCIAL &mdash; INTEREST (Going / Interested) ────────────────────────────────
  const toggleInterest = (eventId, type) => {
    if (!currentUser) { showToast("Sign in to mark your interest", "warn"); return; }
    const uid = currentUser.id;
    setInterests(prev => {
      const evIntr = prev[eventId] || { going: [], interested: [] };
      const otherType = type === "going" ? "interested" : "going";
      const inCurrent = evIntr[type].includes(uid);
      const updated = {
        ...prev,
        [eventId]: {
          ...evIntr,
          [type]: inCurrent ? evIntr[type].filter(id => id !== uid) : [...evIntr[type], uid],
          [otherType]: evIntr[otherType].filter(id => id !== uid), // remove from other
        },
      };
      localStorage.setItem("nh_interests", JSON.stringify(updated));
      return updated;
    });
  };
  const getInterest = (eventId) => interests[eventId] || { going: [], interested: [] };

  // ─── SOCIAL &mdash; FOLLOW ORGANIZER ─────────────────────────────────────────────
  const toggleFollow = (organizer) => {
    if (!currentUser) { showToast("Sign in to follow organizers", "warn"); return; }
    setFollowing(prev => {
      const next = new Set(prev);
      if (next.has(organizer)) { next.delete(organizer); showToast(`Unfollowed ${organizer}`); }
      else { next.add(organizer); showToast(`Following ${organizer} 🌿`); }
      localStorage.setItem("nh_following", JSON.stringify([...next]));
      return next;
    });
  };

  // ─── SOCIAL &mdash; REFERRAL LINK ────────────────────────────────────────────────
  const getReferralLink = (eventId) => {
    const base = window.location.href.split("?")[0].split("#")[0];
    const ref = currentUser ? btoa(currentUser.id).replace(/=/g, "").slice(0, 8) : "share";
    return `${base}?event=${eventId}&ref=${ref}`;
  };
  const copyReferralLink = async (eventId) => {
    const link = getReferralLink(eventId);
    // Track referral click
    if (currentUser) {
      const ref = btoa(currentUser.id).replace(/=/g, "").slice(0, 8);
      setReferralStats(prev => {
        const evStats = prev[eventId] || {};
        const updated = { ...prev, [eventId]: { ...evStats, [ref]: (evStats[ref] || 0) + 1 } };
        localStorage.setItem("nh_referrals", JSON.stringify(updated));
        return updated;
      });
    }
    try { await navigator.clipboard.writeText(link); showToast("Referral link copied! 🔗 Share it to bring friends."); }
    catch { showToast("Link: " + link); }
  };
  const getReferralCount = (eventId) => {
    if (!currentUser) return 0;
    const ref = btoa(currentUser.id).replace(/=/g, "").slice(0, 8);
    return (referralStats[eventId] || {})[ref] || 0;
  };

  // ─── PRIVATE EVENT &mdash; INVITE LINK ──────────────────────────────────────────
  const getInviteLink = (ev) => {
    if (!ev?.inviteToken) return null;
    const base = window.location.href.split("?")[0].split("#")[0];
    return `${base}?invite=${ev.inviteToken}`;
  };
  const copyInviteLink = async (ev) => {
    const link = getInviteLink(ev);
    if (!link) return;
    try { await navigator.clipboard.writeText(link); showToast("Invite link copied! 🔒 Share it privately."); }
    catch { showToast("Link: " + link); }
  };

  // ─── BADGES ────────────────────────────────────────────────────────────────
  const BADGE_DEFS = [
    { id: "first_ticket", emoji: "🎟️", name: "First Ticket", desc: "Registered for your first event" },
    { id: "five_events", emoji: "🌟", name: "Community Regular", desc: "Attended 5 events" },
    { id: "ten_events", emoji: "🏆", name: "Harmony Champion", desc: "Attended 10 events" },
    { id: "first_referral", emoji: "🤝", name: "Community Builder", desc: "Referred a friend to an event" },
    { id: "five_referrals", emoji: "🌱", name: "Seed Spreader", desc: "Referred 5 friends" },
    { id: "photo_uploader", emoji: "📷", name: "Memory Maker", desc: "Uploaded a photo to an event gallery" },
    { id: "reviewer", emoji: "⭐", name: "Honest Voice", desc: "Left a review for an event" },
    { id: "waitlist_survivor", emoji: "⏳", name: "Waitlist Warrior", desc: "Made it off the waitlist" },
    { id: "early_bird", emoji: "🌅", name: "Early Bird", desc: "Registered more than 30 days before an event" },
  ];
  const computeBadges = (tickets, refStats) => {
    const earned = [];
    const confirmedTickets = tickets.filter(t => t.status !== "cancelled");
    if (confirmedTickets.length >= 1) earned.push("first_ticket");
    if (confirmedTickets.length >= 5) earned.push("five_events");
    if (confirmedTickets.length >= 10) earned.push("ten_events");
    // Check reviews state: badge earned if the user has left at least one review
    const userReviews = Object.values(reviews).flat();
    if (currentUser && userReviews.some(r => r.userId === currentUser.id)) earned.push("reviewer");
    const totalRefs = Object.values(refStats || {}).reduce((s, ev) => s + Object.values(ev).reduce((a, c) => a + c, 0), 0);
    if (totalRefs >= 1) earned.push("first_referral");
    if (totalRefs >= 5) earned.push("five_referrals");
    return BADGE_DEFS.filter(b => earned.includes(b.id));
  };
  const awardBadge = (badgeId) => {
    setBadges(prev => {
      if (prev.some(b => b.id === badgeId)) return prev;
      const def = BADGE_DEFS.find(b => b.id === badgeId);
      if (!def) return prev;
      showToast(`🏅 Badge earned: ${def.emoji} ${def.name}!`);
      return [...prev, def];
    });
  };

  // ─── ACTIVITY FEED ─────────────────────────────────────────────────────────
  const addFeedItem = (item) => {
    setActivityFeed(prev => [{ ...item, id: Date.now() + Math.random(), ts: new Date().toISOString() }, ...prev].slice(0, 50));
  };
  const loadActivityFeed = async () => {
    // Load recent tickets, reviews, and photo uploads to build feed
    const { data: recentTickets } = await supabase.from("tickets").select("buyer_name,event_title,created_at").eq("status", "confirmed").order("created_at", { ascending: false }).limit(20);
    const { data: recentReviews } = await supabase.from("reviews").select("user_name,event_id,rating,created_at").order("created_at", { ascending: false }).limit(10);
    const feedItems = [];
    if (recentTickets) {
      recentTickets.forEach(t => feedItems.push({ type: "registration", text: `${t.buyer_name} registered for ${t.event_title}`, emoji: "🎟️", ts: t.created_at }));
    }
    if (recentReviews) {
      recentReviews.forEach(r => {
        const ev = events.find(e => e.id === r.event_id);
        feedItems.push({ type: "review", text: `${r.user_name} gave ${"⭐".repeat(r.rating)} to ${ev?.title || "an event"}`, emoji: "⭐", ts: r.created_at });
      });
    }
    feedItems.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    setActivityFeed(feedItems.slice(0, 40));
  };

  // ─── EVENT PHOTO GALLERIES ──────────────────────────────────────────────────
  const loadEventPhotos = async (eventId) => {
    const { data } = await supabase.from("event_photos").select("*").eq("event_id", eventId).order("created_at", { ascending: false });
    if (data) {
      setEventPhotos(prev => ({ ...prev, [eventId]: data.map(p => ({ id: p.id, url: p.photo_url, caption: p.caption || "", uploadedBy: p.uploaded_by_name, uploadedAt: p.created_at })) }));
    }
  };
  const uploadEventPhoto = async (eventId, file, caption = "") => {
    if (!currentUser) { showToast("Sign in to upload photos", "warn"); return; }
    try {
      const dataUrl = await compressImage(file, 1200, 0.8);
      const name = `${currentUser.first_name || ""} ${currentUser.last_name || ""}`.trim() || currentUser.email;
      await supabase.from("event_photos").insert({ event_id: eventId, photo_url: dataUrl, caption, uploaded_by: currentUser.id, uploaded_by_name: name });
      await loadEventPhotos(eventId);
      awardBadge("photo_uploader");
      addFeedItem({ type: "photo", text: `${name} added a photo to ${events.find(e => e.id === eventId)?.title || "an event"}`, emoji: "📷" });
      showToast("📷 Photo uploaded to gallery!");
    } catch (e) { showToast("Upload failed: " + e.message, "warn"); }
  };
  const deleteEventPhoto = async (photoId, eventId) => {
    await supabase.from("event_photos").delete().eq("id", photoId);
    await loadEventPhotos(eventId);
    showToast("Photo removed.", "warn");
  };

  // ─── PUSH NOTIFICATIONS ─────────────────────────────────────────────────────
  const requestPushPermission = async () => {
    if (!("Notification" in window)) { showToast("Push notifications not supported in this browser.", "warn"); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { showToast("Notification permission denied.", "warn"); return false; }
    return true;
  };
  const toggleNotifPref = async (eventId, type) => {
    if (!currentUser) { showToast("Sign in to manage notifications", "warn"); return; }
    const granted = await requestPushPermission();
    if (!granted) return;
    setNotifPrefs(prev => {
      const evPrefs = prev[eventId] || {};
      const updated = { ...prev, [eventId]: { ...evPrefs, [type]: !evPrefs[type] } };
      localStorage.setItem("nh_notif_prefs", JSON.stringify(updated));
      const isOn = !evPrefs[type];
      if (isOn) showToast(`🔔 ${type === "reminder" ? "Event reminders" : "Waitlist alerts"} enabled for this event`);
      else showToast(`🔕 Notifications disabled for this event`);
      return updated;
    });
  };
  const getNotifPref = (eventId, type) => (notifPrefs[eventId] || {})[type] || false;
  const sendLocalNotification = (title, body, tag = "") => {
    if (Notification.permission === "granted") {
      try { new Notification(title, { body, icon: "/favicon.ico", tag }); } catch (e) {}
    }
  };
  // Check reminders on load &mdash; fire local notifs for upcoming events user is registered for
  useEffect(() => {
    if (!currentUser || myTickets.length === 0) return;
    const today = new Date();
    myTickets.filter(t => t.status !== "cancelled").forEach(ticket => {
      const ev = events.find(e => e.id === ticket.eventId);
      if (!ev || !ev.startDate) return;
      const evDate = new Date(ev.startDate + "T" + (ev.time || "09:00"));
      const msUntil = evDate - today;
      const daysUntil = msUntil / (1000 * 60 * 60 * 24);
      const pref = notifPrefs[ev.id] || {};
      if (!pref.reminder) return;
      // 7-day reminder
      if (daysUntil > 6.9 && daysUntil < 7.1) {
        setTimeout(() => sendLocalNotification(`📅 Event in 1 week!`, `${ev.title} is coming up on ${fmt(ev.startDate)}.`, `reminder-7-${ev.id}`), 500);
      }
      // 1-day reminder
      if (daysUntil > 0.9 && daysUntil < 1.1) {
        setTimeout(() => sendLocalNotification(`🌿 Tomorrow: ${ev.title}`, `Don't forget! ${ev.title} is tomorrow at ${fmtTime(ev.time)}.`, `reminder-1-${ev.id}`), 500);
      }
    });
  }, [myTickets, events, currentUser]);

  // ─── EVENT DUPLICATION &mdash; handled in handleSave/startEdit section below ──────

  // ─── SCHEDULED REMINDERS via Resend ─────────────────────────────────────────
  const scheduleEventReminders = async (eventId) => {
    const ev = events.find(e => e.id === eventId);
    const rKey = localStorage.getItem("nh_resend_key");
    if (!ev || !rKey) return;
    const { data: allTickets } = await supabase.from("tickets").select("buyer_email,buyer_name").eq("event_id", eventId).eq("status", "confirmed");
    if (!allTickets || allTickets.length === 0) return;
    const uniqueEmails = [...new Map(allTickets.map(t => [t.buyer_email, t])).values()];
    const evDate = new Date(ev.startDate + "T" + (ev.time || "09:00"));
    const now = new Date();
    const msUntil = evDate - now;
    const daysUntil = msUntil / (1000 * 60 * 60 * 24);
    // Build reminder email HTML
    const makeReminderHtml = (name, daysLabel) => `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#1C2B1A;padding:28px 32px;text-align:center">
    <h1 style="color:#74C69D;margin:0;font-size:1.4rem">🌿 New Harmony Life</h1>
    <p style="color:#9CA3AF;margin:8px 0 0;font-size:0.9rem">Event Reminder</p>
  </div>
  <div style="padding:28px 32px">
    <h2 style="color:#1C2B1A;margin:0 0 8px">⏰ ${daysLabel}: ${ev.title}</h2>
    <p style="color:#6B7280;margin:0 0 20px;line-height:1.6">Hi ${name}! Just a friendly reminder that <strong>${ev.title}</strong> is coming up soon.</p>
    <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:16px 20px;margin-bottom:20px">
      <div style="color:#166534;font-weight:700;font-size:0.9rem;margin-bottom:4px">📍 ${ev.location}</div>
      <div style="color:#4B7C5A;font-size:0.85rem">${dateRange(ev)}${ev.time ? " · " + fmtTime(ev.time) : ""}</div>
      ${ev.address ? `<div style="color:#6B7280;font-size:0.8rem;margin-top:4px">${ev.address}</div>` : ""}
    </div>
    <p style="color:#6B7280;font-size:0.85rem;margin:0">Remember to bring your QR code or ticket ID. See you there! 🌱</p>
  </div>
  <div style="background:#F7F5F0;padding:16px 32px;text-align:center">
    <p style="color:#9CA3AF;font-size:0.78rem;margin:0">New Harmony Life · Sioux City, IA</p>
  </div>
</div>`;
    let sent = 0;
    if (daysUntil >= 6) {
      // Send 1-week reminder
      for (const t of uniqueEmails) {
        try {
          await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${rKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "New Harmony Life <tickets@newharmonylife.com>", to: [t.buyer_email], subject: `⏰ 1 week away &mdash; ${ev.title}`, html: makeReminderHtml(t.buyer_name?.split(" ")[0] || "there", "1 week away") }) });
          sent++;
        } catch (e) { console.warn("Reminder email failed:", e); }
      }
    } else if (daysUntil >= 0) {
      // Send 1-day reminder  
      for (const t of uniqueEmails) {
        try {
          await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${rKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "New Harmony Life <tickets@newharmonylife.com>", to: [t.buyer_email], subject: `🌿 Tomorrow &mdash; ${ev.title}`, html: makeReminderHtml(t.buyer_name?.split(" ")[0] || "there", "Tomorrow") }) });
          sent++;
        } catch (e) { console.warn("Reminder email failed:", e); }
      }
    }
    if (sent > 0) showToast(`📧 Reminders sent to ${sent} attendee${sent !== 1 ? "s" : ""}!`);
    else showToast("No reminders sent &mdash; check timing and Resend key.", "warn");
  };

  // ─── PWA &mdash; Service Worker & Install ────────────────────────────────────────
  useEffect(() => {
    // Install prompt listener
    const onInstallPrompt = e => { e.preventDefault(); setInstallPrompt(e); };
    const onAppInstalled = () => { setIsInstalled(true); setInstallPrompt(null); };
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Inject Web App Manifest
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = { name: "New Harmony Life Events", short_name: "NH Events", start_url: "/", display: "standalone", background_color: "#1C2B1A", theme_color: "#2D6A4F", icons: [{ src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='32' fill='%232D6A4F'/><text y='140' x='24' font-size='130'>🌿</text></svg>", sizes: "192x192", type: "image/svg+xml" }] };
      const blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
      const link = document.createElement("link"); link.rel = "manifest"; link.href = URL.createObjectURL(blob);
      document.head.appendChild(link);
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
      const m = document.createElement("meta"); m.name = "theme-color"; m.content = "#2D6A4F"; document.head.appendChild(m);
    }
    [["apple-mobile-web-app-capable","yes"],["apple-mobile-web-app-status-bar-style","black-translucent"],["apple-mobile-web-app-title","NH Events"]].forEach(([n,c]) => {
      if (!document.querySelector(`meta[name="${n}"]`)) { const m = document.createElement("meta"); m.name=n; m.content=c; document.head.appendChild(m); }
    });

    // Register service worker for offline support
    if ("serviceWorker" in navigator) {
      const swCode = `
const CACHE = "nh-v1";
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/"])).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || e.request.url.includes("supabase.co")) return;
  e.respondWith(fetch(e.request).then(res => { const cl = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cl)); return res; }).catch(() => caches.match(e.request)));
});
self.addEventListener("push", e => {
  const data = e.data?.json() || { title: "New Harmony Life", body: "New notification" };
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/favicon.ico", data: data.url }));
});
self.addEventListener("notificationclick", e => { e.notification.close(); if (e.notification.data) clients.openWindow(e.notification.data); });
      `.trim();
      const blob = new Blob([swCode], { type: "application/javascript" });
      navigator.serviceWorker.register(URL.createObjectURL(blob)).then(reg => setSwRegistered(true)).catch(() => {});
    }
    // Handle ?event= deep link on load
    const params = new URLSearchParams(window.location.search);
    const evParam = params.get("event");
    if (evParam) window.__nhPendingEvent = evParam;
    const inviteParam = params.get("invite");
    if (inviteParam) window.__nhInviteToken = inviteParam;

    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Deep link: open event once events are loaded
  useEffect(() => {
    if (events.length > 0 && window.__nhPendingEvent) {
      const evId = window.__nhPendingEvent;
      window.__nhPendingEvent = null;
      const found = events.find(e => e.id === evId || String(e.id) === evId);
      if (found) { setSelectedId(found.id); setView("detail"); }
    }
    // Invite token deep link &mdash; find the matching private event and open it
    if (events.length > 0 && window.__nhInviteToken) {
      const token = window.__nhInviteToken;
      window.__nhInviteToken = null;
      const found = events.find(e => e.inviteToken && e.inviteToken === token);
      if (found) { setSelectedId(found.id); setView("detail"); }
    }
  }, [events]);

  // ─── CHECKOUT ──────────────────────────────────────────────────────────────
  const openCheckout = () => {
    if (cart.length === 0) return;
    if (currentUser) {
      setCheckoutInfo({ firstName: currentUser.first_name || "", lastName: currentUser.last_name || "", email: currentUser.email || "", phone: currentUser.phone || "", address: "", city: currentUser.city || "", state: currentUser.state || "", zip: "" });
    } else {
      setCheckoutInfo({ firstName: "", lastName: "", email: "", phone: "", address: "", city: "", state: "", zip: "" });
    }
    setCheckoutStep(1); setCheckoutErrors({}); setPaymentForm({ cardName: "", cardNum: "", expiry: "", cvv: "" });
    setPaymentErrors({}); setOrderComplete(null); setPayMethod("stripe"); setProcessing(false);
    setCartOpen(false); setView("checkout");
  };
  const validateCheckoutInfo = () => {
    const e = {};
    if (!checkoutInfo.firstName.trim()) e.firstName = "First name required";
    if (!checkoutInfo.lastName.trim()) e.lastName = "Last name required";
    if (!checkoutInfo.email.includes("@")) e.email = "Valid email required";
    if (!checkoutInfo.phone.trim()) e.phone = "Phone required";
    setCheckoutErrors(e);
    return !Object.keys(e).length;
  };
  const validatePayment = () => {
    const e = {};
    const onlyFree = cartTotal === 0;
    if (!onlyFree && payMethod === "stripe") {
      if (!paymentForm.cardName.trim()) e.cardName = "Name on card required";
      const digits = paymentForm.cardNum.replace(/\s/g, "");
      if (digits.length < 15 || digits.length > 16 || isNaN(digits)) e.cardNum = "Valid card number required";
      if (!/^\d{2}\/\d{2}$/.test(paymentForm.expiry)) e.expiry = "Format: MM/YY";
      if (!/^\d{3,4}$/.test(paymentForm.cvv)) e.cvv = "3-4 digits";
    }
    setPaymentErrors(e);
    return !Object.keys(e).length;
  };
  const completeOrder = async () => {
    if (!validatePayment()) return;
    setProcessing(true);
    try {
      const orderNum = "NHL-" + Math.random().toString(36).substr(2, 8).toUpperCase();
      const buyerName = `${checkoutInfo.firstName} ${checkoutInfo.lastName}`;

      // Create order record
      const { error: orderErr } = await supabase.from("orders").insert({
        order_number: orderNum,
        user_id: currentUser?.id || null,
        buyer_name: buyerName,
        buyer_email: checkoutInfo.email,
        buyer_phone: checkoutInfo.phone || "",
        total: cartTotal,
        payment_method: payMethod,
        payment_status: cartTotal === 0 ? "free" : "simulated",
      });

      if (orderErr) {
        console.error("Order insert error:", orderErr);
        showToast("Order failed: " + orderErr.message, "warn");
        setProcessing(false);
        return;
      }

      // Fetch the order back by order_number to get the ID
      const { data: fetchedOrder, error: fetchErr } = await supabase
        .from("orders")
        .select("*")
        .eq("order_number", orderNum)
        .single();

      if (fetchErr || !fetchedOrder) {
        console.error("Order fetch error:", fetchErr);
        showToast("Order saved but could not confirm. Please check your tickets.", "warn");
        setProcessing(false);
        return;
      }

      const orderId = fetchedOrder.id;

      // Create ticket records — one row per individual ticket (not per cart item)
      const ticketInserts = cart.flatMap(item =>
        Array.from({ length: item.qty }, () => ({
          ticket_id: genTicketId(),
          order_id: orderId,
          order_number: orderNum,
          event_id: item.event.id,
          event_title: item.event.title,
          tier_id: item.tier.id,
          tier_name: item.tier.name,
          user_id: currentUser?.id || null,
          buyer_name: buyerName,
          buyer_email: checkoutInfo.email,
          quantity: 1,
          unit_price: item.tier.price,
          total: item.tier.price,
          status: "confirmed",
          checked_in: false,
        }))
      );

      // Use raw fetch for ticket insert &mdash; bypasses custom client quirks
      const sessionToken = supabase.getSession()?.access_token || SUPABASE_ANON_KEY;
      const ticketRes = await fetch(`${SUPABASE_URL}/rest/v1/tickets`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify(ticketInserts),
      });
      const ticketResText = await ticketRes.text();
      console.log("Ticket insert status:", ticketRes.status, ticketResText);

      if (!ticketRes.ok) {
        console.error("Ticket insert failed:", ticketRes.status, ticketResText);
        showToast("Tickets failed: " + ticketResText, "warn");
        setProcessing(false);
        return;
      }

      // Update tier sold counts and event registered count using fresh DB values
      for (const item of cart) {
        const { data: freshTier } = await supabase.from("ticket_tiers").select("sold").eq("id", item.tier.id).single();
        await supabase.from("ticket_tiers").update({ sold: (freshTier?.sold ?? item.tier.sold) + item.qty }).eq("id", item.tier.id);
        const { data: freshEvent } = await supabase.from("events").select("registered").eq("id", item.event.id).single();
        await supabase.from("events").update({ registered: (freshEvent?.registered ?? item.event.registered ?? 0) + item.qty }).eq("id", item.event.id);
      }

      // Build local ticket objects for display — ticketInserts is already 1 row per ticket
      const newTickets = ticketInserts.map(t => ({
        ticketId: t.ticket_id,
        orderId: t.order_id,
        eventId: t.event_id,
        eventTitle: t.event_title,
        tierId: t.tier_id,
        tierName: t.tier_name,
        buyerName: t.buyer_name,
        buyerEmail: t.buyer_email,
        qty: 1,
        total: t.total,
        orderNum,
        bookedOn: new Date().toLocaleDateString(),
        status: "confirmed",
        checkedIn: false,
        checkinTime: null,
      }));

      // Reload tickets from DB to get the real UUID `id` for each row
      // (ticketInserts only has ticket_id / TKT-xxx, not the DB-assigned UUID)
      if (currentUser?.id) {
        await loadMyTickets(currentUser.id);
      } else {
        setMyTickets(prev => [...prev, ...newTickets]);
      }

      // Send confirmation email with tickets via Resend if API key is configured
      const rKey = localStorage.getItem("nh_resend_key");
      if (rKey && checkoutInfo.email) {
        try {
          // Build one ticket block per individual ticket (ticketInserts is already expanded to qty=1 each)
          // Count total tickets per tier for "Ticket N of M" labels
          const tierCounts = {};
          newTickets.forEach(t => { const k = t.eventId + "_" + t.tierId; tierCounts[k] = (tierCounts[k] || 0) + 1; });
          const tierIndexes = {};
          const ticketBlocks = newTickets.map(t => {
            const k = t.eventId + "_" + t.tierId;
            tierIndexes[k] = (tierIndexes[k] || 0) + 1;
            const ticketNum = tierIndexes[k];
            const tierTotal = tierCounts[k];
            const ev = cart.find(i => i.event.id === t.eventId)?.event || {};
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(t.ticketId)}&color=1C2B1A&bgcolor=F7F5F0`;
            const eventDate = ev.date ? new Date(ev.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "";
            const eventTime = ev.startTime ? (() => { const [h,m] = ev.startTime.split(":"); const hr = parseInt(h); return `${hr > 12 ? hr-12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`; })() : "";
            return `
  <div style="border:2px solid #3D5A38;border-radius:14px;padding:0;margin-bottom:24px;overflow:hidden;background:#fff">
    <!-- Ticket header -->
    <div style="background:#1C2B1A;padding:16px 22px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="color:#74C69D;font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px">🌿 New Harmony Life · Ticket</div>
        <div style="color:#fff;font-size:1.05rem;font-weight:700">${t.eventTitle}</div>
      </div>
      <div style="background:#74C69D22;border:1px solid #74C69D55;border-radius:8px;padding:4px 12px;color:#74C69D;font-size:0.75rem;font-weight:700;white-space:nowrap">${t.tierName}</div>
    </div>
    <!-- Ticket body -->
    <div style="display:flex;padding:20px 22px;gap:20px;align-items:flex-start">
      <!-- QR code -->
      <div style="flex-shrink:0;text-align:center">
        <img src="${qrUrl}" width="130" height="130" alt="QR Code" style="display:block;border-radius:8px;border:1px solid #e5e7eb" />
        <div style="color:#9CA3AF;font-size:0.62rem;margin-top:5px;font-family:monospace">Scan at entry</div>
      </div>
      <!-- Details -->
      <div style="flex:1;min-width:0">
        ${eventDate ? `<div style="margin-bottom:10px"><div style="color:#9CA3AF;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px">Date &amp; Time</div><div style="color:#1C2B1A;font-weight:600;font-size:0.88rem">${eventDate}${eventTime ? " · " + eventTime : ""}</div></div>` : ""}
        ${ev.location ? `<div style="margin-bottom:10px"><div style="color:#9CA3AF;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px">Location</div><div style="color:#1C2B1A;font-weight:600;font-size:0.88rem">${ev.location}</div></div>` : ""}
        <div style="margin-bottom:10px"><div style="color:#9CA3AF;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px">Ticket Holder</div><div style="color:#1C2B1A;font-weight:600;font-size:0.88rem">${buyerName}</div></div>
        ${tierTotal > 1 ? `<div style="margin-bottom:10px"><div style="color:#9CA3AF;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px">Ticket</div><div style="color:#1C2B1A;font-weight:600;font-size:0.88rem">${ticketNum} of ${tierTotal}</div></div>` : ""}
      </div>
    </div>
    <!-- Ticket footer -->
    <div style="background:#F7F5F0;border-top:1px dashed #D1D5DB;padding:10px 22px;display:flex;align-items:center;justify-content:space-between">
      <div style="font-family:monospace;color:#3D5A38;font-size:0.8rem;font-weight:700;letter-spacing:0.04em">${t.ticketId}</div>
      <div style="color:#6B7280;font-size:0.75rem">Order ${orderNum}</div>
    </div>
  </div>`;
          }).join("");

          // Receipt summary rows
          const receiptRows = cart.map(item =>
            `<tr><td style="padding:9px 14px;border-bottom:1px solid #F3F4F6;color:#374151;font-size:0.85rem">${item.event.title} &mdash; ${item.tier.name}</td><td style="padding:9px 14px;border-bottom:1px solid #F3F4F6;color:#374151;font-size:0.85rem;text-align:center">${item.qty}</td><td style="padding:9px 14px;border-bottom:1px solid #F3F4F6;color:#374151;font-size:0.85rem;text-align:right">${item.tier.price === 0 ? "Free" : "$" + (item.tier.price * item.qty).toFixed(2)}</td></tr>`
          ).join("");

          const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:580px;margin:32px auto;padding:0 16px">

  <!-- Header -->
  <div style="background:#1C2B1A;border-radius:14px 14px 0 0;padding:28px 32px;text-align:center">
    <div style="color:#74C69D;font-size:1.5rem;font-weight:700;margin-bottom:4px">🌿 New Harmony Life</div>
    <div style="color:#9CA3AF;font-size:0.9rem">You're all set — here are your tickets!</div>
  </div>

  <!-- Greeting -->
  <div style="background:#fff;padding:24px 32px 8px">
    <h2 style="color:#1C2B1A;margin:0 0 8px;font-size:1.2rem">Hey ${checkoutInfo.firstName}! 🎉</h2>
    <p style="color:#6B7280;margin:0 0 4px;line-height:1.6">Your order <strong style="color:#1C2B1A">${orderNum}</strong> is confirmed. Your tickets are below — just show the QR code at the door.</p>
  </div>

  <!-- Tickets -->
  <div style="background:#fff;padding:16px 32px 24px">
    ${ticketBlocks}
  </div>

  <!-- Receipt -->
  <div style="background:#fff;border-top:1px solid #F3F4F6;padding:20px 32px">
    <div style="color:#374151;font-weight:700;font-size:0.9rem;margin-bottom:12px">📋 Order Receipt</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
      <thead><tr style="background:#F7F5F0"><th style="padding:9px 14px;text-align:left;color:#3D5A38;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Item</th><th style="padding:9px 14px;text-align:center;color:#3D5A38;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Qty</th><th style="padding:9px 14px;text-align:right;color:#3D5A38;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Price</th></tr></thead>
      <tbody>${receiptRows}</tbody>
      <tfoot><tr style="background:#F7F5F0"><td colspan="2" style="padding:11px 14px;font-weight:700;color:#1C2B1A;font-size:0.9rem">Total</td><td style="padding:11px 14px;font-weight:700;color:#1C2B1A;text-align:right;font-size:0.9rem">${cartTotal === 0 ? "Free" : "$" + cartTotal.toFixed(2)}</td></tr></tfoot>
    </table>
    <p style="color:#9CA3AF;font-size:0.75rem;margin:14px 0 0">Payment method: ${payMethod === "card" ? "Credit / Debit Card" : payMethod === "paypal" ? "PayPal" : payMethod}</p>
  </div>

  <!-- Footer -->
  <div style="background:#F7F5F0;border-radius:0 0 14px 14px;padding:18px 32px;text-align:center">
    <p style="color:#9CA3AF;font-size:0.75rem;margin:0 0 6px">Questions? Reply to this email and we'll help you out.</p>
    <p style="color:#9CA3AF;font-size:0.72rem;margin:0">New Harmony Life · Loess Hills Region, Iowa</p>
  </div>

</div></body></html>`;

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${rKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "New Harmony Life <tickets@newharmonylife.com>",
              to: [checkoutInfo.email],
              subject: `Your tickets: ${cart.map(i => i.event.title).filter((v,i,a) => a.indexOf(v)===i).join(", ")} — ${orderNum}`,
              html: emailHtml,
            }),
          });
        } catch (emailErr) {
          console.warn("Ticket email send failed (non-fatal):", emailErr);
        }
      }

      setOrderComplete({ orderNum, tickets: newTickets, total: cartTotal, buyer: checkoutInfo });
      await loadEvents();
      setCart([]);
      setCheckoutStep(3);
    } catch (e) {
      showToast("Something went wrong: " + e.message, "warn");
      console.error("completeOrder error:", e);
    }
    setProcessing(false);
  };


  // ─── EVENTS ────────────────────────────────────────────────────────────────
  const validateEventForm = () => {
    const e = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.startDate) e.startDate = "Start date is required";
    if (form.endDate && form.endDate < form.startDate) e.endDate = "End date must be after start";
    if (!form.location.trim()) e.location = "Location is required";
    if (!form.organizer.trim()) e.organizer = "Organizer is required";
    setFormErrors(e);
    return !Object.keys(e).length;
  };

  // Save extended fields (columns that may not exist yet) to localStorage
  const LS_EXTENDED_KEY = "nh_event_extended_v1";
  const saveExtended = (eventId, data) => {
    try {
      const m = JSON.parse(localStorage.getItem(LS_EXTENDED_KEY) || "{}");
      m[eventId] = { ...(m[eventId] || {}), ...data };
      localStorage.setItem(LS_EXTENDED_KEY, JSON.stringify(m));
    } catch {}
  };
  const loadExtended = (eventId) => {
    try {
      const m = JSON.parse(localStorage.getItem(LS_EXTENDED_KEY) || "{}");
      return m[eventId] || {};
    } catch { return {}; }
  };

  const handleSave = async () => {
    if (!validateEventForm()) return;
    const tags = form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
    const tiers = (form.ticketTiers || []);
    const totalCap = parseInt(form.capacity) || 50;

    // Core payload — only columns that exist in a standard events table
    const corePayload = {
      title: form.title, category: form.category,
      start_date: form.startDate, end_date: form.endDate || null,
      time: form.time, end_time: form.endTime,
      location: form.location, address: form.address,
      description: form.description, capacity: totalCap,
      color: form.color, organizer: form.organizer,
      tags, online: form.online,
      vendor_invite: form.vendorInvite, show_vendors: form.showVendors,
      vendor_deadline: form.vendorDeadline || null,
      vendor_info: form.vendorInfo,
      profit_model: form.profitModel, host_pct: form.hostPct,
      is_public: form.isPublic !== false,
      is_private: form.isPrivate || false,
      private_password: form.isPrivate ? (form.privatePassword || "") : "",
      invite_token: form.isPrivate ? (form.inviteToken || Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)) : "",
      recurring: form.recurring || false,
    };

    // Extended payload — columns added later that may not exist in all deployments
    const extendedFields = {
      recurring_type: form.recurringType || "weekly",
      recurring_day: parseInt(form.recurringDay) || 0,
      recurring_month_date: parseInt(form.recurringMonthDate) || 1,
      recurring_week_num: parseInt(form.recurringWeekNum) || 1,
      recurring_week_day: parseInt(form.recurringWeekDay) || 5,
      recurring_end_date: form.recurringEndDate || null,
      custom_questions: form.customQuestions || [],
      vibe_tags: form.vibeTags || [],
      event_types: form.eventTypes || [],
      refund_policy: form.refundPolicy || "none",
      refund_deadline_days: parseInt(form.refundDeadlineDays) || 7,
      show_attendance_bar: form.showAttendanceBar !== false,
    };

    // Try full payload; if any column is missing fall back to core only
    const tryPayload = async (id, payload, isInsert = false) => {
      if (isInsert) {
        const { data, error } = await supabase.from("events").insert({ ...payload, registered: 0 }).select();
        return { data, error };
      } else {
        const { error } = await supabase.from("events").update(payload).eq("id", id);
        return { error };
      }
    };

    const fullPayload = { ...corePayload, ...extendedFields };
    if (editingId) {
      const oldEvent = events.find(e => e.id === editingId);
      const oldCapacity = oldEvent ? (oldEvent.capacity || 0) : 0;
      const oldSold = oldEvent ? (oldEvent.ticketTiers?.reduce((s, t) => s + t.sold, 0) || oldEvent.registered || 0) : 0;
      const oldSpotsLeft = Math.max(0, oldCapacity - oldSold);

      // Try full payload; if a column is missing, retry with core only
      let { error: updateErr } = await tryPayload(editingId, fullPayload);
      if (updateErr) {
        console.warn("Full payload failed, retrying with core only:", updateErr.message);
        const { error: coreErr } = await tryPayload(editingId, corePayload);
        if (coreErr) { showToast("Save error: " + coreErr.message, "warn"); return; }
      }
      // Always save extended fields + photos to localStorage
      saveExtended(editingId, extendedFields);
      localPhotosSet(editingId, form.photos || []);
      // Delete old tiers and re-insert
      await supabase.from("ticket_tiers").delete().eq("event_id", editingId);
      if (tiers.length) await supabase.from("ticket_tiers").insert(tiers.map((t, i) => ({ event_id: editingId, name: t.name, description: t.description || "", price: parseFloat(t.price) || 0, capacity: totalCap, sold: t.sold || 0, sort_order: i })));

      // Detect important changes that warrant notifying registered attendees
      const dateChanged = oldEvent && (oldEvent.startDate !== form.startDate || oldEvent.endDate !== (form.endDate || null) || oldEvent.time !== form.time);
      const locationChanged = oldEvent && (oldEvent.location !== form.location || oldEvent.address !== form.address);
      if ((dateChanged || locationChanged) && oldEvent) {
        const rKey = localStorage.getItem("nh_resend_key");
        if (rKey) {
          // Fetch all confirmed ticket holders for this event
          const { data: allTickets } = await supabase.from("tickets").select("buyer_email,buyer_name").eq("event_id", editingId).eq("status", "confirmed");
          if (allTickets && allTickets.length > 0) {
            // Deduplicate by email
            const uniqueEmails = [...new Map(allTickets.map(t => [t.buyer_email, t])).values()];
            let notified = 0;
            const changeLines = [];
            if (dateChanged) changeLines.push(`<li style="margin-bottom:6px">📅 <strong>New date/time:</strong> ${fmt(form.startDate)}${form.endDate && form.endDate !== form.startDate ? ` &ndash; ${fmt(form.endDate)}` : ""}${form.time ? ` at ${fmtTime(form.time)}` : ""}</li>`);
            if (locationChanged) changeLines.push(`<li style="margin-bottom:6px">📍 <strong>New location:</strong> ${form.location}${form.address ? `, ${form.address}` : ""}</li>`);
            for (const ticket of uniqueEmails) {
              try {
                await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${rKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    from: "New Harmony Life <tickets@newharmonylife.com>",
                    to: [ticket.buyer_email],
                    subject: `Important update &mdash; ${form.title}`,
                    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#1C2B1A;padding:28px 32px;text-align:center">
    <h1 style="color:#74C69D;margin:0;font-size:1.4rem">🌿 New Harmony Life</h1>
    <p style="color:#9CA3AF;margin:8px 0 0;font-size:0.9rem">Event Update</p>
  </div>
  <div style="padding:28px 32px">
    <h2 style="color:#1C2B1A;margin:0 0 8px">Your event has been updated</h2>
    <p style="color:#6B7280;margin:0 0 20px;line-height:1.6">Hi ${ticket.buyer_name?.split(" ")[0] || "there"}, there have been changes to <strong>${form.title}</strong> that you're registered for. Please take note:</p>
    <ul style="color:#374151;font-size:0.9rem;line-height:1.8;padding-left:20px;margin:0 0 20px">${changeLines.join("")}</ul>
    <p style="color:#6B7280;font-size:0.85rem;margin:0">Your ticket is still valid. Please update your calendar. Questions? Reply to this email.</p>
  </div>
  <div style="background:#F7F5F0;padding:16px 32px;text-align:center">
    <p style="color:#9CA3AF;font-size:0.78rem;margin:0">New Harmony Life · Sioux City, IA</p>
  </div>
</div>`,
                  }),
                });
                notified++;
              } catch (e) { console.warn("Update notification failed:", e); }
            }
            if (notified > 0) showToast(`📧 ${notified} attendee${notified !== 1 ? "s" : ""} notified of event changes`);
          }
        }
      }

      // Check if capacity increased and there's a waitlist to notify
      const newSpotsLeft = Math.max(0, totalCap - oldSold);
      const spotsOpened = newSpotsLeft - oldSpotsLeft;

      if (spotsOpened > 0) {
        const { data: waitlistEntries } = await supabase
          .from("waitlist").select("*")
          .eq("event_id", editingId)
          .order("created_at", { ascending: true });

        if (waitlistEntries && waitlistEntries.length > 0) {
          // Email everyone on the waitlist &mdash; spots are first-come-first-served
          const rKey = localStorage.getItem("nh_resend_key");
          const toNotify = waitlistEntries; // all of them
          let emailsSent = 0;

          if (rKey && oldEvent) {
            for (const person of toNotify) {
              if (!person.email) continue;
              try {
                await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${rKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    from: "New Harmony Life <tickets@newharmonylife.com>",
                    to: [person.email],
                    subject: `Spots just opened up &mdash; ${form.title}`,
                    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#1C2B1A;padding:28px 32px;text-align:center">
    <h1 style="color:#74C69D;margin:0;font-size:1.4rem">🌿 New Harmony Life</h1>
    <p style="color:#9CA3AF;margin:8px 0 0;font-size:0.9rem">Waitlist Update</p>
  </div>
  <div style="padding:28px 32px">
    <h2 style="color:#1C2B1A;margin:0 0 8px">Great news, ${person.name?.split(" ")[0] || "there"}! 🎉</h2>
    <p style="color:#6B7280;margin:0 0 20px;line-height:1.6">
      <strong>${spotsOpened} new spot${spotsOpened !== 1 ? "s have" : " has"} opened up</strong> for <strong>${form.title}</strong>.
      All ${toNotify.length} waitlisted ${toNotify.length !== 1 ? "people are" : "person is"} being notified at the same time &mdash; it's first come, first served, so grab your ticket soon!
    </p>
    <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:16px 20px;margin-bottom:20px">
      <div style="color:#166534;font-weight:700;font-size:0.9rem;margin-bottom:4px">📍 ${form.location}</div>
      <div style="color:#4B7C5A;font-size:0.85rem">${dateRange({ startDate: form.startDate, endDate: form.endDate })}${form.time ? " · " + fmtTime(form.time) : ""}</div>
    </div>
    <p style="color:#6B7280;font-size:0.85rem;margin:0">Visit the event page to register before the spots fill up again.</p>
  </div>
  <div style="background:#F7F5F0;padding:16px 32px;text-align:center">
    <p style="color:#9CA3AF;font-size:0.78rem;margin:0">New Harmony Life · Sioux City, IA</p>
  </div>
</div>`,
                  }),
                });
                emailsSent++;
              } catch (emailErr) {
                console.warn(`Waitlist email failed for ${person.email}:`, emailErr);
              }
            }
            showToast(`✉️ ${emailsSent} waitlist ${emailsSent !== 1 ? "emails" : "email"} sent &mdash; ${spotsOpened} new spot${spotsOpened !== 1 ? "s" : ""} opened!`);
          } else {
            // No Resend key &mdash; tell the admin how many people to contact manually
            showToast(`⚠️ ${spotsOpened} spot${spotsOpened !== 1 ? "s" : ""} opened &mdash; notify ${toNotify.length} waitlisted ${toNotify.length !== 1 ? "people" : "person"} manually (no Resend key set).`, "warn");
          }
        }
      }

      showToast("Event updated ✓");
    } else {
      // Try full payload; if a column is missing, retry with core only
      let { data: newEv, error: insertErr } = await tryPayload(null, fullPayload, true);
      if (insertErr) {
        console.warn("Full insert failed, retrying with core only:", insertErr.message);
        const res = await tryPayload(null, corePayload, true);
        if (res.error) { showToast("Save error: " + res.error.message, "warn"); return; }
        newEv = res.data;
      }
      const newId = newEv?.[0]?.id;
      // Save extended fields + photos to localStorage keyed by new event id
      if (newId) {
        saveExtended(newId, extendedFields);
        if ((form.photos || []).length > 0) localPhotosSet(newId, form.photos);
      }
      if (newId && tiers.length) await supabase.from("ticket_tiers").insert(tiers.map((t, i) => ({ event_id: newId, name: t.name, description: t.description || "", price: parseFloat(t.price) || 0, capacity: totalCap, sold: 0, sort_order: i })));
      // If private, store the generated token back in form state so the copy-link UI shows immediately
      if (form.isPrivate && fullPayload.invite_token) {
        setForm(f => ({ ...f, inviteToken: fullPayload.invite_token }));
      }
      showToast("Event published ✓");
    }
    await loadEvents();
    setForm(EMPTY_EVENT_FORM); setEditingId(null); setView("discover");
  };
  const startEdit = ev => {
    setForm({
      ...ev,
      tags: (ev.tags || []).join(", "),
      capacity: String(ev.capacity),
      ticketTiers: ev.ticketTiers || [],
      isPublic: ev.isPublic !== false,
      isPrivate: ev.isPrivate || false,
      privatePassword: ev.privatePassword || "",
      inviteToken: ev.inviteToken || "",
      recurring: ev.recurring || false,
      recurringType: ev.recurringType || "weekly",
      recurringDay: String(ev.recurringDay || "0"),
      recurringMonthDate: String(ev.recurringMonthDate || "1"),
      recurringWeekNum: String(ev.recurringWeekNum || "1"),
      recurringWeekDay: String(ev.recurringWeekDay || "5"),
      recurringEndDate: ev.recurringEndDate || "",
      customQuestions: ev.customQuestions || [],
      vibeTags: ev.vibeTags || [],
      eventTypes: ev.eventTypes || [],
      refundPolicy: ev.refundPolicy || "none",
      refundDeadlineDays: ev.refundDeadlineDays ?? 7,
    });
    setEditingId(ev.id); setFormErrors({}); setView("create");
  };
  const duplicateEvent = ev => {
    setForm({
      ...ev,
      title: ev.title + " (Copy)",
      tags: (ev.tags || []).join(", "),
      capacity: String(ev.capacity),
      ticketTiers: (ev.ticketTiers || []).map(t => ({ ...t, id: "t" + Math.random().toString(36).substr(2,5), sold: 0 })),
      isPublic: ev.isPublic !== false,
      isPrivate: ev.isPrivate || false,
      privatePassword: ev.privatePassword || "",
      inviteToken: "", // always generate a fresh token for duplicates
      recurring: ev.recurring || false,
      recurringType: ev.recurringType || "weekly",
      recurringDay: String(ev.recurringDay || "0"),
      recurringMonthDate: String(ev.recurringMonthDate || "1"),
      recurringWeekNum: String(ev.recurringWeekNum || "1"),
      recurringWeekDay: String(ev.recurringWeekDay || "5"),
      recurringEndDate: ev.recurringEndDate || "",
      customQuestions: ev.customQuestions || [],
      vibeTags: ev.vibeTags || [],
      eventTypes: ev.eventTypes || [],
      refundPolicy: ev.refundPolicy || "none",
      refundDeadlineDays: ev.refundDeadlineDays ?? 7,
      startDate: "", endDate: "", // Clear dates so admin sets new ones
    });
    setEditingId(null); setFormErrors({}); setView("create");
  };
  const handleDelete = async (id) => {
    await supabase.from("events").delete().eq("id", id);
    await loadEvents();
    showToast("Event removed.", "warn");
    setView("discover");
  };

  // ─── PHOTOS ────────────────────────────────────────────────────────────────
  const handlePhotoAdd = async (files) => {
    const arr = Array.from(files).slice(0, 8 - (form.photos || []).length);
    const urls = await Promise.all(arr.map(f => compressImage(f, 1200, 0.75)));
    setForm(f => ({ ...f, photos: [...(f.photos || []), ...urls] }));
  };
  const removePhoto = idx => setForm(f => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }));
  const handleVendorPhoto = async (files) => {
    if (!files || !files.length) return;
    const url = await compressImage(files[0], 800, 0.8);
    setVendorForm(f => {
      const existing = f.photos || [];
      if (existing.length >= 3) return f;
      return { ...f, photo: f.photo || url, photos: [...existing, url] };
    });
  };
  const removeVendorPhoto = (idx) => {
    setVendorForm(f => {
      const updated = (f.photos || []).filter((_, i) => i !== idx);
      return { ...f, photos: updated, photo: updated[0] || null };
    });
  };

  // ─── VENDORS ───────────────────────────────────────────────────────────────
  const validateVendor = () => {
    const e = {};
    if (!vendorForm.businessName.trim()) e.businessName = "Business name required";
    if (!vendorForm.contactName.trim()) e.contactName = "Contact name required";
    if (!vendorForm.email.includes("@")) e.email = "Valid email required";
    if (!vendorForm.phone.trim()) e.phone = "Phone required";
    if (!vendorForm.city.trim()) e.city = "City required";
    if (!vendorForm.state.trim()) e.state = "State required";
    if (!vendorForm.description.trim()) e.description = "Please describe your products";
    DISCLAIMERS.forEach(d => { if (!vendorForm[d.key]) e[d.key] = "You must agree to this term"; });
    setVendorErrors(e);
    return !Object.keys(e).length;
  };
  const submitVendorApp = async () => {
    if (!validateVendor()) return;
    await supabase.from("vendors").insert({
      event_id: vendorModal,
      business_name: vendorForm.businessName, contact_name: vendorForm.contactName,
      email: vendorForm.email, phone: vendorForm.phone,
      city: vendorForm.city, state: vendorForm.state,
      vendor_type: vendorForm.vendorType, description: vendorForm.description,
      space_needed: vendorForm.spaceNeeded, years_in_business: vendorForm.yearsInBusiness,
      has_permit: vendorForm.hasPermit, electric_needed: vendorForm.electricNeeded,
      tent_owned: vendorForm.tentOwned, website: vendorForm.website,
      instagram: vendorForm.instagram, comments: vendorForm.comments,
      photo: vendorForm.photo || null,
      photos: vendorForm.photos || [], status: "pending",
      community_opt_in: vendorForm.communityOptIn || false,
    });
    await loadEvents();
    setVendorSubmitted(true);
    showToast("🌿 Application submitted!");
  };
  const openVendorModal = evId => {
    // Pre-fill from any existing approved vendor record that opted into the community directory
    // Match by currentUser email first, then fall back to any community-opted-in vendor with same email
    let prefill = null;
    const userEmail = currentUser?.email || "";
    events.forEach(ev => {
      (ev.vendors || []).forEach(v => {
        if (!prefill && v.communityOptIn && v.email && userEmail && v.email.toLowerCase() === userEmail.toLowerCase()) {
          prefill = v;
        }
      });
    });
    // Also check if any vendor record matches by email even without community opt-in (same person applying again)
    if (!prefill && userEmail) {
      events.forEach(ev => {
        (ev.vendors || []).forEach(v => {
          if (!prefill && v.email && v.email.toLowerCase() === userEmail.toLowerCase()) {
            prefill = v;
          }
        });
      });
    }
    if (prefill) {
      setVendorForm({
        ...EMPTY_VENDOR_APP,
        businessName: prefill.businessName || "",
        contactName: prefill.contactName || "",
        email: prefill.email || "",
        phone: prefill.phone || "",
        city: prefill.city || "",
        state: prefill.state || "",
        vendorType: prefill.vendorType || "Produce & Vegetables",
        description: prefill.description || "",
        spaceNeeded: prefill.spaceNeeded || "Small – 3 ft table",
        yearsInBusiness: prefill.yearsInBusiness || "",
        hasPermit: prefill.hasPermit || false,
        electricNeeded: prefill.electricNeeded || false,
        tentOwned: prefill.tentOwned || false,
        website: prefill.website || "",
        instagram: prefill.instagram || "",
        photo: prefill.photo || null,
        photos: prefill.photos || (prefill.photo ? [prefill.photo] : []),
        communityOptIn: prefill.communityOptIn || false,
        // Always reset agreements and event-specific fields
        d1: false, d2: false, d3: false, d4: false, d5: false,
        boothNeighborPref: "", comments: "",
      });
    } else {
      // Pre-fill name and email from logged-in user if available
      setVendorForm({
        ...EMPTY_VENDOR_APP,
        contactName: currentUser ? (currentUser.user_metadata?.full_name || "") : "",
        email: userEmail,
      });
    }
    setVendorModal(evId); setVendorErrors({}); setVendorSubmitted(false);
  };
  const updateVendorStatus = async (evId, vendorId, status) => {
    await supabase.from("vendors").update({ status }).eq("id", vendorId);
    await loadEvents();
  };

  // ─── FILTERED EVENTS ───────────────────────────────────────────────────────
  const visibleEvents = activeEvents.filter(ev => {
    // Private events are hidden from the public discover feed —
    // but admins with the dashboard unlocked can see everything
    if (ev.isPrivate === true && !dashUnlocked) return false;
    // Non-logged-in users only see public events
    if (!currentUser && ev.isPublic === false) return false;
    return true;
  });
  const filteredEvents = visibleEvents.filter(ev => {
    const q = search.toLowerCase();
    const ms = !search || [ev.title, ev.description, ev.location].some(s => s && s.toLowerCase().includes(q));
    const mc = filterCat === "All" || ev.category === filterCat;
    const today = new Date().toISOString().split("T")[0];
    const wk = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const mo = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const md = filterDate === "all" ? true : filterDate === "today" ? ev.startDate <= today && (ev.endDate || ev.startDate) >= today : filterDate === "week" ? ev.startDate <= wk && (ev.endDate || ev.startDate) >= today : filterDate === "month" ? ev.startDate <= mo && (ev.endDate || ev.startDate) >= today : true;
    const lowestPrice = ev.ticketTiers && ev.ticketTiers.length > 0 ? Math.min(...ev.ticketTiers.map(t => t.price)) : 0;
    const mp = filterPrice === "all" ? true : filterPrice === "free" ? lowestPrice === 0 : lowestPrice > 0;
    const mv = filterVibe.length === 0 ? true : filterVibe.every(v => (ev.vibeTags || []).includes(v));
    return ms && mc && md && mp && mv;
  }).sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));

  // ─── LOADING SCREEN ────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#F7F5F0", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem" }}>
      <div style={{ fontSize: "3rem" }}>🌿</div>
      <div style={{ color: "#2D6A4F", fontFamily: "'Lora',serif", fontSize: "1.3rem", fontWeight: 700 }}>New Harmony Life</div>
      <div style={{ color: "#6B7280", fontSize: "0.9rem" }}>Loading events…</div>
    </div>
  );

  const value = {
    currentUser, setCurrentUser,
    authModal, setAuthModal, authForm, setAuthForm, authErrors, setAuthErrors, authMode, setAuthMode,
    cart, setCart, cartOpen, setCartOpen, cartTotal, cartCount,
    checkoutInfo, setCheckoutInfo, checkoutErrors, setCheckoutErrors,
    checkoutStep, setCheckoutStep, paymentForm, setPaymentForm,
    paymentErrors, setPaymentErrors, orderComplete, setOrderComplete,
    payMethod, setPayMethod, paypalLoaded, setPaypalLoaded, processing, setProcessing,
    events, setEvents, view, setView, selectedId, setSelectedId,
    search, setSearch, filterCat, setFilterCat, filterDate, setFilterDate, filterPrice, setFilterPrice, filterVibe, setFilterVibe,
    myTickets, setMyTickets, toast, setToast, registerQty, setRegQty,
    selectedTierId, setSelectedTierId,
    calendarModal, setCalendarModal,
    vendorModal, setVendorModal, vendorForm, setVendorForm, vendorErrors, setVendorErrors, vendorSubmitted, setVendorSubmitted,
    dashUnlocked, setDashUnlocked, pwInput, setPwInput, pwError, setPwError, resendApiKey, setResendApiKey,
    form, setForm, formErrors, setFormErrors, editingId, setEditingId,
    checkinModal, setCheckinModal,
    fileRef, vendorPhotoRef,
    selectedEvent, activeEvents, archivedEvents, filteredEvents, isInCart, isReg, isOnWaitlist,
    showToast, addToCart, removeFromCart, updateCartQty,
    joinWaitlist, leaveWaitlist, cancelTicket, checkinAttendee, undoCheckin,
    openAuth, handleLogin, handleSignup, handleLogout, updateProfile,
    reviews, qaItems, interests, following, swRegistered,
    loadReviews, submitReview, deleteReview,
    loadQA, submitQuestion, answerQuestion, deleteQuestion,
    toggleInterest, getInterest, toggleFollow, copyReferralLink, getReferralLink, getReferralCount, copyInviteLink, getInviteLink,
    installPrompt, setInstallPrompt, isInstalled, isOnline,
    openCheckout, validateCheckoutInfo, validatePayment, completeOrder,
    handleSave, startEdit, handleDelete, duplicateEvent,
    handlePhotoAdd, removePhoto, handleVendorPhoto, removeVendorPhoto,
    validateVendor, submitVendorApp, openVendorModal, updateVendorStatus,
    loadEvents,
    // New features
    eventPhotos, loadEventPhotos, uploadEventPhoto, deleteEventPhoto,
    badges, computeBadges, awardBadge, BADGE_DEFS,
    activityFeed, loadActivityFeed, addFeedItem,
    notifPrefs, toggleNotifPref, getNotifPref,
    scheduleEventReminders,
    referralStats,
    customAnswers, setCustomAnswers,
    vibeConfig, saveVibeConfig,
    sortConfig, saveSortConfig,
    categoryConfig, saveCategoryConfig,
    eventTypeConfig, saveEventTypeConfig,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

const useApp = () => { const ctx = useContext(AppContext); if (!ctx) throw new Error("useApp must be inside AppProvider"); return ctx; };

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", bottom: "2rem", right: "2rem", zIndex: 9999, background: toast.type === "warn" ? T.earth : T.green1, color: "#fff", padding: "14px 22px", borderRadius: "12px", fontSize: "0.9rem", fontWeight: 500, boxShadow: "0 10px 40px rgba(0,0,0,0.2)", animation: "slideUp 0.3s ease", maxWidth: "320px" }}>
      {toast.msg}
    </div>
  );
}

// ─── EVENT PHOTO GALLERY ──────────────────────────────────────────────────────
function EventPhotoGallery({ eventId }) {
  const { eventPhotos, loadEventPhotos, uploadEventPhoto, deleteEventPhoto, currentUser, dashUnlocked, events } = useApp();
  const [loaded, setLoaded] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const photos = eventPhotos[eventId] || [];

  useEffect(() => { if (!loaded) { loadEventPhotos(eventId).catch(() => {}); setLoaded(true); } }, [eventId]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await uploadEventPhoto(eventId, file, caption);
    setCaption("");
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const ev = events.find(e => e.id === eventId);
  const isPastEvent = ev ? isExpired(ev) : false;

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.1rem", margin: 0 }}>
          📷 Community Photos {photos.length > 0 && <span style={{ color: T.stoneL, fontWeight: 400, fontSize: "0.9rem" }}>({photos.length})</span>}
        </h3>
        {currentUser && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              placeholder="Optional caption…"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              style={{ padding: "7px 12px", borderRadius: "8px", border: `1px solid ${T.border}`, background: T.cream, fontSize: "0.82rem", fontFamily: "inherit", outline: "none", width: "160px" }}
            />
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: uploading ? "wait" : "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem", opacity: uploading ? 0.7 : 1 }}>
              {uploading ? "Uploading…" : "📤 Add Photo"}
            </button>
          </div>
        )}
      </div>

      {photos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: T.stoneL }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>📷</div>
          <div style={{ fontSize: "0.9rem", color: T.textMid, marginBottom: "4px" }}>No photos yet</div>
          <div style={{ fontSize: "0.8rem" }}>{isPastEvent ? "Be the first to share a memory from this event!" : "Come back after the event to share your photos!"}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" }}>
          {photos.map((photo, i) => (
            <div key={photo.id} style={{ position: "relative", borderRadius: "10px", overflow: "hidden", aspectRatio: "1", cursor: "pointer", background: T.cream, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
              onClick={() => setLightbox(i)}>
              <img src={photo.url} alt={photo.caption || "Event photo"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              {(dashUnlocked || currentUser?.id === photo.uploadedBy) && (
                <button
                  onClick={e => { e.stopPropagation(); deleteEventPhoto(photo.id, eventId); }}
                  style={{ position: "absolute", top: "6px", right: "6px", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: "24px", height: "24px", cursor: "pointer", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              )}
              {photo.caption && (
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,rgba(0,0,0,0.65))", padding: "18px 8px 8px", color: "#fff", fontSize: "0.7rem", lineHeight: 1.3 }}>{photo.caption}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setLightbox(null)}>
          <button onClick={e => { e.stopPropagation(); setLightbox(l => (l > 0 ? l - 1 : photos.length - 1)); }}
            style={{ position: "absolute", left: "1.5rem", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: "50%", width: "44px", height: "44px", cursor: "pointer", fontSize: "1.4rem", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <div style={{ textAlign: "center", maxWidth: "90vw", maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
            <img src={photos[lightbox]?.url} alt="" style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: "10px" }} />
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.82rem", marginTop: "12px" }}>
              {photos[lightbox]?.caption && <div style={{ marginBottom: "4px" }}>{photos[lightbox].caption}</div>}
              <div>By {photos[lightbox]?.uploadedBy} · {photos[lightbox]?.uploadedAt ? new Date(photos[lightbox].uploadedAt).toLocaleDateString() : ""}</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem", marginTop: "4px" }}>{lightbox + 1} / {photos.length} &mdash; click outside to close</div>
            </div>
          </div>
          <button onClick={e => { e.stopPropagation(); setLightbox(l => (l < photos.length - 1 ? l + 1 : 0)); }}
            style={{ position: "absolute", right: "1.5rem", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: "50%", width: "44px", height: "44px", cursor: "pointer", fontSize: "1.4rem", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        </div>
      )}
    </div>
  );
}

// ─── NOTIFICATION PREFS TOGGLE ────────────────────────────────────────────────
function NotifToggle({ eventId }) {
  const { toggleNotifPref, getNotifPref, currentUser, openAuth } = useApp();
  const reminderOn = getNotifPref(eventId, "reminder");
  const waitlistOn = getNotifPref(eventId, "waitlist");
  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      <button
        onClick={() => currentUser ? toggleNotifPref(eventId, "reminder") : openAuth("login")}
        style={{ padding: "7px 13px", borderRadius: "8px", border: `1px solid ${reminderOn ? T.green1 : T.border}`, background: reminderOn ? T.green5 : "transparent", color: reminderOn ? T.green1 : T.textSoft, fontFamily: "inherit", fontWeight: reminderOn ? 700 : 400, fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
        {reminderOn ? "🔔" : "🔕"} Reminders {reminderOn ? "On" : "Off"}
      </button>
      <button
        onClick={() => currentUser ? toggleNotifPref(eventId, "waitlist") : openAuth("login")}
        style={{ padding: "7px 13px", borderRadius: "8px", border: `1px solid ${waitlistOn ? T.green1 : T.border}`, background: waitlistOn ? T.green5 : "transparent", color: waitlistOn ? T.green1 : T.textSoft, fontFamily: "inherit", fontWeight: waitlistOn ? 700 : 400, fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
        ⏳ Waitlist Alert {waitlistOn ? "On" : "Off"}
      </button>
    </div>
  );
}

// ─── BADGES DISPLAY ───────────────────────────────────────────────────────────
function BadgesPanel({ tickets, referralStats: rStats }) {
  const { computeBadges, BADGE_DEFS } = useApp();
  const earned = computeBadges(tickets, rStats);
  const earnedIds = new Set(earned.map(b => b.id));
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "1.5rem" }}>
      <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.1rem", margin: "0 0 16px" }}>
        🏅 Badges <span style={{ color: T.stoneL, fontWeight: 400, fontSize: "0.88rem" }}>({earned.length}/{BADGE_DEFS.length} earned)</span>
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px" }}>
        {BADGE_DEFS.map(badge => {
          const isEarned = earnedIds.has(badge.id);
          return (
            <div key={badge.id} style={{ background: isEarned ? T.green5 : T.cream, border: `1px solid ${isEarned ? T.green3 : T.border}`, borderRadius: "12px", padding: "14px 12px", textAlign: "center", opacity: isEarned ? 1 : 0.45, transition: "all 0.2s" }}>
              <div style={{ fontSize: "1.8rem", marginBottom: "6px", filter: isEarned ? "none" : "grayscale(1)" }}>{badge.emoji}</div>
              <div style={{ color: isEarned ? T.green1 : T.textSoft, fontWeight: 700, fontSize: "0.78rem", marginBottom: "3px" }}>{badge.name}</div>
              <div style={{ color: T.stoneL, fontSize: "0.7rem", lineHeight: 1.4 }}>{badge.desc}</div>
              {isEarned && <div style={{ marginTop: "6px", color: T.green2, fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase" }}>✓ Earned</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ACTIVITY FEED PANEL ──────────────────────────────────────────────────────
function ActivityFeedPanel() {
  const { activityFeed, loadActivityFeed, events } = useApp();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded && events.length > 0) { loadActivityFeed().catch(() => {}); setLoaded(true); }
  }, [events.length]);

  if (activityFeed.length === 0) return null;

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "20px", marginBottom: "1.5rem" }}>
      <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1rem", margin: "0 0 14px", display: "flex", alignItems: "center", gap: "8px" }}>
        🌊 Community Activity
        <span style={{ background: T.green5, color: T.green1, borderRadius: "100px", padding: "1px 8px", fontSize: "0.72rem", fontWeight: 700 }}>Live</span>
      </h3>
      <div style={{ display: "grid", gap: "8px", maxHeight: "260px", overflowY: "auto" }} className="hide-scrollbar">
        {activityFeed.map(item => (
          <div key={item.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <div style={{ fontSize: "1rem", flexShrink: 0, marginTop: "1px" }}>{item.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: T.textMid, fontSize: "0.8rem", lineHeight: 1.4 }}>{item.text}</div>
              <div style={{ color: T.stoneL, fontSize: "0.7rem", marginTop: "2px" }}>
                {item.ts ? new Date(item.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Recently"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── REFERRAL STATS PANEL ─────────────────────────────────────────────────────
function ReferralPanel({ eventId }) {
  const { copyReferralLink, getReferralCount, currentUser, openAuth } = useApp();
  const count = getReferralCount(eventId);
  return (
    <div style={{ background: `${T.green1}0D`, border: `1px solid ${T.green3}`, borderRadius: "12px", padding: "16px 18px", marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <div style={{ color: T.green1, fontWeight: 700, fontSize: "0.88rem", marginBottom: "2px" }}>🤝 Bring a Friend</div>
          <div style={{ color: T.textSoft, fontSize: "0.78rem" }}>
            Share your personal referral link.
            {count > 0 && <span style={{ color: T.green1, fontWeight: 700 }}> {count} link share{count !== 1 ? "s" : ""} so far!</span>}
          </div>
        </div>
        <button
          onClick={() => currentUser ? copyReferralLink(eventId) : openAuth("login")}
          style={{ background: T.green1, color: "#fff", border: "none", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.82rem", whiteSpace: "nowrap" }}>
          🔗 Copy My Link
        </button>
      </div>
    </div>
  );
}

// ─── STAR RATING ──────────────────────────────────────────────────────────────
function StarRating({ value, onChange, size = 22, readonly = false }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: "3px" }}>
      {[1,2,3,4,5].map(star => (
        <span key={star}
          onClick={() => !readonly && onChange && onChange(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          style={{ fontSize: size, cursor: readonly ? "default" : "pointer", color: star <= (hover || value) ? "#F59E0B" : "#D1D5DB", lineHeight: 1, transition: "color 0.1s" }}>★</span>
      ))}
    </div>
  );
}

// ─── PWA INSTALL BANNER ───────────────────────────────────────────────────────
function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("nh_pwa_dismissed") === "1");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  if (!deferredPrompt || dismissed || installed) return null;
  return (
    <div style={{ position: "fixed", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)", zIndex: 500, background: T.bgDeep, border: `1px solid ${T.green3}40`, borderRadius: "16px", padding: "14px 20px", display: "flex", alignItems: "center", gap: "14px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", maxWidth: "min(420px, 90vw)", width: "100%", animation: "slideUp 0.3s ease" }}>
      <div style={{ fontSize: "2rem", flexShrink: 0 }}>🌿</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.88rem", marginBottom: "2px" }}>Install New Harmony Life</div>
        <div style={{ color: T.green4, fontSize: "0.76rem" }}>Add to your home screen for quick access & offline browsing</div>
      </div>
      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
        <button onClick={install} style={{ background: T.green1, color: "#fff", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.8rem", whiteSpace: "nowrap" }}>Install</button>
        <button onClick={() => { setDismissed(true); localStorage.setItem("nh_pwa_dismissed", "1"); }} style={{ background: "rgba(255,255,255,0.1)", color: T.stoneL, border: "none", borderRadius: "8px", padding: "8px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: "0.8rem" }}>✕</button>
      </div>
    </div>
  );
}

// ─── ADD TO CALENDAR DROPDOWN ─────────────────────────────────────────────────
function AddToCalendar({ ev }) {
  const [open, setOpen] = useState(false);
  const links = makeCalLinks(ev);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "6px" }}>
        📅 Add to Calendar {open ? "▲" : "▼"}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", overflow: "hidden", zIndex: 50, minWidth: "180px" }}>
          {[["🗓️ Google Calendar", links.google, "_blank"], ["🍎 Apple Calendar", links.apple, "_blank"], ["📧 Outlook", links.outlook, "_blank"]].map(([label, href, target]) => (
            <a key={label} href={href} target={target} rel="noopener noreferrer" onClick={() => setOpen(false)}
              style={{ display: "block", padding: "10px 16px", color: T.text, textDecoration: "none", fontSize: "0.85rem", fontWeight: 500, borderBottom: `1px solid ${T.border}` }}
              onMouseEnter={e => e.currentTarget.style.background = T.cream}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CART SIDEBAR ─────────────────────────────────────────────────────────────
function CartSidebar() {
  const { cart, cartOpen, setCartOpen, cartTotal, removeFromCart, updateCartQty, openCheckout, setView } = useApp();
  if (!cartOpen) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400 }}>
      <div onClick={() => setCartOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "min(420px,100vw)", background: T.bgCard, boxShadow: "-8px 0 40px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", animation: "slideUp 0.25s ease" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.3rem", margin: 0 }}>🛒 Your Cart</h2>
          <button onClick={() => setCartOpen(false)} style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "50%", width: "34px", height: "34px", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {cart.length === 0
            ? <div style={{ textAlign: "center", padding: "3rem 1rem", color: T.stoneL }}>
                <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🛒</div>
                <div style={{ color: T.textMid, fontWeight: 600, fontSize: "1rem", marginBottom: "6px" }}>Your cart is empty</div>
                <div style={{ fontSize: "0.82rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>Browse upcoming events and add tickets to get started.</div>
                <button onClick={() => setCartOpen(false)} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px 22px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.85rem" }}>Browse Events 🌿</button>
              </div>
            : <div style={{ display: "grid", gap: "12px" }}>
              {cart.map((item, idx) => (
                <div key={idx} style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.text, fontWeight: 700, fontSize: "0.9rem", lineHeight: 1.3 }}>{item.event.title}</div>
                      <div style={{ color: T.green1, fontSize: "0.78rem", fontWeight: 600, marginTop: "2px" }}>{item.tier.name}</div>
                      <div style={{ color: T.stoneL, fontSize: "0.78rem" }}>{item.tier.price === 0 ? "Free" : `$${item.tier.price} / ticket`}</div>
                    </div>
                    <button onClick={() => removeFromCart(item.event.id, item.tier.id)} style={{ background: "none", border: "none", color: T.stoneL, cursor: "pointer", fontSize: "1rem", padding: "0 2px" }}>✕</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button onClick={() => updateCartQty(item.event.id, item.tier.id, item.qty - 1)} style={{ width: "28px", height: "28px", borderRadius: "50%", background: T.bgCard, border: `1px solid ${T.border}`, cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                      <span style={{ color: T.text, fontWeight: 700, minWidth: "20px", textAlign: "center" }}>{item.qty}</span>
                      <button onClick={() => updateCartQty(item.event.id, item.tier.id, item.qty + 1)} style={{ width: "28px", height: "28px", borderRadius: "50%", background: T.bgCard, border: `1px solid ${T.border}`, cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                    </div>
                    <div style={{ color: T.text, fontWeight: 700 }}>{item.tier.price === 0 ? "Free" : `$${(item.tier.price * item.qty).toFixed(2)}`}</div>
                  </div>
                </div>
              ))}
            </div>
          }
        </div>
        {cart.length > 0 && (
          <div style={{ padding: "16px 24px", borderTop: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px" }}>
              <span style={{ color: T.textSoft, fontWeight: 600 }}>Total</span>
              <span style={{ color: T.text, fontWeight: 700, fontSize: "1.2rem", fontFamily: "'Lora',serif" }}>{cartTotal === 0 ? "Free" : `$${cartTotal.toFixed(2)}`}</span>
            </div>
            <button onClick={openCheckout} style={{ width: "100%", background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "12px", padding: "14px", fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {cartTotal === 0 ? "Complete Registration 🌿" : "Proceed to Checkout →"}
            </button>
            <button onClick={() => { setCartOpen(false); setView("discover"); }} style={{ width: "100%", marginTop: "10px", background: "transparent", color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "11px", fontSize: "0.9rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              ← Continue Shopping
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TERMS & PRIVACY MODAL ────────────────────────────────────────────────────
function TermsModal({ onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: T.bgCard, borderRadius: "20px", width: "100%", maxWidth: "600px", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(0,0,0,0.35)", position: "relative" }}>
        {/* Header */}
        <div style={{ padding: "24px 28px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.3rem", margin: "0 0 2px" }}>Terms of Service & Privacy Policy</h2>
            <div style={{ color: T.stoneL, fontSize: "0.75rem" }}>New Harmony Life · Last updated {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
          </div>
          <button onClick={onClose} style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "50%", width: "34px", height: "34px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0 }}>✕</button>
        </div>
        {/* Scrollable body */}
        <div style={{ overflowY: "auto", padding: "24px 28px", flex: 1 }}>
          {[
            {
              heading: "1. Acceptance of Terms",
              body: 'By creating an account or using New Harmony Life Events (the "Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.',
            },
            {
              heading: "2. Who We Are",
              body: "New Harmony Life is a community events platform serving the Loess Hills region of Iowa. We connect local organizers with attendees for festivals, workshops, markets, wellness events, and more. Questions? Email us at hello@newharmonylife.com.",
            },
            {
              heading: "3. Your Account",
              body: "You are responsible for keeping your login credentials secure and for all activity under your account. You must be 13 years of age or older to create an account. Please provide accurate information when registering &mdash; we use it to send you ticket confirmations and event updates.",
            },
            {
              heading: "4. Tickets & Purchases",
              body: "All ticket sales are final unless the event's published refund policy states otherwise. Refund eligibility is set by the individual event organizer and displayed on each event page. New Harmony Life is not responsible for event cancellations by third-party organizers, but we will communicate changes to registered attendees as promptly as possible.",
            },
            {
              heading: "5. Vendor Applications",
              body: "Vendor applications submitted through the platform are reviewed by event organizers. Submitting an application does not guarantee acceptance. Vendors are responsible for obtaining any required licenses, permits, food-handling certifications, and for collecting applicable sales tax.",
            },
            {
              heading: "6. Acceptable Use",
              body: "You agree not to misuse the Service &mdash; including attempting to circumvent capacity limits, submitting false registrations, harassing other community members, or using the platform for unlawful purposes. We reserve the right to suspend accounts that violate these terms.",
            },
            {
              heading: "7. Privacy & Your Data",
              body: "We collect your name, email, phone number, and city/state when you register. This information is used solely to manage your account, process ticket purchases, and (with your consent) send you updates about upcoming New Harmony Life events. We do not sell your personal data to third parties. You may withdraw marketing consent at any time in your account settings.",
            },
            {
              heading: "8. Email Communications",
              body: "By opting in to our mailing list, you consent to receive occasional emails about upcoming events, community news, and seasonal updates from New Harmony Life. You can unsubscribe at any time by updating your notification preferences in My Account, or by clicking the unsubscribe link in any email we send.",
            },
            {
              heading: "9. Photos & Content",
              body: "By uploading photos to an event gallery, you grant New Harmony Life a non-exclusive license to display and share that content in connection with the event and our community platforms. You retain ownership of your photos. By registering as a vendor, you grant permission for your business name, logo, and photos to be used in event promotions.",
            },
            {
              heading: "10. Limitation of Liability",
              body: "New Harmony Life and the Loess Hills Elysian Prairie Restoration and Conservation Project are not liable for personal injury, loss, or damage sustained at events listed on this platform. Attendees and vendors participate at their own risk. Our total liability for any claim arising from use of the Service is limited to the amount you paid for the relevant ticket or registration.",
            },
            {
              heading: "11. Changes to These Terms",
              body: "We may update these Terms from time to time. When we do, we'll update the date at the top of this page. Continued use of the Service after changes are posted constitutes your acceptance of the revised Terms.",
            },
            {
              heading: "12. Contact Us",
              body: "If you have questions about these Terms or our privacy practices, please reach out at hello@newharmonylife.com or write to us at New Harmony Life, Castana, IA.",
            },
          ].map(({ heading, body }) => (
            <div key={heading} style={{ marginBottom: "20px" }}>
              <div style={{ color: T.green1, fontWeight: 700, fontSize: "0.88rem", marginBottom: "5px" }}>{heading}</div>
              <p style={{ color: T.textSoft, fontSize: "0.85rem", lineHeight: 1.75, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
        {/* Footer */}
        <div style={{ padding: "16px 28px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: "100%", background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px", fontFamily: "inherit", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer" }}>
            Close ✓
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AUTH MODAL ───────────────────────────────────────────────────────────────
function AuthModal() {
  const { authModal, setAuthModal, authMode, setAuthMode, authForm, setAuthForm, authErrors, setAuthErrors, handleLogin, handleSignup } = useApp();
  const [showTerms, setShowTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  if (!authModal) return null;
  const isSignup = authMode === "signup";

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (isSignup) await handleSignup();
      else await handleLogin();
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: T.bgCard, borderRadius: "20px", padding: "2.5rem", width: "100%", maxWidth: "440px", position: "relative", boxShadow: "0 24px 70px rgba(0,0,0,0.3)" }}>
        <button onClick={() => setAuthModal(null)} style={{ position: "absolute", top: "1rem", right: "1rem", background: T.green5, border: `1px solid ${T.border}`, borderRadius: "50%", width: "32px", height: "32px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem" }}>✕</button>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ width: 52, height: 52, borderRadius: "14px", background: `linear-gradient(135deg,${T.green2},${T.green3})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", margin: "0 auto 12px" }}>🌿</div>
          <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.5rem", margin: "0 0 4px" }}>{isSignup ? "Create Account" : "Welcome Back"}</h2>
          <p style={{ color: T.textSoft, fontSize: "0.875rem", margin: 0 }}>{isSignup ? "Join the New Harmony community" : "Sign in to your account"}</p>
        </div>
        <div style={{ display: "flex", background: T.cream, borderRadius: "10px", padding: "3px", marginBottom: "1.5rem", border: `1px solid ${T.border}` }}>
          {[["login", "Sign In"], ["signup", "Create Account"]].map(([m, l]) => (
            <button key={m} onClick={() => { setAuthMode(m); setAuthErrors({}); }} style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "none", background: authMode === m ? T.bgCard : "transparent", color: authMode === m ? T.green1 : T.textSoft, cursor: "pointer", fontFamily: "inherit", fontWeight: authMode === m ? 700 : 400, fontSize: "0.875rem", transition: "all 0.15s", boxShadow: authMode === m ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "grid", gap: "12px" }}>
          {isSignup && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <Field label="First Name *" error={authErrors.firstName}><input value={authForm.firstName} onChange={e => setAuthForm({ ...authForm, firstName: e.target.value })} style={inp(authErrors.firstName)} placeholder="Jane" /></Field>
                <Field label="Last Name *" error={authErrors.lastName}><input value={authForm.lastName} onChange={e => setAuthForm({ ...authForm, lastName: e.target.value })} style={inp(authErrors.lastName)} placeholder="Doe" /></Field>
              </div>
              <Field label="Phone *" error={authErrors.phone}><input value={authForm.phone} onChange={e => setAuthForm({ ...authForm, phone: fmtPhone(e.target.value) })} style={inp(authErrors.phone)} placeholder="555-000-0000" maxLength={12} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
                <Field label="City"><input value={authForm.city} onChange={e => setAuthForm({ ...authForm, city: e.target.value })} style={inp()} placeholder="Moville" /></Field>
                <Field label="State"><input value={authForm.state} onChange={e => setAuthForm({ ...authForm, state: e.target.value })} style={inp()} placeholder="IA" /></Field>
              </div>
            </>
          )}
          <Field label="Email Address *" error={authErrors.email}><input type="email" value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} style={inp(authErrors.email)} placeholder="you@example.com" /></Field>
          <Field label="Password *" error={authErrors.password}><PasswordInput value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} style={inp(authErrors.password)} placeholder={isSignup ? "6+ characters" : "Your password"} onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }} /></Field>
          {isSignup && <Field label="Confirm Password *" error={authErrors.confirm}><PasswordInput value={authForm.confirm} onChange={e => setAuthForm({ ...authForm, confirm: e.target.value })} style={inp(authErrors.confirm)} placeholder="Re-enter password" onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }} /></Field>}

          {/* Email opt-in toggle */}
          {isSignup && (
            <div onClick={() => setAuthForm({ ...authForm, emailOptIn: !authForm.emailOptIn })}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: authForm.emailOptIn ? `${T.green1}08` : T.cream, border: `1px solid ${authForm.emailOptIn ? T.green3 : T.border}`, borderRadius: "10px", padding: "12px 14px", cursor: "pointer", userSelect: "none", transition: "all 0.15s" }}>
              <div>
                <div style={{ color: T.textMid, fontWeight: 600, fontSize: "0.85rem" }}>📬 Notify me about upcoming events</div>
                <div style={{ color: T.stoneL, fontSize: "0.75rem", marginTop: "1px" }}>Occasional emails about New Harmony Life events &amp; community news</div>
              </div>
              <div style={{ width: "44px", height: "24px", borderRadius: "12px", background: authForm.emailOptIn ? T.green1 : "#D1D5DB", flexShrink: 0, marginLeft: "12px", position: "relative", transition: "background 0.2s" }}>
                <div style={{ position: "absolute", top: "3px", left: authForm.emailOptIn ? "23px" : "3px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
          )}

          {/* Terms agreement checkbox */}
          {isSignup && (
            <div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", background: authErrors.agreedToTerms ? "#FEF2F2" : T.cream, border: `1px solid ${authErrors.agreedToTerms ? "#FECACA" : T.border}`, borderRadius: "10px", cursor: "pointer" }}
                onClick={() => setAuthForm({ ...authForm, agreedToTerms: !authForm.agreedToTerms })}>
                <div style={{ width: "18px", height: "18px", borderRadius: "4px", border: `2px solid ${authForm.agreedToTerms ? T.green1 : T.stoneL}`, background: authForm.agreedToTerms ? T.green1 : "#fff", flexShrink: 0, marginTop: "1px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                  {authForm.agreedToTerms && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4L4 7.5L10 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div style={{ fontSize: "0.8rem", color: T.textMid, lineHeight: 1.5 }}>
                  I agree to the{" "}
                  <button type="button" onClick={e => { e.stopPropagation(); setShowTerms(true); }}
                    style={{ background: "none", border: "none", color: T.green1, cursor: "pointer", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 700, padding: 0, textDecoration: "underline" }}>
                    Terms of Service &amp; Privacy Policy
                  </button>
                </div>
              </div>
              {authErrors.agreedToTerms && <div style={{ color: T.warn, fontSize: "0.75rem", marginTop: "4px" }}>⚠ {authErrors.agreedToTerms}</div>}
            </div>
          )}
        </div>
        {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
        <button onClick={handleSubmit} disabled={submitting} style={{ width: "100%", marginTop: "1.25rem", background: submitting ? T.green2 : `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "12px", padding: "14px", fontSize: "1rem", fontWeight: 700, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit", boxShadow: `0 4px 18px ${T.green1}44`, opacity: submitting ? 0.8 : 1, transition: "opacity 0.15s" }}>
          {submitting ? (isSignup ? "Creating Account…" : "Signing In…") : (isSignup ? "Create My Account 🌿" : "Sign In →")}
        </button>
        {!isSignup && (
          <>
            <div style={{ textAlign: "center", marginTop: "1rem", color: T.textSoft, fontSize: "0.8rem" }}>
              <span>New here? </span>
              <button onClick={() => { setAuthMode("signup"); setAuthErrors({}); }} style={{ background: "none", border: "none", color: T.green1, cursor: "pointer", fontWeight: 600, fontFamily: "inherit", fontSize: "0.8rem" }}>Create a free account</button>
            </div>
            <div style={{ marginTop: "1rem", background: T.cream, borderRadius: "8px", padding: "10px 12px", color: T.stoneL, fontSize: "0.75rem", textAlign: "center" }}>
              Demo: <strong>jane@example.com</strong> / <strong>password123</strong>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── VENDOR MODAL ─────────────────────────────────────────────────────────────
function VendorModal() {
  const { vendorModal, setVendorModal, vendorForm, setVendorForm, vendorErrors, vendorSubmitted, vendorPhotoRef, handleVendorPhoto, removeVendorPhoto, submitVendorApp, events, currentUser } = useApp();
  if (!vendorModal) return null;
  const ev = events.find(e => e.id === vendorModal);
  const allAgreed = DISCLAIMERS.every(d => vendorForm[d.key]);
  // Detect if form was pre-filled (any non-empty identifying field that wasn't blank from EMPTY_VENDOR_APP)
  const wasPrefilled = !!(vendorForm.businessName || (vendorForm.email && vendorForm.email !== (currentUser?.email || "")));
  const isPrefilled = !!(vendorForm.businessName && vendorForm.email);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "2rem 1rem" }}>
      <div style={{ background: T.bgCard, borderRadius: "20px", width: "100%", maxWidth: "740px", position: "relative", boxShadow: "0 24px 70px rgba(0,0,0,0.3)", margin: "auto", overflow: "hidden" }}>
        <button onClick={() => setVendorModal(null)} style={{ position: "absolute", top: "1rem", right: "1rem", zIndex: 10, background: "rgba(255,255,255,0.9)", border: `1px solid ${T.border}`, borderRadius: "50%", width: "34px", height: "34px", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}>✕</button>
        {vendorSubmitted ? (
          <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🌿</div>
            <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.75rem", margin: "0 0 0.75rem" }}>Application Received!</h2>
            <p style={{ color: T.textSoft, lineHeight: 1.75, marginBottom: "2rem", maxWidth: "420px", margin: "0 auto 2rem" }}>Thank you for your interest in vending at <strong>{ev?.title}</strong>. We'll review your application and reach out soon.</p>
            <button onClick={() => setVendorModal(null)} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "12px", padding: "13px 32px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "1rem" }}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ position: "relative", minHeight: "160px", background: `linear-gradient(135deg,${T.earth}CC,${T.bgDeep})`, display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
              {(vendorForm.photos && vendorForm.photos.length > 0) && <img src={vendorForm.photos[0]} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35 }} />}
              <div style={{ position: "relative", zIndex: 1, padding: "1.5rem 2rem", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                  <div>
                    <div style={{ display: "inline-block", background: T.earth, color: "#fff", borderRadius: "6px", padding: "3px 12px", fontSize: "0.72rem", fontWeight: 700, marginBottom: "8px" }}>🛖 CALL FOR VENDORS</div>
                    <h2 style={{ color: "#fff", fontFamily: "'Lora',serif", fontSize: "1.5rem", margin: "0 0 3px", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>Vendor Application</h2>
                    <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.85rem", margin: 0 }}>{ev?.title} · {dateRange(ev || {})}</p>
                  </div>
                </div>
              </div>
            </div>
            {(ev?.vendorInfo || ev?.vendorDeadline) && (
              <div style={{ background: T.green5, borderBottom: `1px solid ${T.green4}`, padding: "12px 2rem", display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
                {ev.vendorInfo && <span style={{ color: T.textMid, fontSize: "0.83rem", flex: 1, lineHeight: 1.5 }}>{ev.vendorInfo}</span>}
                {ev.vendorDeadline && <span style={{ color: T.earth, fontSize: "0.8rem", fontWeight: 700, whiteSpace: "nowrap" }}>📅 Deadline: {fmt(ev.vendorDeadline)}</span>}
              </div>
            )}
            {ev?.profitModel && (
              <div style={{ background: ev.profitModel === "sharing" ? `${T.gold}15` : `${T.green1}0D`, borderBottom: `1px solid ${ev.profitModel === "sharing" ? T.gold + "44" : T.green3}`, padding: "12px 2rem", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "1.1rem" }}>{ev.profitModel === "sharing" ? "💰" : "✅"}</span>
                <div>
                  <div style={{ color: ev.profitModel === "sharing" ? "#7A5C00" : T.green1, fontWeight: 700, fontSize: "0.82rem" }}>{ev.profitModel === "sharing" ? `Profit Sharing: ${ev.hostPct}% to host · ${100 - ev.hostPct}% to vendor` : "Vendor Keeps All Profits"}</div>
                  <div style={{ color: T.textSoft, fontSize: "0.77rem", marginTop: "2px" }}>{ev.profitModel === "sharing" ? "By applying, you agree to remit the host percentage of gross sales at end of each event day." : "You retain 100% of all sales made at this event."}</div>
                </div>
              </div>
            )}
            <div style={{ padding: "1.75rem 2rem", display: "grid", gap: "18px" }}>
              {isPrefilled && (
                <div style={{ background: `linear-gradient(135deg,${T.green5},#EFF9F4)`, border: `1px solid ${T.green3}`, borderRadius: "12px", padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>✨</span>
                  <div>
                    <div style={{ color: T.green1, fontWeight: 700, fontSize: "0.86rem", marginBottom: "2px" }}>We filled this in for you!</div>
                    <div style={{ color: T.textSoft, fontSize: "0.78rem", lineHeight: 1.55 }}>Your vendor profile was found on the community directory. Review your details, update anything that has changed, then accept the agreements to submit.</div>
                  </div>
                </div>
              )}
              <div style={{ background: T.cream, borderRadius: "14px", padding: "18px", border: `1px solid ${T.border}` }}>
                <div style={{ color: T.green1, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>1 · Business Information</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <Field label="Business / Farm Name *" error={vendorErrors.businessName}><input value={vendorForm.businessName} onChange={e => setVendorForm({ ...vendorForm, businessName: e.target.value })} style={inp(vendorErrors.businessName)} placeholder="e.g. Sunrise Acres" /></Field>
                  <Field label="Contact Name *" error={vendorErrors.contactName}><input value={vendorForm.contactName} onChange={e => setVendorForm({ ...vendorForm, contactName: e.target.value })} style={inp(vendorErrors.contactName)} placeholder="First & Last name" /></Field>
                  <Field label="Email *" error={vendorErrors.email}><input type="email" value={vendorForm.email} onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })} style={inp(vendorErrors.email)} placeholder="you@example.com" /></Field>
                  <Field label="Phone *" error={vendorErrors.phone}><input value={vendorForm.phone} onChange={e => setVendorForm({ ...vendorForm, phone: fmtPhone(e.target.value) })} style={inp(vendorErrors.phone)} placeholder="555-000-0000" maxLength={12} /></Field>
                  <Field label="City *" error={vendorErrors.city}><input value={vendorForm.city} onChange={e => setVendorForm({ ...vendorForm, city: e.target.value })} style={inp(vendorErrors.city)} placeholder="e.g. Moville" /></Field>
                  <Field label="State *" error={vendorErrors.state}><input value={vendorForm.state} onChange={e => setVendorForm({ ...vendorForm, state: e.target.value })} style={inp(vendorErrors.state)} placeholder="e.g. IA" /></Field>
                  <Field label="Website (optional)"><input value={vendorForm.website} onChange={e => setVendorForm({ ...vendorForm, website: e.target.value })} style={inp()} placeholder="www.yoursite.com" /></Field>
                  <Field label="Instagram (optional)"><input value={vendorForm.instagram} onChange={e => setVendorForm({ ...vendorForm, instagram: e.target.value })} style={inp()} placeholder="@yourhandle" /></Field>
                </div>
              </div>
              <div style={{ background: T.cream, borderRadius: "14px", padding: "18px", border: `1px solid ${T.border}` }}>
                <div style={{ color: T.green1, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>2 · Products & Space</div>
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <Field label="Vendor / Product Type"><select value={vendorForm.vendorType} onChange={e => setVendorForm({ ...vendorForm, vendorType: e.target.value })} style={inp()}>{VENDOR_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
                    <Field label="Years in Business"><input type="number" min="0" value={vendorForm.yearsInBusiness} onChange={e => setVendorForm({ ...vendorForm, yearsInBusiness: e.target.value })} style={inp()} placeholder="e.g. 5" /></Field>
                  </div>
                  {vendorForm.vendorType === "Other" && <Field label="Describe Your Category"><input value={vendorForm.otherType} onChange={e => setVendorForm({ ...vendorForm, otherType: e.target.value })} style={inp()} placeholder="e.g. Mushroom Cultivation" /></Field>}
                  <Field label="Describe Your Products *" error={vendorErrors.description}><textarea value={vendorForm.description} onChange={e => setVendorForm({ ...vendorForm, description: e.target.value })} rows={3} style={{ ...inp(vendorErrors.description), resize: "vertical", fontFamily: "inherit" }} placeholder="Tell us about your products…" /></Field>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <Field label="Booth / Space Size Needed"><select value={vendorForm.spaceNeeded} onChange={e => setVendorForm({ ...vendorForm, spaceNeeded: e.target.value })} style={inp()}>{BOOTH_SIZES.map(s => <option key={s}>{s}</option>)}</select></Field>
                    <Field label="Booth Neighbor Preference (optional)"><input value={vendorForm.boothNeighborPref} onChange={e => setVendorForm({ ...vendorForm, boothNeighborPref: e.target.value })} style={inp()} placeholder="e.g. Next to Prairie Honey Co." /></Field>
                  </div>
                </div>
              </div>
              {/* ── Section 3: Photos of Goods & Services ── */}
              <div style={{ background: T.cream, borderRadius: "14px", padding: "18px", border: `1px solid ${T.border}` }}>
                <div style={{ color: T.green1, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>3 · Photos of Your Goods & Services</div>
                <div style={{ color: T.stoneL, fontSize: "0.78rem", marginBottom: "14px", lineHeight: 1.5 }}>Add up to 3 photos showcasing your products. These help organizers and visitors get a feel for what you offer.</div>
                <input ref={vendorPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleVendorPhoto(e.target.files)} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                  {[0, 1, 2].map(idx => {
                    const photo = (vendorForm.photos || [])[idx];
                    return (
                      <div key={idx} style={{ aspectRatio: "1", borderRadius: "12px", overflow: "hidden", position: "relative", border: `2px dashed ${photo ? T.green3 : T.border}`, background: photo ? "transparent" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", cursor: photo ? "default" : "pointer", transition: "border-color 0.15s" }}
                        onClick={() => { if (!photo && (vendorForm.photos || []).length < 3) vendorPhotoRef.current?.click(); }}
                        onMouseEnter={e => { if (!photo) e.currentTarget.style.borderColor = T.green2; }}
                        onMouseLeave={e => { if (!photo) e.currentTarget.style.borderColor = T.border; }}>
                        {photo ? (
                          <>
                            <img src={photo} alt={`Product photo ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            <button
                              onClick={e => { e.stopPropagation(); removeVendorPhoto(idx); }}
                              style={{ position: "absolute", top: "6px", right: "6px", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: "26px", height: "26px", cursor: "pointer", fontSize: "0.8rem", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>✕</button>
                            <div style={{ position: "absolute", bottom: "6px", left: "6px", background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: "0.65rem", fontWeight: 700, borderRadius: "4px", padding: "2px 6px" }}>Photo {idx + 1}</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: "1.6rem", marginBottom: "6px", opacity: 0.4 }}>📷</div>
                            <div style={{ color: T.stoneL, fontSize: "0.72rem", fontWeight: 600, textAlign: "center", lineHeight: 1.4 }}>
                              {(vendorForm.photos || []).length > idx ? "Add photo" : idx === 0 ? "Add photo" : `Photo ${idx + 1}`}
                            </div>
                            {(vendorForm.photos || []).length === idx && (
                              <div style={{ color: T.green2, fontSize: "0.68rem", marginTop: "3px" }}>Click to upload</div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(vendorForm.photos || []).length > 0 && (
                  <div style={{ marginTop: "10px", color: T.stoneL, fontSize: "0.75rem", textAlign: "center" }}>
                    {(vendorForm.photos || []).length}/3 photo{(vendorForm.photos || []).length !== 1 ? "s" : ""} added
                    {(vendorForm.photos || []).length < 3 && " · Click an empty slot to add more"}
                  </div>
                )}
              </div>
              {/* ── Section 4: Setup Requirements ── */}
              <div style={{ background: T.cream, borderRadius: "14px", padding: "18px", border: `1px solid ${T.border}` }}>
                <div style={{ color: T.green1, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>4 · Setup Requirements</div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {[["hasPermit", "I hold a valid food handler / vendor permit (if applicable)"], ["electricNeeded", "I require electrical access at my booth"], ["tentOwned", "I will bring my own canopy / tent"]].map(([key, label]) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "10px 14px", background: vendorForm[key] ? T.green5 : "#fff", border: `1px solid ${vendorForm[key] ? T.green3 : T.border}`, borderRadius: "10px" }}>
                      <input type="checkbox" checked={vendorForm[key]} onChange={e => setVendorForm({ ...vendorForm, [key]: e.target.checked })} style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: T.green1, flexShrink: 0 }} />
                      <span style={{ color: T.textMid, fontSize: "0.875rem" }}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Field label="Additional Notes (optional)"><textarea value={vendorForm.comments} onChange={e => setVendorForm({ ...vendorForm, comments: e.target.value })} rows={2} style={{ ...inp(), resize: "vertical", fontFamily: "inherit" }} placeholder="Anything else we should know?" /></Field>

              {/* Community Directory opt-in */}
              <div style={{ background: `linear-gradient(135deg,${T.green5},${T.bgCard})`, border: `1px solid ${T.green3}`, borderRadius: "14px", padding: "18px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                      <span style={{ fontSize: "1.2rem" }}>🌐</span>
                      <span style={{ color: T.text, fontWeight: 700, fontSize: "0.95rem", fontFamily: "'Lora',serif" }}>Join the Vendor Community Page</span>
                    </div>
                    <p style={{ color: T.textSoft, fontSize: "0.82rem", margin: 0, lineHeight: 1.6 }}>
                      Get listed on the New Harmony Life public vendor directory — visible to all site visitors. Your business name, photo, product description, city, website, and Instagram will be shown on the Vendors page.
                    </p>
                    {vendorForm.communityOptIn && (
                      <div style={{ marginTop: "10px", background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "8px 12px", fontSize: "0.78rem", color: T.green1, fontWeight: 600 }}>
                        ✅ You'll appear on the Vendors community page once your application is approved!
                      </div>
                    )}
                  </div>
                  <div onClick={() => setVendorForm(f => ({ ...f, communityOptIn: !f.communityOptIn }))}
                    style={{ width: "52px", height: "28px", borderRadius: "14px", background: vendorForm.communityOptIn ? T.green1 : "#D1D5DB", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0, marginTop: "2px" }}>
                    <div style={{ position: "absolute", top: "4px", left: vendorForm.communityOptIn ? "28px" : "4px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }} />
                  </div>
                </div>
              </div>
              <div style={{ background: "#FFF9F0", borderRadius: "14px", padding: "18px", border: `1px solid ${T.earthL}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ color: T.earth, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>5 · Terms & Agreements</div>
                  <div style={{ color: T.textSoft, fontSize: "0.75rem" }}>{DISCLAIMERS.filter(d => vendorForm[d.key]).length}/{DISCLAIMERS.length} agreed</div>
                </div>
                <div style={{ height: "5px", background: `${T.earthL}40`, borderRadius: "3px", marginBottom: "16px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(DISCLAIMERS.filter(d => vendorForm[d.key]).length / DISCLAIMERS.length) * 100}%`, background: `linear-gradient(90deg,${T.green2},${T.green3})`, borderRadius: "3px", transition: "width 0.3s" }} />
                </div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {DISCLAIMERS.map((d, i) => (
                    <div key={d.key}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", padding: "12px 14px", background: vendorForm[d.key] ? "#F0FBF4" : vendorErrors[d.key] ? "#FEF2F2" : "#fff", border: `1px solid ${vendorForm[d.key] ? T.green3 : vendorErrors[d.key] ? "#FECACA" : T.border}`, borderRadius: "10px" }}>
                        <div onClick={() => setVendorForm(f => ({ ...f, [d.key]: !f[d.key] }))} style={{ width: "44px", height: "24px", borderRadius: "12px", background: vendorForm[d.key] ? T.green1 : "#D1D5DB", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0, marginTop: "1px" }}>
                          <div style={{ position: "absolute", top: "3px", left: vendorForm[d.key] ? "23px" : "3px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#6B4E1A", fontSize: "0.72rem", fontWeight: 700, marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Agreement {i + 1}</div>
                          <div style={{ color: T.textMid, fontSize: "0.83rem", lineHeight: 1.6 }}>{d.text}</div>
                        </div>
                      </label>
                      {vendorErrors[d.key] && <div style={{ color: T.warn, fontSize: "0.72rem", marginTop: "3px", paddingLeft: "4px" }}>⚠ {vendorErrors[d.key]}</div>}
                    </div>
                  ))}
                </div>
                {allAgreed && <div style={{ marginTop: "12px", background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "10px 14px", color: T.green1, fontSize: "0.82rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>✅ All agreements accepted &mdash; you're ready to submit!</div>}
              </div>
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", paddingBottom: "0.5rem" }}>
                {!allAgreed && (
                  <div style={{ flex: 1, background: `${T.earth}12`, border: `1px solid ${T.earthL}60`, borderRadius: "10px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "1rem" }}>⬇️</span>
                    <span style={{ color: T.earth, fontSize: "0.78rem", fontWeight: 600 }}>Scroll down to review & accept all agreements before submitting</span>
                  </div>
                )}
                <button onClick={() => setVendorModal(null)} style={{ background: T.green5, color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "12px 22px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
                <button onClick={submitVendorApp} disabled={!allAgreed} title={!allAgreed ? "Accept all agreements to submit" : ""} style={{ background: allAgreed ? `linear-gradient(135deg,${T.earth},${T.earthL})` : "#D1D5DB", color: allAgreed ? "#fff" : T.stoneL, border: "none", borderRadius: "10px", padding: "12px 28px", cursor: allAgreed ? "pointer" : "not-allowed", fontFamily: "inherit", fontWeight: 700, fontSize: "0.95rem", transition: "all 0.2s" }}>Submit Application 🌱</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── CALENDAR EVENT MODAL ─────────────────────────────────────────────────────
function CalendarEventModal() {
  const { calendarModal, setCalendarModal, events, isReg, isInCart, addToCart, setCartOpen, setSelectedId, setView, openVendorModal } = useApp();
  if (!calendarModal) return null;
  const ev = events.find(e => e.id === calendarModal);
  if (!ev) return null;
  const full = spotsLeft(ev) === 0;
  const registered = isReg(ev.id);
  const inCart = isInCart(ev.id);
  const approvedVendors = (ev.vendors || []).filter(v => v.status === "approved");
  const fp = ev.photos && ev.photos.length > 0 ? ev.photos[0] : null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 550, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }} onClick={e => { if (e.target === e.currentTarget) setCalendarModal(null); }}>
      <div style={{ background: T.bgCard, borderRadius: "20px", width: "100%", maxWidth: "620px", maxHeight: "90vh", overflowY: "auto", position: "relative", boxShadow: "0 28px 80px rgba(0,0,0,0.35)", animation: "slideUp 0.25s ease" }}>
        <button onClick={() => setCalendarModal(null)} style={{ position: "sticky", top: "12px", float: "right", marginRight: "12px", zIndex: 10, background: "rgba(0,0,0,0.35)", border: "none", borderRadius: "50%", width: "34px", height: "34px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem", color: "#fff" }}>✕</button>
        <div style={{ height: "200px", position: "relative", overflow: "hidden", borderRadius: "20px 20px 0 0", flexShrink: 0 }}>
          {fp ? <img src={fp} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ height: "100%", background: `linear-gradient(135deg,${ev.color}33,${ev.color}88)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5rem" }}>{catEmoji(ev.category)}</div>}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 60%)" }} />
          <div style={{ position: "absolute", bottom: "14px", left: "18px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ background: ev.color, color: "#fff", borderRadius: "6px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" }}>{ev.category}</span>
            {ev.vendorInvite && <span style={{ background: T.earth, color: "#fff", borderRadius: "6px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700 }}>🛖 Vendors Welcome</span>}
          </div>
        </div>
        <div style={{ padding: "22px 24px 28px" }}>
          <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.5rem", fontWeight: 700, margin: "0 0 14px", lineHeight: 1.2, paddingRight: "30px" }}>{ev.title}</h2>
          <p style={{ color: T.textSoft, lineHeight: 1.75, fontSize: "0.9rem", margin: "0 0 18px" }}>{ev.description}</p>
          {ev.tags && ev.tags.length > 0 && <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "18px" }}>{ev.tags.map(t => <span key={t} style={{ background: T.green5, color: T.green1, borderRadius: "6px", padding: "3px 10px", fontSize: "0.72rem" }}>#{t}</span>)}</div>}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", borderTop: `1px solid ${T.border}`, paddingTop: "18px" }}>
            <button onClick={() => { setSelectedId(ev.id); setView("detail"); setCalendarModal(null); }} style={{ flex: 1, background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "12px", padding: "13px", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minWidth: "120px" }}>Full Event Page →</button>
            {registered
              ? <div style={{ flex: 1, background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "12px", padding: "13px", textAlign: "center", minWidth: "120px" }}><div style={{ color: T.green1, fontWeight: 700, fontSize: "0.9rem" }}>✅ You're registered!</div></div>
              : inCart
              ? <button onClick={() => { setCalendarModal(null); setCartOpen(true); }} style={{ flex: 1, background: T.earth, color: "#fff", border: "none", borderRadius: "12px", padding: "13px", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minWidth: "120px" }}>In Cart &mdash; View Cart 🛒</button>
              : full
              ? <button disabled style={{ flex: 1, background: T.cream, color: T.stoneL, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "13px", fontSize: "0.9rem", cursor: "not-allowed", fontFamily: "inherit", minWidth: "120px" }}>Sold Out</button>
              : <button onClick={() => { const tier = ev.ticketTiers?.[0]; addToCart(ev, 1, tier); setCalendarModal(null); }} style={{ flex: 1, background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "12px", padding: "13px", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minWidth: "120px" }}>{(ev.ticketTiers?.[0]?.price ?? 0) === 0 ? "Register Free 🌿" : "Add to Cart 🛒"}</button>
            }
            {ev.vendorInvite && !registered && <button onClick={() => { setCalendarModal(null); openVendorModal(ev.id); }} style={{ background: `${T.earth}15`, color: T.earth, border: `1px solid ${T.earthL}`, borderRadius: "12px", padding: "13px 18px", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🛖 Apply as Vendor</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PHOTO CAROUSEL ───────────────────────────────────────────────────────────
function PhotoCarousel({ photos, color }) {
  const [idx, setIdx] = useState(0);
  if (!photos || photos.length === 0) return <div style={{ height: "280px", background: `linear-gradient(135deg,${color}22,${color}66)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5rem" }}>🌿</div>;
  return (
    <div style={{ position: "relative", height: "320px", overflow: "hidden", background: "#111" }}>
      <img src={photos[idx]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {photos.length > 1 && <>
        <button onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + photos.length) % photos.length); }} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: "38px", height: "38px", cursor: "pointer", fontSize: "1.2rem", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <button onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % photos.length); }} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: "38px", height: "38px", cursor: "pointer", fontSize: "1.2rem", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        <div style={{ position: "absolute", bottom: "12px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "6px" }}>
          {photos.map((_, i) => <button key={i} onClick={e => { e.stopPropagation(); setIdx(i); }} style={{ width: i === idx ? "22px" : "8px", height: "8px", borderRadius: "4px", background: i === idx ? "#fff" : "rgba(255,255,255,0.5)", border: "none", cursor: "pointer", padding: 0, transition: "all 0.2s" }} />)}
        </div>
      </>}
    </div>
  );
}

// ─── TIER PICKER POPOVER ──────────────────────────────────────────────────────
// Shown when "Add to Cart" is clicked on an EventCard &mdash; mirrors the detail view's
// tier selector layout so the experience is consistent.
function TierPickerPopover({ ev, onClose }) {
  const { addToCart } = useApp();
  const tiers = ev.ticketTiers || [];
  const [activeTierId, setActiveTierId] = useState(tiers[0]?.id || null);
  const [qty, setQty] = useState(1);
  const selectedTier = tiers.find(t => t.id === activeTierId) || tiers[0] || null;

  // Close on outside click or Escape
  useEffect(() => {
    const handler = e => {
      if (!e.target.closest("[data-tier-picker]")) onClose();
    };
    const keyHandler = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  if (!selectedTier) return null;

  const eventSpotsLeft = spotsLeft(ev);
  const maxQty = Math.max(1, eventSpotsLeft);

  // Render as fixed modal portal-style so it is never clipped by card overflow
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.45)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        data-tier-picker
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", border: `1px solid ${T.border}`, borderRadius: "18px",
          boxShadow: "0 16px 50px rgba(0,0,0,0.28)", padding: "22px",
          width: "100%", maxWidth: "400px", animation: "slideUp 0.18s ease",
          maxHeight: "85vh", overflowY: "auto",
        }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
          <div>
            <div style={{ color: T.text, fontWeight: 700, fontSize: "1rem", fontFamily: "'Lora',serif", marginBottom: "2px" }}>{ev.title}</div>
            <div style={{ color: T.stoneL, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Select Ticket Type</div>
          </div>
          <button onClick={onClose} style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "50%", width: "32px", height: "32px", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: T.stoneL }}>✕</button>
        </div>

        {/* Spots remaining */}
        {eventSpotsLeft > 0 && eventSpotsLeft <= 15 && (
          <div style={{ background: eventSpotsLeft <= 5 ? `${T.warn}15` : `${T.gold}15`, border: `1px solid ${eventSpotsLeft <= 5 ? T.warn : T.gold}40`, borderRadius: "8px", padding: "6px 10px", fontSize: "0.74rem", fontWeight: 600, color: eventSpotsLeft <= 5 ? T.warn : "#B45309", marginBottom: "12px" }}>
            ⚡ Only {eventSpotsLeft} spot{eventSpotsLeft !== 1 ? "s" : ""} remaining!
          </div>
        )}

        {/* Tier list */}
        <div style={{ display: "grid", gap: "9px", marginBottom: "16px", marginTop: "12px" }}>
          {tiers.map(tier => {
            const isFull = eventSpotsLeft === 0;
            const isSel = activeTierId === tier.id;
            return (
              <div key={tier.id}
                onClick={() => { if (!isFull) { setActiveTierId(tier.id); setQty(1); } }}
                style={{
                  border: `2px solid ${isSel ? T.green2 : T.border}`, borderRadius: "12px",
                  padding: "12px 14px", cursor: isFull ? "default" : "pointer",
                  background: isSel ? `${T.green1}0D` : isFull ? T.bg : "#fff",
                  opacity: isFull ? 0.55 : 1, transition: "all 0.15s",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {isSel && !isFull && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: T.green2, flexShrink: 0 }} />}
                      <span style={{ color: T.text, fontWeight: 700, fontSize: "0.9rem" }}>{tier.name}</span>
                    </div>
                    {tier.description && (
                      <div style={{ color: T.textSoft, fontSize: "0.75rem", marginTop: "3px", lineHeight: 1.45 }}>{tier.description}</div>
                    )}
                  </div>
                  <div style={{ color: tier.price === 0 ? T.green1 : T.text, fontWeight: 700, fontSize: "1.05rem", fontFamily: "'Lora',serif", flexShrink: 0 }}>
                    {tier.price === 0 ? "Free" : `$${tier.price}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: T.border, margin: "0 0 14px" }} />

        {/* Quantity row */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <div style={{ color: T.stoneL, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>Quantity</div>
          <button onClick={() => setQty(q => Math.max(1, q - 1))}
            style={{ width: "34px", height: "34px", borderRadius: "8px", background: T.green5, border: `1px solid ${T.border}`, color: T.green1, cursor: "pointer", fontSize: "1.2rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
          <span style={{ color: T.text, fontWeight: 700, fontSize: "1.05rem", minWidth: "26px", textAlign: "center" }}>{qty}</span>
          <button onClick={() => setQty(q => Math.min(maxQty, q + 1))}
            style={{ width: "34px", height: "34px", borderRadius: "8px", background: T.green5, border: `1px solid ${T.border}`, color: T.green1, cursor: "pointer", fontSize: "1.2rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
          {selectedTier.price > 0 && (
            <span style={{ color: T.earth, fontWeight: 700, fontSize: "0.9rem", marginLeft: "2px" }}>
              = ${(selectedTier.price * qty).toFixed(2)}
            </span>
          )}
        </div>

        {/* Add to cart CTA */}
        <button
          onClick={() => { addToCart(ev, qty, selectedTier); onClose(); }}
          style={{ width: "100%", background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "12px", padding: "13px", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 14px ${T.green1}44`, marginBottom: "8px" }}>
          {selectedTier.price === 0 ? "Register Free 🌿" : `Add to Cart 🛒`}
        </button>
        <div style={{ color: T.stoneL, fontSize: "0.68rem", textAlign: "center" }}>Instant confirmation &middot; No hidden fees</div>
      </div>
    </div>
  );
}

// ─── EVENT CARD ───────────────────────────────────────────────────────────────
function EventCard({ ev }) {
  const { setSelectedId, setView, toggleInterest, getInterest, currentUser, reviews, vibeConfig } = useApp();
  const fp = ev.photos && ev.photos.length > 0 ? ev.photos[0] : null;
  const spots = spotsLeft(ev);
  const cap = totalCapacity(ev);
  const sold = totalSold(ev);
  const pctFull = cap > 0 ? Math.min(100, Math.round((sold / cap) * 100)) : 0;
  const full = spots === 0;
  const almostFull = spots > 0 && spots <= 10;
  const lowestPrice = ev.ticketTiers && ev.ticketTiers.length > 0 ? Math.min(...ev.ticketTiers.map(t => t.price)) : (ev.price || 0);
  const shortDesc = ev.description && ev.description.length > 100 ? ev.description.slice(0, 97) + "…" : ev.description;
  const intr = getInterest(ev.id);
  const uid = currentUser?.id;
  const isGoing = uid && intr.going.includes(uid);
  const isInterested = uid && intr.interested.includes(uid);
  const totalInterest = intr.going.length + intr.interested.length;
  const evReviews = reviews[ev.id] || [];
  const avgRating = evReviews.length > 0 ? (evReviews.reduce((s, r) => s + r.rating, 0) / evReviews.length) : 0;

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", overflow: "hidden", transition: "transform 0.2s,box-shadow 0.2s", display: "flex", flexDirection: "column" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 16px 48px rgba(44,106,79,0.18)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
      <div onClick={() => { setSelectedId(ev.id); setView("detail"); }} style={{ cursor: "pointer" }}>

        {fp ? (
          /* ── Photo banner mode ── */
          <div style={{ height: "200px", position: "relative", overflow: "hidden" }}>
            <img src={fp} alt={ev.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {/* Gradient scrim so text is always readable */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)" }} />
            {/* Top badges */}
            <div style={{ position: "absolute", top: "10px", left: "10px", background: ev.isPrivate ? "#6B3FA0" : ev.color, color: "#fff", borderRadius: "6px", padding: "3px 10px", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>{ev.isPrivate ? "🔒 Private" : ev.category}</div>
            {ev.vendorInvite && <div style={{ position: "absolute", top: "10px", left: ev.isPrivate ? "90px" : "80px", background: T.earth, color: "#fff", borderRadius: "6px", padding: "3px 8px", fontSize: "0.68rem", fontWeight: 700 }}>🛖 Vendors</div>}
            {/* Interest heart */}
            <button onClick={e => { e.stopPropagation(); toggleInterest(ev.id, isInterested ? "interested" : isGoing ? "going" : "interested"); }}
              title={isGoing ? "Going!" : isInterested ? "Interested" : "Mark interest"}
              style={{ position: "absolute", top: "8px", right: "8px", width: "34px", height: "34px", borderRadius: "50%", background: (isGoing || isInterested) ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.35)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", backdropFilter: "blur(4px)", transition: "transform 0.15s, background 0.15s", zIndex: 2 }}
              onMouseEnter={e => e.currentTarget.style.transform = "scale(1.15)"}
              onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
              {isGoing ? "✅" : isInterested ? "❤️" : "🤍"}
            </button>
            {/* Title + meta overlaid at bottom of banner */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 14px 10px" }}>
              <h3 style={{ color: "#fff", fontSize: "1rem", fontWeight: 700, margin: "0 0 3px", lineHeight: 1.25, fontFamily: "'Lora',serif", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>{ev.title}</h3>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.72rem", fontWeight: 600 }}>
                  {dateRange(ev)}{ev.time ? ` · ${fmtTime(ev.time)}` : ""}
                </div>
                {(full || almostFull) && (
                  <div style={{ background: full ? T.warn : "#D97706", color: "#fff", borderRadius: "5px", padding: "2px 8px", fontSize: "0.65rem", fontWeight: 700 }}>
                    {full ? "SOLD OUT" : `Only ${spots} left!`}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── No-photo mode (unchanged) ── */
          <div style={{ height: "150px", position: "relative", overflow: "hidden" }}>
            <div style={{ height: "100%", background: `linear-gradient(135deg,${ev.color}22,${ev.color}66)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem" }}>{catEmoji(ev.category)}</div>
            <div style={{ position: "absolute", top: "10px", left: "10px", background: ev.isPrivate ? "#6B3FA0" : ev.color, color: "#fff", borderRadius: "6px", padding: "3px 10px", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>{ev.isPrivate ? "🔒 Private" : "Public"}</div>
            <button onClick={e => { e.stopPropagation(); toggleInterest(ev.id, isInterested ? "interested" : isGoing ? "going" : "interested"); }}
              title={isGoing ? "Going!" : isInterested ? "Interested" : "Mark interest"}
              style={{ position: "absolute", top: "8px", right: "8px", width: "34px", height: "34px", borderRadius: "50%", background: (isGoing || isInterested) ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.35)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", backdropFilter: "blur(4px)", transition: "transform 0.15s, background 0.15s", zIndex: 2 }}
              onMouseEnter={e => e.currentTarget.style.transform = "scale(1.15)"}
              onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
              {isGoing ? "✅" : isInterested ? "❤️" : "🤍"}
            </button>
            {ev.vendorInvite && <div style={{ position: "absolute", bottom: "10px", left: "10px", background: T.earth, color: "#fff", borderRadius: "6px", padding: "3px 8px", fontSize: "0.68rem", fontWeight: 700 }}>🛖 Vendors Welcome</div>}
            {full && <div style={{ position: "absolute", bottom: "10px", right: "10px", background: T.warn, color: "#fff", borderRadius: "6px", padding: "3px 10px", fontSize: "0.7rem", fontWeight: 700 }}>SOLD OUT</div>}
            {almostFull && <div style={{ position: "absolute", bottom: "10px", right: "10px", background: "#D97706", color: "#fff", borderRadius: "6px", padding: "3px 10px", fontSize: "0.7rem", fontWeight: 700 }}>Only {spots} left!</div>}
          </div>
        )}

        <div style={{ padding: fp ? "10px 16px 6px" : "14px 16px 6px" }}>
          {/* Only show title/date row when no photo (photo mode overlays them) */}
          {!fp && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                <div style={{ color: T.green1, fontSize: "0.75rem", fontWeight: 600 }}>
                  {dateRange(ev)}{multiDay(ev) && <span style={{ marginLeft: "6px", background: T.green5, color: T.green1, borderRadius: "4px", padding: "1px 6px", fontSize: "0.68rem" }}>Multi-day</span>}
                </div>
                {ev.time && <div style={{ color: T.stoneL, fontSize: "0.7rem" }}>{fmtTime(ev.time)}</div>}
              </div>
              <h3 style={{ color: T.text, fontSize: "1rem", fontWeight: 700, margin: "0 0 4px", lineHeight: 1.3, fontFamily: "'Lora',serif" }}>{ev.title}</h3>
            </>
          )}
          {fp && multiDay(ev) && (
            <div style={{ marginBottom: "4px" }}>
              <span style={{ background: T.green5, color: T.green1, borderRadius: "4px", padding: "1px 6px", fontSize: "0.68rem" }}>Multi-day</span>
            </div>
          )}
          <div style={{ color: T.textSoft, fontSize: "0.78rem", marginBottom: "4px" }}>📍 {ev.location}</div>
          {/* Social signals row */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "5px", flexWrap: "wrap" }}>
            {avgRating > 0 && (
              <span style={{ color: "#F59E0B", fontSize: "0.75rem", fontWeight: 700 }}>
                ★ {avgRating.toFixed(1)} <span style={{ color: T.stoneL, fontWeight: 400 }}>({evReviews.length})</span>
              </span>
            )}
            {totalInterest > 0 && (
              <span style={{ color: T.stoneL, fontSize: "0.72rem" }}>
                {intr.going.length > 0 && `✅ ${intr.going.length} going`}
                {intr.going.length > 0 && intr.interested.length > 0 && " · "}
                {intr.interested.length > 0 && `❤️ ${intr.interested.length} interested`}
              </span>
            )}
          </div>
          {shortDesc && <p style={{ color: T.textSoft, fontSize: "0.78rem", lineHeight: 1.55, margin: "0 0 6px" }}>{shortDesc}</p>}
          {/* Vibe tag pills */}
          {vibeConfig.enabled && (ev.vibeTags || []).length > 0 && (
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "8px" }}>
              {(ev.vibeTags || []).slice(0, 4).map(vid => {
                const vt = vibeConfig.items.find(v => v.id === vid) || VIBE_TAGS.find(v => v.id === vid);
                return vt ? (
                  <span key={vid} style={{ background: T.green5, color: T.green1, borderRadius: "100px", padding: "2px 8px", fontSize: "0.68rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                    {vt.emoji} {vt.label}
                  </span>
                ) : null;
              })}
            </div>
          )}
          {ev.showAttendanceBar !== false && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <div style={{ color: T.stoneL, fontSize: "0.7rem" }}>{sold} registered</div>
                <div style={{ color: full ? T.warn : almostFull ? "#D97706" : T.stoneL, fontSize: "0.7rem", fontWeight: 600 }}>{full ? "Sold out" : `${spots} spot${spots !== 1 ? "s" : ""} left`}</div>
              </div>
              <div style={{ height: "4px", background: T.border, borderRadius: "2px", overflow: "hidden", marginBottom: "2px" }}>
                <div style={{ height: "100%", width: `${pctFull}%`, background: pctFull >= 90 ? T.warn : pctFull >= 70 ? "#D97706" : T.green2, borderRadius: "2px", transition: "width 0.3s" }} />
              </div>
            </>
          )}
        </div>
      </div>
      {/* Details button */}
      <div style={{ padding: "8px 16px 14px", marginTop: "auto" }}>
        <button
          onClick={() => { setSelectedId(ev.id); setView("detail"); }}
          style={{ width: "100%", background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "9px", padding: "10px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.01em" }}>
          Click for Details →
        </button>
      </div>
    </div>
  );
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
function Navbar() {
  const { view, setView, cart, setCartOpen, currentUser, handleLogout, openAuth } = useApp();
  const cartCount = cart.reduce((s, item) => s + item.qty, 0);
  const navLinks = [["discover", "Discover"], ["vendors", "Vendors"], ["mytickets", "My Account"]];
  return (
    <nav style={{ background: T.bgDeep, padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "68px", position: "sticky", top: 0, zIndex: 200, boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", minWidth: 0 }}>
        <div onClick={() => setView("discover")} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: "10px", background: `linear-gradient(135deg,${T.green2},${T.green3})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>🌿</div>
          <div>
            <div style={{ color: "#fff", fontFamily: "'Lora',serif", fontSize: "1rem", fontWeight: 700, lineHeight: 1.1 }}>New Harmony</div>
            <div style={{ color: T.green4, fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>Life Events</div>
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", gap: "0.85rem", overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch", paddingRight: "20px" }}>
            {navLinks.map(([v, l]) => (
              <button key={v} onClick={() => setView(v)}
                style={{ background: "none", border: "none", color: view === v ? T.green3 : "#9CA3AF", cursor: "pointer", fontSize: "0.85rem", fontWeight: view === v ? 600 : 400, padding: "4px 0", borderBottom: view === v ? `2px solid ${T.green3}` : "2px solid transparent", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                {l}
              </button>
            ))}
          </div>
          {/* Fade-out on right edge to hint at scroll */}
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "20px", background: `linear-gradient(to right, transparent, ${T.bgDeep})`, pointerEvents: "none" }} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <button onClick={() => setCartOpen(true)} style={{ position: "relative", background: cartCount > 0 ? `${T.green1}30` : "rgba(255,255,255,0.08)", border: cartCount > 0 ? `1px solid ${T.green3}55` : "1px solid rgba(255,255,255,0.15)", borderRadius: "10px", padding: "8px 14px", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: "6px", fontFamily: "inherit", fontSize: "0.85rem", fontWeight: 500 }}>
          🛒{cartCount > 0 && <span style={{ background: T.green3, color: T.bgDeep, borderRadius: "100px", padding: "1px 7px", fontSize: "0.72rem", fontWeight: 700 }}>{cartCount}</span>}
        </button>
        {currentUser ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button onClick={() => setView("mytickets")} title="My Account" style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "10px", padding: "6px 12px", cursor: "pointer", color: "#fff", fontFamily: "inherit", fontSize: "0.82rem" }}>
              <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: (currentUser.avatarColor || currentUser.avatar_color || "#40916C"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>{initials(currentUser)}</div>
              <span style={{ maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.firstName || currentUser.first_name || ""}</span>
            </button>
            <button onClick={handleLogout} title="Sign Out" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", padding: "7px 12px", cursor: "pointer", color: "#9CA3AF", fontFamily: "inherit", fontSize: "0.78rem" }}>Sign Out</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={() => openAuth("login")} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "9px", padding: "8px 14px", cursor: "pointer", color: "#fff", fontFamily: "inherit", fontSize: "0.83rem", fontWeight: 500 }}>Sign In</button>
            <button onClick={() => openAuth("signup")} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "9px", padding: "8px 14px", fontSize: "0.83rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Sign Up</button>
          </div>
        )}
      </div>
    </nav>
  );
}

// ─── CALENDAR VIEW (sub-component of Discover) ────────────────────────────────
function CalendarView() {
  const { activeEvents, setCalendarModal, isReg, isInCart } = useApp();
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [hoveredDay, setHoveredDay] = useState(null);
  const [popupDay, setPopupDay] = useState(null);
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const CAL_DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); setPopupDay(null); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); setPopupDay(null); };
  const goToday = () => { setCalMonth(now.getMonth()); setCalYear(now.getFullYear()); setPopupDay(null); };
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const getEventsForDay = (dayNum) => {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    return activeEvents.filter(ev => { const start = ev.startDate || ""; const end = ev.endDate || ev.startDate || ""; return start <= dateStr && dateStr <= end; });
  };
  const getEventColor = (ev, idx) => { const colors = [ev.color, T.green2, T.earth, T.green1, "#7C5CBF", "#D97706", "#0369A1"]; return colors[idx % colors.length]; };
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const todayInGrid = now.getFullYear() === calYear && now.getMonth() === calMonth ? now.getDate() : null;
  return (
    <div style={{ padding: "0 2rem 4rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.5rem", paddingTop: "1rem", borderTop: `2px solid ${T.border}` }}>
        <div style={{ width: "4px", height: "28px", background: `linear-gradient(180deg,${T.green1},${T.green3})`, borderRadius: "2px" }} />
        <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.5rem", margin: 0 }}>Event Calendar</h2>
      </div>
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "20px", overflow: "hidden", boxShadow: "0 4px 24px rgba(44,106,79,0.08)" }}>
        <div style={{ background: `linear-gradient(135deg,${T.bgDeep},${T.bgMid})`, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={prevMonth} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: "10px", width: "38px", height: "38px", cursor: "pointer", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#fff", fontFamily: "'Lora',serif", fontSize: "1.4rem", fontWeight: 700 }}>{MONTH_NAMES[calMonth]} {calYear}</div>
            <button onClick={goToday} style={{ background: "rgba(116,198,157,0.2)", border: "1px solid rgba(116,198,157,0.3)", color: T.green3, borderRadius: "100px", padding: "2px 12px", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", marginTop: "4px", fontFamily: "inherit" }}>Today</button>
          </div>
          <button onClick={nextMonth} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: "10px", width: "38px", height: "38px", cursor: "pointer", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", background: T.cream, borderBottom: `1px solid ${T.border}` }}>
          {CAL_DAY_NAMES.map(d => <div key={d} style={{ padding: "10px 0", textAlign: "center", color: d === "Sun" || d === "Sat" ? T.earthL : T.textSoft, fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
          {cells.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} style={{ minHeight: "100px", background: T.bg, borderRight: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, opacity: 0.4 }} />;
            const dayEvents = getEventsForDay(day);
            const isToday = day === todayInGrid;
            const isHovered = hoveredDay === day;
            const isWeekend = (idx % 7 === 0 || idx % 7 === 6);
            const hasEvents = dayEvents.length > 0;
            const isPopup = popupDay === day;
            const MAX_SHOW = 3;
            return (
              <div key={day} onClick={() => hasEvents && setPopupDay(isPopup ? null : day)} onMouseEnter={() => setHoveredDay(day)} onMouseLeave={() => setHoveredDay(null)}
                style={{ minHeight: "100px", background: isPopup ? T.green5 : isWeekend ? "#FDFBF7" : T.bgCard, borderRight: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, padding: "8px 6px 6px", cursor: hasEvents ? "pointer" : "default", position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "50%", background: isToday ? T.green1 : "transparent", color: isToday ? "#fff" : isWeekend ? T.earthL : T.text, fontSize: "0.82rem", fontWeight: isToday ? 700 : 500, marginBottom: "5px" }}>{day}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {dayEvents.slice(0, MAX_SHOW).map((ev, i) => (
                    <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: "4px", background: getEventColor(ev, i), borderRadius: "4px", padding: "2px 5px", overflow: "hidden" }}>
                      <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "rgba(255,255,255,0.7)", flexShrink: 0 }} />
                      <span style={{ color: "#fff", fontSize: "0.62rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>{ev.title}</span>
                    </div>
                  ))}
                  {dayEvents.length > MAX_SHOW && <div style={{ fontSize: "0.62rem", color: T.green1, fontWeight: 700, paddingLeft: "4px" }}>+{dayEvents.length - MAX_SHOW} more</div>}
                </div>
                {isPopup && (() => {
                  // Align popup to the right on last 2 columns to prevent clipping
                  const colPos = idx % 7;
                  const popupAlign = colPos >= 5 ? { right: 0 } : { left: 0 };
                  return (
                    <div style={{ position: "absolute", top: "100%", ...popupAlign, zIndex: 100, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", padding: "12px", minWidth: "220px", maxWidth: "280px" }}>
                      {dayEvents.map(ev => {
                        const registered = isReg(ev.id);
                        const inCart = isInCart(ev.id);
                        const full = spotsLeft(ev) === 0;
                        return (
                          <div key={ev.id} onClick={e => { e.stopPropagation(); setCalendarModal(ev.id); setPopupDay(null); }}
                            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px", borderRadius: "8px", cursor: "pointer", marginBottom: "4px", background: T.cream, border: `1px solid ${T.border}` }}>
                            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: ev.color, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: T.text, fontSize: "0.8rem", fontWeight: 700, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                              <div style={{ color: T.stoneL, fontSize: "0.68rem" }}>{fmtTime(ev.time)}</div>
                            </div>
                            <div style={{ color: (ev.ticketTiers?.[0]?.price ?? 0) === 0 ? T.green1 : T.earth, fontWeight: 700, fontSize: "0.88rem" }}>{(ev.ticketTiers?.[0]?.price ?? 0) === 0 ? "Free" : `$${ev.ticketTiers?.[0]?.price}`}</div>
                            {registered && <span style={{ background: T.green5, color: T.green1, borderRadius: "4px", padding: "1px 7px", fontSize: "0.65rem", fontWeight: 700 }}>✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 24px", background: T.cream, borderTop: `1px solid ${T.border}`, display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: T.stoneL, fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Key:</span>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}><div style={{ width: "18px", height: "18px", borderRadius: "50%", background: T.green1, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "0.55rem", fontWeight: 700 }}>●</div><span style={{ color: T.textSoft, fontSize: "0.75rem" }}>Today</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}><div style={{ width: "40px", height: "10px", borderRadius: "3px", background: T.earth }} /><span style={{ color: T.textSoft, fontSize: "0.75rem" }}>Event</span></div>
          <span style={{ color: T.stoneL, fontSize: "0.72rem", marginLeft: "auto" }}>Click any event to view full details</span>
        </div>
      </div>
    </div>
  );
}

// ─── DISCOVER VIEW ────────────────────────────────────────────────────────────
function DiscoverView() {
  const { search, setSearch, filterCat, setFilterCat, filterDate, setFilterDate, filterPrice, setFilterPrice, filterVibe, setFilterVibe, filteredEvents, activeEvents, archivedEvents, following, vibeConfig, sortConfig, categoryConfig } = useApp();
  const [filterFollowing, setFilterFollowing] = useState(false);
  const toggleVibe = (id) => setFilterVibe(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  const activeDateItems = sortConfig.enabled ? sortConfig.items.filter(i => i.group === "date") : [];
  const showFreeBtn = sortConfig.enabled && sortConfig.items.some(i => i.group === "price" && i.id === "price-free");
  const activeFilterCount = (filterCat !== "All" ? 1 : 0) + (filterDate !== "all" ? 1 : 0) + (filterPrice !== "all" ? 1 : 0) + (filterFollowing ? 1 : 0) + filterVibe.length;
  const clearAll = () => { setSearch(""); setFilterCat("All"); setFilterDate("all"); setFilterPrice("all"); setFilterFollowing(false); setFilterVibe([]); };
  const displayEvents = filterFollowing ? filteredEvents.filter(ev => following.has(ev.organizer)) : filteredEvents;
  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ background: `linear-gradient(160deg,${T.bgDeep} 0%,${T.bgMid} 100%)`, padding: "4rem 2rem 3rem", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(ellipse at 25% 60%,${T.green1}30 0%,transparent 55%),radial-gradient(ellipse at 75% 30%,${T.green3}15 0%,transparent 55%)` }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: `${T.green3}20`, border: `1px solid ${T.green3}40`, borderRadius: "100px", padding: "6px 18px", fontSize: "0.8rem", color: T.green4, fontWeight: 600, marginBottom: "1.5rem", letterSpacing: "0.06em" }}><span>🌱</span> COMMUNITY · NATURE · CELEBRATION</div>
          <h1 style={{ color: "#fff", fontFamily: "'Lora',serif", fontSize: "clamp(2rem,5vw,3.2rem)", fontWeight: 700, margin: "0 0 1rem", letterSpacing: "-0.02em", lineHeight: 1.15 }}>Gather. Grow.<br /><span style={{ background: `linear-gradient(135deg,${T.green3},${T.earthL})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Belong Together.</span></h1>
          <p style={{ color: "#9CA3AF", fontSize: "1.05rem", maxWidth: "480px", margin: "0 auto 2.5rem", lineHeight: 1.7 }}>Discover events rooted in community, nature, and shared joy &mdash; right here in the heartland.</p>
          <div style={{ maxWidth: "540px", margin: "0 auto", position: "relative" }}>
            <span style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", fontSize: "1rem", pointerEvents: "none", zIndex: 1 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events, venues, topics..." style={{ width: "100%", padding: "14px 44px 14px 46px", background: "rgba(255,255,255,0.12)", border: `1px solid ${T.green3}40`, borderRadius: "14px", color: "#fff", fontSize: "0.9rem", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: "22px", height: "22px", color: "#fff", cursor: "pointer", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>}
          </div>
        </div>
      </div>
      <div style={{ background: T.bgMid, padding: "0.7rem 2rem", display: "flex", gap: "2rem", overflowX: "auto" }}>
        {[[`${activeEvents.length} Upcoming Events`, "🗓️"], [`${activeEvents.filter(e => (e.ticketTiers || []).length === 0 || e.ticketTiers.every(t => t.price === 0)).length} Free`, "🎁"], [`${activeEvents.filter(e => e.vendorInvite).length} Seeking Vendors`, "🛖"], [`${archivedEvents.length} Archived`, "📦"]].map(([stat, icon]) => (
          <div key={stat} style={{ display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}><span>{icon}</span><span style={{ color: T.green4, fontSize: "0.85rem" }}>{stat}</span></div>
        ))}
      </div>
      {/* Filter bar */}
      <div style={{ padding: "1.25rem 2rem 0", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {categoryConfig.enabled && categoryConfig.items.length > 0 && (
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px", scrollbarWidth: "none", msOverflowStyle: "none" }}
              className="hide-scrollbar">
              {["All", ...categoryConfig.items].map(cat => <button key={cat} onClick={() => setFilterCat(cat)} style={{ padding: "6px 14px", borderRadius: "100px", border: filterCat === cat ? `1px solid ${T.green1}` : `1px solid ${T.border}`, background: filterCat === cat ? T.green5 : "transparent", color: filterCat === cat ? T.green1 : T.textSoft, fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit", fontWeight: filterCat === cat ? 600 : 400, flexShrink: 0 }}>{cat}</button>)}
            </div>
            <div style={{ position: "absolute", right: 0, top: 0, bottom: "4px", width: "40px", background: `linear-gradient(to right, transparent, ${T.bg})`, pointerEvents: "none" }} />
          </div>
        )}
        {(sortConfig.enabled || following.size > 0) && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            {sortConfig.enabled && activeDateItems.map(item => {
              const label = item.label.toLowerCase();
              const val = label.includes("today") ? "today" : label.includes("week") ? "week" : label.includes("month") ? "month" : item.id.replace(/^date-/, "");
              return <button key={item.id} onClick={() => setFilterDate(filterDate === val ? "all" : val)} style={{ padding: "6px 14px", borderRadius: "100px", border: filterDate === val ? `1px solid ${T.earth}` : `1px solid ${T.border}`, background: filterDate === val ? `${T.earthL}30` : "transparent", color: filterDate === val ? T.earth : T.textSoft, fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>{item.label}</button>;
            })}
            {sortConfig.enabled && showFreeBtn && <button onClick={() => setFilterPrice(filterPrice === "free" ? "all" : "free")} style={{ padding: "6px 14px", borderRadius: "100px", border: filterPrice === "free" ? `1px solid ${T.green2}` : `1px solid ${T.border}`, background: filterPrice === "free" ? T.green5 : "transparent", color: filterPrice === "free" ? T.green1 : T.textSoft, fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>🎁 Free</button>}
            {following.size > 0 && <button onClick={() => setFilterFollowing(f => !f)} style={{ padding: "6px 14px", borderRadius: "100px", border: filterFollowing ? `1px solid ${T.earth}` : `1px solid ${T.border}`, background: filterFollowing ? `${T.earth}18` : "transparent", color: filterFollowing ? T.earth : T.textSoft, fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>🔔 Following</button>}
          </div>
        )}
      </div>
      {/* Vibe tag filter row */}
      {vibeConfig.enabled && vibeConfig.items.length > 0 && (
        <div style={{ padding: "0.5rem 2rem 0", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: T.stoneL, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginRight: "2px" }}>Vibe:</span>
          {vibeConfig.items.map(vt => {
            const active = filterVibe.includes(vt.id);
            return (
              <button key={vt.id} onClick={() => toggleVibe(vt.id)}
                style={{ padding: "4px 11px", borderRadius: "100px", border: active ? `1px solid ${T.green1}` : `1px solid ${T.border}`, background: active ? T.green5 : "transparent", color: active ? T.green1 : T.textSoft, fontSize: "0.76rem", cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 700 : 400, display: "flex", alignItems: "center", gap: "4px", transition: "all 0.15s" }}>
                {vt.emoji} {vt.label}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ padding: "1rem 2rem 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ color: T.textSoft, fontSize: "0.85rem" }}>
          {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""} found
          {activeFilterCount > 0 && <span style={{ marginLeft: "8px", background: T.green1, color: "#fff", borderRadius: "100px", padding: "1px 8px", fontSize: "0.72rem", fontWeight: 700 }}>{activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active</span>}
        </div>
        {(search || activeFilterCount > 0) && <button onClick={clearAll} style={{ background: "none", border: `1px solid ${T.border}`, color: T.textSoft, borderRadius: "8px", padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: "0.78rem" }}>Clear all ✕</button>}
      </div>
      <div style={{ padding: "1rem 2rem 2rem" }}>
        {filteredEvents.length === 0
          ? <div style={{ textAlign: "center", padding: "4rem 0", color: T.stoneL }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔭</div>
            <div style={{ fontSize: "1.1rem", color: T.textMid }}>No events match your search</div>
            <button onClick={clearAll} style={{ marginTop: "1rem", background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "10px 20px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Clear filters</button>
          </div>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "22px" }}>{filteredEvents.map(ev => <EventCard key={ev.id} ev={ev} />)}</div>
        }
      </div>
      <CalendarView />
      <div style={{ padding: "0 2rem 2rem", maxWidth: "680px" }}>
        <ActivityFeedPanel />
      </div>
    </div>
  );
}

// ─── REVIEWS SECTION ──────────────────────────────────────────────────────────
function ReviewsSection({ ev }) {
  const { reviews, loadReviews, submitReview, deleteReview, currentUser, openAuth, myTickets } = useApp();
  const evReviews = reviews[ev.id] || [];
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [hoveredStar, setHoveredStar] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!loaded) { loadReviews(ev.id).catch(() => {}); setLoaded(true); } }, [ev.id]);

  const hasTicket = myTickets.some(t => t.eventId === ev.id);
  const alreadyReviewed = currentUser && evReviews.some(r => r.userId === currentUser.id);
  const avgRating = evReviews.length > 0 ? (evReviews.reduce((s, r) => s + r.rating, 0) / evReviews.length) : 0;

  const handleSubmit = async () => {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    await submitReview(ev.id, rating, body.trim()).catch(() => {});
    setBody(""); setRating(5); setShowForm(false); setSubmitting(false);
  };

  const stars = (n, interactive = false) => Array.from({ length: 5 }, (_, i) => (
    <span key={i}
      onClick={interactive ? () => setRating(i + 1) : undefined}
      onMouseEnter={interactive ? () => setHoveredStar(i + 1) : undefined}
      onMouseLeave={interactive ? () => setHoveredStar(0) : undefined}
      style={{ fontSize: interactive ? "1.6rem" : "0.95rem", cursor: interactive ? "pointer" : "default", color: i < (interactive ? (hoveredStar || rating) : n) ? "#F59E0B" : "#D1D5DB", transition: "color 0.1s" }}>★</span>
  ));

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.1rem", margin: "0 0 4px" }}>
            ⭐ Reviews {evReviews.length > 0 && <span style={{ color: T.stoneL, fontWeight: 400, fontSize: "0.9rem" }}>({evReviews.length})</span>}
          </h3>
          {evReviews.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {stars(Math.round(avgRating))}
              <span style={{ color: T.text, fontWeight: 700, fontSize: "0.9rem" }}>{avgRating.toFixed(1)}</span>
              <span style={{ color: T.stoneL, fontSize: "0.8rem" }}>out of 5</span>
            </div>
          )}
        </div>
        {!alreadyReviewed && (
          hasTicket
            ? <button onClick={() => { if (!currentUser) { openAuth("login"); return; } setShowForm(s => !s); }}
                style={{ background: showForm ? T.cream : `linear-gradient(135deg,${T.green1},${T.green2})`, color: showForm ? T.textMid : "#fff", border: `1px solid ${showForm ? T.border : "transparent"}`, borderRadius: "10px", padding: "9px 18px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.85rem" }}>
                {showForm ? "Cancel" : "✍️ Write a Review"}
              </button>
            : <div style={{ color: T.stoneL, fontSize: "0.8rem", fontStyle: "italic", maxWidth: "180px", textAlign: "right" }}>Register for this event to leave a review</div>
        )}
        {alreadyReviewed && <div style={{ background: T.green5, color: T.green1, borderRadius: "8px", padding: "6px 12px", fontSize: "0.78rem", fontWeight: 600 }}>✓ You've reviewed this event</div>}
      </div>

      {showForm && (
        <div style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "18px", marginBottom: "18px" }}>
          <div style={{ marginBottom: "14px" }}>
            <div style={{ color: T.textSoft, fontSize: "0.8rem", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Your Rating</div>
            <div style={{ display: "flex", gap: "2px" }}>{stars(rating, true)}</div>
          </div>
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Share your experience at this event…" rows={3}
            style={{ width: "100%", padding: "11px 13px", borderRadius: "10px", border: `1px solid ${T.border}`, background: "#fff", color: T.text, fontFamily: "inherit", fontSize: "0.88rem", resize: "vertical", boxSizing: "border-box", outline: "none", lineHeight: 1.6 }} />
          <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
            <button onClick={handleSubmit} disabled={!body.trim() || submitting}
              style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "9px", padding: "10px 22px", cursor: body.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", fontWeight: 700, opacity: body.trim() ? 1 : 0.6 }}>
              {submitting ? "Posting…" : "Post Review"}
            </button>
          </div>
        </div>
      )}

      {evReviews.length === 0
        ? <div style={{ color: T.stoneL, fontSize: "0.88rem", textAlign: "center", padding: "2rem 0" }}>No reviews yet &mdash; be the first to share your experience!</div>
        : <div style={{ display: "grid", gap: "12px" }}>
            {evReviews.map(r => (
              <div key={r.id} style={{ background: T.cream, borderRadius: "12px", padding: "14px 16px", border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: T.green3, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.75rem", flexShrink: 0 }}>
                      {(r.userName || "?").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ color: T.text, fontWeight: 700, fontSize: "0.88rem" }}>{r.userName}</div>
                      <div style={{ color: T.stoneL, fontSize: "0.72rem" }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {stars(r.rating)}
                    {currentUser?.id === r.userId && (
                      <button onClick={() => deleteReview(r.id, ev.id)} style={{ background: "none", border: "none", color: T.stoneL, cursor: "pointer", fontSize: "0.8rem", padding: "2px 6px", borderRadius: "5px" }}>✕</button>
                    )}
                  </div>
                </div>
                <p style={{ color: T.textMid, fontSize: "0.875rem", lineHeight: 1.65, margin: 0 }}>{r.text}</p>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ─── Q&A SECTION ──────────────────────────────────────────────────────────────
function QASection({ ev }) {
  const { qaItems, loadQA, submitQuestion, answerQuestion, deleteQuestion, currentUser, openAuth, dashUnlocked } = useApp();
  const evQA = qaItems[ev.id] || [];
  const [loaded, setLoaded] = useState(false);
  const [newQ, setNewQ] = useState("");
  const [answerFor, setAnswerFor] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!loaded) { loadQA(ev.id).catch(() => {}); setLoaded(true); } }, [ev.id]);

  const handleAsk = async () => {
    if (!newQ.trim() || submitting) return;
    if (!currentUser) { openAuth("login"); return; }
    setSubmitting(true);
    await submitQuestion(ev.id, newQ.trim()).catch(() => {});
    setNewQ(""); setSubmitting(false);
  };

  const handleAnswer = async (qaId) => {
    if (!answerText.trim()) return;
    await answerQuestion(qaId, ev.id, answerText.trim()).catch(() => {});
    setAnswerFor(null); setAnswerText("");
  };

  const answered = evQA.filter(q => q.answer);
  const unanswered = evQA.filter(q => !q.answer);

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "2rem" }}>
      <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.1rem", margin: "0 0 18px" }}>
        ❓ Q&amp;A {evQA.length > 0 && <span style={{ color: T.stoneL, fontWeight: 400, fontSize: "0.9rem" }}>({evQA.length})</span>}
      </h3>

      {/* Ask a question */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        <input value={newQ} onChange={e => setNewQ(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAsk()}
          placeholder={currentUser ? "Ask the organizer a question…" : "Sign in to ask a question"}
          disabled={!currentUser}
          style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", border: `1px solid ${T.border}`, background: currentUser ? T.cream : T.bg, color: T.text, fontFamily: "inherit", fontSize: "0.88rem", outline: "none", cursor: currentUser ? "text" : "not-allowed" }} />
        <button onClick={currentUser ? handleAsk : () => openAuth("login")} disabled={currentUser && !newQ.trim()}
          style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, whiteSpace: "nowrap", opacity: currentUser && !newQ.trim() ? 0.5 : 1 }}>
          {currentUser ? "Ask" : "Sign In"}
        </button>
      </div>

      {evQA.length === 0
        ? <div style={{ color: T.stoneL, fontSize: "0.88rem", textAlign: "center", padding: "1.5rem 0" }}>No questions yet &mdash; ask away!</div>
        : <div style={{ display: "grid", gap: "12px" }}>
            {[...unanswered, ...answered].map(q => (
              <div key={q.id} style={{ background: T.cream, borderRadius: "12px", padding: "14px 16px", border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: q.answer ? "12px" : "0" }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: T.gold, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.72rem", flexShrink: 0, marginTop: "2px" }}>Q</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: T.text, fontSize: "0.875rem", margin: "0 0 3px", fontWeight: 600, lineHeight: 1.5 }}>{q.question}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: T.stoneL, fontSize: "0.72rem" }}>{q.userName} · {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : ""}</span>
                      {dashUnlocked && !q.answer && (
                        <button onClick={() => { setAnswerFor(answerFor === q.id ? null : q.id); setAnswerText(""); }}
                          style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "6px", padding: "2px 8px", cursor: "pointer", fontSize: "0.72rem", fontFamily: "inherit", fontWeight: 600 }}>
                          {answerFor === q.id ? "Cancel" : "Answer"}
                        </button>
                      )}
                      {currentUser?.id === q.userId && (
                        <button onClick={() => deleteQuestion(q.id, ev.id)} style={{ background: "none", border: "none", color: T.stoneL, cursor: "pointer", fontSize: "0.75rem" }}>Remove</button>
                      )}
                    </div>
                  </div>
                </div>
                {q.answer && (
                  <div style={{ display: "flex", gap: "10px", background: `${T.green1}08`, borderRadius: "10px", padding: "11px 13px", borderLeft: `3px solid ${T.green1}` }}>
                    <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: T.green1, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.72rem", flexShrink: 0, marginTop: "1px" }}>A</div>
                    <p style={{ color: T.textMid, fontSize: "0.875rem", margin: 0, lineHeight: 1.6 }}>{q.answer}</p>
                  </div>
                )}
                {answerFor === q.id && dashUnlocked && (
                  <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                    <textarea value={answerText} onChange={e => setAnswerText(e.target.value)} placeholder="Type your answer…" rows={2}
                      style={{ flex: 1, padding: "9px 12px", borderRadius: "9px", border: `1px solid ${T.border}`, background: "#fff", fontFamily: "inherit", fontSize: "0.85rem", resize: "vertical", outline: "none" }} />
                    <button onClick={() => handleAnswer(q.id)}
                      style={{ background: T.green1, color: "#fff", border: "none", borderRadius: "9px", padding: "9px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, alignSelf: "flex-end" }}>Post</button>
                  </div>
                )}
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ─── DETAIL VIEW ──────────────────────────────────────────────────────────────
function DetailView() {
  const { selectedEvent, setView, setCartOpen, addToCart, openVendorModal, openAuth, isInCart, isReg, isOnWaitlist, joinWaitlist, leaveWaitlist, registerQty, setRegQty, currentUser, selectedTierId, setSelectedTierId, toggleInterest, getInterest, toggleFollow, following, copyReferralLink, showToast, vibeConfig, eventTypeConfig, categoryConfig, dashUnlocked } = useApp();
  const [privateInput, setPrivateInput] = React.useState("");
  const [privateUnlocked, setPrivateUnlocked] = React.useState(false);
  const [privateError, setPrivateError] = React.useState(false);
  const ev = selectedEvent;
  if (!ev) return null;

  // Check if this page was opened via an invite link token
  const urlToken = new URLSearchParams(window.location.search).get("invite");
  const tokenValid = ev.inviteToken && urlToken && ev.inviteToken === urlToken;

  // Private event gate — bypassed for admins and valid invite tokens
  if (ev.isPrivate && !tokenValid && !privateUnlocked && !dashUnlocked) {
    // If there's a password, show password form; if invite-only (no password), show locked message
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "18px", padding: "2.5rem", maxWidth: "420px", width: "100%", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
          <h2 style={{ color: T.text, fontFamily: "'Lora',serif", margin: "0 0 0.5rem" }}>Private Event</h2>
          {ev.privatePassword ? (
            <>
              <p style={{ color: T.textSoft, marginBottom: "1.5rem", fontSize: "0.9rem" }}>This event requires a password &mdash; or an invite link from the organizer.</p>
              <PasswordInput
                value={privateInput}
                onChange={e => { setPrivateInput(e.target.value); setPrivateError(false); }}
                onKeyDown={e => { if (e.key === "Enter") { if (privateInput === ev.privatePassword) setPrivateUnlocked(true); else setPrivateError(true); }}}
                placeholder="Enter event password"
                style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: `1px solid ${privateError ? T.warn : T.border}`, background: T.cream, fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit", marginBottom: "8px", outline: "none" }}
              />
              {privateError && <div style={{ color: T.warn, fontSize: "0.82rem", marginBottom: "8px" }}>⚠ Incorrect password</div>}
              <button onClick={() => { if (privateInput === ev.privatePassword) setPrivateUnlocked(true); else setPrivateError(true); }}
                style={{ width: "100%", padding: "12px", background: T.green1, color: "#fff", border: "none", borderRadius: "10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: "0.95rem" }}>
                Unlock Event
              </button>
            </>
          ) : (
            <p style={{ color: T.textSoft, marginBottom: "1.5rem", fontSize: "0.9rem", lineHeight: 1.7 }}>
              This is an invite-only event. You'll need a private invite link from the organizer to view this page.
            </p>
          )}
          <button onClick={() => setView("discover")} style={{ marginTop: "10px", background: "none", border: "none", color: T.textSoft, cursor: "pointer", fontFamily: "inherit", fontSize: "0.85rem" }}>← Back to Events</button>
        </div>
      </div>
    );
  }

  const registered = isReg(ev.id);
  const approvedVendors = (ev.vendors || []).filter(v => v.status === "approved");
  const tiers = ev.ticketTiers || [];
  const activeTierId = selectedTierId || tiers[0]?.id;
  const selectedTier = tiers.find(t => t.id === activeTierId) || tiers[0];
  const full = spotsLeft(ev) === 0;
  const onWaitlist = isOnWaitlist(ev.id);

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <PhotoCarousel photos={ev.photos} color={ev.color} />
      <div style={{ maxWidth: "980px", margin: "0 auto", padding: "2rem", display: "flex", flexWrap: "wrap", gap: "2rem", alignItems: "start" }}>
        {/* Main content */}
        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          <button onClick={() => { setView("discover"); window.scrollTo(0, 0); }} style={{ background: T.green5, border: `1px solid ${T.border}`, color: T.green1, borderRadius: "8px", padding: "8px 16px", cursor: "pointer", marginBottom: "1.5rem", fontFamily: "inherit", fontWeight: 600 }}>← Back to Events</button>
          <div style={{ display: "flex", gap: "8px", marginBottom: "1rem", flexWrap: "wrap" }}>
            {categoryConfig.enabled && <span style={{ background: ev.color, color: "#fff", borderRadius: "6px", padding: "4px 12px", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>{ev.category}</span>}
            {ev.online && <span style={{ background: T.green2, color: "#fff", borderRadius: "6px", padding: "4px 12px", fontSize: "0.75rem", fontWeight: 700 }}>Online</span>}
            {multiDay(ev) && <span style={{ background: T.earth, color: "#fff", borderRadius: "6px", padding: "4px 12px", fontSize: "0.75rem", fontWeight: 700 }}>Multi-Day</span>}
            {ev.vendorInvite && <span style={{ background: T.earth, color: "#fff", borderRadius: "6px", padding: "4px 12px", fontSize: "0.75rem", fontWeight: 700 }}>🛖 Vendors Welcome</span>}
            {eventTypeConfig.enabled && (ev.eventTypes || []).map(etid => { const et = eventTypeConfig.items.find(e => e.id === etid); return et ? <span key={etid} style={{ background: T.bgCard, border: `1px solid ${T.earth}55`, color: T.earth, borderRadius: "6px", padding: "4px 10px", fontSize: "0.75rem", fontWeight: 600 }}>{et.emoji} {et.label}</span> : null; })}
            {categoryConfig.enabled && (ev.tags || []).map(t => <span key={t} style={{ background: T.green5, color: T.green1, borderRadius: "6px", padding: "4px 10px", fontSize: "0.75rem" }}>#{t}</span>)}
            {vibeConfig.enabled && (ev.vibeTags || []).map(vid => { const vt = vibeConfig.items.find(v => v.id === vid) || VIBE_TAGS.find(v => v.id === vid); return vt ? <span key={vid} style={{ background: T.bgCard, border: `1px solid ${T.green3}`, color: T.green4, borderRadius: "100px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 600 }}>{vt.emoji} {vt.label}</span> : null; })}
          </div>
          <h1 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "clamp(1.8rem,4vw,2.5rem)", fontWeight: 700, margin: "0 0 1rem", lineHeight: 1.2 }}>{ev.title}</h1>
          {/* Recurring badge */}
          {ev.recurring && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "100px", padding: "4px 14px", fontSize: "0.78rem", color: T.green1, fontWeight: 600, marginBottom: "1rem" }}>
              🔁 {getRecurringDescription(ev)}
            </div>
          )}
          {/* Social action bar — interest, follow, share, calendar */}
          {(() => {
            const intr = getInterest(ev.id);
            const isGoing = currentUser && intr.going.includes(currentUser.id);
            const isInterested = currentUser && intr.interested.includes(currentUser.id);
            const isFollowing = following.has(ev.organizer);
            return (
              <div style={{ display: "flex", gap: "8px", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
                {currentUser && (
                  <>
                    <button onClick={() => toggleInterest(ev.id, "going")}
                      style={{ padding: "8px 14px", borderRadius: "8px", border: `1px solid ${isGoing ? T.green1 : T.border}`, background: isGoing ? T.green5 : "transparent", color: isGoing ? T.green1 : T.textSoft, fontFamily: "inherit", fontWeight: isGoing ? 700 : 400, fontSize: "0.82rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
                      ✅ Going {intr.going.length > 0 ? <span style={{ background: T.green1, color: "#fff", borderRadius: "100px", padding: "0px 6px", fontSize: "0.7rem" }}>{intr.going.length}</span> : ""}
                    </button>
                    <button onClick={() => toggleInterest(ev.id, "interested")}
                      style={{ padding: "8px 14px", borderRadius: "8px", border: `1px solid ${isInterested ? T.gold : T.border}`, background: isInterested ? "#FFF8E7" : "transparent", color: isInterested ? "#92400E" : T.textSoft, fontFamily: "inherit", fontWeight: isInterested ? 700 : 400, fontSize: "0.82rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
                      ⭐ Interested {intr.interested.length > 0 ? <span style={{ background: T.gold, color: "#fff", borderRadius: "100px", padding: "0px 6px", fontSize: "0.7rem" }}>{intr.interested.length}</span> : ""}
                    </button>
                    <button onClick={() => toggleFollow(ev.organizer)}
                      style={{ padding: "8px 14px", borderRadius: "8px", border: `1px solid ${isFollowing ? T.earth : T.border}`, background: isFollowing ? `${T.earth}15` : "transparent", color: isFollowing ? T.earth : T.textSoft, fontFamily: "inherit", fontWeight: isFollowing ? 700 : 400, fontSize: "0.82rem", cursor: "pointer" }}>
                      {isFollowing ? "🔔 Following" : "🔔 Follow"} {ev.organizer}
                    </button>
                  </>
                )}
                <AddToCalendar ev={ev} />
                <button onClick={() => copyReferralLink(ev.id)}
                  style={{ padding: "8px 14px", borderRadius: "8px", border: `1px solid ${T.border}`, background: "transparent", color: T.textSoft, fontFamily: "inherit", fontSize: "0.82rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
                  🔗 Share & Refer
                </button>
              </div>
            );
          })()}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: "14px", marginBottom: "2rem" }}>
            {[["📅 Dates & Time", multiDay(ev) ? `${fmt(ev.startDate)} &ndash;\n${fmt(ev.endDate)}\n${fmtTime(ev.time)} &ndash; ${fmtTime(ev.endTime)}` : `${fmt(ev.startDate)}\n${fmtTime(ev.time)} &ndash; ${fmtTime(ev.endTime)}`], ["📍 Location", ev.online ? "Online Event" : `${ev.location}${ev.address ? "\n" + ev.address : ""}`], ["👤 Organizer", ev.organizer]].map(([label, val]) => (
              <div key={label} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "14px" }}>
                <div style={{ color: T.stoneL, fontSize: "0.72rem", fontWeight: 700, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                <div style={{ color: T.textMid, fontSize: "0.875rem", whiteSpace: "pre-line", lineHeight: 1.5 }}>{val}</div>
              </div>
            ))}
          </div>
          {/* ── REGISTERED BANNER — shown above About when user is registered ── */}
          {registered && (
            <div style={{ marginBottom: "1.5rem" }}>
              <CountdownTimer ev={ev} />
              <div style={{ background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "12px", padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem" }}>✅</div>
                <div style={{ color: T.green1, fontWeight: 700, marginTop: "6px" }}>You're registered!</div>
                <div style={{ color: T.textSoft, fontSize: "0.8rem", marginTop: "4px" }}>See My Account for details & QR code</div>
              </div>
            </div>
          )}

          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "20px", marginBottom: "2rem" }}>
            <h3 style={{ color: T.text, margin: "0 0 10px", fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>About This Event</h3>
            <p style={{ color: T.textSoft, lineHeight: 1.75, margin: 0 }}>{ev.description}</p>
          </div>
          {ev.vendorInvite && (
            <div style={{ background: `linear-gradient(135deg,${T.earth}10,${T.earthL}20)`, border: `1px solid ${T.earthL}`, borderRadius: "16px", padding: "22px", marginBottom: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h3 style={{ color: T.earth, fontFamily: "'Lora',serif", fontSize: "1.15rem", margin: "0 0 4px" }}>🛖 Call for Vendors</h3>
                  <p style={{ color: T.textSoft, fontSize: "0.85rem", margin: 0 }}>We're inviting local vendors and makers to participate.</p>
                </div>
                <button onClick={() => openVendorModal(ev.id)} style={{ background: `linear-gradient(135deg,${T.earth},${T.earthL})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px 20px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.9rem" }}>Apply as Vendor</button>
              </div>
              {ev.vendorInfo && <div style={{ background: "rgba(255,255,255,0.65)", borderRadius: "10px", padding: "12px 14px", color: T.textMid, fontSize: "0.85rem", lineHeight: 1.65, marginBottom: "10px" }}>{ev.vendorInfo}</div>}
              {ev.vendorDeadline && <div style={{ color: T.earth, fontSize: "0.82rem", fontWeight: 600 }}>📅 Deadline: {fmt(ev.vendorDeadline)}</div>}
            </div>
          )}
          {ev.showVendors && approvedVendors.length > 0 && (
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "2rem" }}>
              <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.15rem", margin: "0 0 16px" }}>🌾 Participating Vendors ({approvedVendors.length})</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "12px" }}>
                {approvedVendors.map(v => (
                  <div key={v.id} style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "14px" }}>
                    <div style={{ color: T.text, fontWeight: 700, fontSize: "0.95rem", marginBottom: "4px", fontFamily: "'Lora',serif" }}>{v.businessName}</div>
                    <div style={{ display: "inline-block", background: T.green5, color: T.green1, borderRadius: "4px", padding: "2px 8px", fontSize: "0.7rem", fontWeight: 600, marginBottom: "6px" }}>{v.vendorType}</div>
                    <p style={{ color: T.textSoft, fontSize: "0.8rem", lineHeight: 1.5, margin: 0 }}>{v.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* ── REVIEWS & RATINGS — only shown the day after the event ends ── */}
          {isExpired(ev) && <ReviewsSection ev={ev} />}

          {/* ── COMMUNITY PHOTOS ── */}
          <EventPhotoGallery eventId={ev.id} />

          {/* ── MEMORY REEL (past events with 2+ photos) ── */}
          {isExpired(ev) && <MemoryReel eventId={ev.id} />}

          {/* ── Q&A ── */}
          <QASection ev={ev} />

        </div>

        {/* Sticky sidebar — ticket tiers + waitlist */}
        <div style={{ flex: "0 0 300px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "24px", position: "sticky", top: "80px", boxShadow: `0 4px 24px rgba(44,106,79,0.1)` }}>

          {/* ── TIER SELECTOR / QTY PICKERS ── */}
          {!registered && !full && (() => {
            const multiTier = tiers.length > 1;
            if (multiTier) {
              // Multi-tier: per-tier quantity steppers
              // Use local state via a small inner component trick — track qtys in selectedTierId-keyed object
              // We'll repurpose the existing selectedTierId state as a JSON map for multi-tier
              let tierQtys = {};
              try { tierQtys = selectedTierId && selectedTierId.startsWith("{") ? JSON.parse(selectedTierId) : {}; } catch { tierQtys = {}; }
              const setTierQty = (tierId, delta) => {
                const tier = tiers.find(t => t.id === tierId);
                const avail = Math.max(0, (tier?.capacity || 0) - (tier?.sold || 0));
                const cur = tierQtys[tierId] || 0;
                const next = Math.min(avail, Math.max(0, cur + delta));
                const updated = { ...tierQtys, [tierId]: next };
                if (next === 0) delete updated[tierId];
                setSelectedTierId(JSON.stringify(updated));
              };
              const totalQty = Object.values(tierQtys).reduce((s, q) => s + q, 0);
              const cartTotal = tiers.reduce((s, tier) => s + (tier.price * (tierQtys[tier.id] || 0)), 0);
              const anyInCart = tiers.some(tier => isInCart(ev.id, tier.id));

              return (
                <div style={{ marginBottom: "18px" }}>
                  <div style={{ color: T.stoneL, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Select Tickets</div>
                  <div style={{ display: "grid", gap: "10px", marginBottom: "16px" }}>
                    {tiers.map(tier => {
                      const avail = Math.max(0, (tier.capacity || 0) - (tier.sold || 0));
                      const tierFull = avail === 0;
                      const qty = tierQtys[tier.id] || 0;
                      const inCart = isInCart(ev.id, tier.id);
                      return (
                        <div key={tier.id} style={{ border: `2px solid ${qty > 0 ? T.green2 : inCart ? T.earth : T.border}`, borderRadius: "12px", padding: "12px 14px", background: qty > 0 ? `${T.green1}08` : inCart ? `${T.earth}08` : "#fff", opacity: tierFull ? 0.55 : 1, transition: "all 0.15s" }}>
                          {/* Tier name + price row */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: tier.description ? "4px" : "10px" }}>
                            <div>
                              <span style={{ color: T.text, fontWeight: 700, fontSize: "0.88rem" }}>{tier.name}</span>
                              {tierFull && <span style={{ marginLeft: "8px", background: "#FEE2E2", color: T.warn, borderRadius: "4px", padding: "1px 6px", fontSize: "0.65rem", fontWeight: 700 }}>SOLD OUT</span>}
                              {!tierFull && avail <= 5 && <span style={{ marginLeft: "8px", background: "#FEF3C7", color: "#92400E", borderRadius: "4px", padding: "1px 6px", fontSize: "0.65rem", fontWeight: 700 }}>Only {avail} left</span>}
                            </div>
                            <div style={{ color: tier.price === 0 ? T.green1 : T.text, fontWeight: 700, fontSize: "1rem", fontFamily: "'Lora',serif", flexShrink: 0, marginLeft: "8px" }}>
                              {tier.price === 0 ? "Free" : `$${tier.price}`}
                            </div>
                          </div>
                          {tier.description && <div style={{ color: T.textSoft, fontSize: "0.73rem", marginBottom: "10px" }}>{tier.description}</div>}
                          {/* Qty stepper or in-cart indicator */}
                          {inCart ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ background: `${T.earth}18`, color: T.earth, borderRadius: "7px", padding: "5px 12px", fontSize: "0.78rem", fontWeight: 700 }}>✓ In cart</span>
                              <button onClick={() => setCartOpen(true)} style={{ background: "none", border: "none", color: T.earth, cursor: "pointer", fontFamily: "inherit", fontSize: "0.75rem", textDecoration: "underline" }}>View cart</button>
                            </div>
                          ) : tierFull ? null : (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <button onClick={() => setTierQty(tier.id, -1)} disabled={qty === 0}
                                style={{ width: "30px", height: "30px", borderRadius: "7px", background: qty === 0 ? "#F3F4F6" : T.green5, border: `1px solid ${qty === 0 ? T.border : T.green3}`, color: qty === 0 ? T.stoneL : T.green1, cursor: qty === 0 ? "default" : "pointer", fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>−</button>
                              <span style={{ color: qty > 0 ? T.green1 : T.stoneL, fontWeight: 700, fontSize: "1rem", minWidth: "20px", textAlign: "center" }}>{qty}</span>
                              <button onClick={() => setTierQty(tier.id, 1)} disabled={qty >= avail}
                                style={{ width: "30px", height: "30px", borderRadius: "7px", background: qty >= avail ? "#F3F4F6" : T.green5, border: `1px solid ${qty >= avail ? T.border : T.green3}`, color: qty >= avail ? T.stoneL : T.green1, cursor: qty >= avail ? "default" : "pointer", fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
                              {qty > 0 && tier.price > 0 && (
                                <span style={{ color: T.earth, fontWeight: 700, fontSize: "0.82rem", marginLeft: "4px" }}>${(tier.price * qty).toFixed(2)}</span>
                              )}
                              {qty > 0 && tier.price === 0 && (
                                <span style={{ color: T.green1, fontWeight: 700, fontSize: "0.78rem", marginLeft: "4px" }}>Free ×{qty}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Order summary + Add to Cart */}
                  {totalQty > 0 && (
                    <div style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "12px 14px", marginBottom: "12px" }}>
                      <div style={{ color: T.stoneL, fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Order Summary</div>
                      {tiers.filter(t => (tierQtys[t.id] || 0) > 0).map(tier => (
                        <div key={tier.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "4px" }}>
                          <span style={{ color: T.textMid }}>{tier.name} × {tierQtys[tier.id]}</span>
                          <span style={{ color: T.textMid, fontWeight: 600 }}>{tier.price === 0 ? "Free" : `$${(tier.price * tierQtys[tier.id]).toFixed(2)}`}</span>
                        </div>
                      ))}
                      {cartTotal > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${T.border}`, marginTop: "8px", paddingTop: "8px" }}>
                          <span style={{ color: T.text, fontWeight: 700, fontSize: "0.85rem" }}>Total</span>
                          <span style={{ color: T.earth, fontWeight: 700, fontSize: "0.95rem" }}>${cartTotal.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {anyInCart && totalQty === 0 ? (
                    <button onClick={() => setCartOpen(true)} style={{ width: "100%", background: T.earth, color: "#fff", border: "none", borderRadius: "12px", padding: "14px", fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>View Cart 🛒</button>
                  ) : (
                    <button
                      onClick={() => {
                        if (totalQty === 0) return;
                        tiers.forEach(tier => {
                          const qty = tierQtys[tier.id] || 0;
                          if (qty > 0) addToCart(ev, qty, tier);
                        });
                        setSelectedTierId(null);
                      }}
                      disabled={totalQty === 0}
                      style={{ width: "100%", background: totalQty === 0 ? "#E5E7EB" : `linear-gradient(135deg,${T.green1},${T.green2})`, color: totalQty === 0 ? T.stoneL : "#fff", border: "none", borderRadius: "12px", padding: "14px", fontSize: "1rem", fontWeight: 700, cursor: totalQty === 0 ? "default" : "pointer", fontFamily: "inherit", boxShadow: totalQty > 0 ? `0 4px 18px ${T.green1}44` : "none", transition: "all 0.2s" }}>
                      {totalQty === 0 ? "Select tickets above" : cartTotal === 0 ? `Register Free 🌿` : `Add ${totalQty} ticket${totalQty !== 1 ? "s" : ""} to Cart 🛒`}
                    </button>
                  )}
                </div>
              );
            }

            // Single tier — original clean UI unchanged
            return (
              <div style={{ marginBottom: "18px" }}>
                <div style={{ color: T.stoneL, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Select Ticket Type</div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {tiers.map(tier => {
                    const isSel = activeTierId === tier.id;
                    const evFull = spotsLeft(ev) === 0;
                    return (
                      <div key={tier.id} onClick={() => { if (!evFull) { setSelectedTierId(tier.id); setRegQty(1); } }}
                        style={{ border: `2px solid ${isSel ? T.green2 : T.border}`, borderRadius: "12px", padding: "11px 14px", cursor: evFull ? "default" : "pointer", background: isSel ? `${T.green1}0A` : evFull ? T.bg : "#fff", opacity: evFull ? 0.55 : 1, transition: "all 0.15s" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              {isSel && !evFull && <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: T.green2 }} />}
                              <span style={{ color: T.text, fontWeight: 700, fontSize: "0.88rem" }}>{tier.name}</span>
                            </div>
                            {tier.description && <div style={{ color: T.textSoft, fontSize: "0.73rem", marginTop: "1px" }}>{tier.description}</div>}
                          </div>
                          <div style={{ color: tier.price === 0 ? T.green1 : T.text, fontWeight: 700, fontSize: "1.05rem", fontFamily: "'Lora',serif", flexShrink: 0, marginLeft: "8px" }}>
                            {tier.price === 0 ? "Free" : `$${tier.price}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Overall capacity bar */}
          {ev.showAttendanceBar !== false && (() => {
            const sp = spotsLeft(ev);
            const cap = totalCapacity(ev);
            const sold = totalSold(ev);
            const pct = cap > 0 ? Math.min(100, Math.round((sold / cap) * 100)) : 0;
            const almost = sp > 0 && sp <= 10;
            return (
              <div style={{ marginBottom: "18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                  <span style={{ color: T.stoneL, fontSize: "0.73rem" }}>{sold} registered</span>
                  <span style={{ color: full ? T.warn : almost ? "#D97706" : T.stoneL, fontSize: "0.73rem", fontWeight: full || almost ? 700 : 400 }}>
                    {full ? "SOLD OUT" : almost ? `⚠ Only ${sp} left!` : `${sp} of ${cap} available`}
                  </span>
                </div>
                <div style={{ height: "5px", background: T.border, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: pct >= 90 ? T.warn : pct >= 70 ? "#D97706" : T.green2, borderRadius: "3px" }} />
                </div>
              </div>
            );
          })()}

          {/* Quantity + CTA — only shown for single-tier events */}
          {registered ? null : full ? (
            <div>
              <button disabled style={{ width: "100%", background: "#E5E7EB", color: T.stoneL, border: "none", borderRadius: "12px", padding: "13px", fontSize: "1rem", cursor: "not-allowed", fontFamily: "inherit", marginBottom: "10px" }}>Sold Out</button>
              {onWaitlist ? (
                <div style={{ background: `${T.gold}18`, border: `1px solid ${T.gold}55`, borderRadius: "10px", padding: "12px 14px", textAlign: "center" }}>
                  <div style={{ color: "#7A5C00", fontWeight: 700, fontSize: "0.85rem" }}>🕐 You're on the waitlist</div>
                  <div style={{ color: T.textSoft, fontSize: "0.75rem", marginTop: "3px" }}>We'll notify you if a spot opens</div>
                  <button onClick={() => leaveWaitlist(ev.id)} style={{ marginTop: "8px", background: "none", border: "none", color: T.stoneL, cursor: "pointer", fontSize: "0.75rem", textDecoration: "underline", fontFamily: "inherit" }}>Leave waitlist</button>
                </div>
              ) : (
                <button onClick={() => joinWaitlist(ev.id)} style={{ width: "100%", background: `linear-gradient(135deg,${T.gold},#C8940F)`, color: "#fff", border: "none", borderRadius: "12px", padding: "13px", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  🔔 Join Waitlist
                </button>
              )}
            </div>
          ) : tiers.length === 1 ? (
            isInCart(ev.id, selectedTier?.id) ? (
              <button onClick={() => setCartOpen(true)} style={{ width: "100%", background: T.earth, color: "#fff", border: "none", borderRadius: "12px", padding: "14px", fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>In Cart — View Cart 🛒</button>
            ) : selectedTier ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                  <button onClick={() => setRegQty(q => Math.max(1, q - 1))} style={{ width: "34px", height: "34px", borderRadius: "8px", background: T.green5, border: `1px solid ${T.border}`, color: T.green1, cursor: "pointer", fontSize: "1.2rem", fontWeight: 700 }}>−</button>
                  <span style={{ color: T.text, fontWeight: 700, fontSize: "1.1rem", minWidth: "24px", textAlign: "center" }}>{registerQty}</span>
                  <button onClick={() => setRegQty(q => Math.min(Math.max(0, selectedTier.capacity - selectedTier.sold), q + 1))} style={{ width: "34px", height: "34px", borderRadius: "8px", background: T.green5, border: `1px solid ${T.border}`, color: T.green1, cursor: "pointer", fontSize: "1.2rem", fontWeight: 700 }}>+</button>
                  {selectedTier.price > 0 && <span style={{ color: T.earth, fontWeight: 700, fontSize: "0.9rem" }}>${(selectedTier.price * registerQty).toFixed(2)}</span>}
                </div>
                <button onClick={() => addToCart(ev, registerQty, selectedTier)} style={{ width: "100%", background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "12px", padding: "14px", fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 18px ${T.green1}44` }}>
                  {selectedTier.price === 0 ? "Register Free 🌿" : `Add to Cart 🛒`}
                </button>
              </div>
            ) : null
          ) : null}

          <div style={{ color: T.stoneL, fontSize: "0.72rem", textAlign: "center", marginTop: "12px" }}>Instant confirmation · No hidden fees</div>
          {!currentUser && !registered && (
            <div style={{ marginTop: "10px", background: T.cream, borderRadius: "8px", padding: "10px", textAlign: "center", fontSize: "0.78rem", color: T.textSoft }}>
              <button onClick={() => openAuth("login")} style={{ background: "none", border: "none", color: T.green1, cursor: "pointer", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: 700 }}>Sign in</button> to autofill checkout
            </div>
          )}

          {/* ── BRING A FRIEND ── */}
          <div style={{ marginTop: "16px", borderTop: `1px solid ${T.border}`, paddingTop: "16px" }}>
            <ReferralPanel eventId={ev.id} />
          </div>

          {/* ── NOTIFICATIONS ── */}
          <div style={{ marginTop: "12px" }}>
            <div style={{ color: T.stoneL, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Notifications</div>
            <NotifToggle eventId={ev.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT STEP ─────────────────────────────────────────────────────────────
function PaymentStep() {
  const { cart, cartTotal, checkoutInfo, setCheckoutStep, paymentForm, setPaymentForm, payMethod, setPayMethod, setPaypalLoaded, processing, setProcessing, setMyTickets, setEvents, setOrderComplete, setCart, showToast } = useApp();
  const [localCardName, setLocalCardName] = useState(paymentForm.cardName);
  const [localCardNum, setLocalCardNum] = useState(paymentForm.cardNum);
  const [localExpiry, setLocalExpiry] = useState(paymentForm.expiry);
  const [localCvv, setLocalCvv] = useState(paymentForm.cvv);
  const [paymentErrors, setPaymentErrors] = useState({});
  const [ppRendered, setPpRendered] = useState(false);
  const ppContainerRef = useRef(null);
  const syncCard = () => setPaymentForm({ cardName: localCardName, cardNum: localCardNum, expiry: localExpiry, cvv: localCvv });
  const renderPayPalButton = () => {
    if (ppRendered || !ppContainerRef.current) return;
    const container = ppContainerRef.current;
    container.innerHTML = "";
    if (!window.paypal) return;
    window.paypal.Buttons({
      style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal", height: 48 },
      createOrder: (data, actions) => actions.order.create({ purchase_units: [{ amount: { value: cartTotal.toFixed(2), currency_code: "USD" }, description: "New Harmony Life &mdash; Event Tickets" }] }),
      onApprove: (data, actions) => actions.order.capture().then(() => {
        setProcessing(true);
        setTimeout(() => {
          const orderNum = "NHL-PP-" + Math.random().toString(36).substr(2, 8).toUpperCase();
          const newTickets = cart.flatMap(item =>
            Array.from({ length: item.qty }, () => ({
              ticketId: genTicketId(),
              eventId: item.event.id, eventTitle: item.event.title,
              tierId: item.tier.id, tierName: item.tier.name,
              qty: 1, bookedOn: new Date().toLocaleDateString(),
              total: item.tier.price, orderNum,
              paymentMethod: "PayPal",
              buyerName: `${checkoutInfo.firstName} ${checkoutInfo.lastName}`,
              buyerEmail: checkoutInfo.email,
              status: "confirmed", checkedIn: false, checkinTime: null,
            }))
          );
          setMyTickets(prev => [...prev, ...newTickets]);
          setEvents(prev => prev.map(ev => {
            const ci = cart.find(i => i.event.id === ev.id);
            if (!ci) return ev;
            return {
              ...ev, registered: (ev.registered || 0) + ci.qty,
              ticketTiers: (ev.ticketTiers || []).map(tier =>
                tier.id === ci.tier.id ? { ...tier, sold: tier.sold + ci.qty } : tier
              ),
            };
          }));
          setOrderComplete({ orderNum, tickets: newTickets, total: cartTotal, buyer: checkoutInfo, paymentMethod: "PayPal" });
          setCart([]); setCheckoutStep(3); setProcessing(false);
        }, 1200);
      }),
      onError: err => { console.error("PayPal error", err); showToast("PayPal error &mdash; please try again", "warn"); },
    }).render(container);
    setPpRendered(true);
  };
  const loadPayPalSDK = () => {
    if (document.getElementById("paypal-sdk")) { renderPayPalButton(); return; }
    const s = document.createElement("script");
    s.id = "paypal-sdk";
    s.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD&intent=capture`;
    s.onload = () => { setPaypalLoaded(true); renderPayPalButton(); };
    document.head.appendChild(s);
  };
  const handleSelectPaypal = () => { setPayMethod("paypal"); syncCard(); setTimeout(loadPayPalSDK, 100); };
  const handleStripeSubmit = () => {
    syncCard();
    const e = {};
    if (!localCardName.trim()) e.cardName = "Name on card required";
    const digits = localCardNum.replace(/\s/g, "");
    if (digits.length < 15 || digits.length > 16 || isNaN(digits)) e.cardNum = "Valid card number required";
    if (!/^\d{2}\/\d{2}$/.test(localExpiry)) e.expiry = "Format: MM/YY";
    if (!/^\d{3,4}$/.test(localCvv)) e.cvv = "3-4 digits";
    setPaymentErrors(e);
    if (Object.keys(e).length > 0) return;
    setProcessing(true);
    setTimeout(() => {
      const orderNum = "NHL-STR-" + Math.random().toString(36).substr(2, 8).toUpperCase();
      const newTickets = cart.flatMap(item =>
        Array.from({ length: item.qty }, () => ({
          ticketId: genTicketId(),
          eventId: item.event.id, eventTitle: item.event.title,
          tierId: item.tier.id, tierName: item.tier.name,
          qty: 1, bookedOn: new Date().toLocaleDateString(),
          total: item.tier.price, orderNum,
          paymentMethod: "Stripe",
          buyerName: `${checkoutInfo.firstName} ${checkoutInfo.lastName}`,
          buyerEmail: checkoutInfo.email,
          status: "confirmed", checkedIn: false, checkinTime: null,
        }))
      );
      setMyTickets(prev => [...prev, ...newTickets]);
      setEvents(prev => prev.map(ev => {
        const ci = cart.find(i => i.event.id === ev.id);
        if (!ci) return ev;
        return { ...ev, registered: (ev.registered || 0) + ci.qty, ticketTiers: (ev.ticketTiers || []).map(tier => tier.id === ci.tier.id ? { ...tier, sold: tier.sold + ci.qty } : tier) };
      }));
      setOrderComplete({ orderNum, tickets: newTickets, total: cartTotal, buyer: checkoutInfo, paymentMethod: "Stripe" });
      setCart([]); setCheckoutStep(3); setProcessing(false);
    }, 1500);
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
        <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.25rem", margin: 0 }}>Payment</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: T.stoneL, fontSize: "0.78rem" }}><span>🔒</span><span>256-bit SSL</span></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "22px" }}>
        <button onClick={() => setPayMethod("stripe")} style={{ padding: "14px 12px", borderRadius: "12px", border: `2px solid ${payMethod === "stripe" ? T.green1 : T.border}`, background: payMethod === "stripe" ? T.green5 : "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: payMethod === "stripe" ? T.green1 : T.textSoft }}>💳 Credit / Debit Card</div>
        </button>
        <button onClick={handleSelectPaypal} style={{ padding: "14px 12px", borderRadius: "12px", border: `2px solid ${payMethod === "paypal" ? "#003087" : T.border}`, background: payMethod === "paypal" ? "#EEF7FD" : "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#003087" }}>🅿 PayPal</div>
        </button>
      </div>
      {payMethod === "stripe" && (
        <div style={{ display: "grid", gap: "14px" }}>
          <Field label="Name on Card *" error={paymentErrors.cardName}><input value={localCardName} onChange={e => setLocalCardName(e.target.value)} style={inp(paymentErrors.cardName)} placeholder="Full name as it appears on card" /></Field>
          <Field label="Card Number *" error={paymentErrors.cardNum}><input value={localCardNum} onChange={e => setLocalCardNum(e.target.value.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim())} maxLength={19} style={inp(paymentErrors.cardNum)} placeholder="1234 5678 9012 3456" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <Field label="Expiry *" error={paymentErrors.expiry}><input value={localExpiry} onChange={e => { let v = e.target.value.replace(/\D/g, ""); if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2, 4); setLocalExpiry(v); }} maxLength={5} style={inp(paymentErrors.expiry)} placeholder="MM/YY" /></Field>
            <Field label="CVV *" error={paymentErrors.cvv}><input value={localCvv} onChange={e => setLocalCvv(e.target.value.replace(/\D/g, ""))} maxLength={4} style={inp(paymentErrors.cvv)} placeholder="123" /></Field>
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
            <button onClick={() => setCheckoutStep(1)} style={{ background: T.green5, color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "12px 20px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>← Back</button>
            <button onClick={handleStripeSubmit} disabled={processing} style={{ flex: 1, background: processing ? "#9CA3AF" : `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "12px", padding: "14px", fontSize: "1rem", fontWeight: 700, cursor: processing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{processing ? "Processing…" : `Pay $${cartTotal.toFixed(2)}`}</button>
          </div>
        </div>
      )}
      {payMethod === "paypal" && (
        <div>
          <div ref={ppContainerRef} style={{ minHeight: "60px" }} />
          {processing && <div style={{ textAlign: "center", color: T.textSoft, padding: "1rem" }}>Confirming your order…</div>}
          <button onClick={() => setCheckoutStep(1)} style={{ background: T.green5, color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "12px 20px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, marginTop: "8px" }}>← Back</button>
        </div>
      )}
    </div>
  );
}

// ─── CHECKOUT VIEW ────────────────────────────────────────────────────────────
function CheckoutView() {
  const { cart, cartTotal, checkoutInfo, setCheckoutInfo, checkoutErrors, checkoutStep, setCheckoutStep, validateCheckoutInfo, completeOrder, orderComplete, setView, setCartOpen, currentUser, openAuth, events } = useApp();
  const [customAnswers, setCustomAnswers] = React.useState({});
  const onlyFree = cartTotal === 0;
  const steps = [{ n: 1, label: "Your Info" }, { n: 2, label: onlyFree ? "Confirm" : "Payment" }, { n: 3, label: "Done!" }];
  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "2rem" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        <button onClick={() => { if (checkoutStep === 1) { setView("discover"); setCartOpen(true); } else setCheckoutStep(s => s - 1); }} style={{ background: T.green5, border: `1px solid ${T.border}`, color: T.green1, borderRadius: "8px", padding: "8px 16px", cursor: "pointer", marginBottom: "2rem", fontFamily: "inherit", fontWeight: 600 }}>{checkoutStep === 1 ? "← Back to Cart" : "← Back"}</button>
        <h1 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "2rem", margin: "0 0 2rem" }}>Checkout</h1>
        <div style={{ display: "flex", alignItems: "center", marginBottom: "2.5rem" }}>
          {steps.map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "auto" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: checkoutStep > s.n ? T.green2 : checkoutStep === s.n ? T.green1 : "#D1D5DB", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.875rem", fontWeight: 700 }}>{checkoutStep > s.n ? "✓" : s.n}</div>
                <span style={{ fontSize: "0.72rem", color: checkoutStep >= s.n ? T.green1 : T.stoneL, fontWeight: checkoutStep === s.n ? 700 : 400, whiteSpace: "nowrap" }}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <div style={{ flex: 1, height: "2px", background: checkoutStep > s.n ? T.green2 : "#D1D5DB", margin: "0 8px", marginBottom: "18px" }} />}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "2rem", alignItems: "start" }}>
          <div>
            {checkoutStep === 1 && (
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
                  <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.25rem", margin: 0 }}>Attendee Information</h2>
                  {currentUser ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "6px 12px" }}>
                      <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: (currentUser.avatarColor || currentUser.avatar_color || "#40916C"), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700 }}>{initials(currentUser)}</div>
                      <span style={{ color: T.green1, fontSize: "0.8rem", fontWeight: 600 }}>✓ Autofilled from your account</span>
                    </div>
                  ) : (
                    <button onClick={() => openAuth("login")} style={{ background: "none", border: `1px solid ${T.green3}`, color: T.green1, borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>Sign in to autofill</button>
                  )}
                </div>
                <div style={{ display: "grid", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <Field label="First Name *" error={checkoutErrors.firstName}><input value={checkoutInfo.firstName} onChange={e => setCheckoutInfo({ ...checkoutInfo, firstName: e.target.value })} style={inp(checkoutErrors.firstName)} placeholder="Jane" /></Field>
                    <Field label="Last Name *" error={checkoutErrors.lastName}><input value={checkoutInfo.lastName} onChange={e => setCheckoutInfo({ ...checkoutInfo, lastName: e.target.value })} style={inp(checkoutErrors.lastName)} placeholder="Doe" /></Field>
                  </div>
                  <Field label="Email Address *" error={checkoutErrors.email}><input type="email" value={checkoutInfo.email} onChange={e => setCheckoutInfo({ ...checkoutInfo, email: e.target.value })} style={inp(checkoutErrors.email)} placeholder="you@example.com" /></Field>
                  <Field label="Phone Number *" error={checkoutErrors.phone}><input value={checkoutInfo.phone} onChange={e => setCheckoutInfo({ ...checkoutInfo, phone: fmtPhone(e.target.value) })} style={inp(checkoutErrors.phone)} placeholder="555-000-0000" maxLength={12} /></Field>
                  {!onlyFree && <>
                    <Field label="Street Address"><input value={checkoutInfo.address} onChange={e => setCheckoutInfo({ ...checkoutInfo, address: e.target.value })} style={inp()} placeholder="123 Main St (optional)" /></Field>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px" }}>
                      <Field label="City"><input value={checkoutInfo.city} onChange={e => setCheckoutInfo({ ...checkoutInfo, city: e.target.value })} style={inp()} placeholder="Moville" /></Field>
                      <Field label="State"><input value={checkoutInfo.state} onChange={e => setCheckoutInfo({ ...checkoutInfo, state: e.target.value })} style={inp()} placeholder="IA" /></Field>
                      <Field label="ZIP"><input value={checkoutInfo.zip} onChange={e => setCheckoutInfo({ ...checkoutInfo, zip: e.target.value })} style={inp()} placeholder="51039" /></Field>
                    </div>
                  </>}
                </div>
                {/* Custom registration questions */}
                {cart.some(item => item.event?.customQuestions?.length > 0) && (
                  <div style={{ marginTop: "20px", borderTop: `1px solid ${T.border}`, paddingTop: "20px" }}>
                    <h3 style={{ color: T.textMid, fontFamily: "'Lora',serif", fontSize: "1rem", margin: "0 0 14px" }}>Additional Information</h3>
                    {cart.flatMap(item => (item.event?.customQuestions || []).map(q => ({ ...q, eventTitle: item.event.title }))).filter((q,i,a) => a.findIndex(x=>x.id===q.id)===i).map(q => (
                      <div key={q.id} style={{ marginBottom: "14px" }}>
                        <Field label={`${q.label}${q.required ? " *" : ""}`}>
                          {q.type === "text" && <input value={customAnswers[q.id]||""} onChange={e => setCustomAnswers(a => ({...a,[q.id]:e.target.value}))} style={inp()} placeholder="Your answer..." />}
                          {q.type === "select" && (
                            <select value={customAnswers[q.id]||""} onChange={e => setCustomAnswers(a => ({...a,[q.id]:e.target.value}))} style={inp()}>
                              <option value="">Select an option...</option>
                              {(q.options||"").split(",").map(o => o.trim()).filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          )}
                          {q.type === "checkbox" && (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: T.cream, border: `1px solid ${T.border}`, borderRadius: "10px" }}>
                              <input type="checkbox" id={`qa-${q.id}`} checked={!!customAnswers[q.id]} onChange={e => setCustomAnswers(a => ({...a,[q.id]:e.target.checked}))} />
                              <label htmlFor={`qa-${q.id}`} style={{ color: T.textMid, fontSize: "0.9rem", cursor: "pointer" }}>{q.label}</label>
                            </div>
                          )}
                        </Field>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => { if (validateCheckoutInfo()) setCheckoutStep(2); }} style={{ width: "100%", marginTop: "20px", background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "12px", padding: "14px", fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Continue to {onlyFree ? "Confirm" : "Payment"} →</button>
              </div>
            )}
            {checkoutStep === 2 && (
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "24px" }}>
                {onlyFree ? (
                  <>
                    <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.25rem", margin: "0 0 1rem" }}>Confirm Registration</h2>
                    <div style={{ background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "12px", padding: "16px", marginBottom: "1.5rem" }}>
                      <div style={{ color: T.green1, fontWeight: 700, marginBottom: "4px" }}>🎉 All tickets in your cart are free!</div>
                      <div style={{ color: T.textSoft, fontSize: "0.85rem" }}>No payment needed &mdash; click below to confirm your registration.</div>
                    </div>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button onClick={() => setCheckoutStep(1)} style={{ background: T.green5, color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "12px 20px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>← Back</button>
                      <button onClick={completeOrder} style={{ flex: 1, background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "12px", padding: "14px", fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirm Registration 🌿</button>
                    </div>
                  </>
                ) : <PaymentStep />}
              </div>
            )}
            {checkoutStep === 3 && orderComplete && (
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "2rem", textAlign: "center" }}>
                <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎉</div>
                <h2 style={{ color: T.green1, fontFamily: "'Lora',serif", fontSize: "1.75rem", margin: "0 0 0.5rem" }}>{cartTotal === 0 ? "You're Registered!" : "Order Confirmed!"}</h2>
                <p style={{ color: T.textSoft, marginBottom: "1.5rem" }}>A confirmation has been sent to <strong>{orderComplete.buyer.email}</strong></p>
                <div style={{ background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "12px", padding: "16px", marginBottom: "1.5rem", textAlign: "left" }}>
                  <div style={{ color: T.stoneL, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Order Reference</div>
                  <div style={{ color: T.green1, fontSize: "1.4rem", fontWeight: 700, fontFamily: "'Lora',serif" }}>{orderComplete.orderNum}</div>
                </div>
                {/* Add to Calendar buttons for each event in order */}
                {[...new Map(orderComplete.tickets.map(t => [t.eventId, t])).values()].map(t => {
                  const ev = events.find(e => e.id === t.eventId);
                  if (!ev) return null;
                  return (
                    <a key={t.eventId} href={makeCalLinks(ev).google} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "10px", padding: "10px 18px", borderRadius: "10px", background: T.bgCard, border: `1px solid ${T.border}`, color: T.textMid, fontSize: "0.85rem", fontWeight: 600, textDecoration: "none" }}>
                      📅 Add "{ev.title}" to Google Calendar
                    </a>
                  );
                })}
                <div style={{ display: "grid", gap: "10px", marginBottom: "2rem", textAlign: "left" }}>
                  {orderComplete.tickets.map((t, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: T.cream, borderRadius: "10px", border: `1px solid ${T.border}` }}>
                      <div><div style={{ color: T.text, fontWeight: 700, fontSize: "0.9rem" }}>{t.eventTitle}</div><div style={{ color: T.stoneL, fontSize: "0.78rem" }}>{t.qty} ticket{t.qty > 1 ? "s" : ""}</div></div>
                      <div style={{ color: t.total === 0 ? T.green1 : T.earth, fontWeight: 700 }}>{t.total === 0 ? "Free" : `$${t.total.toFixed(2)}`}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                  <button onClick={() => setView("mytickets")} style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "10px", padding: "12px 22px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>View My Account</button>
                  <button onClick={() => setView("discover")} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px 22px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>Browse More Events</button>
                </div>
              </div>
            )}
          </div>
          {checkoutStep < 3 && (
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "20px", position: "sticky", top: "80px" }}>
              <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1rem", margin: "0 0 14px" }}>Order Summary</h3>
              <div style={{ display: "grid", gap: "10px", marginBottom: "14px" }}>
                {cart.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.text, fontSize: "0.82rem", fontWeight: 600, lineHeight: 1.3 }}>{item.event.title}</div>
                      <div style={{ color: T.green1, fontSize: "0.72rem", fontWeight: 600 }}>{item.tier.name}</div>
                      <div style={{ color: T.stoneL, fontSize: "0.72rem" }}>{item.qty} ticket{item.qty > 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ color: T.text, fontSize: "0.85rem", fontWeight: 700, flexShrink: 0 }}>{item.tier.price === 0 ? "Free" : `$${(item.tier.price * item.qty).toFixed(2)}`}</div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: "12px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.textSoft, fontWeight: 600 }}>Total</span>
                <span style={{ color: T.text, fontWeight: 700, fontSize: "1.1rem", fontFamily: "'Lora',serif" }}>{cartTotal === 0 ? "Free" : `$${cartTotal.toFixed(2)}`}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CREATE VIEW ──────────────────────────────────────────────────────────────
function CreateView() {
  const { form, setForm, formErrors, editingId, setEditingId, setView, handleSave, handlePhotoAdd, removePhoto, fileRef, dashUnlocked, categoryConfig, vibeConfig, eventTypeConfig } = useApp();
  const hasChanges = form.title.trim() || form.description.trim() || form.location.trim();

  // Warn on browser back/close too &mdash; must be before any early returns
  useEffect(() => {
    const handler = (e) => { if (hasChanges) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  // Access guard &mdash; only admins can create/edit events
  if (!dashUnlocked) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "20px", padding: "3rem", maxWidth: "380px", width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
          <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.4rem", margin: "0 0 0.75rem" }}>Admin Access Required</h2>
          <p style={{ color: T.textSoft, fontSize: "0.88rem", lineHeight: 1.6, margin: "0 0 1.5rem" }}>
            Creating and editing events is restricted to administrators. Please log in to the admin dashboard first.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <button onClick={() => setView("discover")} style={{ background: T.green5, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "10px 18px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>← Back</button>
            <button onClick={() => setView("dashlogin")} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px 20px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>Admin Login 🔒</button>
          </div>
        </div>
      </div>
    );
  }
  const confirmLeave = () => {
    if (hasChanges && !window.confirm("You have unsaved changes. Leave anyway?")) return false;
    return true;
  };
  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "2rem" }}>
      <div style={{ maxWidth: "840px", margin: "0 auto" }}>
        <button onClick={() => { if (confirmLeave()) { setView("discover"); setEditingId(null); } }} style={{ background: T.green5, border: `1px solid ${T.border}`, color: T.green1, borderRadius: "8px", padding: "8px 16px", cursor: "pointer", marginBottom: "2rem", fontFamily: "inherit", fontWeight: 600 }}>← Back</button>
        <h1 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "2rem", margin: "0 0 2rem" }}>{editingId ? "Edit Event" : "Create New Event"}</h1>
        <div style={{ display: "grid", gap: "22px" }}>
          <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "24px" }}>
            <h3 style={{ color: T.green1, margin: "0 0 18px", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Basic Information</h3>
            <div style={{ display: "grid", gap: "16px" }}>
              <Field label="Event Title *" error={formErrors.title}><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Give your event a meaningful name" style={inp(formErrors.title)} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <Field label="Category"><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inp()}>{(categoryConfig.items.length ? categoryConfig.items : CATEGORIES).map(c => <option key={c}>{c}</option>)}</select></Field>
                <Field label="Accent Color">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 14px", background: T.cream, border: `1px solid ${T.border}`, borderRadius: "10px" }}>
                    <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ width: "44px", height: "32px", border: "none", borderRadius: "6px", cursor: "pointer", padding: 0 }} />
                    <span style={{ color: T.textSoft, fontSize: "0.85rem" }}>{form.color}</span>
                  </div>
                </Field>
              </div>
              <Field label="Description"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} style={{ ...inp(), resize: "vertical", fontFamily: "inherit" }} placeholder="Tell people what makes this event special…" /></Field>
              <Field label="Tags (comma-separated)"><input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="outdoor, family, free" style={inp()} /></Field>
            </div>
          </section>
          <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "24px" }}>
            <h3 style={{ color: T.green1, margin: "0 0 4px", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Photos</h3>
            <p style={{ color: T.textSoft, fontSize: "0.8rem", margin: "0 0 16px", lineHeight: 1.5 }}>The first photo becomes the event banner shown on the detail page and event card. Add up to 8 photos.</p>

            {/* Banner preview */}
            {(form.photos || []).length > 0 ? (
              <div style={{ position: "relative", width: "100%", height: "200px", borderRadius: "12px", overflow: "hidden", marginBottom: "14px", border: `2px solid ${T.green3}` }}>
                <img src={form.photos[0]} alt="Event banner" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", top: "10px", left: "10px", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", color: "#fff", fontSize: "0.7rem", fontWeight: 700, borderRadius: "6px", padding: "3px 10px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  🖼️ Banner Photo
                </div>
              </div>
            ) : (
              <div style={{ width: "100%", height: "160px", borderRadius: "12px", border: `2px dashed ${T.green3}`, background: T.green5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "14px", cursor: "pointer" }}
                onClick={() => fileRef.current.click()}>
                <span style={{ fontSize: "2.2rem" }}>🖼️</span>
                <span style={{ color: T.green1, fontWeight: 600, fontSize: "0.85rem" }}>Add a banner photo</span>
                <span style={{ color: T.stoneL, fontSize: "0.75rem" }}>The first photo appears as the event banner</span>
              </div>
            )}

            {/* Thumbnail strip */}
            {(form.photos || []).length > 0 && (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                {(form.photos || []).map((p, i) => (
                  <div key={i} style={{ position: "relative", width: "80px", height: "62px", flexShrink: 0 }}>
                    <img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px", border: i === 0 ? `2px solid ${T.green2}` : `2px solid ${T.border}` }} />
                    {/* Set as banner button — only show on non-first photos */}
                    {i > 0 && (
                      <button
                        title="Set as banner"
                        onClick={() => setForm(f => { const photos = [...f.photos]; const [moved] = photos.splice(i, 1); photos.unshift(moved); return { ...f, photos }; })}
                        style={{ position: "absolute", bottom: "-6px", left: "50%", transform: "translateX(-50%)", background: T.green1, border: "none", color: "#fff", borderRadius: "5px", padding: "2px 6px", cursor: "pointer", fontSize: "0.58rem", fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>
                        Set banner
                      </button>
                    )}
                    {i === 0 && (
                      <div style={{ position: "absolute", bottom: "-6px", left: "50%", transform: "translateX(-50%)", background: T.green2, color: "#fff", borderRadius: "5px", padding: "2px 6px", fontSize: "0.58rem", fontWeight: 700, whiteSpace: "nowrap" }}>
                        Banner
                      </div>
                    )}
                    <button onClick={() => removePhoto(i)} style={{ position: "absolute", top: "-6px", right: "-6px", width: "18px", height: "18px", borderRadius: "50%", background: T.warn, border: "none", color: "#fff", cursor: "pointer", fontSize: "0.65rem", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>✕</button>
                  </div>
                ))}
                {(form.photos || []).length < 8 && (
                  <button onClick={() => fileRef.current.click()} style={{ width: "80px", height: "62px", borderRadius: "8px", border: `2px dashed ${T.green3}`, background: T.green5, color: T.green1, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", fontSize: "1.4rem", flexShrink: 0 }}>+</button>
                )}
              </div>
            )}

            {(form.photos || []).length === 0 && (
              <button onClick={() => fileRef.current.click()} style={{ width: "100%", background: T.green5, border: `1px solid ${T.green3}`, color: T.green1, borderRadius: "10px", padding: "10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.85rem" }}>
                + Add Photos
              </button>
            )}
            <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={e => handlePhotoAdd(e.target.files)} />
          </section>
          <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "24px" }}>
            <h3 style={{ color: T.green1, margin: "0 0 18px", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Dates, Time & Location</h3>
            <div style={{ display: "grid", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <Field label="Start Date *" error={formErrors.startDate}><input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value, endDate: form.endDate || e.target.value })} style={inp(formErrors.startDate)} /></Field>
                <Field label="End Date" error={formErrors.endDate}><input type="date" value={form.endDate} min={form.startDate} onChange={e => setForm({ ...form, endDate: e.target.value })} style={inp(formErrors.endDate)} /></Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <Field label="Daily Start Time"><input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} style={inp()} /></Field>
                <Field label="Daily End Time"><input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} style={inp()} /></Field>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: T.green5, borderRadius: "10px", border: `1px solid ${T.border}`, cursor: "pointer" }}>
                <input type="checkbox" checked={form.online} onChange={e => setForm({ ...form, online: e.target.checked })} style={{ width: "18px", height: "18px", accentColor: T.green1 }} />
                <span style={{ color: T.textMid, fontSize: "0.9rem" }}>This is an online / virtual event</span>
              </label>
              {!form.online && <>
                <Field label="Venue / Location *" error={formErrors.location}><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Venue name" style={inp(formErrors.location)} /></Field>
                <Field label="Full Address"><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, City, State" style={inp()} /></Field>
              </>}
            </div>
          </section>
          <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "24px" }}>
            <h3 style={{ color: T.green1, margin: "0 0 4px", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Tickets & Capacity</h3>
            <p style={{ color: T.textSoft, fontSize: "0.8rem", margin: "0 0 20px", lineHeight: 1.5 }}>Set one total capacity for the event &mdash; this is the maximum number of attendees across all ticket types combined. Then add one or more pricing tiers (e.g. Early Bird, General, VIP).</p>
            <div style={{ display: "grid", gap: "16px" }}>

              {/* ── Single total capacity ── */}
              <Field label="Total Event Capacity *" error={formErrors.capacity}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="number" min="1"
                    value={form.capacity}
                    onChange={e => setForm({ ...form, capacity: e.target.value })}
                    placeholder="e.g. 200"
                    style={{ ...inp(formErrors.capacity), maxWidth: "160px" }}
                  />
                  <span style={{ color: T.textSoft, fontSize: "0.82rem" }}>total seats available (shared across all tiers)</span>
                </div>
              </Field>

              {/* ── Ticket tiers ── */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div>
                    <label style={{ color: T.textSoft, fontSize: "0.82rem", fontWeight: 600 }}>Pricing Tiers</label>
                    <div style={{ color: T.stoneL, fontSize: "0.74rem", marginTop: "1px" }}>Each tier shares the total capacity above &mdash; any mix of ticket types can be sold up to that limit.</div>
                  </div>
                  <button type="button" onClick={() => setForm(f => ({ ...f, ticketTiers: [...(f.ticketTiers || []), { id: "t" + Date.now(), name: "", price: 0, capacity: parseInt(f.capacity) || 50, sold: 0, description: "" }] }))} style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem", flexShrink: 0, marginLeft: "12px" }}>+ Add Tier</button>
                </div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {(form.ticketTiers || []).map((tier, idx) => (
                    <div key={tier.id} style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "14px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                        <Field label="Tier Name">
                          <input
                            placeholder="e.g. Early Bird, General Admission, VIP"
                            value={tier.name}
                            onChange={e => setForm(f => ({ ...f, ticketTiers: f.ticketTiers.map((t, i) => i === idx ? { ...t, name: e.target.value } : t) }))}
                            style={{ ...inp(), fontSize: "0.85rem" }}
                          />
                        </Field>
                        <Field label="Ticket Price">
                          <div style={{ position: "relative" }}>
                            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: T.textSoft, fontSize: "0.88rem", fontWeight: 600, pointerEvents: "none" }}>$</span>
                            <input
                              type="number" min="0" step="0.01"
                              placeholder="0.00"
                              value={tier.price}
                              onChange={e => setForm(f => ({ ...f, ticketTiers: f.ticketTiers.map((t, i) => i === idx ? { ...t, price: parseFloat(e.target.value) || 0 } : t) }))}
                              style={{ ...inp(), fontSize: "0.85rem", paddingLeft: "26px" }}
                            />
                          </div>
                          {tier.price === 0 && <div style={{ color: T.green1, fontSize: "0.7rem", marginTop: "3px", fontWeight: 600 }}>Free admission</div>}
                        </Field>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <Field label="Short Description (optional)" style={{ flex: 1 }}>
                          <input
                            placeholder="e.g. Full 3-day access, Single day entry…"
                            value={tier.description}
                            onChange={e => setForm(f => ({ ...f, ticketTiers: f.ticketTiers.map((t, i) => i === idx ? { ...t, description: e.target.value } : t) }))}
                            style={{ ...inp(), fontSize: "0.82rem" }}
                          />
                        </Field>
                        {(form.ticketTiers || []).length > 1 && (
                          <button type="button" onClick={() => setForm(f => ({ ...f, ticketTiers: f.ticketTiers.filter((_, i) => i !== idx) }))} style={{ background: "#FEE2E2", color: T.warn, border: "none", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.8rem", flexShrink: 0, alignSelf: "flex-end", marginBottom: "1px" }}>✕ Remove</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Field label="Organizer Name *" error={formErrors.organizer}><input value={form.organizer} onChange={e => setForm({ ...form, organizer: e.target.value })} placeholder="Your name or organization" style={inp(formErrors.organizer)} /></Field>
            </div>
          </section>
          <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.vendorInvite ? "20px" : "0", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h3 style={{ color: T.earth, margin: "0 0 4px", fontSize: "1rem", fontWeight: 700 }}>🛖 Vendor / Farmers Market Participation</h3>
                <p style={{ color: T.textSoft, fontSize: "0.85rem", margin: 0 }}>Enable a public call-for-vendors application form</p>
              </div>
              <div onClick={() => setForm({ ...form, vendorInvite: !form.vendorInvite })} style={{ width: "52px", height: "28px", borderRadius: "14px", background: form.vendorInvite ? T.earth : "#D1D5DB", cursor: "pointer", position: "relative", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: "4px", left: form.vendorInvite ? "28px" : "4px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
            {form.vendorInvite && (
              <div style={{ display: "grid", gap: "16px", borderTop: `1px solid ${T.border}`, paddingTop: "18px" }}>
                <Field label="Vendor Invitation Message"><textarea value={form.vendorInfo} onChange={e => setForm({ ...form, vendorInfo: e.target.value })} rows={3} placeholder="Describe what types of vendors you're looking for…" style={{ ...inp(), resize: "vertical", fontFamily: "inherit" }} /></Field>
                <Field label="Application Deadline"><input type="date" value={form.vendorDeadline} onChange={e => setForm({ ...form, vendorDeadline: e.target.value })} style={inp()} /></Field>
                <div style={{ background: `${T.gold}10`, border: `1px solid ${T.gold}55`, borderRadius: "12px", padding: "16px" }}>
                  <div style={{ color: "#7A5C00", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>💰 Event Profit Sharing</div>
                  <Field label="Sales Arrangement">
                    <select value={form.profitModel} onChange={e => setForm({ ...form, profitModel: e.target.value })} style={inp()}>
                      <option value="vendor-keeps">Vendor Keeps All Profits</option>
                      <option value="sharing">Profit Sharing (host takes a percentage)</option>
                    </select>
                  </Field>
                  {form.profitModel === "sharing" && (
                    <div style={{ marginTop: "14px", display: "grid", gap: "12px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", alignItems: "end" }}>
                        <Field label="Host / Organizer Cut (%)">
                          <input type="number" min="1" max="99" value={form.hostPct} onChange={e => setForm({ ...form, hostPct: Math.min(99, Math.max(1, parseInt(e.target.value) || 1)) })} style={inp()} />
                        </Field>
                        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "11px 14px" }}>
                          <div style={{ color: T.stoneL, fontSize: "0.72rem", marginBottom: "4px" }}>Vendor Keeps</div>
                          <div style={{ color: T.green1, fontWeight: 700, fontSize: "1.2rem" }}>{100 - form.hostPct}%</div>
                        </div>
                      </div>
                      <div style={{ height: "10px", borderRadius: "5px", overflow: "hidden", display: "flex" }}>
                        <div style={{ width: `${form.hostPct}%`, background: `linear-gradient(90deg,${T.earth},${T.earthL})` }} />
                        <div style={{ flex: 1, background: `linear-gradient(90deg,${T.green3},${T.green4})` }} />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: `${T.earth}10`, border: `1px solid ${T.earthL}`, borderRadius: "10px", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <div style={{ color: T.earth, fontWeight: 700, fontSize: "0.9rem", marginBottom: "2px" }}>Display Approved Vendors on Event Page</div>
                    <div style={{ color: T.textSoft, fontSize: "0.8rem" }}>Show a public "Participating Vendors" section once approved</div>
                  </div>
                  <div onClick={() => setForm({ ...form, showVendors: !form.showVendors })} style={{ width: "52px", height: "28px", borderRadius: "14px", background: form.showVendors ? T.green1 : "#D1D5DB", cursor: "pointer", position: "relative", flexShrink: 0 }}>
                    <div style={{ position: "absolute", top: "4px", left: form.showVendors ? "28px" : "4px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                  </div>
                </div>
              </div>
            )}
          </section>
          {/* ── EVENT TYPE SECTION ── */}
          {eventTypeConfig.enabled && eventTypeConfig.items.length > 0 && (
            <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "20px" }}>
              <h3 style={{ color: T.text, margin: "0 0 6px", fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>🏷️ Event Type</h3>
              <p style={{ color: T.textSoft, fontSize: "0.83rem", margin: "0 0 16px", lineHeight: 1.55 }}>Select all that describe this event. These help guests know what to expect.</p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {eventTypeConfig.items.map(et => {
                  const active = (form.eventTypes || []).includes(et.id);
                  return (
                    <button key={et.id} type="button"
                      onClick={() => setForm(f => ({ ...f, eventTypes: active ? (f.eventTypes||[]).filter(v => v !== et.id) : [...(f.eventTypes||[]), et.id] }))}
                      style={{ padding: "7px 14px", borderRadius: "100px", border: active ? `2px solid ${T.earth}` : `1px solid ${T.border}`, background: active ? `${T.earthL}22` : "transparent", color: active ? T.earth : T.textSoft, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 700 : 400, display: "flex", alignItems: "center", gap: "5px", transition: "all 0.15s" }}>
                      {et.emoji} {et.label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {/* ── VIBE TAGS SECTION ── */}
          {vibeConfig.items.length > 0 && (
            <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "20px" }}>
              <h3 style={{ color: T.text, margin: "0 0 6px", fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>✨ Vibe Tags</h3>
              <p style={{ color: T.textSoft, fontSize: "0.83rem", margin: "0 0 16px", lineHeight: 1.55 }}>Help guests find events that match their style. Select all that apply.</p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {vibeConfig.items.map(vt => {
                  const active = (form.vibeTags || []).includes(vt.id);
                  return (
                    <button key={vt.id} type="button"
                      onClick={() => setForm(f => ({ ...f, vibeTags: active ? (f.vibeTags||[]).filter(v => v !== vt.id) : [...(f.vibeTags||[]), vt.id] }))}
                      style={{ padding: "7px 14px", borderRadius: "100px", border: active ? `2px solid ${T.green1}` : `1px solid ${T.border}`, background: active ? T.green5 : "transparent", color: active ? T.green1 : T.textSoft, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 700 : 400, display: "flex", alignItems: "center", gap: "5px", transition: "all 0.15s" }}>
                      {vt.emoji} {vt.label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {/* ── REFUND POLICY SECTION ── */}
          <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "20px" }}>
            <h3 style={{ color: T.text, margin: "0 0 6px", fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>💸 Refund Policy</h3>
            <p style={{ color: T.textSoft, fontSize: "0.83rem", margin: "0 0 16px", lineHeight: 1.55 }}>Choose what happens when an attendee cancels their ticket.</p>
            <div style={{ display: "grid", gap: "10px" }}>
              {[
                { value: "none", emoji: "☀️", label: "Rain or Shine &mdash; No Refunds", desc: "All sales are final. No refunds under any circumstances." },
                { value: "partial", emoji: "♻️", label: "Partial Refund Window", desc: "Refunds allowed up to a set number of days before the event." },
                { value: "full", emoji: "✅", label: "Full Refund Window", desc: "Full refund allowed up to a set number of days before the event." },
              ].map(opt => (
                <div key={opt.value} onClick={() => setForm({ ...form, refundPolicy: opt.value })}
                  style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", background: form.refundPolicy === opt.value ? `${T.green1}12` : T.cream, border: `2px solid ${form.refundPolicy === opt.value ? T.green1 : T.border}`, borderRadius: "12px", cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ fontSize: "1.4rem", flexShrink: 0 }}>{opt.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: form.refundPolicy === opt.value ? T.green1 : T.text, fontWeight: 700, fontSize: "0.9rem", marginBottom: "2px" }}>{opt.label}</div>
                    <div style={{ color: T.textSoft, fontSize: "0.8rem" }}>{opt.desc}</div>
                  </div>
                  <div style={{ width: "20px", height: "20px", borderRadius: "50%", border: `2px solid ${form.refundPolicy === opt.value ? T.green1 : T.border}`, background: form.refundPolicy === opt.value ? T.green1 : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {form.refundPolicy === opt.value && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#fff" }} />}
                  </div>
                </div>
              ))}
            </div>
            {(form.refundPolicy === "partial" || form.refundPolicy === "full") && (
              <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${T.border}` }}>
                <Field label="Refund window &mdash; days before event">
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <input type="number" min="1" max="90" value={form.refundDeadlineDays} onChange={e => setForm({ ...form, refundDeadlineDays: Math.max(1, parseInt(e.target.value) || 1) })} style={{ ...inp(), width: "90px" }} />
                    <span style={{ color: T.textSoft, fontSize: "0.85rem" }}>days before the event start date</span>
                  </div>
                </Field>
                <div style={{ marginTop: "10px", background: `${T.green1}10`, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "10px 14px", fontSize: "0.8rem", color: T.green1 }}>
                  {form.refundPolicy === "full" ? "✅" : "♻️"} Attendees can cancel and receive a {form.refundPolicy === "full" ? "full" : "partial"} refund up to <strong>{form.refundDeadlineDays} day{form.refundDeadlineDays !== 1 ? "s" : ""}</strong> before the event.
                </div>
              </div>
            )}
          </section>

          {/* ── VISIBILITY & PRIVACY SECTION ── */}
          <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "20px" }}>
            <h3 style={{ color: T.text, margin: "0 0 16px", fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>🔐 Visibility & Privacy</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: T.cream, border: `1px solid ${T.border}`, borderRadius: "10px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ color: T.textMid, fontWeight: 700, fontSize: "0.9rem", marginBottom: "2px" }}>Public Event</div>
                  <div style={{ color: T.textSoft, fontSize: "0.8rem" }}>Visible to all visitors (logged in or not)</div>
                </div>
                <div onClick={() => setForm({ ...form, isPublic: !form.isPublic })} style={{ width: "52px", height: "28px", borderRadius: "14px", background: form.isPublic !== false ? T.green1 : "#D1D5DB", cursor: "pointer", position: "relative", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: "4px", left: form.isPublic !== false ? "28px" : "4px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: T.cream, border: `1px solid ${T.border}`, borderRadius: "10px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ color: T.textMid, fontWeight: 700, fontSize: "0.9rem", marginBottom: "2px" }}>🔒 Password Protected</div>
                  <div style={{ color: T.textSoft, fontSize: "0.8rem" }}>Require a password to view details or buy tickets</div>
                </div>
                <div onClick={() => setForm({ ...form, isPrivate: !form.isPrivate })} style={{ width: "52px", height: "28px", borderRadius: "14px", background: form.isPrivate ? T.green1 : "#D1D5DB", cursor: "pointer", position: "relative", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: "4px", left: form.isPrivate ? "28px" : "4px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: T.cream, border: `1px solid ${T.border}`, borderRadius: "10px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ color: T.textMid, fontWeight: 700, fontSize: "0.9rem", marginBottom: "2px" }}>📊 Show Attendance Bar</div>
                  <div style={{ color: T.textSoft, fontSize: "0.8rem" }}>Display registered count &amp; remaining seats on event cards</div>
                </div>
                <div onClick={() => setForm({ ...form, showAttendanceBar: form.showAttendanceBar === false ? true : false })} style={{ width: "52px", height: "28px", borderRadius: "14px", background: form.showAttendanceBar !== false ? T.green1 : "#D1D5DB", cursor: "pointer", position: "relative", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: "4px", left: form.showAttendanceBar !== false ? "28px" : "4px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                </div>
              </div>
              {form.isPrivate && (
                <div style={{ paddingLeft: "8px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <Field label="Event Password (optional)" error={formErrors.privatePassword}>
                    <input value={form.privatePassword || ""} onChange={e => setForm({ ...form, privatePassword: e.target.value })} placeholder="Leave blank for invite-link only" style={inp(formErrors.privatePassword)} />
                  </Field>
                  {form.inviteToken ? (
                    <div style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "12px 14px" }}>
                      <div style={{ color: T.textSoft, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>🔗 Invite Link</div>
                      <div style={{ color: T.textMid, fontSize: "0.78rem", wordBreak: "break-all", marginBottom: "8px", fontFamily: "monospace" }}>
                        {`${window.location.href.split("?")[0].split("#")[0]}?invite=${form.inviteToken}`}
                      </div>
                      <button type="button" onClick={async () => {
                        const link = `${window.location.href.split("?")[0].split("#")[0]}?invite=${form.inviteToken}`;
                        try { await navigator.clipboard.writeText(link); alert("Invite link copied!"); } catch { alert("Link: " + link); }
                      }} style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "7px", padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.78rem" }}>
                        Copy Link
                      </button>
                    </div>
                  ) : (
                    <div style={{ color: T.stoneL, fontSize: "0.78rem", padding: "8px 12px", background: T.cream, borderRadius: "8px" }}>
                      💡 An invite link will be generated automatically when you save this event.
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ── RECURRING EVENT SECTION ── */}
          <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "20px" }}>
            <h3 style={{ color: T.text, margin: "0 0 16px", fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>🔁 Recurring Schedule</h3>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: T.cream, border: `1px solid ${T.border}`, borderRadius: "10px", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={{ color: T.textMid, fontWeight: 700, fontSize: "0.9rem", marginBottom: "2px" }}>This is a recurring event</div>
                <div style={{ color: T.textSoft, fontSize: "0.8rem" }}>Repeats on a regular schedule</div>
              </div>
              <div onClick={() => setForm({ ...form, recurring: !form.recurring })} style={{ width: "52px", height: "28px", borderRadius: "14px", background: form.recurring ? T.green1 : "#D1D5DB", cursor: "pointer", position: "relative", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: "4px", left: form.recurring ? "28px" : "4px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
            {form.recurring && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <Field label="Repeat Pattern">
                  <select value={form.recurringType || "weekly"} onChange={e => setForm({ ...form, recurringType: e.target.value })} style={inp()}>
                    <option value="weekly">Weekly &mdash; same day each week</option>
                    <option value="monthly-date">Monthly &mdash; same date each month (e.g. 15th)</option>
                    <option value="monthly-position">Monthly &mdash; same position (e.g. 3rd Friday)</option>
                  </select>
                </Field>
                {form.recurringType === "weekly" && (
                  <Field label="Day of Week">
                    <select value={form.recurringDay || "0"} onChange={e => setForm({ ...form, recurringDay: e.target.value })} style={inp()}>
                      {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d,i) => <option key={i} value={String(i)}>{d}</option>)}
                    </select>
                  </Field>
                )}
                {form.recurringType === "monthly-date" && (
                  <Field label="Day of Month">
                    <select value={form.recurringMonthDate || "1"} onChange={e => setForm({ ...form, recurringMonthDate: e.target.value })} style={inp()}>
                      {Array.from({length:28},(_,i)=>i+1).map(d => <option key={d} value={String(d)}>{d}{d===1||d===21?"st":d===2||d===22?"nd":d===3||d===23?"rd":"th"}</option>)}
                    </select>
                  </Field>
                )}
                {form.recurringType === "monthly-position" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <Field label="Week">
                      <select value={form.recurringWeekNum || "1"} onChange={e => setForm({ ...form, recurringWeekNum: e.target.value })} style={inp()}>
                        {["1st","2nd","3rd","4th","5th"].map((w,i) => <option key={i} value={String(i+1)}>{w}</option>)}
                      </select>
                    </Field>
                    <Field label="Day">
                      <select value={form.recurringWeekDay || "5"} onChange={e => setForm({ ...form, recurringWeekDay: e.target.value })} style={inp()}>
                        {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d,i) => <option key={i} value={String(i)}>{d}</option>)}
                      </select>
                    </Field>
                  </div>
                )}
                {form.recurringType === "monthly-position" && (
                  <div style={{ background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "10px 14px", fontSize: "0.82rem", color: T.green1, fontWeight: 600 }}>
                    🔁 {["1st","2nd","3rd","4th","5th"][parseInt(form.recurringWeekNum||1)-1]} {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][parseInt(form.recurringWeekDay||5)]} of each month
                  </div>
                )}
                <Field label="Repeat Until (optional)">
                  <input type="date" value={form.recurringEndDate || ""} onChange={e => setForm({ ...form, recurringEndDate: e.target.value })} style={inp()} />
                </Field>
              </div>
            )}
          </section>

          {/* ── CUSTOM REGISTRATION QUESTIONS ── */}
          <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <h3 style={{ color: T.text, margin: 0, fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>📋 Custom Registration Questions</h3>
              <button onClick={() => setForm({ ...form, customQuestions: [...(form.customQuestions||[]), { id: Date.now().toString(), label: "", type: "text", options: "", required: false }] })}
                style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem" }}>
                + Add Question
              </button>
            </div>
            {(!form.customQuestions || form.customQuestions.length === 0) && (
              <div style={{ color: T.textSoft, fontSize: "0.85rem", textAlign: "center", padding: "20px 0" }}>No custom questions yet. Add questions to collect info from attendees at checkout.</div>
            )}
            {(form.customQuestions || []).map((q, qi) => (
              <div key={q.id} style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "16px", marginBottom: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", marginBottom: "10px", alignItems: "start" }}>
                  <Field label={`Question ${qi+1}`}>
                    <input value={q.label} onChange={e => { const qs=[...form.customQuestions]; qs[qi]={...qs[qi],label:e.target.value}; setForm({...form,customQuestions:qs}); }} placeholder="e.g. Dietary restrictions, T-shirt size..." style={inp()} />
                  </Field>
                  <button onClick={() => { const qs=form.customQuestions.filter((_,i)=>i!==qi); setForm({...form,customQuestions:qs}); }}
                    style={{ marginTop: "22px", background: "#FEE2E2", border: "none", color: T.warn, borderRadius: "8px", padding: "8px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✕</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <Field label="Answer Type">
                    <select value={q.type} onChange={e => { const qs=[...form.customQuestions]; qs[qi]={...qs[qi],type:e.target.value}; setForm({...form,customQuestions:qs}); }} style={inp()}>
                      <option value="text">Short text</option>
                      <option value="select">Dropdown choices</option>
                      <option value="checkbox">Yes / No checkbox</option>
                    </select>
                  </Field>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "22px" }}>
                    <input type="checkbox" id={`req-${q.id}`} checked={q.required||false} onChange={e => { const qs=[...form.customQuestions]; qs[qi]={...qs[qi],required:e.target.checked}; setForm({...form,customQuestions:qs}); }} />
                    <label htmlFor={`req-${q.id}`} style={{ color: T.textMid, fontSize: "0.85rem", cursor: "pointer" }}>Required</label>
                  </div>
                </div>
                {q.type === "select" && (
                  <Field label="Options (comma-separated)">
                    <input value={q.options||""} onChange={e => { const qs=[...form.customQuestions]; qs[qi]={...qs[qi],options:e.target.value}; setForm({...form,customQuestions:qs}); }} placeholder="e.g. Vegetarian, Vegan, Gluten-free, None" style={inp()} />
                  </Field>
                )}
              </div>
            ))}
          </section>

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", paddingBottom: "2rem" }}>
            <button onClick={() => { if (confirmLeave()) { setView("discover"); setEditingId(null); } }} style={{ background: T.green5, color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "12px 24px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
            <button onClick={handleSave} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px 32px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "1rem" }}>{editingId ? "Save Changes" : "Publish Event 🌿"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MY TICKETS VIEW ──────────────────────────────────────────────────────────
function MyTicketsView() {
  const { myTickets, events, currentUser, setView, openAuth, setSelectedId, cancelTicket, showToast, updateProfile, handleLogout, interests, getInterest, following, toggleFollow, referralStats, computeBadges, BADGE_DEFS } = useApp();
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [scanModal, setScanModal] = useState(null); // ticket object for full-screen QR view
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ firstName: "", lastName: "", phone: "", city: "", state: "" });
  const [activeTab, setActiveTab] = useState("tickets");

  useEffect(() => {
    if (currentUser) {
      setProfileForm({
        firstName: currentUser.firstName || currentUser.first_name || "",
        lastName: currentUser.lastName || currentUser.last_name || "",
        phone: currentUser.phone || "",
        city: currentUser.city || "",
        state: currentUser.state || "",
        emailOptIn: currentUser.email_opt_in !== false,
      });
    }
  }, [currentUser]);

  const activeTickets = myTickets.filter(t => t.status !== "cancelled");
  const cancelledTickets = myTickets.filter(t => t.status === "cancelled");
  const uid = currentUser?.id;
  const savedEvents = uid ? events.filter(e => {
    const intr = getInterest(e.id);
    return intr.going.includes(uid) || intr.interested.includes(uid);
  }) : [];
  const followedOrganizers = [...following];
  const earnedBadges = computeBadges(myTickets, referralStats);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "2rem" }}>
      <div style={{ maxWidth: "780px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px" }}>
          <h1 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "2rem", margin: 0 }}>My Account</h1>
        </div>

        {!currentUser && (
          <div style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "16px", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ color: T.textMid, fontSize: "0.9rem" }}>Sign in to see your tickets across devices</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => openAuth("login")} style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.85rem" }}>Sign In</button>
              <button onClick={() => openAuth("signup")} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.85rem" }}>Create Account</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "1.5rem", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "5px", overflowX: "auto" }} className="hide-scrollbar">
          {[["tickets", "🎟️ My Account", activeTickets.length], ["badges", "🏅 Badges", earnedBadges.length], ["activity", "🌊 Activity", null], ["saved", "❤️ Saved", savedEvents.length], ["following", "🔔 Following", followedOrganizers.length]].map(([id, label, count]) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{ flex: "0 0 auto", padding: "9px 12px", borderRadius: "9px", border: "none", background: activeTab === id ? `linear-gradient(135deg,${T.green1},${T.green2})` : "transparent", color: activeTab === id ? "#fff" : T.textSoft, fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", whiteSpace: "nowrap" }}>
              {label}{count != null && count > 0 && <span style={{ background: activeTab === id ? "rgba(255,255,255,0.25)" : T.green5, color: activeTab === id ? "#fff" : T.green1, borderRadius: "100px", padding: "1px 7px", fontSize: "0.72rem" }}>{count}</span>}
            </button>
          ))}
        </div>

        {/* Profile card with inline edit */}
        {currentUser && (
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "20px 24px", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: editingProfile ? "16px" : "0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: (currentUser.avatarColor || currentUser.avatar_color || "#40916C"), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 700, flexShrink: 0 }}>{initials(currentUser)}</div>
                <div>
                  <div style={{ color: T.text, fontWeight: 700, fontSize: "1rem" }}>{currentUser.firstName || currentUser.first_name || ""} {currentUser.lastName || currentUser.last_name || ""}</div>
                  <div style={{ color: T.textSoft, fontSize: "0.78rem" }}>{currentUser.email}</div>
                  {(currentUser.city || currentUser.phone) && (
                    <div style={{ color: T.stoneL, fontSize: "0.75rem", marginTop: "2px" }}>
                      {currentUser.phone && <span>📞 {currentUser.phone}</span>}
                      {currentUser.phone && (currentUser.city || currentUser.state) && <span style={{ margin: "0 6px" }}>·</span>}
                      {(currentUser.city || currentUser.state) && <span>📍 {[currentUser.city, currentUser.state].filter(Boolean).join(", ")}</span>}
                    </div>
                  )}
                  <div style={{ marginTop: "4px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: currentUser.email_opt_in !== false ? T.green5 : T.cream, color: currentUser.email_opt_in !== false ? T.green1 : T.stoneL, border: `1px solid ${currentUser.email_opt_in !== false ? T.green3 : T.border}`, borderRadius: "100px", padding: "2px 9px", fontSize: "0.7rem", fontWeight: 600 }}>
                      {currentUser.email_opt_in !== false ? "📬 Event emails on" : "🔕 Event emails off"}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setEditingProfile(!editingProfile)} style={{ background: editingProfile ? T.cream : T.green5, color: editingProfile ? T.textSoft : T.green1, border: `1px solid ${editingProfile ? T.border : T.green3}`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>
                  {editingProfile ? "✕ Cancel" : "✏️ Edit Profile"}
                </button>
                <button onClick={handleLogout} style={{ background: "#FEF2F2", color: T.warn, border: `1px solid #FECACA`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>Sign Out</button>
              </div>
            </div>
            {editingProfile && (
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", marginBottom: "14px" }}>
                  <Field label="First Name">
                    <input value={profileForm.firstName} onChange={e => setProfileForm(f => ({ ...f, firstName: e.target.value }))} style={inp()} />
                  </Field>
                  <Field label="Last Name">
                    <input value={profileForm.lastName} onChange={e => setProfileForm(f => ({ ...f, lastName: e.target.value }))} style={inp()} />
                  </Field>
                  <Field label="Phone">
                    <input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: fmtPhone(e.target.value) }))} placeholder="712-555-0000" style={inp()} maxLength={12} />
                  </Field>
                  <Field label="City">
                    <input value={profileForm.city} onChange={e => setProfileForm(f => ({ ...f, city: e.target.value }))} placeholder="Moville" style={inp()} />
                  </Field>
                  <Field label="State">
                    <input value={profileForm.state} onChange={e => setProfileForm(f => ({ ...f, state: e.target.value }))} placeholder="IA" style={inp()} />
                  </Field>
                </div>
                {/* Email opt-in toggle */}
                <div onClick={() => setProfileForm(f => ({ ...f, emailOptIn: !f.emailOptIn }))}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: profileForm.emailOptIn ? `${T.green1}08` : T.cream, border: `1px solid ${profileForm.emailOptIn ? T.green3 : T.border}`, borderRadius: "10px", padding: "12px 14px", cursor: "pointer", userSelect: "none", marginBottom: "14px", transition: "all 0.15s" }}>
                  <div>
                    <div style={{ color: T.textMid, fontWeight: 600, fontSize: "0.85rem" }}>📬 Notify me about upcoming events</div>
                    <div style={{ color: T.stoneL, fontSize: "0.75rem", marginTop: "1px" }}>Receive occasional emails about New Harmony Life events &amp; community news</div>
                  </div>
                  <div style={{ width: "44px", height: "24px", borderRadius: "12px", background: profileForm.emailOptIn ? T.green1 : "#D1D5DB", flexShrink: 0, marginLeft: "12px", position: "relative", transition: "background 0.2s" }}>
                    <div style={{ position: "absolute", top: "3px", left: profileForm.emailOptIn ? "23px" : "3px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </div>
                </div>
                <button onClick={async () => { await updateProfile(profileForm); setEditingProfile(false); }}
                  style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px 24px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.9rem" }}>
                  Save Changes ✓
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── FULL-SCREEN TICKET SCAN MODAL ── */}
        {scanModal && (() => {
          const ev = events.find(e => e.id === scanModal.eventId);
          return (
            <div onClick={() => setScanModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
              <div onClick={e => e.stopPropagation()} style={{ background: T.bgDeep, borderRadius: "24px", padding: "2rem 2rem 1.75rem", width: "100%", maxWidth: "360px", display: "flex", flexDirection: "column", alignItems: "center", gap: "0", boxShadow: "0 30px 80px rgba(0,0,0,0.6)", border: `1px solid rgba(116,198,157,0.2)` }}>
                {/* Header */}
                <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                  <div>
                    <div style={{ color: "#fff", fontFamily: "'Lora',serif", fontWeight: 700, fontSize: "1.05rem", lineHeight: 1.2 }}>{scanModal.eventTitle}</div>
                    <div style={{ color: T.green3, fontSize: "0.78rem", fontWeight: 600, marginTop: "2px" }}>{scanModal.tierName}</div>
                  </div>
                  <button onClick={() => setScanModal(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: "34px", height: "34px", cursor: "pointer", color: "#fff", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
                </div>

                {/* Large QR Code */}
                <div style={{ background: "#fff", borderRadius: "16px", padding: "16px", marginBottom: "1rem", boxShadow: "0 0 0 6px rgba(116,198,157,0.15)" }}>
                  <QRCode value={scanModal.ticketId} size={220} />
                </div>

                {/* Scan label */}
                <div style={{ color: T.green3, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1.25rem" }}>📲 Present for scanning at entry</div>

                {/* Ticket details */}
                <div style={{ width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: "12px", padding: "14px 16px", marginBottom: "1rem" }}>
                  <div style={{ display: "grid", gap: "7px" }}>
                    {[
                      ["Ticket ID", scanModal.ticketId],
                      ["Attendee", scanModal.buyerName],
                      ["Qty", `${scanModal.qty} ticket${scanModal.qty > 1 ? "s" : ""}`],
                      ...(ev ? [["Date", dateRange(ev)], ["Location", ev.location]] : []),
                    ].map(([label, val]) => (
                      <div key={label} style={{ display: "flex", gap: "10px", fontSize: "0.78rem" }}>
                        <span style={{ color: T.stoneL, fontWeight: 600, minWidth: "70px", flexShrink: 0 }}>{label}</span>
                        <span style={{ color: "#fff", wordBreak: "break-all" }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Status badges */}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                  <div style={{ background: T.green1, border: `1px solid ${T.green2}`, borderRadius: "8px", padding: "7px 18px", color: "#fff", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.04em" }}>
                    ✓ CONFIRMED
                  </div>
                  <div style={{ background: scanModal.checkedIn ? T.green2 : "#C0392B", border: `1px solid ${scanModal.checkedIn ? T.green3 : "#E74C3C"}`, borderRadius: "8px", padding: "7px 18px", color: "#fff", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.04em" }}>
                    {scanModal.checkedIn ? `✔ Checked In${scanModal.checkinTime ? "  ·  " + scanModal.checkinTime : ""}` : "✗ Not Checked In"}
                  </div>
                </div>

                <button onClick={() => setScanModal(null)} style={{ marginTop: "1.25rem", background: "none", border: "none", color: T.stoneL, cursor: "pointer", fontSize: "0.82rem", fontFamily: "inherit" }}>
                  ← Back to My Account
                </button>
              </div>
            </div>
          );
        })()}

        {cancelConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
            <div style={{ background: T.bgCard, borderRadius: "16px", padding: "2rem", maxWidth: "400px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
              <div style={{ fontSize: "2.5rem", textAlign: "center", marginBottom: "1rem" }}>⚠️</div>
              <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.2rem", margin: "0 0 0.75rem", textAlign: "center" }}>Cancel this ticket?</h3>
              <p style={{ color: T.textSoft, fontSize: "0.88rem", textAlign: "center", margin: "0 0 1rem", lineHeight: 1.6 }}>
                <strong>{cancelConfirm.tierName}</strong> × {cancelConfirm.qty} for <em>{cancelConfirm.eventTitle}</em>.
              </p>
              {(() => {
                const ev = events.find(e => e.id === cancelConfirm.eventId);
                const policy = ev?.refundPolicy || "none";
                const days = ev?.refundDeadlineDays ?? 7;
                const daysUntil = ev?.startDate ? Math.ceil((new Date(ev.startDate) - new Date()) / (1000*60*60*24)) : 999;
                const inWindow = daysUntil >= days;
                if (cancelConfirm.total === 0) return (
                  <div style={{ background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "10px", padding: "12px 14px", marginBottom: "1.25rem", fontSize: "0.83rem", color: T.green1, textAlign: "center" }}>
                    🎟️ Free ticket &mdash; no refund needed. Registration will be removed.
                  </div>
                );
                if (policy === "none") return (
                  <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "10px", padding: "12px 14px", marginBottom: "1.25rem", fontSize: "0.83rem", color: "#92400E", textAlign: "center" }}>
                    ☀️ <strong>Rain or Shine &mdash; No Refunds.</strong> This ticket is non-refundable per event policy.
                  </div>
                );
                if (policy === "full") return (
                  <div style={{ background: inWindow ? T.green5 : "#FEF3C7", border: `1px solid ${inWindow ? T.green3 : "#FDE68A"}`, borderRadius: "10px", padding: "12px 14px", marginBottom: "1.25rem", fontSize: "0.83rem", color: inWindow ? T.green1 : "#92400E", textAlign: "center" }}>
                    {inWindow ? `✅ Full refund eligible &mdash; more than ${days} days until the event.` : `⏰ Refund window closed &mdash; less than ${days} days until the event.`}
                  </div>
                );
                if (policy === "partial") return (
                  <div style={{ background: inWindow ? T.green5 : "#FEF3C7", border: `1px solid ${inWindow ? T.green3 : "#FDE68A"}`, borderRadius: "10px", padding: "12px 14px", marginBottom: "1.25rem", fontSize: "0.83rem", color: inWindow ? T.green1 : "#92400E", textAlign: "center" }}>
                    {inWindow ? `♻️ Partial refund eligible &mdash; more than ${days} days until the event.` : `⏰ Refund window closed &mdash; less than ${days} days until the event.`}
                  </div>
                );
              })()}
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => setCancelConfirm(null)} style={{ flex: 1, background: T.green5, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Keep Ticket</button>
                <button onClick={() => { cancelTicket(cancelConfirm.ticketId); setCancelConfirm(null); }} style={{ flex: 1, background: "#FEE2E2", color: T.warn, border: `1px solid #FECACA`, borderRadius: "10px", padding: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>Yes, Cancel</button>
              </div>
            </div>
          </div>
        )}

        {activeTickets.length === 0 ? (
          <div style={{ textAlign: "center", padding: "5rem 0", color: T.stoneL, display: activeTab === "tickets" ? "block" : "none" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎟️</div>
            <div style={{ fontSize: "1.1rem", color: T.textMid, marginBottom: "0.5rem" }}>No tickets yet</div>
            <div style={{ marginBottom: "1.5rem" }}>Register for an event to see your tickets here</div>
            <button onClick={() => setView("discover")} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px 24px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Browse Events →</button>
          </div>
        ) : (
          <div style={{ display: activeTab === "tickets" ? "grid" : "none", gap: "16px" }}>
            {activeTickets.map((ticket) => {
              const ev = events.find(e => e.id === ticket.eventId);
              // Determine if Cancel button should be shown based on refund policy
              const policy = ev?.refundPolicy || "none";
              const days = ev?.refundDeadlineDays ?? 7;
              const daysUntil = ev?.startDate ? Math.ceil((new Date(ev.startDate) - new Date()) / (1000*60*60*24)) : 999;
              const inRefundWindow = daysUntil >= days;
              const showCancel = policy === "full" || policy === "partial" ? inRefundWindow : false;
              return (
                <div key={ticket.ticketId} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                  {/* Ticket header */}
                  <div style={{ display: "flex" }}>
                    <div style={{ width: "8px", background: ev?.color || T.green1, flexShrink: 0 }} />
                    <div style={{ padding: "18px 20px", flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                      <div style={{ flex: 1, minWidth: "180px" }}>
                        <div style={{ color: T.text, fontWeight: 700, fontSize: "1.05rem", fontFamily: "'Lora',serif", marginBottom: "3px" }}>{ticket.eventTitle}</div>
                        <div style={{ color: T.green1, fontSize: "0.78rem", fontWeight: 600, marginBottom: "2px" }}>{ticket.tierName}</div>
                        {ev && <div style={{ color: T.textSoft, fontSize: "0.8rem" }}>{dateRange(ev)} · {fmtTime(ev.time)}</div>}
                        {ev && <div style={{ color: T.textSoft, fontSize: "0.8rem" }}>📍 {ev.location}</div>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                        {/* Confirmed badge &mdash; always green */}
                        <div style={{ background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "6px", padding: "3px 10px", color: T.green1, fontSize: "0.72rem", fontWeight: 700 }}>
                          ✓ CONFIRMED
                        </div>
                        {/* Check-in badge &mdash; red if not checked in, green if checked in */}
                        <div style={{ background: ticket.checkedIn ? T.green1 : "#FEE2E2", border: `1px solid ${ticket.checkedIn ? T.green2 : "#FECACA"}`, borderRadius: "6px", padding: "3px 10px", color: ticket.checkedIn ? "#fff" : T.warn, fontSize: "0.72rem", fontWeight: 700 }}>
                          {ticket.checkedIn ? `✔ Checked In${ticket.checkinTime ? "  ·  " + ticket.checkinTime : ""}` : "✗ Not Checked In"}
                        </div>
                        <div style={{ color: T.textSoft, fontSize: "0.78rem" }}>{ticket.qty} ticket{ticket.qty > 1 ? "s" : ""} · {ticket.total === 0 ? "Free" : `$${ticket.total.toFixed(2)}`}</div>
                      </div>
                    </div>
                  </div>

                  {/* QR code + details &mdash; always visible */}
                  <div style={{ borderTop: `1px dashed ${T.border}`, padding: "20px 24px", background: T.cream, display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" }}>
                    {/* QR Code */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <div style={{ background: "#fff", border: `2px solid ${T.border}`, borderRadius: "12px", padding: "12px" }}>
                        <QRCode value={ticket.ticketId} size={100} />
                      </div>
                      <div style={{ color: T.stoneL, fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.08em", textAlign: "center" }}>SCAN AT ENTRY</div>
                    </div>

                    {/* Ticket details */}
                    <div style={{ flex: 1, minWidth: "180px" }}>
                      <div style={{ display: "grid", gap: "6px", marginBottom: "14px" }}>
                        {[["Ticket ID", ticket.ticketId], ["Order", ticket.orderNum], ["Booked", ticket.bookedOn], ["Attendee", ticket.buyerName], ["Email", ticket.buyerEmail]].map(([label, val]) => (
                          <div key={label} style={{ display: "flex", gap: "8px", fontSize: "0.78rem" }}>
                            <span style={{ color: T.stoneL, fontWeight: 600, minWidth: "60px" }}>{label}</span>
                            <span style={{ color: T.textMid, wordBreak: "break-all" }}>{val}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {/* Tap to View Ticket button */}
                        <button onClick={() => setScanModal(ticket)}
                          onMouseEnter={e => { e.currentTarget.style.background = `linear-gradient(135deg,${T.green2},${T.green3})`; }}
                          onMouseLeave={e => { e.currentTarget.style.background = `linear-gradient(135deg,${T.green1},${T.green2})`; }}
                          style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "6px" }}>
                          🎟️ Tap to View Ticket
                        </button>
                        {ev && (
                          <button onClick={() => { setSelectedId(ev.id); setView("detail"); }} style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem" }}>View Event →</button>
                        )}
                        {showCancel && (
                          <button onClick={() => setCancelConfirm(ticket)} style={{ background: "#FEF2F2", color: T.warn, border: `1px solid #FECACA`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem" }}>Cancel Ticket</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Cancelled tickets section */}
            {cancelledTickets.length > 0 && (
              <div style={{ marginTop: "8px" }}>
                <div style={{ color: T.stoneL, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Cancelled</div>
                {cancelledTickets.map((ticket) => (
                  <div key={ticket.ticketId} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.55, marginBottom: "8px" }}>
                    <div>
                      <div style={{ color: T.text, fontWeight: 600, fontSize: "0.88rem" }}>{ticket.eventTitle}</div>
                      <div style={{ color: T.stoneL, fontSize: "0.75rem" }}>{ticket.tierName} · {ticket.qty} ticket{ticket.qty > 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ background: "#FEE2E2", color: T.warn, borderRadius: "6px", padding: "3px 10px", fontSize: "0.7rem", fontWeight: 700 }}>CANCELLED</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SAVED EVENTS TAB ── */}
        {activeTab === "saved" && (
          <div>
            {savedEvents.length === 0 ? (
              <div style={{ textAlign: "center", padding: "5rem 0", color: T.stoneL }}>
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🤍</div>
                <div style={{ fontSize: "1.1rem", color: T.textMid, marginBottom: "0.5rem" }}>No saved events yet</div>
                <div style={{ marginBottom: "1.5rem" }}>Tap ❤️ on any event card to save it for later</div>
                <button onClick={() => setView("discover")} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px 24px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Browse Events →</button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "14px" }}>
                {savedEvents.map(ev => (
                  <div key={ev.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "16px 20px", display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: `${ev.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", flexShrink: 0 }}>{catEmoji(ev.category)}</div>
                    <div style={{ flex: 1, minWidth: "160px" }}>
                      <div style={{ color: T.text, fontWeight: 700, fontFamily: "'Lora',serif", marginBottom: "2px" }}>{ev.title}</div>
                      <div style={{ color: T.green1, fontSize: "0.78rem", fontWeight: 600 }}>{dateRange(ev)} · {fmtTime(ev.time)}</div>
                      <div style={{ color: T.textSoft, fontSize: "0.78rem" }}>📍 {ev.location}</div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                      <button onClick={() => { setSelectedId(ev.id); setView("detail"); }} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem" }}>View →</button>
                      <button onClick={() => { setSelectedId(ev.id); setView("detail"); }} title="View to manage interest" style={{ background: "#FEF2F2", color: T.warn, border: `1px solid #FECACA`, borderRadius: "8px", padding: "8px 12px", cursor: "pointer", fontSize: "0.9rem" }}>→</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── FOLLOWING TAB ── */}
        {activeTab === "following" && (
          <div>
            {followedOrganizers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "5rem 0", color: T.stoneL }}>
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔔</div>
                <div style={{ fontSize: "1.1rem", color: T.textMid, marginBottom: "0.5rem" }}>Not following anyone yet</div>
                <div style={{ marginBottom: "1.5rem" }}>Follow organizers on event pages to see their events here</div>
                <button onClick={() => setView("discover")} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px 24px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Browse Events →</button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "16px" }}>
                {followedOrganizers.map(org => {
                  const orgEvents = events.filter(e => e.organizer === org);
                  const today = new Date().toISOString().slice(0, 10);
                  const upcoming = orgEvents.filter(e => (e.startDate || "") >= today);
                  return (
                    <div key={org} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "18px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: T.green3, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.95rem" }}>
                            {org.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <div style={{ color: T.text, fontWeight: 700, fontFamily: "'Lora',serif" }}>{org}</div>
                            <div style={{ color: T.stoneL, fontSize: "0.75rem" }}>{orgEvents.length} event{orgEvents.length !== 1 ? "s" : ""} · {upcoming.length} upcoming</div>
                          </div>
                        </div>
                        <button onClick={() => toggleFollow(org)} style={{ background: "#FEF2F2", color: T.warn, border: `1px solid #FECACA`, borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem" }}>Unfollow</button>
                      </div>
                      {upcoming.length > 0 ? (
                        <div style={{ display: "grid", gap: "8px" }}>
                          {upcoming.slice(0, 3).map(ev => (
                            <div key={ev.id} onClick={() => { setSelectedId(ev.id); setView("detail"); }}
                              style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "9px", padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                              <div>
                                <div style={{ color: T.text, fontWeight: 600, fontSize: "0.88rem" }}>{ev.title}</div>
                                <div style={{ color: T.green1, fontSize: "0.75rem" }}>{dateRange(ev)}</div>
                              </div>
                              <span style={{ color: T.stoneL }}>→</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: T.stoneL, fontSize: "0.82rem", textAlign: "center", padding: "8px 0" }}>No upcoming events from this organizer</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── BADGES TAB ── */}
        {activeTab === "badges" && (
          <div>
            {currentUser ? (
              <BadgesPanel tickets={myTickets} referralStats={referralStats} />
            ) : (
              <div style={{ textAlign: "center", padding: "5rem 0", color: T.stoneL }}>
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏅</div>
                <div style={{ fontSize: "1.1rem", color: T.textMid, marginBottom: "1.5rem" }}>Sign in to earn badges</div>
                <button onClick={() => openAuth("login")} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px 24px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Sign In →</button>
              </div>
            )}
          </div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {activeTab === "activity" && (
          <div>
            <ActivityFeedPanel />
          </div>
        )}
      </div>
    </div>
  );
}
function DashLoginView() {
  const { pwInput, setPwInput, pwError, setPwError, setDashUnlocked, setView, currentUser } = useApp();
  const unlock = () => { if (pwInput === ADMIN_PASSWORD) { setDashUnlocked(true); setPwInput(""); setView("dashboard"); } else setPwError(true); };

  // Guests (not logged in) cannot access the admin login
  if (!currentUser) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "20px", padding: "3rem", width: "100%", maxWidth: "380px", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
          <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.4rem", margin: "0 0 0.75rem" }}>Sign In Required</h2>
          <p style={{ color: T.textSoft, fontSize: "0.88rem", margin: "0 0 1.5rem" }}>You must be signed in to access the admin area.</p>
          <button onClick={() => setView("discover")} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "11px 24px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.95rem" }}>← Back to Discover</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "20px", padding: "3rem", width: "100%", maxWidth: "380px", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.08)" }}>
        <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: T.green5, border: `2px solid ${T.green3}`, margin: "0 auto 1.5rem", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem" }}>🔒</div>
        <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.5rem", margin: "0 0 0.5rem" }}>Admin Dashboard</h2>
        <p style={{ color: T.textSoft, fontSize: "0.9rem", margin: "0 0 2rem" }}>Enter the admin password to manage events and vendor applications.</p>
        <PasswordInput value={pwInput} onChange={e => { setPwInput(e.target.value); setPwError(false); }} onKeyDown={e => e.key === "Enter" && unlock()} placeholder="Enter password"
          style={{ width: "100%", padding: "12px 16px", background: T.cream, border: `1px solid ${pwError ? T.warn : T.border}`, borderRadius: "10px", color: T.text, fontSize: "1rem", outline: "none", boxSizing: "border-box", fontFamily: "inherit", marginBottom: "8px", textAlign: "center" }} />
        {pwError && <div style={{ color: T.warn, fontSize: "0.8rem", marginBottom: "8px" }}>⚠ Incorrect password. Try again.</div>}
        <button onClick={unlock} style={{ width: "100%", background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "13px", fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Unlock Dashboard</button>
        <div style={{ marginTop: "1rem", background: T.cream, borderRadius: "8px", padding: "8px 12px", color: T.stoneL, fontSize: "0.75rem" }}>Password: <strong>harmony2026</strong></div>
        <button onClick={() => setView("discover")} style={{ background: "none", border: "none", color: T.stoneL, cursor: "pointer", marginTop: "1rem", fontSize: "0.85rem", fontFamily: "inherit" }}>← Back to Discover</button>
      </div>
    </div>
  );
}

// ─── DASHBOARD SETTINGS PANEL ────────────────────────────────────────────────
function DashSettingsPanel() {
  const { vibeConfig, saveVibeConfig, sortConfig, saveSortConfig, categoryConfig, saveCategoryConfig, eventTypeConfig, saveEventTypeConfig, showToast, resendApiKey, setResendApiKey } = useApp();

  // ── Vibe editor state ───────────────────────────────────────────────────
  const [vibeEnabled, setVibeEnabled] = useState(vibeConfig.enabled);
  const [vibeItems, setVibeItems] = useState(vibeConfig.items.map(v => ({ ...v })));
  const [vibeEditId, setVibeEditId] = useState(null);
  const [newVibe, setNewVibe] = useState({ emoji: "✨", label: "" });
  const [vibeAddOpen, setVibeAddOpen] = useState(false);

  const saveVibes = () => { saveVibeConfig({ enabled: vibeEnabled, items: vibeItems }); showToast("Vibe settings saved ✓"); };
  const toggleVibeEnabled = () => { const next = !vibeEnabled; setVibeEnabled(next); saveVibeConfig({ enabled: next, items: vibeItems }); };
  const updateVibeItem = (id, field, val) => setVibeItems(prev => prev.map(v => v.id === id ? { ...v, [field]: val } : v));
  const removeVibeItem = (id) => setVibeItems(prev => prev.filter(v => v.id !== id));
  const addVibeItem = () => {
    if (!newVibe.label.trim()) return;
    const id = newVibe.label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now();
    setVibeItems(prev => [...prev, { id, emoji: newVibe.emoji, label: newVibe.label.trim() }]);
    setNewVibe({ emoji: "✨", label: "" }); setVibeAddOpen(false);
  };
  const moveVibe = (idx, dir) => {
    const arr = [...vibeItems]; const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]]; setVibeItems(arr);
  };

  // ── Sort / filter button editor state ───────────────────────────────────
  const [sortEnabled, setSortEnabled] = useState(sortConfig.enabled);
  const [sortItems, setSortItems] = useState(sortConfig.items.map(s => ({ ...s })));
  const [newSort, setNewSort] = useState({ label: "", group: "date" });
  const [sortAddOpen, setSortAddOpen] = useState(false);
  const [sortEditId, setSortEditId] = useState(null);

  const saveSorts = () => { saveSortConfig({ enabled: sortEnabled, items: sortItems }); showToast("Sort settings saved ✓"); };
  const toggleSortEnabled = () => { const next = !sortEnabled; setSortEnabled(next); saveSortConfig({ enabled: next, items: sortItems }); };

  // ── Category editor state ────────────────────────────────────────────────
  const [catEnabled, setCatEnabled] = useState(categoryConfig.enabled);
  const [catItems, setCatItems] = useState([...categoryConfig.items]);
  const [catEditIdx, setCatEditIdx] = useState(null);
  const [catEditVal, setCatEditVal] = useState("");
  const [newCat, setNewCat] = useState("");
  const [catAddOpen, setCatAddOpen] = useState(false);

  const saveCats = () => { saveCategoryConfig({ enabled: catEnabled, items: catItems }); showToast("Category settings saved ✓"); };
  const toggleCatEnabled = () => { const next = !catEnabled; setCatEnabled(next); saveCategoryConfig({ enabled: next, items: catItems }); };
  const removeCat = (idx) => setCatItems(prev => prev.filter((_, i) => i !== idx));
  const startEditCat = (idx) => { setCatEditIdx(idx); setCatEditVal(catItems[idx]); };
  const commitEditCat = () => { if (catEditVal.trim()) setCatItems(prev => prev.map((c, i) => i === catEditIdx ? catEditVal.trim() : c)); setCatEditIdx(null); };
  const addCat = () => { if (!newCat.trim()) return; setCatItems(prev => [...prev, newCat.trim()]); setNewCat(""); setCatAddOpen(false); };
  const moveCat = (idx, dir) => { const arr = [...catItems]; const s = idx + dir; if (s < 0 || s >= arr.length) return; [arr[idx], arr[s]] = [arr[s], arr[idx]]; setCatItems(arr); };

  // ── Event Type editor state ──────────────────────────────────────────────
  const [etEnabled, setEtEnabled] = useState(eventTypeConfig.enabled);
  const [etItems, setEtItems] = useState(eventTypeConfig.items.map(v => ({ ...v })));
  const [etEditId, setEtEditId] = useState(null);
  const [newEt, setNewEt] = useState({ emoji: "🏷️", label: "" });
  const [etAddOpen, setEtAddOpen] = useState(false);

  const saveEts = () => { saveEventTypeConfig({ enabled: etEnabled, items: etItems }); showToast("Event type settings saved ✓"); };
  const toggleEtEnabled = () => { const next = !etEnabled; setEtEnabled(next); saveEventTypeConfig({ enabled: next, items: etItems }); };
  const updateEtItem = (id, field, val) => setEtItems(prev => prev.map(v => v.id === id ? { ...v, [field]: val } : v));
  const removeEtItem = (id) => setEtItems(prev => prev.filter(v => v.id !== id));
  const addEtItem = () => {
    if (!newEt.label.trim()) return;
    const id = newEt.label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now();
    setEtItems(prev => [...prev, { id, emoji: newEt.emoji, label: newEt.label.trim() }]);
    setNewEt({ emoji: "🏷️", label: "" }); setEtAddOpen(false);
  };
  const moveEt = (idx, dir) => { const arr = [...etItems]; const s = idx + dir; if (s < 0 || s >= arr.length) return; [arr[idx], arr[s]] = [arr[s], arr[idx]]; setEtItems(arr); };
  const updateSortItem = (id, field, val) => setSortItems(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));
  const removeSortItem = (id) => setSortItems(prev => prev.filter(s => s.id !== id));
  const addSortItem = () => {
    if (!newSort.label.trim()) return;
    const id = newSort.group + "-" + newSort.label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now();
    setSortItems(prev => [...prev, { id, label: newSort.label.trim(), group: newSort.group }]);
    setNewSort({ label: "", group: "date" }); setSortAddOpen(false);
  };
  const moveSort = (idx, dir) => {
    const arr = [...sortItems]; const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]]; setSortItems(arr);
  };

  // ── Shared mini helpers ──────────────────────────────────────────────────
  const panelStyle = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "24px", marginBottom: "20px" };
  const TogglePill = ({ on, onToggle }) => (
    <div onClick={onToggle} style={{ width: "48px", height: "26px", borderRadius: "13px", background: on ? T.green1 : "#D1D5DB", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: "4px", left: on ? "26px" : "4px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  );
  const StatusBadge = ({ on }) => (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: on ? T.green5 : T.cream, border: `1px solid ${on ? T.green3 : T.border}`, borderRadius: "100px", padding: "3px 12px", fontSize: "0.75rem", fontWeight: 600, color: on ? T.green1 : T.stoneL, marginBottom: "18px" }}>
      {on ? "✅ Showing on Discover & Event Details" : "🔕 Hidden from Discover & Event Details"}
    </div>
  );
  const rowStyle = { display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", background: T.cream, borderRadius: "10px", border: `1px solid ${T.border}`, marginBottom: "6px" };
  const SmBtn = ({ label, onClick, danger }) => (
    <button onClick={onClick} style={{ background: danger ? "#FEE2E2" : T.green5, color: danger ? T.warn : T.green1, border: `1px solid ${danger ? "#FECACA" : T.green3}`, borderRadius: "6px", padding: "4px 9px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.72rem", whiteSpace: "nowrap" }}>{label}</button>
  );
  const TinyInput = ({ value, onChange, placeholder, width }) => (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ padding: "5px 9px", borderRadius: "7px", border: `1px solid ${T.border}`, background: "#fff", fontFamily: "inherit", fontSize: "0.82rem", width: width || "100%", boxSizing: "border-box", outline: "none", minWidth: 0 }} />
  );
  const SaveBtn = ({ label, onClick }) => (
    <button onClick={onClick} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px 24px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.9rem" }}>{label}</button>
  );

  return (
    <div style={{ maxWidth: "600px" }}>

      {/* ── Event Categories ──────────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "6px" }}>
          <div>
            <h3 style={{ color: T.text, margin: "0 0 4px", fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>🗂️ Event Categories</h3>
            <p style={{ color: T.textSoft, fontSize: "0.82rem", margin: 0, lineHeight: 1.5 }}>Category filter buttons on the Discover page, and options in the event creation form.</p>
          </div>
          <TogglePill on={catEnabled} onToggle={toggleCatEnabled} />
        </div>
        <StatusBadge on={catEnabled} />

        <div style={{ marginBottom: "10px" }}>
          {catItems.map((cat, idx) => (
            <div key={idx} style={rowStyle}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", flexShrink: 0 }}>
                <button onClick={() => moveCat(idx, -1)} disabled={idx === 0} style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? T.border : T.stoneL, fontSize: "0.6rem", padding: "1px 3px", lineHeight: 1 }}>▲</button>
                <button onClick={() => moveCat(idx, 1)} disabled={idx === catItems.length - 1} style={{ background: "none", border: "none", cursor: idx === catItems.length - 1 ? "default" : "pointer", color: idx === catItems.length - 1 ? T.border : T.stoneL, fontSize: "0.6rem", padding: "1px 3px", lineHeight: 1 }}>▼</button>
              </div>
              {catEditIdx === idx ? (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <TinyInput value={catEditVal} onChange={setCatEditVal} placeholder="Category name" />
                  </div>
                  <SmBtn label="Done ✓" onClick={commitEditCat} />
                </>
              ) : (
                <>
                  <span style={{ flex: 1, color: T.textMid, fontSize: "0.85rem", fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
                  <SmBtn label="✏️ Edit" onClick={() => startEditCat(idx)} />
                  <SmBtn label="✕" onClick={() => removeCat(idx)} danger />
                </>
              )}
            </div>
          ))}
        </div>

        {catAddOpen ? (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "10px 12px", background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "140px" }}>
              <TinyInput value={newCat} onChange={setNewCat} placeholder="Category name (e.g. Family Fun)" />
            </div>
            <SmBtn label="+ Add" onClick={addCat} />
            <SmBtn label="Cancel" onClick={() => { setCatAddOpen(false); setNewCat(""); }} />
          </div>
        ) : (
          <button onClick={() => setCatAddOpen(true)} style={{ background: "none", border: `1px dashed ${T.green3}`, color: T.green1, borderRadius: "9px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem", width: "100%", marginBottom: "12px" }}>
            + Add Category
          </button>
        )}

        <SaveBtn label="Save Category Settings ✓" onClick={saveCats} />
      </div>

      {/* ── Event Types ───────────────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "6px" }}>
          <div>
            <h3 style={{ color: T.text, margin: "0 0 4px", fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>🏷️ Event Types</h3>
            <p style={{ color: T.textSoft, fontSize: "0.82rem", margin: 0, lineHeight: 1.5 }}>Selection buttons on the event creation form that describe the type of event (e.g. In-Person, Ticketed, Family-Friendly).</p>
          </div>
          <TogglePill on={etEnabled} onToggle={toggleEtEnabled} />
        </div>
        <StatusBadge on={etEnabled} />

        <div style={{ marginBottom: "10px" }}>
          {etItems.map((et, idx) => (
            <div key={et.id} style={rowStyle}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", flexShrink: 0 }}>
                <button onClick={() => moveEt(idx, -1)} disabled={idx === 0} style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? T.border : T.stoneL, fontSize: "0.6rem", padding: "1px 3px", lineHeight: 1 }}>▲</button>
                <button onClick={() => moveEt(idx, 1)} disabled={idx === etItems.length - 1} style={{ background: "none", border: "none", cursor: idx === etItems.length - 1 ? "default" : "pointer", color: idx === etItems.length - 1 ? T.border : T.stoneL, fontSize: "0.6rem", padding: "1px 3px", lineHeight: 1 }}>▼</button>
              </div>
              {etEditId === et.id ? (
                <>
                  <TinyInput value={et.emoji} onChange={val => updateEtItem(et.id, "emoji", val)} placeholder="🏷️" width="52px" />
                  <TinyInput value={et.label} onChange={val => updateEtItem(et.id, "label", val)} placeholder="Label" />
                  <SmBtn label="Done ✓" onClick={() => setEtEditId(null)} />
                </>
              ) : (
                <>
                  <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{et.emoji}</span>
                  <span style={{ flex: 1, color: T.textMid, fontSize: "0.85rem", fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{et.label}</span>
                  <SmBtn label="✏️ Edit" onClick={() => setEtEditId(et.id)} />
                  <SmBtn label="✕" onClick={() => removeEtItem(et.id)} danger />
                </>
              )}
            </div>
          ))}
        </div>

        {etAddOpen ? (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "10px 12px", background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
            <TinyInput value={newEt.emoji} onChange={val => setNewEt(v => ({ ...v, emoji: val }))} placeholder="🏷️" width="52px" />
            <div style={{ flex: 1, minWidth: "140px" }}>
              <TinyInput value={newEt.label} onChange={val => setNewEt(v => ({ ...v, label: val }))} placeholder="Type label (e.g. Outdoor Concert)" />
            </div>
            <SmBtn label="+ Add" onClick={addEtItem} />
            <SmBtn label="Cancel" onClick={() => { setEtAddOpen(false); setNewEt({ emoji: "🏷️", label: "" }); }} />
          </div>
        ) : (
          <button onClick={() => setEtAddOpen(true)} style={{ background: "none", border: `1px dashed ${T.green3}`, color: T.green1, borderRadius: "9px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem", width: "100%", marginBottom: "12px" }}>
            + Add Event Type
          </button>
        )}

        <SaveBtn label="Save Event Type Settings ✓" onClick={saveEts} />
      </div>

      {/* ── Vibe Tags ─────────────────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "6px" }}>
          <div>
            <h3 style={{ color: T.text, margin: "0 0 4px", fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>🏷️ Vibe Tags</h3>
            <p style={{ color: T.textSoft, fontSize: "0.82rem", margin: 0, lineHeight: 1.5 }}>Filter badges shown on the Discover page in the vibe filter row.</p>
          </div>
          <TogglePill on={vibeEnabled} onToggle={toggleVibeEnabled} />
        </div>
        <StatusBadge on={vibeEnabled} />

        <div style={{ marginBottom: "10px" }}>
          {vibeItems.map((vt, idx) => (
            <div key={vt.id} style={rowStyle}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", flexShrink: 0 }}>
                <button onClick={() => moveVibe(idx, -1)} disabled={idx === 0} style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? T.border : T.stoneL, fontSize: "0.6rem", padding: "1px 3px", lineHeight: 1 }}>▲</button>
                <button onClick={() => moveVibe(idx, 1)} disabled={idx === vibeItems.length - 1} style={{ background: "none", border: "none", cursor: idx === vibeItems.length - 1 ? "default" : "pointer", color: idx === vibeItems.length - 1 ? T.border : T.stoneL, fontSize: "0.6rem", padding: "1px 3px", lineHeight: 1 }}>▼</button>
              </div>
              {vibeEditId === vt.id ? (
                <>
                  <TinyInput value={vt.emoji} onChange={val => updateVibeItem(vt.id, "emoji", val)} placeholder="🌿" width="52px" />
                  <TinyInput value={vt.label} onChange={val => updateVibeItem(vt.id, "label", val)} placeholder="Label" />
                  <SmBtn label="Done ✓" onClick={() => setVibeEditId(null)} />
                </>
              ) : (
                <>
                  <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{vt.emoji}</span>
                  <span style={{ flex: 1, color: T.textMid, fontSize: "0.85rem", fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{vt.label}</span>
                  <SmBtn label="✏️ Edit" onClick={() => setVibeEditId(vt.id)} />
                  <SmBtn label="✕" onClick={() => removeVibeItem(vt.id)} danger />
                </>
              )}
            </div>
          ))}
        </div>

        {vibeAddOpen ? (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "10px 12px", background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
            <TinyInput value={newVibe.emoji} onChange={val => setNewVibe(v => ({ ...v, emoji: val }))} placeholder="🌿" width="52px" />
            <div style={{ flex: 1, minWidth: "140px" }}>
              <TinyInput value={newVibe.label} onChange={val => setNewVibe(v => ({ ...v, label: val }))} placeholder="Tag label (e.g. Campfire Friendly)" />
            </div>
            <SmBtn label="+ Add" onClick={addVibeItem} />
            <SmBtn label="Cancel" onClick={() => { setVibeAddOpen(false); setNewVibe({ emoji: "✨", label: "" }); }} />
          </div>
        ) : (
          <button onClick={() => setVibeAddOpen(true)} style={{ background: "none", border: `1px dashed ${T.green3}`, color: T.green1, borderRadius: "9px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem", width: "100%", marginBottom: "12px" }}>
            + Add Vibe Tag
          </button>
        )}

        <SaveBtn label="Save Vibe Settings ✓" onClick={saveVibes} />
      </div>

      {/* ── Sort / Filter Buttons ──────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "6px" }}>
          <div>
            <h3 style={{ color: T.text, margin: "0 0 4px", fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>🔘 Discover Sort Buttons</h3>
            <p style={{ color: T.textSoft, fontSize: "0.82rem", margin: 0, lineHeight: 1.5 }}>Quick-filter buttons on Discover (e.g. Today, This Week, Free). Date group = date filter; Price group = free-events toggle.</p>
          </div>
          <TogglePill on={sortEnabled} onToggle={toggleSortEnabled} />
        </div>
        <StatusBadge on={sortEnabled} />

        <div style={{ marginBottom: "10px" }}>
          {sortItems.length === 0 && <div style={{ color: T.stoneL, fontSize: "0.82rem", padding: "12px", textAlign: "center", background: T.cream, borderRadius: "10px", border: `1px solid ${T.border}`, marginBottom: "6px" }}>No buttons yet &mdash; add one below</div>}
          {sortItems.map((si, idx) => (
            <div key={si.id} style={rowStyle}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", flexShrink: 0 }}>
                <button onClick={() => moveSort(idx, -1)} disabled={idx === 0} style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? T.border : T.stoneL, fontSize: "0.6rem", padding: "1px 3px", lineHeight: 1 }}>▲</button>
                <button onClick={() => moveSort(idx, 1)} disabled={idx === sortItems.length - 1} style={{ background: "none", border: "none", cursor: idx === sortItems.length - 1 ? "default" : "pointer", color: idx === sortItems.length - 1 ? T.border : T.stoneL, fontSize: "0.6rem", padding: "1px 3px", lineHeight: 1 }}>▼</button>
              </div>
              {sortEditId === si.id ? (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <TinyInput value={si.label} onChange={val => updateSortItem(si.id, "label", val)} placeholder="Button label" />
                  </div>
                  <select value={si.group} onChange={e => updateSortItem(si.id, "group", e.target.value)}
                    style={{ padding: "5px 8px", borderRadius: "7px", border: `1px solid ${T.border}`, background: "#fff", fontFamily: "inherit", fontSize: "0.78rem", flexShrink: 0 }}>
                    <option value="date">📅 Date filter</option>
                    <option value="price">💰 Price filter</option>
                  </select>
                  <SmBtn label="Done ✓" onClick={() => setSortEditId(null)} />
                </>
              ) : (
                <>
                  <span style={{ flex: 1, color: T.textMid, fontSize: "0.85rem", fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{si.label}</span>
                  <span style={{ background: si.group === "date" ? `${T.earth}18` : T.green5, color: si.group === "date" ? T.earth : T.green1, borderRadius: "100px", padding: "2px 9px", fontSize: "0.7rem", fontWeight: 600, flexShrink: 0 }}>{si.group === "date" ? "📅 date" : "💰 price"}</span>
                  <SmBtn label="✏️ Edit" onClick={() => setSortEditId(si.id)} />
                  <SmBtn label="✕" onClick={() => removeSortItem(si.id)} danger />
                </>
              )}
            </div>
          ))}
        </div>

        {sortAddOpen ? (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "10px 12px", background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "140px" }}>
              <TinyInput value={newSort.label} onChange={val => setNewSort(v => ({ ...v, label: val }))} placeholder="Button label (e.g. This Weekend)" />
            </div>
            <select value={newSort.group} onChange={e => setNewSort(v => ({ ...v, group: e.target.value }))}
              style={{ padding: "5px 8px", borderRadius: "7px", border: `1px solid ${T.border}`, background: "#fff", fontFamily: "inherit", fontSize: "0.78rem", flexShrink: 0 }}>
              <option value="date">📅 Date filter</option>
              <option value="price">💰 Price filter</option>
            </select>
            <SmBtn label="+ Add" onClick={addSortItem} />
            <SmBtn label="Cancel" onClick={() => { setSortAddOpen(false); setNewSort({ label: "", group: "date" }); }} />
          </div>
        ) : (
          <button onClick={() => setSortAddOpen(true)} style={{ background: "none", border: `1px dashed ${T.green3}`, color: T.green1, borderRadius: "9px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem", width: "100%", marginBottom: "12px" }}>
            + Add Sort Button
          </button>
        )}

        <SaveBtn label="Save Sort Settings ✓" onClick={saveSorts} />
      </div>

      {/* ── Email Confirmations ───────────────────────────────────────────── */}
      <div style={panelStyle}>
        <h3 style={{ color: T.text, margin: "0 0 6px", fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>📧 Email Confirmations (Resend)</h3>
        <p style={{ color: T.textSoft, fontSize: "0.85rem", margin: "0 0 18px", lineHeight: 1.6 }}>
          When set, customers will receive a confirmation email after purchasing tickets. Get a free API key at <a href="https://resend.com" target="_blank" rel="noopener noreferrer" style={{ color: T.green1 }}>resend.com</a>.
        </p>
        <Field label="Resend API Key">
          <PasswordInput value={resendApiKey} onChange={e => setResendApiKey(e.target.value)} placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxx" style={inp()} />
        </Field>
        <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
          <button onClick={() => { localStorage.setItem("nh_resend_key", resendApiKey); showToast("API key saved ✓"); }}
            style={{ background: T.green1, color: "#fff", border: "none", borderRadius: "9px", padding: "10px 20px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>Save Key</button>
          {localStorage.getItem("nh_resend_key") && (
            <button onClick={() => { localStorage.removeItem("nh_resend_key"); setResendApiKey(""); showToast("API key removed", "warn"); }}
              style={{ background: "#FEE2E2", color: T.warn, border: "none", borderRadius: "9px", padding: "10px 20px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Remove Key</button>
          )}
        </div>
        {localStorage.getItem("nh_resend_key") && (
          <div style={{ marginTop: "12px", background: T.green5, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "10px 14px", fontSize: "0.82rem", color: T.green1, fontWeight: 600 }}>✅ Email confirmations are active</div>
        )}
        <div style={{ marginTop: "16px", background: "#FFF8E7", border: "1px solid #F6D860", borderRadius: "10px", padding: "14px 16px", fontSize: "0.82rem", color: "#92710A", lineHeight: 1.6 }}>
          <strong>Setup steps:</strong><br/>1. Create account at resend.com<br/>2. Add &amp; verify your domain<br/>3. Create an API key and paste it above<br/>4. Update the "from" address in the code
        </div>
      </div>

      {/* ── Admin Password ────────────────────────────────────────────────── */}
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "24px" }}>
        <h3 style={{ color: T.text, margin: "0 0 6px", fontFamily: "'Lora',serif", fontSize: "1.1rem" }}>🔐 Admin Password</h3>
        <p style={{ color: T.textSoft, fontSize: "0.85rem", margin: "0 0 4px", lineHeight: 1.6 }}>
          Current password is hardcoded as <code style={{ background: T.cream, padding: "2px 6px", borderRadius: "4px" }}>harmony2026</code>. Change it in the source code before going to production.
        </p>
      </div>
    </div>
  );
}

// ─── ADMIN DETAIL VIEW ────────────────────────────────────────────────────────
function AdminDetailView() {
  const { selectedEvent, setView, setSelectedId, startEdit, handleDelete, duplicateEvent, scheduleEventReminders, copyInviteLink, showToast, getInterest, reviews, dashUnlocked, checkinAttendee, undoCheckin, updateVendorStatus } = useApp();
  const ev = selectedEvent;

  // Local ticket roster state — loaded from Supabase for this event
  const [evTickets, setEvTickets] = React.useState([]);
  const [ticketsLoading, setTicketsLoading] = React.useState(false);
  const [ticketSearch, setTicketSearch] = React.useState("");
  const [vendorSearch, setVendorSearch] = React.useState("");
  // Local vendor check-in state (keyed by vendor id)
  const [vendorCheckins, setVendorCheckins] = React.useState({});

  // ── Expense tracker state ──
  const EXPENSE_CATEGORIES = ["Venue", "Equipment", "Marketing", "Staffing", "Food & Beverage", "Permits & Fees", "Supplies", "Entertainment", "Travel", "Other"];
  const expenseKey = ev?.id ? `nh_expenses_${ev.id}` : null;
  const loadExpenses = () => { try { return JSON.parse(localStorage.getItem(expenseKey) || "[]"); } catch { return []; } };
  const [expenses, setExpenses] = React.useState([]);
  const [expenseForm, setExpenseForm] = React.useState({ description: "", category: "Venue", amount: "", date: "", notes: "" });
  const [expenseFormError, setExpenseFormError] = React.useState("");
  const [editingExpenseId, setEditingExpenseId] = React.useState(null);
  const [expenseCatFilter, setExpenseCatFilter] = React.useState("All");

  // Load tickets + expenses on mount
  React.useEffect(() => {
    if (!ev?.id) return;
    setTicketsLoading(true);
    supabase.from("tickets").select("*").eq("event_id", ev.id).then(({ data }) => {
      if (data) {
        setEvTickets(data.map(t => ({
          id: t.id, ticketId: t.ticket_id, orderId: t.order_id,
          eventId: t.event_id, tierId: t.tier_id,
          tierName: t.tier_name || "", eventTitle: t.event_title || "",
          buyerName: t.buyer_name, buyerEmail: t.buyer_email,
          buyerPhone: t.buyer_phone || "",
          qty: t.quantity, total: parseFloat(t.total || 0),
          orderNum: t.order_number || "", bookedOn: t.created_at?.split("T")[0] || "",
          status: t.status, checkedIn: t.checked_in, checkinTime: t.checkin_time,
        })));
      }
      setTicketsLoading(false);
    });
    // Restore saved vendor check-ins from localStorage
    try {
      const saved = localStorage.getItem(`vendor_checkins_${ev.id}`);
      if (saved) setVendorCheckins(JSON.parse(saved));
    } catch(e) {}
    // Load expenses
    setExpenses(loadExpenses());
  }, [ev?.id]);

  const saveExpenses = (list) => {
    setExpenses(list);
    try { localStorage.setItem(expenseKey, JSON.stringify(list)); } catch(e) {}
  };

  const submitExpense = () => {
    if (!expenseForm.description.trim()) { setExpenseFormError("Description is required."); return; }
    const amt = parseFloat(expenseForm.amount);
    if (!expenseForm.amount || isNaN(amt) || amt < 0) { setExpenseFormError("Enter a valid amount (0 or more)."); return; }
    setExpenseFormError("");
    if (editingExpenseId) {
      saveExpenses(expenses.map(e => e.id === editingExpenseId ? { ...e, ...expenseForm, amount: amt } : e));
      setEditingExpenseId(null);
    } else {
      saveExpenses([...expenses, { id: Date.now().toString(), ...expenseForm, amount: amt, addedAt: new Date().toISOString() }]);
    }
    setExpenseForm({ description: "", category: "Venue", amount: "", date: "", notes: "" });
  };

  const deleteExpense = (id) => { if (window.confirm("Delete this expense?")) saveExpenses(expenses.filter(e => e.id !== id)); };

  const startEditExpense = (exp) => {
    setEditingExpenseId(exp.id);
    setExpenseForm({ description: exp.description, category: exp.category, amount: String(exp.amount), date: exp.date || "", notes: exp.notes || "" });
    setExpenseFormError("");
  };

  const cancelEditExpense = () => {
    setEditingExpenseId(null);
    setExpenseForm({ description: "", category: "Venue", amount: "", date: "", notes: "" });
    setExpenseFormError("");
  };

  const exportExpensesCSV = () => {
    const rows = [["Description", "Category", "Amount", "Date", "Notes"]];
    expenses.forEach(e => rows.push([e.description, e.category, `$${e.amount.toFixed(2)}`, e.date || "", e.notes || ""]));
    const csv = rows.map(r => r.map(c => `"${(c||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${(ev.title||"event").replace(/\s+/g,"_")}_expenses.csv`; a.click();
  };

  const toggleVendorCheckin = (vendorId) => {
    setVendorCheckins(prev => {
      const next = { ...prev, [vendorId]: !prev[vendorId] };
      try { localStorage.setItem(`vendor_checkins_${ev.id}`, JSON.stringify(next)); } catch(e) {}
      return next;
    });
  };

  const handleTicketCheckin = async (ticket) => {
    if (ticket.checkedIn) {
      await undoCheckin(ticket.id);
      setEvTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, checkedIn: false, checkinTime: null } : t));
    } else {
      await checkinAttendee(ev.id, ticket.id);
      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setEvTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, checkedIn: true, checkinTime: now } : t));
    }
  };

  if (!ev || !dashUnlocked) { return null; }

  const intr = getInterest(ev.id);
  const evReviews = reviews[ev.id] || [];
  const avgRating = evReviews.length > 0 ? (evReviews.reduce((s, r) => s + r.rating, 0) / evReviews.length) : 0;
  const cap = totalCapacity(ev);
  const sold = totalSold(ev);
  const spots = spotsLeft(ev);
  const pctFull = cap > 0 ? Math.min(100, Math.round((sold / cap) * 100)) : 0;
  const revenue = (ev.ticketTiers || []).reduce((s, t) => s + t.price * t.sold, 0);
  const approvedVendors = (ev.vendors || []).filter(v => v.status === "approved");
  const pendingVendors = (ev.vendors || []).filter(v => v.status === "pending");
  const allVendors = ev.vendors || [];
  const waitlist = ev.waitlist || [];

  // Ticket roster filtered
  const activeTickets = evTickets.filter(t => t.status !== "cancelled");
  const filteredTickets = ticketSearch
    ? activeTickets.filter(t => [t.buyerName, t.buyerEmail, t.ticketId, t.orderNum, t.buyerPhone].some(f => f && f.toLowerCase().includes(ticketSearch.toLowerCase())))
    : activeTickets;
  const checkedInCount = activeTickets.filter(t => t.checkedIn).length;

  // Vendor roster filtered
  const filteredVendors = vendorSearch
    ? allVendors.filter(v => [v.businessName, v.contactName, v.email, v.vendorType].some(f => f && f.toLowerCase().includes(vendorSearch.toLowerCase())))
    : allVendors;
  const vendorCheckinCount = allVendors.filter(v => vendorCheckins[v.id]).length;

  const StatCard = ({ label, value, sub, color, icon }) => (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "16px 18px", minWidth: "130px" }}>
      <div style={{ color: T.stoneL, fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>{icon} {label}</div>
      <div style={{ color: color || T.text, fontWeight: 700, fontSize: "1.5rem", fontFamily: "'Lora',serif", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ color: T.stoneL, fontSize: "0.72rem", marginTop: "4px" }}>{sub}</div>}
    </div>
  );

  const Section = ({ title, icon, children, accent }) => (
    <div style={{ background: T.bgCard, border: `1px solid ${accent || T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "20px" }}>
      <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.05rem", margin: "0 0 16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span>{icon}</span> {title}
      </h3>
      {children}
    </div>
  );

  const Field = ({ label, value, mono }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "12px" }}>
      <div style={{ color: T.stoneL, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ color: T.textMid, fontSize: "0.875rem", lineHeight: 1.5, fontFamily: mono ? "monospace" : "inherit", wordBreak: "break-all" }}>{value || <span style={{ color: T.stoneL, fontStyle: "italic" }}>Not set</span>}</div>
    </div>
  );

  const Badge = ({ label, color, bg }) => (
    <span style={{ background: bg || T.green5, color: color || T.green1, borderRadius: "6px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700, display: "inline-block", marginRight: "6px", marginBottom: "4px" }}>{label}</span>
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      {/* Admin header banner */}
      <div style={{ background: `linear-gradient(90deg,${T.bgDeep},${T.bgMid})`, borderBottom: `2px solid ${T.green3}`, padding: "14px 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", position: "sticky", top: "68px", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ background: `${T.green3}25`, border: `1px solid ${T.green3}50`, borderRadius: "8px", padding: "4px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: T.green3, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>⚙️ Admin View</span>
          </div>
          <span style={{ color: "#fff", fontFamily: "'Lora',serif", fontWeight: 700, fontSize: "1rem" }}>{ev.title}</span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={() => { setSelectedId(ev.id); setView("detail"); }} style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>👁 Public View</button>
          <button onClick={() => startEdit(ev)} style={{ background: T.cream, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>✏️ Edit Event</button>
          <button onClick={() => { if (window.confirm(`Send email reminders to all attendees of "${ev.title}"?`)) scheduleEventReminders(ev.id); }} style={{ background: `${T.green1}12`, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>📧 Remind</button>
          {ev.isPrivate && ev.inviteToken && (
            <button onClick={() => copyInviteLink(ev)} style={{ background: `${T.earth}12`, color: T.earth, border: `1px solid ${T.earthL}`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>🔗 Invite Link</button>
          )}
          <button onClick={() => setView("dashboard")} style={{ background: "rgba(255,255,255,0.08)", color: "#9CA3AF", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: "0.8rem" }}>← Dashboard</button>
        </div>
      </div>

      <div style={{ maxWidth: "1060px", margin: "0 auto", padding: "2rem" }}>

        {/* ── KPI STAT CARDS ── */}
        {(() => {
          const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
          const netProfit = revenue - totalExpenses;
          return (
            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "24px" }}>
              <StatCard icon="🎟️" label="Registered" value={sold} sub={`of ${cap} capacity`} color={pctFull >= 90 ? T.warn : T.green1} />
              <StatCard icon="🪑" label="Spots Left" value={spots} sub={spots === 0 ? "SOLD OUT" : `${pctFull}% full`} color={spots === 0 ? T.warn : spots <= 10 ? "#D97706" : T.green2} />
              <StatCard icon="💰" label="Revenue" value={`$${revenue.toLocaleString()}`} sub={(ev.ticketTiers||[]).filter(t => t.price > 0).length > 0 ? `${(ev.ticketTiers||[]).filter(t=>t.price>0).length} paid tier${(ev.ticketTiers||[]).filter(t=>t.price>0).length!==1?"s":""}` : "Free event"} color={T.gold} />
              {expenses.length > 0 && <StatCard icon="📋" label="Expenses" value={`$${totalExpenses.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`} sub={`${expenses.length} item${expenses.length!==1?"s":""}`} color={T.warn} />}
              {expenses.length > 0 && <StatCard icon={netProfit >= 0 ? "📈" : "📉"} label="Net Profit" value={`${netProfit < 0 ? "-" : ""}$${Math.abs(netProfit).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`} sub={netProfit >= 0 ? "after expenses" : "currently a loss"} color={netProfit >= 0 ? T.green1 : T.warn} />}
              <StatCard icon="✅" label="Going" value={intr.going.length} sub="marked as going" color={T.green2} />
              <StatCard icon="⭐" label="Interested" value={intr.interested.length} sub="marked interested" color={T.gold} />
              {waitlist.length > 0 && <StatCard icon="⏳" label="Waitlist" value={waitlist.length} sub="waiting for spots" color="#D97706" />}
              {avgRating > 0 && <StatCard icon="🌟" label="Avg Rating" value={avgRating.toFixed(1)} sub={`${evReviews.length} review${evReviews.length !== 1 ? "s" : ""}`} color="#F59E0B" />}
            </div>
          );
        })()}

        {/* Capacity bar */}
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "16px 20px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ color: T.textMid, fontWeight: 700, fontSize: "0.875rem" }}>Capacity Fill Rate</span>
            <span style={{ color: pctFull >= 90 ? T.warn : pctFull >= 70 ? "#D97706" : T.green1, fontWeight: 700, fontSize: "0.875rem" }}>{pctFull}%</span>
          </div>
          <div style={{ height: "10px", background: T.border, borderRadius: "5px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pctFull}%`, background: pctFull >= 90 ? T.warn : pctFull >= 70 ? "#D97706" : T.green2, borderRadius: "5px", transition: "width 0.4s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
            <span style={{ color: T.stoneL, fontSize: "0.72rem" }}>{sold} registered</span>
            <span style={{ color: T.stoneL, fontSize: "0.72rem" }}>{spots} spots remaining</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: "20px" }}>

          {/* ── EVENT DETAILS ── */}
          <Section title="Event Details" icon="📋">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              <Field label="Title" value={ev.title} />
              <Field label="Category" value={ev.category} />
              <Field label="Start Date" value={fmt(ev.startDate)} />
              <Field label="End Date" value={ev.endDate && ev.endDate !== ev.startDate ? fmt(ev.endDate) : "Same day"} />
              <Field label="Start Time" value={fmtTime(ev.time)} />
              <Field label="End Time" value={fmtTime(ev.endTime)} />
              <Field label="Location" value={ev.location} />
              <Field label="Address" value={ev.address} />
              <Field label="Organizer" value={ev.organizer} />
              <Field label="Format" value={ev.online ? "Online" : "In-Person"} />
            </div>
            {ev.description && (
              <div style={{ marginTop: "4px" }}>
                <div style={{ color: T.stoneL, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Description</div>
                <div style={{ color: T.textMid, fontSize: "0.875rem", lineHeight: 1.65, background: T.cream, borderRadius: "8px", padding: "12px 14px" }}>{ev.description}</div>
              </div>
            )}
            <div style={{ marginTop: "14px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
              <Badge label={ev.isPublic !== false ? "🌐 Public" : "🚫 Unlisted"} color={ev.isPublic !== false ? T.green1 : T.warn} bg={ev.isPublic !== false ? T.green5 : "#FEE2E2"} />
              {ev.isPrivate && <Badge label="🔒 Password Protected" color="#6B3FA0" bg="#F3E8FF" />}
              {ev.recurring && <Badge label={`🔁 ${getRecurringDescription(ev)}`} color={T.green1} />}
              {ev.showAttendanceBar !== false ? <Badge label="📊 Attendance Bar: On" /> : <Badge label="📊 Attendance Bar: Off" color={T.stoneL} bg={T.bg} />}
              {(ev.tags || []).map(t => <Badge key={t} label={`#${t}`} color={T.textSoft} bg={T.border} />)}
            </div>
          </Section>

          {/* ── TICKET TIERS ── */}
          <Section title="Ticket Tiers" icon="🎟️">
            {(ev.ticketTiers || []).length === 0 ? (
              <div style={{ color: T.stoneL, fontSize: "0.85rem" }}>No tiers configured</div>
            ) : (ev.ticketTiers || []).map(tier => {
              const tierPct = tier.capacity > 0 ? Math.min(100, Math.round((tier.sold / tier.capacity) * 100)) : 0;
              return (
                <div key={tier.id} style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "14px 16px", marginBottom: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div>
                      <div style={{ color: T.text, fontWeight: 700, fontSize: "0.925rem" }}>{tier.name}</div>
                      {tier.description && <div style={{ color: T.textSoft, fontSize: "0.78rem", marginTop: "2px" }}>{tier.description}</div>}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "12px" }}>
                      <div style={{ color: tier.price === 0 ? T.green1 : T.text, fontWeight: 700, fontSize: "1rem" }}>{tier.price === 0 ? "Free" : `$${tier.price}`}</div>
                      <div style={{ color: tier.price > 0 ? T.gold : T.stoneL, fontSize: "0.75rem", fontWeight: 600 }}>{tier.price > 0 ? `$${(tier.price * tier.sold).toLocaleString()} earned` : "No revenue"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <span style={{ color: T.stoneL, fontSize: "0.72rem" }}>{tier.sold} sold of {tier.capacity}</span>
                    <span style={{ color: T.stoneL, fontSize: "0.72rem" }}>{tierPct}%</span>
                  </div>
                  <div style={{ height: "5px", background: T.border, borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${tierPct}%`, background: tierPct >= 90 ? T.warn : tierPct >= 70 ? "#D97706" : T.green2, borderRadius: "3px" }} />
                  </div>
                </div>
              );
            })}
            <div style={{ background: `${T.gold}12`, border: `1px solid ${T.gold}30`, borderRadius: "10px", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: T.textMid, fontWeight: 700, fontSize: "0.875rem" }}>Total Revenue</span>
              <span style={{ color: T.gold, fontWeight: 700, fontSize: "1.15rem", fontFamily: "'Lora',serif" }}>${revenue.toLocaleString()}</span>
            </div>
          </Section>

          {/* ── SETTINGS & CONFIGURATION ── */}
          <Section title="Settings & Configuration" icon="⚙️">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              <Field label="Profit Model" value={ev.profitModel === "sharing" ? `Revenue Sharing (Host: ${ev.hostPct}%)` : "Vendor Keeps All"} />
              <Field label="Capacity" value={`${cap} total`} />
              <Field label="Refund Policy" value={ev.refundPolicy === "none" ? "No Refunds" : ev.refundPolicy === "partial" ? `Partial (within ${ev.refundDeadlineDays}d)` : `Full (within ${ev.refundDeadlineDays}d)`} />
              <Field label="Event Color" value={<span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}><span style={{ width: "14px", height: "14px", borderRadius: "3px", background: ev.color, display: "inline-block" }} />{ev.color}</span>} />
            </div>
            {ev.isPrivate && (
              <div style={{ marginTop: "4px" }}>
                <Field label="Event Password" value={ev.privatePassword || "(invite-link only)"} mono />
                {ev.inviteToken && <Field label="Invite Token" value={ev.inviteToken} mono />}
              </div>
            )}
          </Section>

          {/* ── VENDOR ROSTER WITH CHECK-IN ── */}
          {ev.vendorInvite && (
            <div style={{ background: T.bgCard, border: `1px solid ${T.earth}55`, borderRadius: "16px", padding: "22px", marginBottom: "20px", gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.05rem", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>🛖 Vendor Roster &amp; Check-In</h3>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ background: "#DCFCE7", color: "#166534", borderRadius: "6px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700 }}>✅ {approvedVendors.length} Approved</span>
                  <span style={{ background: "#FEF3C7", color: "#92400E", borderRadius: "6px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700 }}>⏳ {pendingVendors.length} Pending</span>
                  <span style={{ background: T.green5, color: T.green1, borderRadius: "6px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700 }}>🏁 {vendorCheckinCount}/{allVendors.length} Arrived</span>
                </div>
              </div>
              {ev.vendorDeadline && <div style={{ color: T.earth, fontSize: "0.82rem", fontWeight: 600, marginBottom: "12px" }}>📅 Application Deadline: {fmt(ev.vendorDeadline)}</div>}
              {/* Search */}
              <input placeholder="Search vendors by name, type, email…" value={vendorSearch} onChange={e => setVendorSearch(e.target.value)}
                style={{ padding: "9px 14px", borderRadius: "9px", border: `1px solid ${T.border}`, fontFamily: "inherit", fontSize: "0.85rem", width: "100%", maxWidth: "340px", background: T.cream, marginBottom: "14px", outline: "none" }} />
              {allVendors.length === 0 ? (
                <div style={{ color: T.stoneL, fontSize: "0.85rem", padding: "20px", textAlign: "center" }}>No vendor applications yet</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: T.bgDeep }}>
                        {["Check-In", "Business", "Contact", "Type", "Space", "Years", "Needs", "City/State", "Contact Info", "Status"].map(h => (
                          <th key={h} style={{ color: T.green4, padding: "9px 12px", textAlign: "left", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVendors.map((v, i) => {
                        const arrived = !!vendorCheckins[v.id];
                        const needsHighlight = v.electricNeeded || !v.tentOwned || v.comments;
                        return (
                          <tr key={v.id} style={{ background: arrived ? "#F0FDF4" : i % 2 === 0 ? "#fff" : T.cream, borderBottom: `1px solid ${T.border}`, transition: "background 0.15s" }}>
                            {/* Check-in toggle */}
                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                              <button onClick={() => toggleVendorCheckin(v.id)}
                                style={{ background: arrived ? T.green1 : "#E5E7EB", color: arrived ? "#fff" : T.stone, border: "none", borderRadius: "7px", padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.75rem", whiteSpace: "nowrap", transition: "all 0.15s" }}>
                                {arrived ? "✓ Arrived" : "Mark In"}
                              </button>
                            </td>
                            {/* Business */}
                            <td style={{ padding: "10px 12px" }}>
                              <div style={{ color: T.text, fontWeight: 700, fontSize: "0.875rem" }}>{v.businessName}</div>
                              {v.description && <div style={{ color: T.stoneL, fontSize: "0.72rem", marginTop: "2px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.description}>{v.description}</div>}
                              {v.website && <div style={{ color: T.green2, fontSize: "0.7rem", marginTop: "1px" }}>{v.website}</div>}
                              {v.instagram && <div style={{ color: T.textSoft, fontSize: "0.7rem" }}>{v.instagram}</div>}
                            </td>
                            {/* Contact */}
                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                              <div style={{ color: T.textMid, fontWeight: 600 }}>{v.contactName}</div>
                            </td>
                            {/* Type */}
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ background: T.green5, color: T.green1, borderRadius: "5px", padding: "2px 8px", fontSize: "0.7rem", fontWeight: 600, whiteSpace: "nowrap" }}>{v.vendorType}</span>
                            </td>
                            {/* Space */}
                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                              <span style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "5px", padding: "2px 8px", fontSize: "0.72rem", color: T.textMid }}>{v.spaceNeeded || "—"}</span>
                            </td>
                            {/* Years */}
                            <td style={{ padding: "10px 12px", color: T.textSoft, textAlign: "center" }}>{v.yearsInBusiness || "—"}</td>
                            {/* Needs — highlighted if special requirements */}
                            <td style={{ padding: "10px 12px" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                {v.electricNeeded && <span style={{ background: "#FEF3C7", color: "#92400E", borderRadius: "5px", padding: "2px 7px", fontSize: "0.68rem", fontWeight: 700, whiteSpace: "nowrap" }}>⚡ Needs Power</span>}
                                {!v.tentOwned && <span style={{ background: "#FEE2E2", color: T.warn, borderRadius: "5px", padding: "2px 7px", fontSize: "0.68rem", fontWeight: 700, whiteSpace: "nowrap" }}>⛺ No Tent</span>}
                                {v.tentOwned && <span style={{ background: T.green5, color: T.green1, borderRadius: "5px", padding: "2px 7px", fontSize: "0.68rem", fontWeight: 600, whiteSpace: "nowrap" }}>⛺ Has Tent</span>}
                                {v.hasPermit && <span style={{ background: "#F0FDF4", color: "#166534", borderRadius: "5px", padding: "2px 7px", fontSize: "0.68rem", fontWeight: 600, whiteSpace: "nowrap" }}>📋 Permitted</span>}
                                {v.comments && <span style={{ background: "#EFF6FF", color: "#1D4ED8", borderRadius: "5px", padding: "2px 7px", fontSize: "0.68rem", fontWeight: 700, whiteSpace: "nowrap", cursor: "help" }} title={v.comments}>💬 Note</span>}
                                {!v.electricNeeded && v.tentOwned && v.hasPermit && !v.comments && <span style={{ color: T.stoneL, fontSize: "0.72rem" }}>—</span>}
                              </div>
                            </td>
                            {/* City/State */}
                            <td style={{ padding: "10px 12px", color: T.textSoft, whiteSpace: "nowrap" }}>{v.city}, {v.state}</td>
                            {/* Contact info */}
                            <td style={{ padding: "10px 12px" }}>
                              <div style={{ color: T.textMid, fontSize: "0.78rem" }}>{v.email}</div>
                              {v.phone && <div style={{ color: T.textSoft, fontSize: "0.72rem" }}>{v.phone}</div>}
                            </td>
                            {/* Status */}
                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                              <span style={{ background: v.status === "approved" ? "#DCFCE7" : v.status === "rejected" ? "#FEE2E2" : "#FEF3C7", color: v.status === "approved" ? "#166534" : v.status === "rejected" ? T.warn : "#92400E", borderRadius: "5px", padding: "3px 9px", fontSize: "0.72rem", fontWeight: 700 }}>
                                {v.status === "approved" ? "✅ Approved" : v.status === "rejected" ? "❌ Rejected" : "⏳ Pending"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Vendor comments summary */}
              {allVendors.filter(v => v.comments).length > 0 && (
                <div style={{ marginTop: "16px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ color: "#1D4ED8", fontWeight: 700, fontSize: "0.78rem", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>💬 Vendor Notes &amp; Special Requests</div>
                  {allVendors.filter(v => v.comments).map(v => (
                    <div key={v.id} style={{ marginBottom: "6px", fontSize: "0.82rem" }}>
                      <span style={{ color: T.textMid, fontWeight: 700 }}>{v.businessName}:</span>{" "}
                      <span style={{ color: T.textSoft }}>{v.comments}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TICKET ROSTER ── */}
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "20px", gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.05rem", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>🎟️ Ticket Roster</h3>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ background: T.green5, color: T.green1, borderRadius: "6px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700 }}>{activeTickets.length} tickets sold</span>
                <span style={{ background: checkedInCount > 0 ? "#DCFCE7" : T.cream, color: checkedInCount > 0 ? "#166534" : T.stoneL, borderRadius: "6px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700 }}>
                  🏁 {checkedInCount}/{activeTickets.length} checked in
                </span>
                {/* CSV Export */}
                <button onClick={() => {
                  const rows = [["Ticket ID","Order","Name","Email","Phone","Tier","Qty","Total","Booked","Checked In","Check-In Time"]];
                  activeTickets.forEach(t => rows.push([t.ticketId, t.orderNum, t.buyerName, t.buyerEmail, t.buyerPhone, t.tierName, t.qty, `$${(t.total||0).toFixed(2)}`, t.bookedOn, t.checkedIn ? "Yes" : "No", t.checkinTime || ""]));
                  const csv = rows.map(r => r.map(c => `"${(c||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n");
                  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${ev.title.replace(/\s+/g,"_")}_tickets.csv`; a.click();
                }} style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem" }}>
                  ⬇ Export CSV
                </button>
              </div>
            </div>
            <input placeholder="Search by name, email, ticket ID, phone…" value={ticketSearch} onChange={e => setTicketSearch(e.target.value)}
              style={{ padding: "9px 14px", borderRadius: "9px", border: `1px solid ${T.border}`, fontFamily: "inherit", fontSize: "0.85rem", width: "100%", maxWidth: "340px", background: T.cream, marginBottom: "14px", outline: "none" }} />
            {ticketsLoading ? (
              <div style={{ textAlign: "center", padding: "2rem", color: T.stoneL }}>Loading tickets…</div>
            ) : activeTickets.length === 0 ? (
              <div style={{ color: T.stoneL, fontSize: "0.85rem", padding: "20px", textAlign: "center" }}>No tickets sold yet</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ background: T.bgDeep }}>
                      {["Check-In", "Name", "Email", "Phone", "Ticket ID", "Order #", "Tier", "Qty", "Total", "Booked On"].map(h => (
                        <th key={h} style={{ color: T.green4, padding: "9px 12px", textAlign: "left", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map((t, i) => (
                      <tr key={t.id || t.ticketId} style={{ background: t.checkedIn ? "#F0FDF4" : i % 2 === 0 ? "#fff" : T.cream, borderBottom: `1px solid ${T.border}`, transition: "background 0.15s" }}>
                        {/* Check-in */}
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-start" }}>
                            <button onClick={() => handleTicketCheckin(t)}
                              style={{ background: t.checkedIn ? T.green1 : "#E5E7EB", color: t.checkedIn ? "#fff" : T.stone, border: "none", borderRadius: "7px", padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.75rem", whiteSpace: "nowrap", transition: "all 0.15s" }}>
                              {t.checkedIn ? "✓ In" : "Check In"}
                            </button>
                            {t.checkinTime && <span style={{ color: T.stoneL, fontSize: "0.68rem" }}>{t.checkinTime}</span>}
                          </div>
                        </td>
                        {/* Name */}
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ color: T.text, fontWeight: 700 }}>{t.buyerName}</div>
                        </td>
                        {/* Email */}
                        <td style={{ padding: "10px 12px", color: T.textMid }}>{t.buyerEmail}</td>
                        {/* Phone */}
                        <td style={{ padding: "10px 12px", color: T.textSoft, whiteSpace: "nowrap" }}>{t.buyerPhone || <span style={{ color: T.stoneL, fontStyle: "italic" }}>—</span>}</td>
                        {/* Ticket ID */}
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: T.textMid, background: T.bg, borderRadius: "4px", padding: "2px 6px" }}>{t.ticketId}</span>
                        </td>
                        {/* Order # */}
                        <td style={{ padding: "10px 12px", color: T.textSoft, whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "0.78rem" }}>{t.orderNum || "—"}</td>
                        {/* Tier */}
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ background: T.green5, color: T.green1, borderRadius: "5px", padding: "2px 8px", fontSize: "0.7rem", fontWeight: 600, whiteSpace: "nowrap" }}>{t.tierName || "General"}</span>
                        </td>
                        {/* Qty */}
                        <td style={{ padding: "10px 12px", textAlign: "center", color: T.textMid, fontWeight: 700 }}>{t.qty}</td>
                        {/* Total */}
                        <td style={{ padding: "10px 12px", color: t.total > 0 ? T.gold : T.stoneL, fontWeight: t.total > 0 ? 700 : 400, whiteSpace: "nowrap" }}>
                          {t.total > 0 ? `$${t.total.toFixed(2)}` : "Free"}
                        </td>
                        {/* Booked On */}
                        <td style={{ padding: "10px 12px", color: T.textSoft, whiteSpace: "nowrap" }}>{t.bookedOn}</td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals footer */}
                  <tfoot>
                    <tr style={{ background: T.bgDeep, borderTop: `2px solid ${T.green3}40` }}>
                      <td colSpan={7} style={{ padding: "10px 12px", color: T.green4, fontWeight: 700, fontSize: "0.78rem" }}>TOTALS</td>
                      <td style={{ padding: "10px 12px", color: "#fff", fontWeight: 700, textAlign: "center" }}>{activeTickets.reduce((s, t) => s + (t.qty || 1), 0)}</td>
                      <td style={{ padding: "10px 12px", color: T.gold, fontWeight: 700, whiteSpace: "nowrap" }}>${activeTickets.reduce((s, t) => s + (t.total || 0), 0).toFixed(2)}</td>
                      <td style={{ padding: "10px 12px" }} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── WAITLIST ── */}
          {waitlist.length > 0 && (
            <Section title={`Waitlist (${waitlist.length})`} icon="⏳" accent="#FDE68A">
              {waitlist.map((w, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: T.cream, borderRadius: "8px", marginBottom: "6px", border: `1px solid ${T.border}` }}>
                  <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: T.bgDeep, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: 700, flexShrink: 0 }}>#{i + 1}</div>
                  <div>
                    <div style={{ color: T.textMid, fontWeight: 600, fontSize: "0.875rem" }}>{w.name || w.email || "Anonymous"}</div>
                    {w.email && w.name && <div style={{ color: T.stoneL, fontSize: "0.75rem" }}>{w.email}</div>}
                  </div>
                  {w.joinedAt && <div style={{ color: T.stoneL, fontSize: "0.72rem", marginLeft: "auto" }}>{new Date(w.joinedAt).toLocaleDateString()}</div>}
                </div>
              ))}
            </Section>
          )}

          {/* ── VIBE TAGS & CUSTOM QUESTIONS ── */}
          {((ev.vibeTags || []).length > 0 || (ev.customQuestions || []).length > 0) && (
            <Section title="Tags & Custom Questions" icon="🏷️">
              {(ev.vibeTags || []).length > 0 && (
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ color: T.stoneL, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "7px" }}>Vibe Tags</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                    {(ev.vibeTags || []).map(vid => {
                      const vt = VIBE_TAGS.find(v => v.id === vid);
                      return vt ? <Badge key={vid} label={`${vt.emoji} ${vt.label}`} /> : null;
                    })}
                  </div>
                </div>
              )}
              {(ev.customQuestions || []).length > 0 && (
                <div>
                  <div style={{ color: T.stoneL, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "7px" }}>Custom Questions ({ev.customQuestions.length})</div>
                  {ev.customQuestions.map((q, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 12px", background: T.cream, borderRadius: "8px", marginBottom: "6px" }}>
                      <span style={{ color: T.stoneL, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" }}>{q.type}</span>
                      <span style={{ color: T.textMid, fontSize: "0.85rem", flex: 1 }}>{q.label}</span>
                      {q.required && <Badge label="Required" color={T.warn} bg="#FEE2E2" />}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

        </div>

        {/* ── EXPENSES ── */}
        {(() => {
          const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
          const netProfit = revenue - totalExpenses;
          const catTotals = EXPENSE_CATEGORIES.reduce((acc, cat) => {
            const total = expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
            if (total > 0) acc[cat] = total;
            return acc;
          }, {});
          const filtered = expenseCatFilter === "All" ? expenses : expenses.filter(e => e.category === expenseCatFilter);
          const inp = (err) => ({ padding: "9px 12px", borderRadius: "9px", border: `1px solid ${err ? T.warn : T.border}`, fontFamily: "inherit", fontSize: "0.85rem", background: "#fff", outline: "none", width: "100%" });
          return (
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "22px", marginBottom: "20px" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
                <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.05rem", margin: 0 }}>📋 Event Expenses</h3>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  {expenses.length > 0 && (
                    <>
                      <span style={{ background: "#FEE2E2", color: T.warn, borderRadius: "6px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700 }}>
                        Total: ${totalExpenses.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </span>
                      <span style={{ background: netProfit >= 0 ? T.green5 : "#FEE2E2", color: netProfit >= 0 ? T.green1 : T.warn, borderRadius: "6px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700 }}>
                        {netProfit >= 0 ? "📈" : "📉"} Net: {netProfit < 0 ? "-" : ""}${Math.abs(netProfit).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </span>
                      <button onClick={exportExpensesCSV} style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem" }}>⬇ Export CSV</button>
                    </>
                  )}
                </div>
              </div>

              {/* Add / Edit form */}
              <div style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "16px 18px", marginBottom: "20px" }}>
                <div style={{ color: T.textMid, fontWeight: 700, fontSize: "0.85rem", marginBottom: "12px" }}>{editingExpenseId ? "✏️ Edit Expense" : "＋ Add Expense"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                  <div>
                    <div style={{ color: T.stoneL, fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Description *</div>
                    <input value={expenseForm.description} onChange={e => { setExpenseForm(f => ({...f, description: e.target.value})); setExpenseFormError(""); }}
                      placeholder="e.g. Venue rental deposit" style={inp(expenseFormError && !expenseForm.description.trim())} />
                  </div>
                  <div>
                    <div style={{ color: T.stoneL, fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Category</div>
                    <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({...f, category: e.target.value}))}
                      style={{ ...inp(false), appearance: "none", cursor: "pointer" }}>
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ color: T.stoneL, fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Amount ($) *</div>
                    <input type="number" min="0" step="0.01" value={expenseForm.amount} onChange={e => { setExpenseForm(f => ({...f, amount: e.target.value})); setExpenseFormError(""); }}
                      placeholder="0.00" style={inp(expenseFormError && (!expenseForm.amount || isNaN(parseFloat(expenseForm.amount))))} />
                  </div>
                  <div>
                    <div style={{ color: T.stoneL, fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Date</div>
                    <input type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({...f, date: e.target.value}))} style={inp(false)} />
                  </div>
                </div>
                <div style={{ marginBottom: "10px" }}>
                  <div style={{ color: T.stoneL, fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Notes (optional)</div>
                  <input value={expenseForm.notes} onChange={e => setExpenseForm(f => ({...f, notes: e.target.value}))}
                    placeholder="Invoice #, vendor name, payment method…" style={inp(false)} />
                </div>
                {expenseFormError && <div style={{ color: T.warn, fontSize: "0.8rem", marginBottom: "8px" }}>⚠ {expenseFormError}</div>}
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={submitExpense}
                    style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "8px", padding: "9px 20px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.85rem" }}>
                    {editingExpenseId ? "Save Changes" : "Add Expense"}
                  </button>
                  {editingExpenseId && (
                    <button onClick={cancelEditExpense} style={{ background: T.bg, color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "9px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: "0.85rem" }}>Cancel</button>
                  )}
                </div>
              </div>

              {/* Category breakdown pills */}
              {Object.keys(catTotals).length > 1 && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                  {Object.entries(catTotals).sort((a,b) => b[1]-a[1]).map(([cat, total]) => (
                    <div key={cat} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "5px 12px", fontSize: "0.75rem" }}>
                      <span style={{ color: T.textSoft }}>{cat}</span>
                      <span style={{ color: T.warn, fontWeight: 700, marginLeft: "6px" }}>${total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                      <span style={{ color: T.stoneL, fontSize: "0.68rem", marginLeft: "4px" }}>({totalExpenses > 0 ? Math.round(total/totalExpenses*100) : 0}%)</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Filter + table */}
              {expenses.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: T.stoneL, fontSize: "0.85rem" }}>No expenses recorded yet — add one above.</div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                    <div style={{ color: T.stoneL, fontSize: "0.78rem", fontWeight: 600 }}>Filter:</div>
                    {["All", ...EXPENSE_CATEGORIES.filter(c => expenses.some(e => e.category === c))].map(cat => (
                      <button key={cat} onClick={() => setExpenseCatFilter(cat)}
                        style={{ background: expenseCatFilter === cat ? T.green1 : T.bg, color: expenseCatFilter === cat ? "#fff" : T.textSoft, border: `1px solid ${expenseCatFilter === cat ? T.green1 : T.border}`, borderRadius: "6px", padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: "0.75rem", fontWeight: expenseCatFilter === cat ? 700 : 400 }}>{cat}</button>
                    ))}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                      <thead>
                        <tr style={{ background: T.bgDeep }}>
                          {["Description", "Category", "Amount", "Date", "Notes", ""].map(h => (
                            <th key={h} style={{ color: T.green4, padding: "9px 12px", textAlign: h === "Amount" ? "right" : "left", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((exp, i) => (
                          <tr key={exp.id} style={{ background: editingExpenseId === exp.id ? `${T.green5}` : i % 2 === 0 ? "#fff" : T.cream, borderBottom: `1px solid ${T.border}` }}>
                            <td style={{ padding: "10px 12px", color: T.text, fontWeight: 600 }}>{exp.description}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: "5px", padding: "2px 8px", fontSize: "0.72rem", color: T.textSoft, whiteSpace: "nowrap" }}>{exp.category}</span>
                            </td>
                            <td style={{ padding: "10px 12px", color: T.warn, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>${exp.amount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                            <td style={{ padding: "10px 12px", color: T.textSoft, whiteSpace: "nowrap" }}>{exp.date ? fmt(exp.date) : <span style={{ color: T.stoneL, fontStyle: "italic" }}>—</span>}</td>
                            <td style={{ padding: "10px 12px", color: T.textSoft, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={exp.notes}>{exp.notes || <span style={{ color: T.stoneL, fontStyle: "italic" }}>—</span>}</td>
                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button onClick={() => startEditExpense(exp)} style={{ background: T.cream, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 600 }}>✏️</button>
                                <button onClick={() => deleteExpense(exp.id)} style={{ background: "#FEE2E2", color: T.warn, border: `1px solid #FECACA`, borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: "0.75rem" }}>🗑️</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: T.bgDeep, borderTop: `2px solid ${T.green3}40` }}>
                          <td colSpan={2} style={{ padding: "10px 12px", color: T.green4, fontWeight: 700, fontSize: "0.78rem" }}>
                            {expenseCatFilter !== "All" ? `${expenseCatFilter} subtotal` : "TOTAL EXPENSES"}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#FCA5A5", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>
                            ${filtered.reduce((s,e) => s+e.amount,0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                          </td>
                          <td colSpan={3} />
                        </tr>
                        {expenseCatFilter === "All" && revenue > 0 && (
                          <tr style={{ background: netProfit >= 0 ? "#F0FDF4" : "#FEF2F2" }}>
                            <td colSpan={2} style={{ padding: "8px 12px", color: netProfit >= 0 ? T.green1 : T.warn, fontWeight: 700, fontSize: "0.78rem" }}>
                              {netProfit >= 0 ? "📈 NET PROFIT" : "📉 NET LOSS"}
                            </td>
                            <td style={{ padding: "8px 12px", color: netProfit >= 0 ? T.green1 : T.warn, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>
                              {netProfit < 0 ? "-" : ""}${Math.abs(netProfit).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                            </td>
                            <td colSpan={3} style={{ padding: "8px 12px", color: T.stoneL, fontSize: "0.72rem" }}>revenue − expenses</td>
                          </tr>
                        )}
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* ── DANGER ZONE ── */}
        <div style={{ background: "#FEF2F2", border: `1px solid #FECACA`, borderRadius: "16px", padding: "20px 22px", marginTop: "4px" }}>
          <h3 style={{ color: T.warn, fontFamily: "'Lora',serif", fontSize: "1rem", margin: "0 0 12px", display: "flex", alignItems: "center", gap: "8px" }}>⚠️ Danger Zone</h3>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button onClick={() => { if (window.confirm(`Duplicate "${ev.title}"? Dates will be cleared so you can set new ones.`)) duplicateEvent(ev); }} style={{ background: "#fff", color: T.textMid, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem" }}>⧉ Duplicate Event</button>
            <button onClick={() => { if (window.confirm("Permanently delete this event? This cannot be undone.")) { handleDelete(ev.id); setView("dashboard"); }}} style={{ background: T.warn, color: "#fff", border: "none", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.82rem" }}>🗑️ Delete Event</button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── DASHBOARD VIEW ───────────────────────────────────────────────────────────
function DashboardView() {
  const { events, setView, setDashUnlocked, setForm, setEditingId, setFormErrors, setSelectedId, startEdit, handleDelete, duplicateEvent, updateVendorStatus, showToast, resendApiKey, setResendApiKey, scheduleEventReminders, copyInviteLink, getInviteLink, loadEvents, vibeConfig, saveVibeConfig, sortConfig, saveSortConfig, categoryConfig, saveCategoryConfig, eventTypeConfig, saveEventTypeConfig } = useApp();
  const [dashTab, setDashTab] = useState("events");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [checkinSearch, setCheckinSearch] = useState("");
  const [checkinEvId, setCheckinEvId] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [bulkVendorEvId, setBulkVendorEvId] = useState("all");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const { checkinAttendee, undoCheckin } = useApp();
  const [evTicketsAll, setEvTicketsAll] = useState([]);
  const [evTicketsLoading, setEvTicketsLoading] = useState(false);
  const evTicketsRef = useRef([]);

  // Keep ref in sync so scanFrame interval always reads latest tickets (stale closure fix)
  useEffect(() => { evTicketsRef.current = evTicketsAll; }, [evTicketsAll]);

  // Load ALL tickets for selected check-in event (not just current user's)
  useEffect(() => {
    if (!checkinEvId) { setEvTicketsAll([]); evTicketsRef.current = []; return; }
    setEvTicketsLoading(true);
    supabase.from("tickets").select("*").eq("event_id", checkinEvId).then(({ data }) => {
      if (data) {
        const mapped = data.map(t => ({
          id: t.id, ticketId: t.ticket_id, orderId: t.order_id,
          eventId: t.event_id, tierId: t.tier_id,
          tierName: t.tier_name || "", eventTitle: t.event_title || "",
          buyerName: t.buyer_name, buyerEmail: t.buyer_email,
          qty: t.quantity, total: parseFloat(t.total || 0),
          orderNum: t.order_number || "", bookedOn: t.created_at?.split("T")[0] || "",
          status: t.status, checkedIn: t.checked_in, checkinTime: t.checkin_time,
        }));
        setEvTicketsAll(mapped);
        evTicketsRef.current = mapped;
      }
      setEvTicketsLoading(false);
    });
  }, [checkinEvId]);

  // ── QR Scanner logic ─────────────────────────────────────────────
  const startScanner = async () => {
    setScanResult(null);
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          scanIntervalRef.current = setInterval(() => scanFrame(), 300);
        }
      }, 200);
    } catch (e) {
      setScanning(false);
      alert("Camera access denied. Please allow camera permission and try again.");
    }
  };

  const stopScanner = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== 4) return;
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Decode QR using jsQR loaded from CDN
    if (window.jsQR) {
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        const text = code.data;
        stopScanner();
        // Try to find ticket by ticket_id in the QR data
        const ticketIdMatch = text.match(/TKT-[A-Z0-9]+/);
        if (ticketIdMatch) {
          const foundTicket = evTicketsRef.current.find(t => t.ticketId === ticketIdMatch[0] && t.eventId === checkinEvId);
          if (foundTicket) {
            setScanResult({ ticket: foundTicket, status: foundTicket.checkedIn ? "already" : "found" });
          } else {
            setScanResult({ status: "notfound", raw: ticketIdMatch[0] });
          }
        } else {
          setScanResult({ status: "invalid", raw: text });
        }
      }
    }
  };

  useEffect(() => { return () => stopScanner(); }, []);
  const dashActiveEvents = events.filter(ev => !isExpired(ev));
  const dashArchivedEvents = events.filter(ev => isExpired(ev));
  const filteredArchive = dashArchivedEvents.filter(ev => { const q = archiveSearch.toLowerCase(); return !archiveSearch || [ev.title, ev.location, ev.organizer, ev.category].some(s => s && s.toLowerCase().includes(q)); });
  const allVendors = events.flatMap(ev => (ev.vendors || []).map(v => ({ ...v, eventId: ev.id, eventTitle: ev.title })));
  const pending = allVendors.filter(v => v.status === "pending");
  const approved = allVendors.filter(v => v.status === "approved");
  const declined = allVendors.filter(v => v.status === "declined");

  // Checkin tab helpers
  const checkinEv = checkinEvId ? events.find(e => e.id === checkinEvId) : null;
  const evTickets = checkinEv ? evTicketsAll.filter(t => t.eventId === checkinEvId && t.status !== "cancelled") : [];
  const filteredTickets = checkinSearch
    ? evTickets.filter(t => [t.buyerName, t.buyerEmail, t.ticketId, t.orderNum].some(f => f && f.toLowerCase().includes(checkinSearch.toLowerCase())))
    : evTickets;
  const checkedInCount = evTickets.filter(t => t.checkedIn).length;
  const VendorCard = ({ v }) => (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "18px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "220px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
            <span style={{ color: T.text, fontWeight: 700, fontSize: "1rem", fontFamily: "'Lora',serif" }}>{v.businessName}</span>
            <span style={{ background: v.status === "approved" ? T.green5 : v.status === "declined" ? "#FEE2E2" : `${T.earth}20`, color: v.status === "approved" ? T.green1 : v.status === "declined" ? T.warn : T.earth, borderRadius: "100px", padding: "2px 10px", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" }}>{v.status === "approved" ? "✓ Approved" : v.status === "declined" ? "✗ Declined" : "⏳ Pending"}</span>
          </div>
          <div style={{ color: T.textSoft, fontSize: "0.8rem", marginBottom: "3px" }}>👤 {v.contactName} · 📧 {v.email} · 📞 {v.phone}</div>
          <div style={{ color: T.textSoft, fontSize: "0.8rem", marginBottom: "5px" }}>📅 Event: <strong>{v.eventTitle}</strong></div>
          <p style={{ color: T.textMid, fontSize: "0.82rem", lineHeight: 1.55, margin: "0 0 6px" }}>{v.description}</p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", fontSize: "0.78rem", color: T.stoneL }}>
            <span>📐 {v.spaceNeeded}</span>
            {v.yearsInBusiness && <span>🌱 {v.yearsInBusiness} yrs</span>}
            {v.hasPermit && <span>✅ Has permit</span>}
            {v.electricNeeded && <span>⚡ Needs electric</span>}
            {v.tentOwned && <span>⛺ Owns tent</span>}
          </div>
          {v.comments && <div style={{ marginTop: "8px", background: T.cream, borderRadius: "8px", padding: "8px 12px", color: T.textSoft, fontSize: "0.8rem", fontStyle: "italic" }}>"{v.comments}"</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
          {v.status !== "approved" && <button onClick={() => { updateVendorStatus(v.eventId, v.id, "approved"); showToast(`✅ ${v.businessName} approved!`); }} style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.8rem" }}>✓ Approve</button>}
          {v.status !== "declined" && <button onClick={() => { if (window.confirm(`Decline ${v.businessName}'s application?`)) { updateVendorStatus(v.eventId, v.id, "declined"); showToast(`${v.businessName} declined.`, "warn"); } }} style={{ background: "#FEE2E2", color: T.warn, border: `1px solid #FECACA`, borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>✗ Decline</button>}
          {v.status !== "pending" && <button onClick={() => { updateVendorStatus(v.eventId, v.id, "pending"); showToast("Application reset to pending.", "warn"); }} style={{ background: T.cream, color: T.stoneL, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>↺ Reset</button>}
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "2rem" }}>
      <div style={{ maxWidth: "1060px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "2rem", margin: "0 0 4px" }}>Admin Dashboard</h1>
            <p style={{ color: T.textSoft, margin: 0 }}>Manage events, review vendor applications, and update listings.</p>
          </div>
          <button onClick={() => { setDashUnlocked(false); setView("discover"); }} style={{ background: "#FEE2E2", color: T.warn, border: `1px solid #FECACA`, borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.85rem" }}>🔒 Lock Dashboard</button>
        </div>
        <div style={{ display: "flex", gap: "4px", marginBottom: "2rem", background: T.cream, borderRadius: "12px", padding: "4px", width: "fit-content", border: `1px solid ${T.border}`, flexWrap: "wrap" }}>
          {[["events", `Upcoming (${dashActiveEvents.length})`], ["checkin", `Check-In`], ["vendors", `Vendors${pending.length > 0 ? ` · ${pending.length} pending` : ""}`], ["archives", `Archives (${dashArchivedEvents.length})`], ["analytics", "📊 Analytics"], ["settings", "⚙️ Settings"]].map(([t, l]) => (
            <button key={t} onClick={() => setDashTab(t)} style={{ padding: "8px 20px", borderRadius: "9px", border: "none", background: dashTab === t ? T.bgCard : "transparent", color: dashTab === t ? T.green1 : T.textSoft, cursor: "pointer", fontFamily: "inherit", fontWeight: dashTab === t ? 700 : 400, fontSize: "0.875rem" }}>{l}</button>
          ))}
        </div>
        {dashTab === "events" && (
          <div style={{ display: "grid", gap: "16px" }}>
            <button onClick={() => { setForm(EMPTY_EVENT_FORM); setEditingId(null); setFormErrors({}); setView("create"); }} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px 24px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.9rem", width: "fit-content", display: "flex", alignItems: "center", gap: "8px" }}><span>+</span> Create New Event</button>
            {dashActiveEvents.length === 0 && <div style={{ textAlign: "center", padding: "3rem", color: T.stoneL, background: T.bgCard, borderRadius: "14px", border: `1px solid ${T.border}` }}><div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🗓️</div><div style={{ color: T.textMid }}>No upcoming events</div></div>}
            {dashActiveEvents.map(ev => (
              <div key={ev.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                <div style={{ width: "46px", height: "46px", borderRadius: "10px", background: `${ev.color}22`, border: `1px solid ${ev.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flexShrink: 0 }}>{catEmoji(ev.category)}</div>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <div style={{ color: T.text, fontWeight: 700, fontSize: "1rem", fontFamily: "'Lora',serif" }}>{ev.title}</div>
                  <div style={{ color: T.stoneL, fontSize: "0.8rem" }}>{dateRange(ev)} · {ev.location}</div>
                  <div style={{ display: "flex", gap: "6px", marginTop: "5px", flexWrap: "wrap" }}>
                    <span style={{ background: T.green5, color: T.green1, borderRadius: "4px", padding: "2px 8px", fontSize: "0.7rem", fontWeight: 600 }}>{ev.registered}/{ev.capacity} registered</span>
                    {ev.vendorInvite && <span style={{ background: `${T.earth}20`, color: T.earth, borderRadius: "4px", padding: "2px 8px", fontSize: "0.7rem", fontWeight: 600 }}>🛖 {(ev.vendors || []).length} apps · {(ev.vendors || []).filter(v => v.status === "approved").length} approved</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  <button onClick={() => { setSelectedId(ev.id); setView("admindetail"); }} style={{ background: `${T.bgDeep}`, color: T.green4, border: `1px solid ${T.green3}40`, borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>⚙️ Admin View</button>
                  <button onClick={() => { setSelectedId(ev.id); setView("detail"); }} style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>👁 Public View</button>
                  <button onClick={() => startEdit(ev)} style={{ background: T.cream, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>✏️ Edit</button>
                  <button onClick={() => { if (window.confirm(`Duplicate "${ev.title}"? Dates will be cleared so you can set new ones.`)) duplicateEvent(ev); }} style={{ background: T.cream, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>⧉ Dupe</button>
                  <button onClick={() => { if (window.confirm(`Send email reminders to all attendees of "${ev.title}"?`)) scheduleEventReminders(ev.id); }} style={{ background: `${T.green1}12`, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>📧 Remind</button>
                  {ev.isPrivate && (
                    <button onClick={async () => {
                      if (ev.inviteToken) {
                        copyInviteLink(ev);
                      } else {
                        const token = Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,10);
                        await supabase.from("events").update({ invite_token: token }).eq("id", ev.id);
                        await loadEvents();
                        showToast("Invite link generated &mdash; click again to copy! 🔗");
                      }
                    }} style={{ background: `${T.earth}12`, color: T.earth, border: `1px solid ${T.earthL}`, borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>
                      🔗 {ev.inviteToken ? "Invite Link" : "Generate Link"}
                    </button>
                  )}
                  <button onClick={() => { if (window.confirm("Delete this event?")) handleDelete(ev.id); }} style={{ background: "#FEE2E2", color: T.warn, border: `1px solid #FECACA`, borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem" }}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {dashTab === "checkin" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.2rem", flexWrap: "wrap", gap: "10px" }}>
              <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.4rem", margin: 0 }}>🎟️ Event Check-In</h2>
              {checkinEvId && (
                <button onClick={() => setView("dayofmode")}
                  style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px 20px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "7px" }}>
                  📱 Day-of Mode
                </button>
              )}
            </div>
            {/* Event picker */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ color: T.textSoft, fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>Select event to check in attendees</label>
              <select value={checkinEvId || ""} onChange={e => { setCheckinEvId(e.target.value || null); setCheckinSearch(""); }} style={{ padding: "10px 14px", borderRadius: "10px", border: `1px solid ${T.border}`, fontFamily: "inherit", fontSize: "0.9rem", background: T.bgCard, color: T.text, width: "100%", maxWidth: "460px" }}>
                <option value="">&mdash; Choose an event &mdash;</option>
                {dashActiveEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.title} ({ev.startDate})</option>)}
              </select>
            </div>

            {checkinEv && (
              <div>
                {/* Stats bar + CSV export */}
                <div style={{ display: "flex", gap: "14px", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "stretch" }}>
                  {[
                    ["Total Registered", evTickets.length],
                    ["Checked In", checkedInCount, T.green1],
                    ["Awaiting", evTickets.length - checkedInCount, "#D97706"],
                  ].map(([label, val, col]) => (
                    <div key={label} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "14px 20px", flex: "1 1 100px", textAlign: "center" }}>
                      <div style={{ color: col || T.text, fontSize: "1.8rem", fontWeight: 700, fontFamily: "'Lora',serif" }}>{val}</div>
                      <div style={{ color: T.stoneL, fontSize: "0.75rem", marginTop: "2px" }}>{label}</div>
                    </div>
                  ))}
                  {evTickets.length > 0 && (
                    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "14px 20px", flex: "1 1 100px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ color: T.stoneL, fontSize: "0.72rem" }}>Progress</span>
                        <span style={{ color: T.green1, fontSize: "0.72rem", fontWeight: 700 }}>{Math.round((checkedInCount / evTickets.length) * 100)}%</span>
                      </div>
                      <div style={{ height: "8px", background: T.border, borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(checkedInCount / evTickets.length) * 100}%`, background: `linear-gradient(90deg,${T.green2},${T.green1})`, borderRadius: "4px", transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Search + Scan + CSV Export */}
                <div style={{ marginBottom: "1rem", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <input placeholder="Search by name, email, or ticket ID…" value={checkinSearch} onChange={e => setCheckinSearch(e.target.value)} style={{ padding: "10px 14px", borderRadius: "10px", border: `1px solid ${T.border}`, fontFamily: "inherit", fontSize: "0.9rem", flex: "1", minWidth: "200px", maxWidth: "380px", background: T.bgCard }} />
                  <button onClick={scanning ? stopScanner : startScanner} style={{ padding: "10px 18px", borderRadius: "10px", border: "none", background: scanning ? "#DC2626" : T.green1, color: "#fff", fontWeight: 700, fontSize: "0.88rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
                    {scanning ? "⏹ Stop" : "📷 Scan QR"}
                  </button>
                  {evTickets.length > 0 && (
                    <button onClick={() => {
                      const rows = [["Ticket ID","Order #","Name","Email","Tier","Qty","Total","Booked","Checked In","Check-in Time"]];
                      evTickets.forEach(t => rows.push([t.ticketId, t.orderNum, t.buyerName, t.buyerEmail, t.tierName, t.qty, `$${(t.total||0).toFixed(2)}`, t.bookedOn, t.checkedIn ? "Yes" : "No", t.checkinTime || ""]));
                      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
                      const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
                      a.download = `${checkinEv.title.replace(/[^a-z0-9]/gi,"_")}_attendees.csv`; a.click();
                    }} style={{ padding: "10px 16px", borderRadius: "10px", border: `1px solid ${T.border}`, background: T.bgCard, color: T.textMid, fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", whiteSpace: "nowrap" }}>
                      ⬇️ Export CSV
                    </button>
                  )}
                </div>

                {/* QR Scanner UI */}
                {scanning && (
                  <div style={{ marginBottom: "1.5rem", background: T.bgCard, border: `2px solid ${T.green2}`, borderRadius: "14px", padding: "1rem", maxWidth: "420px" }}>
                    <div style={{ color: T.text, fontWeight: 700, marginBottom: "8px", fontSize: "0.9rem" }}>📷 Point camera at ticket QR code</div>
                    <div style={{ position: "relative", borderRadius: "10px", overflow: "hidden", background: "#000" }}>
                      <video ref={videoRef} style={{ width: "100%", display: "block", borderRadius: "10px" }} playsInline muted />
                      <div style={{ position: "absolute", inset: 0, border: "3px solid rgba(45,106,79,0.7)", borderRadius: "10px", pointerEvents: "none" }} />
                    </div>
                    <canvas ref={canvasRef} style={{ display: "none" }} />
                  </div>
                )}

                {/* Scan Result */}
                {scanResult && (
                  <div style={{ marginBottom: "1.5rem", borderRadius: "12px", padding: "16px 20px", maxWidth: "420px",
                    background: scanResult.status === "found" ? T.green5 : scanResult.status === "already" ? "#FEF3C7" : "#FEE2E2",
                    border: `2px solid ${scanResult.status === "found" ? T.green2 : scanResult.status === "already" ? "#F59E0B" : "#EF4444"}` }}>
                    {scanResult.status === "found" && (
                      <div>
                        <div style={{ fontWeight: 700, color: T.green1, marginBottom: "6px" }}>✅ Ticket Found!</div>
                        <div style={{ color: T.text, fontSize: "0.9rem" }}><strong>{scanResult.ticket.buyerName}</strong></div>
                        <div style={{ color: T.textSoft, fontSize: "0.82rem" }}>{scanResult.ticket.buyerEmail}</div>
                        <div style={{ color: T.stoneL, fontSize: "0.78rem", marginBottom: "12px" }}>{scanResult.ticket.tierName} · {scanResult.ticket.ticketId}</div>
                        <button onClick={async () => { await checkinAttendee(checkinEvId, scanResult.ticket.id); setEvTicketsAll(prev => prev.map(t => t.id === scanResult.ticket.id ? { ...t, checkedIn: true, checkinTime: new Date().toLocaleTimeString() } : t)); setScanResult(null); }}
                          style={{ padding: "10px 20px", borderRadius: "10px", border: "none", background: T.green1, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem" }}>
                          ✓ Check In Now
                        </button>
                        <button onClick={() => setScanResult(null)} style={{ marginLeft: "10px", padding: "10px 16px", borderRadius: "10px", border: `1px solid ${T.border}`, background: "transparent", color: T.textSoft, cursor: "pointer", fontSize: "0.9rem" }}>
                          Cancel
                        </button>
                      </div>
                    )}
                    {scanResult.status === "already" && (
                      <div>
                        <div style={{ fontWeight: 700, color: "#D97706", marginBottom: "6px" }}>⚠️ Already Checked In</div>
                        <div style={{ color: T.text, fontSize: "0.9rem" }}><strong>{scanResult.ticket.buyerName}</strong> was already checked in.</div>
                        <button onClick={() => setScanResult(null)} style={{ marginTop: "10px", padding: "8px 16px", borderRadius: "8px", border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer" }}>Dismiss</button>
                      </div>
                    )}
                    {(scanResult.status === "notfound" || scanResult.status === "invalid") && (
                      <div>
                        <div style={{ fontWeight: 700, color: "#DC2626", marginBottom: "6px" }}>❌ Ticket Not Found</div>
                        <div style={{ color: T.textSoft, fontSize: "0.85rem" }}>Could not find "{scanResult.raw}" for this event.</div>
                        <button onClick={() => setScanResult(null)} style={{ marginTop: "10px", padding: "8px 16px", borderRadius: "8px", border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer" }}>Dismiss</button>
                      </div>
                    )}
                  </div>
                )}

                {evTickets.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "3rem", color: T.stoneL, background: T.bgCard, borderRadius: "14px", border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🎫</div>
                    <div>{evTicketsLoading ? "Loading registrations…" : "No registrations yet for this event"}</div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "10px" }}>
                    {filteredTickets.map(ticket => (
                      <div key={ticket.ticketId} style={{ background: ticket.checkedIn ? `${T.green1}08` : T.bgCard, border: `2px solid ${ticket.checkedIn ? T.green2 : T.border}`, borderRadius: "12px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                        {/* Check-in toggle */}
                        <button
                          onClick={async () => {
                            if (ticket.checkedIn) {
                              await undoCheckin(ticket.id);
                              setEvTicketsAll(prev => prev.map(t => t.id === ticket.id ? { ...t, checkedIn: false, checkinTime: null } : t));
                            } else {
                              await checkinAttendee(checkinEv.id, ticket.id);
                              setEvTicketsAll(prev => prev.map(t => t.id === ticket.id ? { ...t, checkedIn: true, checkinTime: new Date().toLocaleTimeString() } : t));
                            }
                          }}
                          style={{ width: "38px", height: "38px", borderRadius: "10px", border: `2px solid ${ticket.checkedIn ? T.green1 : T.border}`, background: ticket.checkedIn ? T.green1 : "#fff", color: ticket.checkedIn ? "#fff" : T.stoneL, cursor: "pointer", fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}
                        >{ticket.checkedIn ? "✓" : ""}</button>
                        <div style={{ flex: 1, minWidth: "160px" }}>
                          <div style={{ color: T.text, fontWeight: 700, fontSize: "0.92rem" }}>{ticket.buyerName}</div>
                          <div style={{ color: T.textSoft, fontSize: "0.78rem" }}>{ticket.buyerEmail}</div>
                          <div style={{ color: T.stoneL, fontSize: "0.72rem", marginTop: "2px" }}>{ticket.tierName} · {ticket.qty} ticket{ticket.qty > 1 ? "s" : ""} · {ticket.ticketId}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          {ticket.checkedIn ? (
                            <div>
                              <div style={{ background: T.green5, color: T.green1, borderRadius: "6px", padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700 }}>✓ CHECKED IN</div>
                              {ticket.checkinTime && <div style={{ color: T.stoneL, fontSize: "0.7rem", marginTop: "3px" }}>{ticket.checkinTime}</div>}
                            </div>
                          ) : (
                            <div style={{ color: T.stoneL, fontSize: "0.75rem" }}>Not checked in</div>
                          )}
                        </div>
                      </div>
                    ))}
                    {filteredTickets.length === 0 && checkinSearch && (
                      <div style={{ textAlign: "center", padding: "2rem", color: T.stoneL }}>No attendees match "{checkinSearch}"</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {dashTab === "vendors" && (
          <div>
            {allVendors.length === 0
              ? <div style={{ textAlign: "center", padding: "4rem 0", color: T.stoneL }}><div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🛖</div><div style={{ fontSize: "1.1rem", color: T.textMid }}>No vendor applications yet</div></div>
              : <div style={{ display: "grid", gap: "24px" }}>
                {/* Bulk actions toolbar */}
                {pending.length > 0 && (
                  <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: "180px" }}>
                      <div style={{ color: T.text, fontWeight: 700, fontSize: "0.88rem" }}>Bulk Actions</div>
                      <div style={{ color: T.textSoft, fontSize: "0.78rem" }}>{pending.length} application{pending.length !== 1 ? "s" : ""} awaiting review</div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <select value={bulkVendorEvId} onChange={e => setBulkVendorEvId(e.target.value)} style={{ padding: "7px 12px", borderRadius: "8px", border: `1px solid ${T.border}`, fontFamily: "inherit", fontSize: "0.82rem", background: T.cream, color: T.text }}>
                        <option value="all">All Events</option>
                        {events.filter(ev => (ev.vendors||[]).some(v => v.status === "pending")).map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                      </select>
                      <button onClick={async () => {
                        if (!window.confirm(`Approve all pending vendors${bulkVendorEvId !== "all" ? " for this event" : ""}?`)) return;
                        const toApprove = pending.filter(v => bulkVendorEvId === "all" || v.eventId === bulkVendorEvId);
                        for (const v of toApprove) await updateVendorStatus(v.eventId, v.id, "approved");
                        showToast(`✅ ${toApprove.length} vendor${toApprove.length !== 1 ? "s" : ""} approved!`);
                      }} style={{ background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.82rem" }}>✓ Approve All Pending</button>
                      <button onClick={async () => {
                        if (!window.confirm(`Decline all pending vendors${bulkVendorEvId !== "all" ? " for this event" : ""}? This cannot be undone.`)) return;
                        const toDecline = pending.filter(v => bulkVendorEvId === "all" || v.eventId === bulkVendorEvId);
                        for (const v of toDecline) await updateVendorStatus(v.eventId, v.id, "declined");
                        showToast(`${toDecline.length} vendor${toDecline.length !== 1 ? "s" : ""} declined.`, "warn");
                      }} style={{ background: "#FEE2E2", color: T.warn, border: `1px solid #FECACA`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.82rem" }}>✗ Decline All Pending</button>
                    </div>
                  </div>
                )}
                {pending.length > 0 && <div><h3 style={{ color: T.earth, fontFamily: "'Lora',serif", margin: "0 0 12px" }}>⏳ Pending Review ({pending.length})</h3><div style={{ display: "grid", gap: "12px" }}>{pending.map(v => <VendorCard key={v.id} v={v} />)}</div></div>}
                {approved.length > 0 && <div><h3 style={{ color: T.green1, fontFamily: "'Lora',serif", margin: "0 0 12px" }}>✅ Approved ({approved.length})</h3><div style={{ display: "grid", gap: "12px" }}>{approved.map(v => <VendorCard key={v.id} v={v} />)}</div></div>}
                {declined.length > 0 && <div><h3 style={{ color: T.stoneL, fontFamily: "'Lora',serif", margin: "0 0 12px" }}>✗ Declined ({declined.length})</h3><div style={{ display: "grid", gap: "12px" }}>{declined.map(v => <VendorCard key={v.id} v={v} />)}</div></div>}
              </div>
            }
          </div>
        )}
        {dashTab === "archives" && (
          <div>
            {dashArchivedEvents.length === 0
              ? <div style={{ textAlign: "center", padding: "4rem 0", color: T.stoneL, background: T.bgCard, borderRadius: "14px", border: `1px solid ${T.border}` }}><div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>📦</div><div style={{ color: T.textMid }}>No archived events yet</div></div>
              : <div style={{ display: "grid", gap: "14px" }}>
                {filteredArchive.map(ev => (
                  <div key={ev.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", overflow: "hidden" }}>
                    <div style={{ height: "4px", background: `linear-gradient(90deg,${ev.color},${ev.color}88)` }} />
                    <div style={{ padding: "18px 20px", display: "flex", alignItems: "flex-start", gap: "14px", flexWrap: "wrap" }}>
                      <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: `${ev.color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", flexShrink: 0 }}>{catEmoji(ev.category)}</div>
                      <div style={{ flex: 1, minWidth: "180px" }}>
                        <div style={{ color: T.text, fontWeight: 700, fontSize: "1rem", fontFamily: "'Lora',serif", marginBottom: "3px" }}>{ev.title}</div>
                        <div style={{ color: T.stoneL, fontSize: "0.8rem", marginBottom: "10px" }}>{dateRange(ev)} · 📍 {ev.location}</div>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          <div style={{ background: T.green5, borderRadius: "8px", padding: "8px 12px" }}>
                            <div style={{ color: T.stoneL, fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", marginBottom: "3px" }}>Attendance</div>
                            <div style={{ color: T.green1, fontWeight: 700, fontSize: "1rem" }}>{ev.registered}<span style={{ color: T.stoneL, fontWeight: 400, fontSize: "0.75rem" }}>/{ev.capacity}</span></div>
                          </div>
                          {ev.price > 0 && <div style={{ background: `${T.gold}12`, borderRadius: "8px", padding: "8px 12px", border: `1px solid ${T.gold}30` }}>
                            <div style={{ color: T.stoneL, fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", marginBottom: "3px" }}>Revenue</div>
                            <div style={{ color: T.gold, fontWeight: 700, fontSize: "1rem" }}>${(ev.ticketTiers ? ev.ticketTiers.reduce((s, t) => s + t.price * t.sold, 0) : (ev.price * ev.registered)).toLocaleString()}</div>
                          </div>}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "7px", flexShrink: 0 }}>
                        <button onClick={() => { setSelectedId(ev.id); setView("admindetail"); }} style={{ background: T.bgDeep, color: T.green4, border: `1px solid ${T.green3}40`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem" }}>⚙️ Admin View</button>
                        <button onClick={() => { setSelectedId(ev.id); setView("detail"); }} style={{ background: T.cream, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem" }}>👁 Public View</button>
                        <button onClick={() => startEdit(ev)} style={{ background: T.cream, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem" }}>✏️ Edit</button>
                        <button onClick={() => { if (window.confirm("Permanently delete this event?")) handleDelete(ev.id); }} style={{ background: "#FEF2F2", color: T.warn, border: `1px solid #FECACA`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem" }}>🗑️ Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            }
          </div>
        )}
        {dashTab === "analytics" && (() => {
          const allEvents = events;
          const totalRevenue = allEvents.reduce((s, ev) => s + (ev.ticketTiers || []).reduce((ts, t) => ts + t.price * t.sold, 0), 0);
          const totalRegistrations = allEvents.reduce((s, ev) => s + (ev.ticketTiers || []).reduce((ts, t) => ts + t.sold, 0), 0);
          const totalCapacityVal = allEvents.reduce((s, ev) => s + (ev.capacity || 0), 0);
          const fillRate = totalCapacityVal > 0 ? Math.round((totalRegistrations / totalCapacityVal) * 100) : 0;
          const freeEvents = allEvents.filter(ev => (ev.ticketTiers||[]).every(t => t.price === 0) || (ev.ticketTiers||[]).length === 0).length;
          const paidEvents = allEvents.length - freeEvents;

          // Revenue by category
          const catRevMap = {};
          const catRegMap = {};
          allEvents.forEach(ev => {
            const cat = ev.category || "Other";
            const rev = (ev.ticketTiers||[]).reduce((s, t) => s + t.price * t.sold, 0);
            const reg = (ev.ticketTiers||[]).reduce((s, t) => s + t.sold, 0);
            catRevMap[cat] = (catRevMap[cat] || 0) + rev;
            catRegMap[cat] = (catRegMap[cat] || 0) + reg;
          });
          const catData = Object.entries(catRegMap).sort((a,b) => b[1]-a[1]);
          const maxCatReg = Math.max(...catData.map(([,v]) => v), 1);

          // Top events by registrations
          const topEvents = [...allEvents].sort((a,b) => {
            const aReg = (a.ticketTiers||[]).reduce((s,t)=>s+t.sold,0);
            const bReg = (b.ticketTiers||[]).reduce((s,t)=>s+t.sold,0);
            return bReg - aReg;
          }).slice(0, 5);

          const statCard = (label, value, sub, color) => (
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "20px 22px" }}>
              <div style={{ color: T.stoneL, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>{label}</div>
              <div style={{ color: color || T.text, fontSize: "2rem", fontWeight: 700, fontFamily: "'Lora',serif", lineHeight: 1 }}>{value}</div>
              {sub && <div style={{ color: T.textSoft, fontSize: "0.78rem", marginTop: "6px" }}>{sub}</div>}
            </div>
          );

          // Build a ticket-sales-over-time chart from event dates
          // Group sold tickets by event month (approximated from event startDate)
          const monthMap = {};
          allEvents.forEach(ev => {
            if (!ev.startDate) return;
            const key = ev.startDate.slice(0, 7); // "YYYY-MM"
            const reg = (ev.ticketTiers||[]).reduce((s,t) => s + t.sold, 0);
            const rev = (ev.ticketTiers||[]).reduce((s,t) => s + t.price * t.sold, 0);
            if (!monthMap[key]) monthMap[key] = { month: key, tickets: 0, revenue: 0 };
            monthMap[key].tickets += reg;
            monthMap[key].revenue += rev;
          });
          const trendData = Object.values(monthMap).sort((a,b) => a.month.localeCompare(b.month)).map(d => ({
            ...d,
            label: new Date(d.month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
          }));

          return (
            <div style={{ display: "grid", gap: "24px" }}>
              {/* Stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "14px" }}>
                {statCard("Total Revenue", `$${totalRevenue.toLocaleString()}`, `${paidEvents} paid event${paidEvents !== 1 ? "s" : ""}`, T.gold)}
                {statCard("Total Registrations", totalRegistrations.toLocaleString(), `across ${allEvents.length} event${allEvents.length !== 1 ? "s" : ""}`, T.green1)}
                {statCard("Avg Fill Rate", `${fillRate}%`, `${totalCapacityVal.toLocaleString()} total capacity`)}
                {statCard("Free Events", freeEvents, `${paidEvents} paid event${paidEvents !== 1 ? "s" : ""}`)}
              </div>

              {/* Revenue + Registration trend chart */}
              {trendData.length >= 2 && (() => {
                const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = window.Recharts || {};
                if (!ResponsiveContainer) return (
                  <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "22px", color: T.stoneL, fontSize: "0.85rem" }}>
                    Loading chart…
                  </div>
                );
                return (
                  <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "22px" }}>
                    <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.05rem", margin: "0 0 18px" }}>📈 Tickets & Revenue by Event Month</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                        <XAxis dataKey="label" tick={{ fill: T.stoneL, fontSize: 11 }} />
                        <YAxis yAxisId="left" tick={{ fill: T.stoneL, fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: T.gold, fontSize: 11 }} tickFormatter={v => `$${v}`} />
                        <Tooltip formatter={(val, name) => name === "Revenue" ? [`$${val.toFixed(0)}`, name] : [val, name]} contentStyle={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "8px", fontSize: "0.82rem" }} />
                        <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
                        <Line yAxisId="left" type="monotone" dataKey="tickets" stroke={T.green2} strokeWidth={2.5} dot={{ fill: T.green1, strokeWidth: 2, r: 4 }} name="Tickets Sold" />
                        <Line yAxisId="right" type="monotone" dataKey="revenue" stroke={T.gold} strokeWidth={2.5} dot={{ fill: T.gold, strokeWidth: 2, r: 4 }} name="Revenue" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}

              {/* Registrations by category */}
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "22px" }}>
                <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.05rem", margin: "0 0 18px" }}>Registrations by Category</h3>
                {catData.length === 0
                  ? <div style={{ color: T.stoneL, fontSize: "0.85rem" }}>No data yet</div>
                  : <div style={{ display: "grid", gap: "10px" }}>
                    {catData.map(([cat, reg]) => (
                      <div key={cat}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ color: T.textMid, fontSize: "0.82rem", fontWeight: 600 }}>{catEmoji(cat)} {cat}</span>
                          <span style={{ color: T.text, fontSize: "0.82rem", fontWeight: 700 }}>{reg} {catRevMap[cat] > 0 ? <span style={{ color: T.gold, fontWeight: 400, fontSize: "0.76rem" }}>· ${catRevMap[cat].toLocaleString()}</span> : ""}</span>
                        </div>
                        <div style={{ height: "8px", background: T.border, borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(reg / maxCatReg) * 100}%`, background: `linear-gradient(90deg,${T.green2},${T.green1})`, borderRadius: "4px" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                }
              </div>

              {/* Top events */}
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "22px" }}>
                <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.05rem", margin: "0 0 18px" }}>Top Events by Registrations</h3>
                {topEvents.length === 0
                  ? <div style={{ color: T.stoneL, fontSize: "0.85rem" }}>No events yet</div>
                  : <div style={{ display: "grid", gap: "10px" }}>
                    {topEvents.map((ev, i) => {
                      const reg = (ev.ticketTiers||[]).reduce((s,t)=>s+t.sold,0);
                      const rev = (ev.ticketTiers||[]).reduce((s,t)=>s+t.price*t.sold,0);
                      const cap = ev.capacity || 1;
                      return (
                        <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 14px", background: T.cream, borderRadius: "10px" }}>
                          <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: `${ev.color}22`, border: `1px solid ${ev.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: T.textSoft, fontSize: "0.8rem", flexShrink: 0 }}>#{i+1}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: T.text, fontWeight: 700, fontSize: "0.88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.title}</div>
                            <div style={{ color: T.stoneL, fontSize: "0.75rem" }}>{dateRange(ev)}</div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ color: T.green1, fontWeight: 700, fontSize: "0.9rem" }}>{reg}<span style={{ color: T.stoneL, fontWeight: 400, fontSize: "0.75rem" }}>/{cap}</span></div>
                            {rev > 0 && <div style={{ color: T.gold, fontSize: "0.75rem", fontWeight: 600 }}>${rev.toLocaleString()}</div>}
                          </div>
                          <div style={{ width: "60px", flexShrink: 0 }}>
                            <div style={{ height: "6px", background: T.border, borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(100,(reg/cap)*100)}%`, background: T.green1, borderRadius: "3px" }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                }
              </div>

              {/* Revenue breakdown table */}
              {totalRevenue > 0 && (
                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "22px" }}>
                  <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.05rem", margin: "0 0 18px" }}>Revenue Breakdown</h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                          {["Event","Date","Tier","Sold","Price","Revenue"].map(h => (
                            <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: T.stoneL, fontWeight: 700, textTransform: "uppercase", fontSize: "0.68rem", letterSpacing: "0.06em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allEvents.flatMap(ev => (ev.ticketTiers||[]).filter(t => t.price > 0 && t.sold > 0).map(t => (
                          <tr key={`${ev.id}-${t.id}`} style={{ borderBottom: `1px solid ${T.border}` }}>
                            <td style={{ padding: "9px 12px", color: T.text, fontWeight: 600, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</td>
                            <td style={{ padding: "9px 12px", color: T.textSoft }}>{fmt(ev.startDate)}</td>
                            <td style={{ padding: "9px 12px", color: T.textSoft }}>{t.name}</td>
                            <td style={{ padding: "9px 12px", color: T.green1, fontWeight: 700 }}>{t.sold}</td>
                            <td style={{ padding: "9px 12px", color: T.textMid }}>${t.price.toFixed(2)}</td>
                            <td style={{ padding: "9px 12px", color: T.gold, fontWeight: 700 }}>${(t.price * t.sold).toLocaleString()}</td>
                          </tr>
                        )))}
                        <tr style={{ borderTop: `2px solid ${T.border}`, background: T.cream }}>
                          <td colSpan={5} style={{ padding: "10px 12px", color: T.text, fontWeight: 700 }}>Total</td>
                          <td style={{ padding: "10px 12px", color: T.gold, fontWeight: 800, fontSize: "1rem" }}>${totalRevenue.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {dashTab === "settings" && <DashSettingsPanel />}
      </div>
    </div>
  );
}

// ─── SAVED VIEW ───────────────────────────────────────────────────────────────
function SavedView() {
  const { events, getInterest, following, currentUser, setSelectedId, setView, openAuth } = useApp();
  if (!currentUser) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem 2rem", textAlign: "center" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔖</div>
        <h2 style={{ color: T.text, fontFamily: "'Lora',serif", margin: "0 0 0.75rem" }}>Your Saved Events</h2>
        <p style={{ color: T.textSoft, marginBottom: "1.5rem", maxWidth: "360px" }}>Sign in to see events you're going to, interested in, and organizers you follow.</p>
        <button onClick={() => openAuth("login")} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px 28px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.95rem" }}>Sign In</button>
      </div>
    );
  }

  const uid = currentUser.id;
  const goingEvents = events.filter(ev => (getInterest(ev.id).going || []).includes(uid));
  const interestedEvents = events.filter(ev => (getInterest(ev.id).interested || []).includes(uid));
  const followedEvents = events.filter(ev => following.has(ev.organizer));

  const EventPill = ({ ev }) => (
    <div onClick={() => { setSelectedId(ev.id); setView("detail"); }}
      style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", transition: "box-shadow 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(44,106,79,0.12)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = ""}>
      <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: `linear-gradient(135deg,${ev.color}33,${ev.color}66)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", flexShrink: 0 }}>{catEmoji(ev.category)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: T.text, fontWeight: 700, fontSize: "0.9rem", fontFamily: "'Lora',serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
        <div style={{ color: T.green1, fontSize: "0.75rem", fontWeight: 600 }}>{dateRange(ev)}</div>
        <div style={{ color: T.stoneL, fontSize: "0.72rem" }}>📍 {ev.location}</div>
      </div>
      <div style={{ color: T.stoneL, fontSize: "1rem" }}>›</div>
    </div>
  );

  const Section = ({ emoji, title, items, empty }) => (
    <div style={{ marginBottom: "2rem" }}>
      <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.1rem", margin: "0 0 12px", display: "flex", alignItems: "center", gap: "8px" }}>
        {emoji} {title} <span style={{ color: T.stoneL, fontWeight: 400, fontSize: "0.85rem" }}>({items.length})</span>
      </h3>
      {items.length === 0
        ? <div style={{ color: T.stoneL, fontSize: "0.85rem", padding: "1.5rem", background: T.bgCard, borderRadius: "12px", border: `1px solid ${T.border}`, textAlign: "center" }}>{empty}</div>
        : <div style={{ display: "grid", gap: "10px" }}>{items.map(ev => <EventPill key={ev.id} ev={ev} />)}</div>
      }
    </div>
  );

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "2rem" }}>
      <h2 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.75rem", margin: "0 0 0.5rem" }}>🔖 Saved &amp; Following</h2>
      <p style={{ color: T.textSoft, fontSize: "0.9rem", marginBottom: "2rem" }}>Events you're tracking and organizers you follow.</p>
      <Section emoji="✅" title="Going" items={goingEvents} empty="No events marked as going yet" />
      <Section emoji="❤️" title="Interested" items={interestedEvents} empty="No events marked as interested yet &mdash; browse events and tap ⭐ Interested" />
      <Section emoji="🔔" title="Events from Followed Organizers" items={followedEvents} empty={following.size === 0 ? "Follow organizers from any event page to see their events here" : "No upcoming events from organizers you follow"} />
      {following.size > 0 && (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "18px" }}>
          <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1rem", margin: "0 0 12px" }}>🔔 Following ({following.size})</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {[...following].map(org => (
              <div key={org} style={{ background: T.green5, color: T.green1, borderRadius: "100px", padding: "6px 14px", fontSize: "0.82rem", fontWeight: 600 }}>
                {org}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MOBILE BOTTOM NAV ────────────────────────────────────────────────────────
function MobileBottomNav() {
  const { view, setView, cart, currentUser, openAuth, interests, getInterest, following } = useApp();
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  // Count user's saves
  const uid = currentUser?.id;
  const savedCount = uid
    ? Object.values(interests).filter(i => i.going?.includes(uid) || i.interested?.includes(uid)).length + following.size
    : 0;

  const navItems = [
    { id: "discover", icon: "🌿", label: "Discover" },
    { id: "vendors",  icon: "🛖", label: "Vendors" },
    { id: "saved", icon: "🔖", label: "Saved", badge: savedCount },
    { id: "mytickets", icon: "🎫", label: "Tickets" },
    { id: "profile", icon: currentUser ? "👤" : "🔑", label: currentUser ? "Profile" : "Sign In" },
  ];

  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 250, background: T.bgDeep, borderTop: `1px solid rgba(116,198,157,0.2)`, display: "flex", alignItems: "stretch", paddingBottom: "env(safe-area-inset-bottom, 0px)", boxShadow: "0 -4px 24px rgba(0,0,0,0.25)" }}
      className="mobile-only">
      {navItems.map(item => {
        const active = view === item.id || (item.id === "profile" && view === "mytickets" && !currentUser);
        return (
          <button key={item.id}
            onClick={() => {
              if (item.id === "profile") { if (currentUser) setView("mytickets"); else openAuth("login"); }
              else setView(item.id);
            }}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", background: "none", border: "none", cursor: "pointer", padding: "10px 4px", position: "relative", transition: "background 0.15s" }}>
            {item.badge > 0 && (
              <div style={{ position: "absolute", top: "6px", right: "calc(50% - 18px)", width: "16px", height: "16px", borderRadius: "50%", background: T.green2, color: "#fff", fontSize: "0.6rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.badge > 9 ? "9+" : item.badge}</div>
            )}
            {item.id === "mytickets" && cartCount > 0 && (
              <div style={{ position: "absolute", top: "6px", right: "calc(50% - 18px)", width: "16px", height: "16px", borderRadius: "50%", background: T.warn, color: "#fff", fontSize: "0.6rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</div>
            )}
            <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: "0.62rem", fontWeight: active ? 700 : 400, color: active ? T.green3 : "#6B7280", letterSpacing: "0.02em" }}>{item.label}</span>
            {active && <div style={{ position: "absolute", bottom: 0, left: "20%", right: "20%", height: "2px", background: T.green3, borderRadius: "2px 2px 0 0" }} />}
          </button>
        );
      })}
    </div>
  );
}

// ─── FOOTER ───────────────────────────────────────────────────────────────────
// ─── MEMORY REEL ──────────────────────────────────────────────────────────────
// ─── DAY-OF CHECK-IN MODE ─────────────────────────────────────────────────────
function DayOfModeView() {
  const { events, setView, checkinAttendee, undoCheckin, showToast } = useApp();
  const [evId, setEvId] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [checkinFeedback, setCheckinFeedback] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const ticketsRef = useRef([]);
  useEffect(() => { ticketsRef.current = tickets; }, [tickets]);

  const activeEvents = events.filter(ev => !isExpired(ev));

  const loadTickets = async (id) => {
    setLoading(true);
    const result = await supabase.from("tickets").select("*").eq("event_id", id);
    if (result.data) {
      const mapped = result.data.map(t => ({
        id: t.id, ticketId: t.ticket_id, buyerName: t.buyer_name, buyerEmail: t.buyer_email,
        tierName: t.tier_name, qty: t.quantity, status: t.status,
        checkedIn: t.checked_in, checkinTime: t.checkin_time, eventId: t.event_id,
      }));
      setTickets(mapped); ticketsRef.current = mapped;
    }
    setLoading(false);
  };

  const handleEvChange = (id) => { setEvId(id); if (id) loadTickets(id); else setTickets([]); };

  const doCheckin = async (ticket) => {
    if (ticket.checkedIn) { showToast(`${ticket.buyerName} already checked in`, "warn"); return; }
    await checkinAttendee(ticket.eventId, ticket.id);
    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, checkedIn: true, checkinTime: new Date().toLocaleTimeString() } : t));
    setCheckinFeedback({ name: ticket.buyerName });
    setScanResult(null);
    setTimeout(() => setCheckinFeedback(null), 2500);
  };

  const stopScanner = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (videoRef.current?.srcObject) { videoRef.current.srcObject.getTracks().forEach(t => t.stop()); videoRef.current.srcObject = null; }
    setScanning(false);
  };
  const startScanner = async () => {
    setScanResult(null); setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setTimeout(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); scanIntervalRef.current = setInterval(scanFrame, 300); }
      }, 200);
    } catch { setScanning(false); alert("Camera access denied."); }
  };
  const scanFrame = () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== 4) return;
    const ctx = canvas.getContext("2d"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (window.jsQR) {
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        stopScanner();
        const m = code.data.match(/TKT-[A-Z0-9]+/);
        if (m) { const found = ticketsRef.current.find(t => t.ticketId === m[0]); setScanResult(found || { notFound: true, raw: m[0] }); }
        else setScanResult({ notFound: true, raw: code.data });
      }
    }
  };

  const checkedIn = tickets.filter(t => t.checkedIn && t.status !== "cancelled").length;
  const total = tickets.filter(t => t.status !== "cancelled").length;
  const filtered = tickets.filter(t => t.status !== "cancelled" && (!search || [t.buyerName, t.buyerEmail, t.ticketId].some(f => f && f.toLowerCase().includes(search.toLowerCase()))));
  const ev = events.find(e => e.id === evId);

  return (
    <div style={{ minHeight: "100vh", background: T.bgDeep, color: "#fff", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <div style={{ background: T.bgMid, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid rgba(116,198,157,0.2)`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ fontSize: "1.4rem" }}>📱</div>
          <div>
            <div style={{ color: T.green3, fontWeight: 700, fontSize: "0.95rem" }}>Day-of Mode</div>
            {ev && <div style={{ color: T.stoneL, fontSize: "0.75rem" }}>{ev.title}</div>}
          </div>
        </div>
        <button onClick={() => { stopScanner(); setView("dashboard"); }}
          style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem" }}>✕ Exit</button>
      </div>
      <div style={{ padding: "16px" }}>
        {!evId ? (
          <div style={{ maxWidth: "500px", margin: "3rem auto", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎟️</div>
            <h2 style={{ fontFamily: "'Lora',serif", margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Select Today's Event</h2>
            <div style={{ display: "grid", gap: "10px" }}>
              {activeEvents.map(e => (
                <button key={e.id} onClick={() => handleEvChange(e.id)}
                  style={{ background: `linear-gradient(135deg,${T.bgMid},rgba(0,0,0,0.3))`, border: `2px solid ${T.green1}50`, borderRadius: "14px", padding: "18px 20px", cursor: "pointer", color: "#fff", textAlign: "left", fontFamily: "inherit" }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "3px" }}>{e.title}</div>
                  <div style={{ color: T.stoneL, fontSize: "0.8rem" }}>{dateRange(e)} · {e.location}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: "600px", margin: "0 auto" }}>
            {/* Stats */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              {[["Checked In", checkedIn, T.green3], ["Remaining", total - checkedIn, "#F59E0B"], ["Total", total, T.stoneL]].map(([l, v, c]) => (
                <div key={l} style={{ flex: 1, background: "rgba(255,255,255,0.07)", borderRadius: "12px", padding: "14px 8px", textAlign: "center", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ color: c, fontSize: "2rem", fontWeight: 700, fontFamily: "'Lora',serif", lineHeight: 1 }}>{v}</div>
                  <div style={{ color: T.stoneL, fontSize: "0.68rem", marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                </div>
              ))}
            </div>
            {total > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ height: "10px", background: "rgba(255,255,255,0.1)", borderRadius: "5px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(checkedIn / total) * 100}%`, background: `linear-gradient(90deg,${T.green2},${T.green3})`, borderRadius: "5px", transition: "width 0.5s" }} />
                </div>
                <div style={{ color: T.stoneL, fontSize: "0.7rem", marginTop: "4px", textAlign: "right" }}>{Math.round((checkedIn / total) * 100)}% checked in</div>
              </div>
            )}
            {/* Big scan button */}
            <button onClick={scanning ? stopScanner : startScanner}
              style={{ width: "100%", background: scanning ? "#DC2626" : `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "16px", padding: "20px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "1.1rem", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
              {scanning ? "⏹ Stop Scanner" : "📷 Scan QR Code"}
            </button>
            {scanning && (
              <div style={{ position: "relative", borderRadius: "16px", overflow: "hidden", marginBottom: "14px", background: "#000" }}>
                <video ref={videoRef} style={{ width: "100%", display: "block" }} playsInline />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <div style={{ width: "200px", height: "200px", border: `3px solid ${T.green3}`, borderRadius: "16px", boxShadow: "0 0 0 2000px rgba(0,0,0,0.5)" }} />
                </div>
              </div>
            )}
            {scanResult && !scanResult.notFound && (
              <div style={{ background: scanResult.checkedIn ? "rgba(220,38,38,0.15)" : `${T.green1}25`, border: `2px solid ${scanResult.checkedIn ? T.warn : T.green2}`, borderRadius: "14px", padding: "18px", marginBottom: "14px" }}>
                <div style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "4px" }}>{scanResult.buyerName}</div>
                <div style={{ color: T.stoneL, fontSize: "0.82rem", marginBottom: "12px" }}>{scanResult.tierName} · {scanResult.ticketId}</div>
                {scanResult.checkedIn ? (
                  <div style={{ color: T.warn, fontWeight: 700 }}>⚠️ Already checked in at {scanResult.checkinTime}</div>
                ) : (
                  <button onClick={() => doCheckin(scanResult)}
                    style={{ width: "100%", background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "12px", padding: "16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "1rem" }}>
                    ✅ Check In {scanResult.buyerName}
                  </button>
                )}
              </div>
            )}
            {scanResult?.notFound && (
              <div style={{ background: "rgba(220,38,38,0.15)", border: `2px solid ${T.warn}`, borderRadius: "14px", padding: "16px", marginBottom: "14px", textAlign: "center" }}>
                <div style={{ color: T.warn, fontWeight: 700 }}>❌ Ticket Not Found</div>
                <div style={{ color: T.stoneL, fontSize: "0.78rem", marginTop: "4px" }}>{scanResult.raw}</div>
              </div>
            )}
            {/* Success flash */}
            {checkinFeedback && (
              <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 999, background: T.green1, borderRadius: "20px", padding: "28px 36px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", animation: "slideUp 0.3s ease" }}>
                <div style={{ fontSize: "3.5rem", marginBottom: "8px" }}>✅</div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: "1.2rem" }}>{checkinFeedback.name}</div>
                <div style={{ color: T.green4, fontSize: "0.85rem", marginTop: "4px" }}>Checked in!</div>
              </div>
            )}
            {/* Manual search */}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search name or ticket ID…"
              style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: "0.9rem", fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: "12px" }} />
            <div style={{ display: "grid", gap: "8px" }}>
              {loading && <div style={{ textAlign: "center", padding: "2rem", color: T.stoneL }}>Loading attendees…</div>}
              {!loading && filtered.map(t => (
                <div key={t.id} style={{ background: t.checkedIn ? `${T.green1}20` : "rgba(255,255,255,0.05)", border: `2px solid ${t.checkedIn ? T.green2 : "rgba(255,255,255,0.1)"}`, borderRadius: "14px", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.buyerName}</div>
                    <div style={{ color: T.stoneL, fontSize: "0.72rem", marginTop: "2px" }}>{t.tierName} · {t.qty} ticket{t.qty > 1 ? "s" : ""}</div>
                    {t.checkedIn && <div style={{ color: T.green3, fontSize: "0.7rem", marginTop: "2px" }}>✓ {t.checkinTime || "Checked in"}</div>}
                  </div>
                  {t.checkedIn ? (
                    <button onClick={() => { undoCheckin(t.id); setTickets(prev => prev.map(x => x.id === t.id ? { ...x, checkedIn: false, checkinTime: null } : x)); }}
                      style={{ background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)", color: "#FCA5A5", borderRadius: "10px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem", flexShrink: 0 }}>Undo</button>
                  ) : (
                    <button onClick={() => doCheckin(t)}
                      style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, border: "none", color: "#fff", borderRadius: "10px", padding: "12px 20px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.95rem", flexShrink: 0 }}>✓ In</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── VENDOR DIRECTORY VIEW ────────────────────────────────────────────────────
function VendorDirectoryView() {
  const { events, setSelectedId, setView } = useApp();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("All");

  // Collect approved vendors who opted into the community directory, deduplicate by email
  const allVendors = [];
  const seen = new Set();
  events.forEach(ev => {
    (ev.vendors || []).filter(v => v.status === "approved" && v.communityOptIn).forEach(v => {
      const key = v.email || v.businessName;
      if (!seen.has(key)) {
        seen.add(key);
        allVendors.push({ ...v, eventTitle: ev.title, eventId: ev.id, eventDate: ev.startDate });
      }
    });
  });

  const vendorTypes = ["All", ...new Set(allVendors.map(v => v.vendorType).filter(Boolean))];
  const filtered = allVendors.filter(v => {
    const q = search.toLowerCase();
    const ms = !search || [v.businessName, v.description, v.city, v.vendorType].some(s => s && s.toLowerCase().includes(q));
    const mt = filterType === "All" || v.vendorType === filterType;
    return ms && mt;
  });

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ background: `linear-gradient(160deg,${T.bgDeep},${T.bgMid})`, padding: "3rem 2rem 2.5rem", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: `${T.earth}25`, border: `1px solid ${T.earthL}50`, borderRadius: "100px", padding: "5px 16px", fontSize: "0.78rem", color: T.earthL, fontWeight: 600, marginBottom: "1rem" }}>🛖 VENDOR COMMUNITY</div>
        <h1 style={{ color: "#fff", fontFamily: "'Lora',serif", fontSize: "clamp(1.8rem,4vw,2.8rem)", fontWeight: 700, margin: "0 0 0.75rem" }}>Meet Our Vendors</h1>
        <p style={{ color: "#9CA3AF", maxWidth: "480px", margin: "0 auto 1.5rem", lineHeight: 1.7 }}>Farmers, artisans, and makers who bring New Harmony Life to life.</p>
        <div style={{ maxWidth: "480px", margin: "0 auto", position: "relative" }}>
          <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors, products, cities…"
            style={{ width: "100%", padding: "12px 14px 12px 40px", background: "rgba(255,255,255,0.12)", border: `1px solid ${T.green3}40`, borderRadius: "12px", color: "#fff", fontSize: "0.9rem", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>
        {allVendors.length > 0 && (
          <div style={{ marginTop: "1.25rem", color: T.green4, fontSize: "0.82rem" }}>
            {allVendors.length} vendor{allVendors.length !== 1 ? "s" : ""} in our community
          </div>
        )}
      </div>

      {/* Type filter */}
      {vendorTypes.length > 1 && (
        <div style={{ padding: "1rem 2rem 0", display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {vendorTypes.map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              style={{ padding: "5px 14px", borderRadius: "100px", border: filterType === t ? `1px solid ${T.earth}` : `1px solid ${T.border}`, background: filterType === t ? `${T.earthL}25` : "transparent", color: filterType === t ? T.earth : T.textSoft, fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit", fontWeight: filterType === t ? 700 : 400 }}>
              {t}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: "1.5rem 2rem 3rem" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: T.stoneL }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🛖</div>
            <div style={{ fontSize: "1rem", color: T.textMid }}>
              {allVendors.length === 0
                ? "No vendors have joined the community directory yet"
                : `No vendors found${search ? " for that search" : ""}`}
            </div>
            {allVendors.length === 0 && (
              <p style={{ color: T.stoneL, fontSize: "0.82rem", maxWidth: "340px", margin: "0.75rem auto 0", lineHeight: 1.6 }}>
                Vendors can opt in to the community directory when applying for an event.
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "18px" }}>
            {filtered.map((v, i) => (
              <div key={i} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "14px", overflow: "hidden", transition: "box-shadow 0.2s, transform 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 8px 30px rgba(44,106,79,0.14)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; }}>
                {/* Header strip */}
                <div style={{ background: `linear-gradient(135deg,${T.bgDeep},${T.bgMid})`, padding: "16px 18px", display: "flex", alignItems: "center", gap: "12px" }}>
                  {v.photo ? (
                    <img src={v.photo} alt={v.businessName} style={{ width: "56px", height: "56px", borderRadius: "10px", objectFit: "cover", flexShrink: 0, border: `2px solid ${T.green3}40` }} />
                  ) : (
                    <div style={{ width: "56px", height: "56px", borderRadius: "10px", background: `${T.green1}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem", flexShrink: 0 }}>🌿</div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem", fontFamily: "'Lora',serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.businessName}</div>
                    <div style={{ color: T.green4, fontSize: "0.72rem", marginTop: "2px" }}>{v.vendorType}</div>
                    {v.city && <div style={{ color: T.stoneL, fontSize: "0.7rem", marginTop: "1px" }}>📍 {v.city}{v.state ? `, ${v.state}` : ""}</div>}
                  </div>
                </div>
                <div style={{ padding: "14px 18px" }}>
                  {v.description && <p style={{ color: T.textSoft, fontSize: "0.8rem", lineHeight: 1.55, margin: "0 0 12px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.description}</p>}
                  {(v.website || v.instagram) && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                      {v.website && <a href={v.website.startsWith("http") ? v.website : `https://${v.website}`} target="_blank" rel="noopener noreferrer" style={{ color: T.green1, fontSize: "0.75rem", textDecoration: "none", fontWeight: 600 }}>🌐 Website</a>}
                      {v.instagram && <span style={{ color: T.earth, fontSize: "0.75rem", fontWeight: 600 }}>📷 {v.instagram}</span>}
                    </div>
                  )}
                  <button onClick={() => { setSelectedId(v.eventId); setView("detail"); }}
                    style={{ width: "100%", background: T.green5, color: T.green1, border: `1px solid ${T.green3}`, borderRadius: "8px", padding: "8px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem" }}>
                    See at: {v.eventTitle} →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MemoryReel({ eventId }) {
  const { eventPhotos, loadEventPhotos, events } = useApp();
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef(null);
  const photos = eventPhotos[eventId] || [];
  const ev = events.find(e => e.id === eventId);

  useEffect(() => {
    if (!loaded) { loadEventPhotos(eventId).catch(() => {}); setLoaded(true); }
  }, [eventId]);

  useEffect(() => {
    if (playing && photos.length > 1) {
      intervalRef.current = setInterval(() => setCurrent(c => (c + 1) % photos.length), 2800);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [playing, photos.length]);

  if (photos.length < 2) return null;

  const handleShare = async () => {
    const text = `📷 Memories from ${ev?.title || "the event"} &mdash; ${photos.length} photos from our community!`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {}
  };

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "16px", overflow: "hidden", marginBottom: "2rem" }}>
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ color: T.text, fontFamily: "'Lora',serif", fontSize: "1.1rem", margin: 0 }}>🎞️ Memory Reel <span style={{ color: T.stoneL, fontWeight: 400, fontSize: "0.85rem" }}>({photos.length} photos)</span></h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => { setPlaying(p => !p); setCurrent(0); }}
            style={{ background: playing ? T.warn : `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "8px", padding: "7px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.82rem" }}>
            {playing ? "⏹ Stop" : "▶ Play Reel"}
          </button>
          <button onClick={handleShare}
            style={{ background: T.cream, border: `1px solid ${T.border}`, color: T.textMid, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem" }}>
            {copied ? "✓ Copied!" : "🔗 Share"}
          </button>
        </div>
      </div>

      {/* Filmstrip */}
      {!playing ? (
        <div style={{ display: "flex", gap: "6px", padding: "0 20px 16px", overflowX: "auto" }} className="hide-scrollbar">
          {photos.map((p, i) => (
            <div key={p.id} onClick={() => { setCurrent(i); setPlaying(true); }}
              style={{ flexShrink: 0, width: "120px", height: "90px", borderRadius: "8px", overflow: "hidden", cursor: "pointer", border: `2px solid ${T.border}`, transition: "transform 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
              onMouseLeave={e => e.currentTarget.style.transform = ""}>
              <img src={p.url} alt={p.caption || "Memory"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ position: "relative", background: "#000", height: "360px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {photos.map((p, i) => (
            <div key={p.id} style={{ position: "absolute", inset: 0, opacity: i === current ? 1 : 0, transition: "opacity 0.7s ease", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={p.url} alt={p.caption || "Memory"} style={{ maxWidth: "100%", maxHeight: "360px", objectFit: "contain" }} />
            </div>
          ))}
          {/* Caption overlay */}
          {photos[current]?.caption && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,rgba(0,0,0,0.7))", padding: "24px 20px 14px", color: "#fff", fontSize: "0.85rem", textAlign: "center" }}>
              {photos[current].caption}
            </div>
          )}
          {/* Nav arrows */}
          <button onClick={() => setCurrent(c => (c - 1 + photos.length) % photos.length)}
            style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: "36px", height: "36px", cursor: "pointer", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <button onClick={() => setCurrent(c => (c + 1) % photos.length)}
            style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: "36px", height: "36px", cursor: "pointer", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          {/* Dot indicators */}
          <div style={{ position: "absolute", bottom: "10px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "5px" }}>
            {photos.map((_, i) => <div key={i} onClick={() => setCurrent(i)} style={{ width: i === current ? "18px" : "7px", height: "7px", borderRadius: "100px", background: i === current ? T.green3 : "rgba(255,255,255,0.4)", cursor: "pointer", transition: "all 0.3s" }} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function Footer() {
  const { view, setView, dashUnlocked, currentUser } = useApp();
  // Don't show footer on full-screen views
  if (["checkout", "dashlogin", "dashboard"].includes(view)) return null;
  return (
    <footer style={{ background: T.bgDeep, borderTop: `1px solid rgba(116,198,157,0.12)`, padding: "2.5rem 2rem 2rem", marginTop: "2rem" }}>
      <div style={{ maxWidth: "1060px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "2rem", justifyContent: "space-between", alignItems: "flex-start" }}>
        {/* Brand */}
        <div style={{ minWidth: "180px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <div style={{ width: 32, height: 32, borderRadius: "8px", background: `linear-gradient(135deg,${T.green2},${T.green3})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>🌿</div>
            <div>
              <div style={{ color: "#fff", fontFamily: "'Lora',serif", fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.1 }}>New Harmony Life</div>
              <div style={{ color: T.green4, fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>Events</div>
            </div>
          </div>
          <p style={{ color: T.stoneL, fontSize: "0.78rem", lineHeight: 1.6, margin: 0, maxWidth: "200px" }}>Community events rooted in nature, shared joy, and the heartland.</p>
        </div>
        {/* Nav links */}
        <div>
          <div style={{ color: T.green4, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Explore</div>
          {[["discover", "Browse Events"], ["mytickets", "My Account"]].map(([v, l]) => (
            <div key={v} style={{ marginBottom: "6px" }}>
              <button onClick={() => setView(v)} style={{ background: "none", border: "none", color: T.stoneL, cursor: "pointer", fontSize: "0.82rem", fontFamily: "inherit", padding: 0, textAlign: "left" }}
                onMouseEnter={e => e.target.style.color = T.green4} onMouseLeave={e => e.target.style.color = T.stoneL}>{l}</button>
            </div>
          ))}
        </div>
        {/* Info */}
        <div>
          <div style={{ color: T.green4, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Info</div>
          <div style={{ color: T.stoneL, fontSize: "0.82rem", marginBottom: "6px" }}>📍 Castana, IA</div>
          <div style={{ color: T.stoneL, fontSize: "0.82rem" }}>🌱 Loess Hills Region</div>
        </div>
        {/* Admin &mdash; only visible to logged-in users */}
        {currentUser && (
          <div>
            <div style={{ color: T.green4, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Admin</div>
            {dashUnlocked
              ? <button onClick={() => setView("dashboard")} style={{ background: `${T.green1}25`, border: `1px solid ${T.green1}40`, color: T.green3, borderRadius: "6px", padding: "5px 12px", cursor: "pointer", fontSize: "0.78rem", fontFamily: "inherit", fontWeight: 600 }}>⚙️ Dashboard</button>
              : <button onClick={() => setView("dashlogin")} style={{ background: "none", border: `1px solid rgba(255,255,255,0.1)`, color: T.stoneL, borderRadius: "6px", padding: "5px 12px", cursor: "pointer", fontSize: "0.78rem", fontFamily: "inherit" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"} onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}>
                  🔒 Admin Login
                </button>
            }
          </div>
        )}
      </div>
      <div style={{ maxWidth: "1060px", margin: "2rem auto 0", paddingTop: "1.5rem", borderTop: `1px solid rgba(255,255,255,0.06)`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ color: "rgba(156,163,175,0.5)", fontSize: "0.72rem" }}>© {new Date().getFullYear()} New Harmony Life · All rights reserved</div>
        <div style={{ color: "rgba(156,163,175,0.35)", fontSize: "0.68rem" }}>Built with 🌿 for the community</div>
      </div>
    </footer>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
function AppShell() {
  const { view, currentUser, installPrompt, setInstallPrompt, isInstalled, isOnline, setView, openAuth, dashUnlocked } = useApp();
  const [showInstallBanner, setShowInstallBanner] = useState(true);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") { setInstallPrompt(null); setShowInstallBanner(false); }
  };

  const mobileHidden = ["checkout", "dashlogin", "dashboard", "create", "dayofmode", "admindetail"].includes(view);

  return (
    <div style={{ fontFamily: "'DM Sans',system-ui,sans-serif", background: T.bg, minHeight: "100vh", paddingBottom: mobileHidden ? "0" : "0" }}>
      {/* Offline indicator */}
      {!isOnline && (
        <div style={{ background: "#DC2626", color: "#fff", textAlign: "center", padding: "8px", fontSize: "0.82rem", fontWeight: 600, position: "sticky", top: 0, zIndex: 300 }}>
          📡 You're offline &mdash; showing cached data
        </div>
      )}
      {/* PWA Install Banner */}
      {installPrompt && !isInstalled && showInstallBanner && (
        <div style={{ background: `linear-gradient(90deg,${T.bgDeep},${T.bgMid})`, borderBottom: `1px solid ${T.green3}`, padding: "10px 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ fontSize: "1.5rem" }}>🌿</div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.88rem" }}>Add to Home Screen</div>
              <div style={{ color: T.stoneL, fontSize: "0.75rem" }}>Install New Harmony Life for a better experience</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={handleInstall} style={{ background: `linear-gradient(135deg,${T.green1},${T.green2})`, color: "#fff", border: "none", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.82rem" }}>Install App</button>
            <button onClick={() => setShowInstallBanner(false)} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: T.stoneL, borderRadius: "8px", padding: "8px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: "0.82rem" }}>Not now</button>
          </div>
        </div>
      )}
      <Navbar />
      {currentUser && view !== "dashlogin" && (
        <div style={{ background: `linear-gradient(90deg,${T.bgMid},${T.bgDeep})`, borderBottom: `1px solid rgba(116,198,157,0.15)`, padding: "9px 2rem", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: (currentUser.avatarColor || currentUser.avatar_color || "#40916C"), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, flexShrink: 0 }}>{initials(currentUser)}</div>
          <span style={{ color: T.green4, fontSize: "0.875rem" }}>
            Hello, <strong style={{ color: "#fff", fontFamily: "'Lora',serif" }}>{currentUser.firstName || currentUser.first_name || ""}!</strong>{" "}
            <span style={{ color: T.stoneL, fontSize: "0.78rem", fontWeight: 400 }}>
              {view === "discover" && "Welcome back &mdash; what's happening near you?"}
              {view === "detail" && "Viewing event details"}
              {view === "create" && "Creating a new event"}
              {view === "mytickets" && "Your account & registered events"}
              {view === "checkout" && "Completing your order"}
              {view === "dashboard" && "You're in admin mode"}
              {view === "admindetail" && "Admin event details"}
            </span>
          </span>
        </div>
      )}
      {/* Main content &mdash; add bottom padding on mobile so bottom nav doesn't cover content */}
      <div style={{ paddingBottom: mobileHidden ? "0" : "env(safe-area-inset-bottom, 0)" }}>
        {view === "discover" && <DiscoverView />}
        {view === "vendors" && <VendorDirectoryView />}
        {view === "detail" && <DetailView />}
        {view === "create" && <CreateView />}
        {view === "mytickets" && <MyTicketsView />}
        {view === "checkout" && <CheckoutView />}
        {view === "dashlogin" && <DashLoginView />}
        {view === "dashboard" && <DashboardView />}
        {view === "admindetail" && <AdminDetailView />}
        {view === "dayofmode" && <DayOfModeView />}
        {view === "saved" && <SavedView />}
        <Footer />
      </div>
      <CartSidebar />
      <VendorModal />
      <CalendarEventModal />
      <AuthModal />
      <Toast />
      <PWAInstallBanner />
      {/* Mobile bottom navigation */}
      {!mobileHidden && <MobileBottomNav />}
    </div>
  );
}

// ─── ROOT EXPORT ──────────────────────────────────────────────────────────────
export default function App() {
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'DM Sans',system-ui,sans-serif;}
        input[type=date]::-webkit-calendar-picker-indicator,
        input[type=time]::-webkit-calendar-picker-indicator{opacity:0.6;cursor:pointer;}
        select option{background:#fff;color:#1C2B1A;}
        input::placeholder,textarea::placeholder{color:#9CA3AF;}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        ::-webkit-scrollbar{width:6px;height:6px;}
        ::-webkit-scrollbar-track{background:#F0F0EA;}
        ::-webkit-scrollbar-thumb{background:#74C69D;border-radius:3px;}
        /* Mobile bottom nav &mdash; only visible on small screens */
        .mobile-bottom-nav { display: none !important; }
        .mobile-nav-spacer { display: none !important; }
        .mobile-only { display: none !important; }
        @media (max-width: 640px) {
          .mobile-bottom-nav { display: flex !important; }
          .mobile-nav-spacer { display: block !important; }
          .mobile-only { display: flex !important; }
          body { padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px)); }
        }
        .hide-scrollbar::-webkit-scrollbar{display:none;}
      `}</style>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </>
  );
}
