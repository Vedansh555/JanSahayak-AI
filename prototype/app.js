/* JanSahayak AI — prototype app. Vanilla JS: one state object, string-template screens, delegated events. */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const KEY = 'jansahayak-proto-v1';
const OCCS = ['farmer', 'student', 'homemaker', 'worker', 'business', 'senior', 'other'];
const AGES = ['u18', '18_35', '36_59', '60'];

function defaults() {
  return {
    screen: 'splash', lang: 'en', prefLang: 'en', langChosen: false,
    profile: null,
    form: { name: '', mobile: '', verified: false, state: '', district: '', village: '', age: '', occ: '', a11y: [] },
    answers: {},
    consent: { essential: true, personal: true, location: false, notif: true },
    textScale: 1, ttsRate: 1, autoRead: false, mic: 'ask',
    notifPrefs: { scheme: true, camp: true, vax: true, service: true, reminder: false }, alertLang: 'same',
    read: [], reminders: [], docs: {},
    simAlert: false, offline: false, alertDismissed: false,
    detailId: 'pmkisan', healthTab: 'camps', schemeQ: '', schemeCat: null, schemeLvl: 'all', notifFilter: 'all',
  };
}
const PERSIST = ['lang', 'prefLang', 'langChosen', 'profile', 'form', 'answers', 'consent', 'textScale', 'ttsRate', 'autoRead', 'mic',
  'notifPrefs', 'alertLang', 'read', 'reminders', 'docs', 'simAlert', 'offline', 'alertDismissed'];

let state = defaults();
try { const raw = localStorage.getItem(KEY); if (raw) Object.assign(state, JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
state.screen = state.langChosen ? 'home' : 'splash';

// Transient UI state — never persisted.
const UI = {
  hist: [], chat: [], ctx: null, typing: false, rec: false, recTimer: null, heard: false, draft: '',
  errors: {}, otpLeft: 0, otpTimer: null, speaking: false, ttsQueue: 0,
  qList: [], qi: 0, showSimple: {}, open: {}, langQ: '', showNoMatch: false, matchFocus: null, editing: false, pickerFor: 'form',
};

function save() {
  try {
    const o = {};
    PERSIST.forEach(k => { o[k] = state[k]; });
    if (!state.consent.personal) o.answers = {};
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch (e) { /* storage unavailable */ }
}

/* ---------- i18n ---------- */
let fbUsed = false;
function t(key, vars) {
  const e = S[key];
  let s;
  if (!e) s = key;
  else if (state.lang === 'hi') s = e[1] || e[0];
  else if (state.lang === 'en') s = e[0];
  else {
    const p = P[state.lang];
    if (p && p[key]) s = p[key];
    else { s = e[0]; fbUsed = true; }
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? ''));
  return s;
}
const isHi = () => state.lang === 'hi';
const tr = (en, hi) => (isHi() ? hi : en);
function filled(v) { return v != null && v !== '' && (!Array.isArray(v) || v.length > 0); }
function L(o) {
  if (o == null) return '';
  if (typeof o === 'string') return o;
  if (filled(o[state.lang])) return o[state.lang];
  if (state.lang !== 'en') fbUsed = true;
  return o.en;
}
function isFallback(o) { return state.lang !== 'en' && o && !filled(o[state.lang]); }
function curLang(code = state.lang) { return LANGUAGES.find(l => l.code === code) || LANGUAGES[0]; }
function contentBcp() { return isHi() ? 'hi-IN' : 'en-IN'; }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, cls = '') => `<i data-lucide="${n}"${cls ? ` class="${cls}"` : ''} aria-hidden="true"></i>`;
function icons() { if (window.lucide) { try { lucide.createIcons(); } catch (e) { /* icon set unavailable */ } } }

function fmtDate(d) { return d.toLocaleDateString(isHi() ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); }
function fmtTime(d) { return d.toLocaleTimeString(isHi() ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' }); }
function ago(d) {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  if (m < 60) return t('ago_m', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('ago_h', { n: h });
  return t('ago_d', { n: Math.round(h / 24) });
}
function until(d) {
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
  if (days <= 0) return t('today');
  if (days === 1) return t('tomorrow');
  return t('inDays', { n: days });
}
function isOffline() { return state.offline || !navigator.onLine; }

/* ---------- Profile helpers ---------- */
function getP() {
  const pr = state.profile || {};
  const a = state.answers || {};
  const base = { name: pr.name, state: pr.state || a.state, district: pr.district || a.district, village: pr.village };
  if (state.consent.personal) { base.age = pr.age; base.occ = pr.occ; }
  return Object.assign(base, a);
}
function setAns(k, v) {
  state.answers[k] = v;
  if (state.profile && (k === 'age' || k === 'occ') && state.consent.personal) state.profile[k] = v;
  save();
}
function areaLabel() {
  const p = getP();
  return [p.village, p.district].filter(Boolean).join(', ');
}
function unreadCount() { return visibleNotifs().filter(n => !state.read.includes(n.id)).length; }
function visibleNotifs() { return NOTIFS.filter(n => !n.needsAlert || state.simAlert); }

/* ---------- Brand art ---------- */
function logoSVG() {
  return `<svg viewBox="0 0 96 96" role="img" aria-label="JanSahayak AI logo">
    <rect x="2" y="2" width="92" height="92" rx="26" fill="#246B45"/>
    <path d="M14 48 L40 26 L66 48" fill="none" stroke="#FFF8EC" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 43 V74 H59 V43" fill="none" stroke="#FFF8EC" stroke-width="5" stroke-linejoin="round"/>
    <circle cx="33" cy="54" r="4.6" fill="#F39A36"/><path d="M25.5 72 q7.5 -13 15 0z" fill="#F39A36"/>
    <circle cx="47" cy="54" r="4.6" fill="#FFF8EC"/><path d="M39.5 72 q7.5 -13 15 0z" fill="#FFF8EC"/>
    <path d="M64 13 h18 a6 6 0 0 1 6 6 v9 a6 6 0 0 1 -6 6 h-9 l-6 6 v-6 h-3 a6 6 0 0 1 -6 -6 v-9 a6 6 0 0 1 6 -6z" fill="#F39A36"/>
    <circle cx="67" cy="23.5" r="2.2" fill="#246B45"/><circle cx="73" cy="23.5" r="2.2" fill="#246B45"/><circle cx="79" cy="23.5" r="2.2" fill="#246B45"/>
    <path d="M68 80 c0 -11 8 -18 18 -18 c0 11 -7 18 -18 18z" fill="#E5EFE5"/><path d="M69 79 l11 -11" stroke="#246B45" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}
function figure(x, o) {
  const y = 150;
  let s = `<rect x="${x - 7}" y="${y - 22}" width="5" height="22" rx="2" fill="#3B4740"/><rect x="${x + 2}" y="${y - 22}" width="5" height="22" rx="2" fill="#3B4740"/>`;
  s += `<path d="M${x - 12} ${y - 20} q0 -30 12 -32 q12 2 12 32z" fill="${o.body}"/>`;
  s += `<circle cx="${x}" cy="${y - 60}" r="8" fill="#B87B4B"/>`;
  if (o.hat) s += `<path d="M${x - 9} ${y - 62} q9 -12 18 0 q-9 3 -18 0z" fill="${o.hat}"/>`;
  if (o.hair) s += `<path d="M${x - 8} ${y - 61} q8 -13 16 0 q-2 -6 -8 -6 q-6 0 -8 6z" fill="${o.hair}"/>`;
  if (o.bun) s += `<circle cx="${x + 7}" cy="${y - 64}" r="4" fill="#2B2B2B"/>`;
  if (o.drape) s += `<path d="M${x - 12} ${y - 22} q4 -22 18 -30 l4 6 q-12 8 -14 24z" fill="${o.drape}"/>`;
  if (o.stick) s += `<line x1="${x + 16}" y1="${y - 52}" x2="${x + 16}" y2="${y}" stroke="#8A5A2B" stroke-width="3" stroke-linecap="round"/>`;
  if (o.cane) s += `<path d="M${x - 16} ${y} V${y - 34} q0 -5 5 -5" fill="none" stroke="#8A5A2B" stroke-width="3" stroke-linecap="round"/>`;
  if (o.phone) s += `<rect x="${x + 4}" y="${y - 44}" width="8" height="12" rx="2" fill="#FFF8EC" stroke="#202A24" stroke-width="1.2"/><path d="M${x + 16} ${y - 46} q4 4 0 8 M${x + 19} ${y - 49} q7 7 0 14" fill="none" stroke="#F39A36" stroke-width="2" stroke-linecap="round"/>`;
  return s;
}
function villageArt() {
  return `<svg class="village-art" viewBox="0 0 330 170" role="img" aria-label="A farmer, an older man, a woman and a young person using a phone, standing in a village">
    <circle cx="272" cy="38" r="20" fill="#F39A36" opacity=".85"/>
    <path d="M0 118 Q80 82 170 110 T330 98 V170 H0Z" fill="#D3E4D4"/>
    <path d="M0 142 Q110 120 220 138 T330 132 V170 H0Z" fill="#BCD6BF"/>
    <path d="M16 92 L42 72 L68 92Z" fill="#246B45"/><rect x="22" y="92" width="40" height="26" fill="#FFFFFF" stroke="#246B45" stroke-width="2"/><rect x="37" y="102" width="10" height="16" fill="#F39A36"/>
    <path d="M262 98 L286 80 L310 98Z" fill="#246B45"/><rect x="268" y="98" width="36" height="22" fill="#FFFFFF" stroke="#246B45" stroke-width="2"/><rect x="281" y="106" width="9" height="14" fill="#2463A6"/>
    <rect x="236" y="96" width="4" height="22" fill="#8A5A2B"/><circle cx="238" cy="88" r="13" fill="#246B45" opacity=".85"/>
    ${figure(108, { body: '#246B45', hat: '#F39A36', stick: true })}
    ${figure(150, { body: '#FFFFFF', hair: '#D7DCD8', cane: true })}
    ${figure(192, { body: '#F39A36', bun: true, hair: '#2B2B2B', drape: '#C86F12' })}
    ${figure(232, { body: '#2463A6', hair: '#2B2B2B', phone: true })}
  </svg>`;
}
function botSVG(cls = 'bot') {
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill="#FFFFFF"/>
    <rect x="14" y="18" width="36" height="28" rx="12" fill="#246B45"/>
    <circle cx="25" cy="31" r="3.4" fill="#FFF8EC"/><circle cx="39" cy="31" r="3.4" fill="#FFF8EC"/>
    <path d="M26 38 q6 4 12 0" fill="none" stroke="#F39A36" stroke-width="2.6" stroke-linecap="round"/>
    <line x1="32" y1="18" x2="32" y2="11" stroke="#246B45" stroke-width="2.6"/><circle cx="32" cy="9" r="3" fill="#F39A36"/>
    <path d="M6 28 v8 M58 28 v8" stroke="#2463A6" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}
function shieldPersonSVG() {
  return `<svg class="art" viewBox="0 0 84 84" aria-hidden="true">
    <circle cx="42" cy="42" r="40" fill="#E5EFE5"/>
    <circle cx="36" cy="32" r="10" fill="#B87B4B"/><path d="M26 30 q10 -14 20 0 q-3 -7 -10 -7 q-7 0 -10 7z" fill="#2B2B2B"/>
    <path d="M18 66 q0 -22 18 -22 q18 0 18 22z" fill="#246B45"/>
    <path d="M56 40 l12 5 v9 q0 10 -12 15 q-12 -5 -12 -15 v-9z" fill="#F39A36"/><path d="M51 54 l4 4 l7 -8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ---------- Shared bits ---------- */
function topbar(title, extra = '') {
  const backBtn = UI.hist.length ? `<button class="icon-btn" data-a="back" aria-label="${t('back')}">${ic('arrow-left')}</button>` : '';
  return `<div class="topbar">${backBtn}<div class="title">${title}</div>${extra}</div>`;
}
function langPill() { return `<button class="lang-pill" data-a="go" data-to="language" aria-label="${t('chooseLanguage')}">${ic('languages')}${esc(curLang().native)}</button>`; }
function bell() {
  const n = unreadCount();
  return `<button class="icon-btn" data-a="go" data-to="notifications" aria-label="${t('nTitle')}${n ? ` (${n})` : ''}">${ic('bell')}${n ? `<span class="dot">${n}</span>` : ''}</button>`;
}
function demoBadge(sim) { return sim ? `<span class="badge b-demo">${ic('flask-conical')}${t('simulated')}</span>` : ''; }
function extLink(url, name, cls = 'link-btn') { return `<a class="${cls}" href="${esc(url)}" data-a="ext" data-url="${esc(url)}" data-name="${esc(name)}">${ic('external-link')}${esc(name)}</a>`; }
function verifyLine(s) {
  return `<div class="verify-line"><span>${ic('badge-check')}${t('official')}: ${extLink(s.source, s.sourceName)}</span><span>${ic('clock')}${t('lastVerified')}: ${t('notVerified')}</span>${demoBadge()}</div>`;
}
function catName(id) { return t('cat_' + id); }
function catTone(s) { return (CATEGORIES.find(c => c.id === s.cats[0]) || {}).tone || 'green'; }
function statusBadge(s) {
  const map = { ongoing: ['b-green', 'st_ongoing'], seasonal: ['b-saffron', 'st_seasonal'], unknown: ['b-grey', 'st_unknown'] };
  const [c, k] = map[s.status] || map.unknown;
  return `<span class="badge ${c}">${t(k)}</span>`;
}
function levelBadge(s) { return `<span class="badge b-blue">${s.level === 'state' ? `${t('lvl_state')} · ${esc(s.state)}` : t('lvl_central')}</span>`; }
function sw(id, checked, c, extra = '', disabled = false) {
  return `<span class="switch"><input type="checkbox" role="switch" id="${id}" data-c="${c}" ${extra} ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span></span></span>`;
}

/* ---------- Screens ---------- */
const SCREENS = {};

SCREENS.splash = () => `
  <div class="splash">
    <div class="blob" style="width:260px;height:260px;top:-90px;right:-110px"></div>
    <div class="blob" style="width:180px;height:180px;bottom:120px;left:-90px;opacity:.7"></div>
    <div class="splash-top">${langPill()}</div>
    <div class="splash-hero">
      <div class="splash-logo">${logoSVG()}</div>
      <div class="splash-name">JanSahayak <span class="ai">AI</span></div>
      <div class="splash-hi" lang="hi">जनसहायक AI</div>
      <div class="splash-sub">${t('subtitle')}</div>
      <div class="splash-pillars">${t('pillars')}</div>
      ${villageArt()}
      <div class="splash-tag">${ic('mic')}<span>${S.tagline[0]}</span></div>
      <div class="small muted">${t('voiceReady')}</div>
    </div>
    <div class="splash-actions">
      <button class="btn btn-primary btn-block" data-a="go" data-to="language">${t('getStarted')}${ic('arrow-right')}</button>
      <button class="btn btn-secondary btn-block" data-a="go" data-to="language">${ic('languages')}${t('chooseLanguage')}</button>
    </div>
    <p class="splash-legal">${t('notOfficial')}</p>
  </div>`;

function langCard(l) {
  const sel = (UI.pendingLang || state.prefLang || state.lang) === l.code;
  const cap = l.ready
    ? `<span class="cap">${ic('audio-lines')}${t('voiceText')}</span>`
    : `<span class="cap limited">${ic('clock')}${t('textOnly')}</span>`;
  const speakBtn = l.voice ? `<button class="lang-speak" data-a="sample" data-code="${l.code}" aria-label="${esc(t('playSample', { lang: l.eng }))}">${ic('volume-2')}</button>` : '';
  return `<div style="position:relative"><button class="lang-card" role="radio" aria-checked="${sel}" data-a="pickLang" data-code="${l.code}" lang="${l.bcp.split('-')[0]}" ${l.rtl ? 'dir="rtl"' : ''}>
    <span class="native">${esc(l.native)}</span><span class="eng" lang="en" dir="ltr">${esc(l.eng)}</span>${cap}<span class="tick">${ic('circle-check')}</span></button>${speakBtn}</div>`;
}
function langListHTML() {
  const q = UI.langQ.trim().toLowerCase();
  const list = LANGUAGES.filter(l => !q || l.eng.toLowerCase().includes(q) || l.native.toLowerCase().includes(q));
  if (!list.length) return `<div class="empty"><div class="ico ico-sage">${ic('search-x')}</div><p>${esc(t('noLangFound', { q: UI.langQ }))}</p></div>`;
  const ready = list.filter(l => l.ready), soon = list.filter(l => !l.ready);
  return `${ready.length ? `<div class="lang-grid" role="radiogroup" aria-label="${t('langTitle')}">${ready.map(langCard).join('')}</div>` : ''}
    ${soon.length ? `<div class="divider-label" style="margin-top:18px">${tr('More Indian languages — in preparation', 'और भारतीय भाषाएँ — तैयारी में')}</div><div class="lang-grid" style="margin-top:8px">${soon.map(langCard).join('')}</div>` : ''}`;
}
SCREENS.language = () => `
  ${topbar(t('chooseLanguage'))}
  <div class="pad stack" style="padding-top:4px">
    <div class="stack-sm"><h1>${t('langTitle')}</h1><p class="muted">${t('langSubtitle')}</p></div>
    <div class="input-wrap">${ic('search')}<input id="langSearch" type="search" placeholder="${t('langSearch')}" value="${esc(UI.langQ)}" aria-label="${t('langSearch')}" autocomplete="off"></div>
    <div id="langList">${langListHTML()}</div>
    <p class="hint">${tr('22 scheduled languages of India plus English. Voice and full translation are switched on language by language as reviewed resources become available.', 'भारत की 22 अनुसूचित भाषाएँ और अंग्रेज़ी। समीक्षा किए गए संसाधन मिलते ही हर भाषा में आवाज़ और पूरा अनुवाद चालू किया जाता है।')}</p>
  </div>
  <div class="sticky-foot"><button class="btn btn-primary btn-block" data-a="langContinue">${t('continue')}${ic('arrow-right')}</button></div>`;

function field(id, label, inner, { opt = false, hint = '' } = {}) {
  const err = UI.errors[id];
  return `<div class="field"><label for="f-${id}">${label}${opt ? `<span class="opt">${t('optional')}</span>` : ''}</label>${inner}${hint ? `<div class="hint">${hint}</div>` : ''}<div class="err" id="err-${id}">${err ? ic('circle-alert') + `<span>${esc(err)}</span>` : ''}</div></div>`;
}
const inv = id => (UI.errors[id] ? ' invalid' : '');
SCREENS.register = () => {
  const f = state.form;
  const editing = UI.editing && state.profile;
  const dlist = DISTRICTS[f.state];
  const mobileRow = f.verified
    ? `<div class="input-wrap">${ic('smartphone')}<span class="prefix">+91</span><input id="f-mobile" value="${esc(f.mobile)}" readonly aria-label="${t('mobile')}"><span class="verified-tag">${ic('circle-check')}${t('verified')}</span></div>
       <button class="link-btn" data-a="changeMobile" style="justify-self:start">${ic('pencil')}${t('change')}</button>`
    : `<div class="input-wrap${inv('mobile')}">${ic('smartphone')}<span class="prefix">+91</span><input id="f-mobile" data-f="mobile" inputmode="numeric" maxlength="10" autocomplete="tel-national" placeholder="${t('mobilePh')}" value="${esc(f.mobile)}"></div>
       <button class="btn btn-secondary btn-sm" data-a="sendOtp" style="justify-self:start">${ic('message-square')}${t('sendOtp')}</button>`;
  const districtInner = !f.state
    ? `<button type="button" class="input-wrap picker" id="f-district" disabled>${ic('map')}<span class="grow muted">${t('districtFirst')}</span></button>`
    : dlist
      ? `<button type="button" class="input-wrap picker${inv('district')}" id="f-district" data-a="pickDistrict">${ic('map')}<span class="grow ${f.district ? '' : 'muted'}">${esc(f.district || t('districtPh'))}</span>${ic('chevron-down')}</button>`
      : `<div class="input-wrap${inv('district')}">${ic('map')}<input id="f-district" data-f="district" placeholder="${t('districtType')}" value="${esc(f.district)}"></div>`;
  const ageSeg = `<div class="seg" role="group" aria-label="${t('ageGroup')}" id="f-age">${AGES.map(a => `<button type="button" data-a="setForm" data-k="age" data-v="${a}" aria-pressed="${f.age === a}">${t('age_' + a)}</button>`).join('')}</div>`;
  const occChips = `<div class="row-wrap" role="group" aria-label="${t('occupation')}">${OCCS.map(o => `<button type="button" class="chip" data-a="setForm" data-k="occ" data-v="${o}" aria-pressed="${f.occ === o}">${t('occ_' + o)}</button>`).join('')}</div>`;
  const a11y = [['text', 'a-large-small'], ['voice', 'audio-lines'], ['reader', 'scan-text']];
  const a11yChips = `<div class="row-wrap" role="group" aria-label="${t('a11yPref')}">${a11y.map(([k, i]) => `<button type="button" class="chip" data-a="toggleA11y" data-k="${k}" aria-pressed="${f.a11y.includes(k)}">${ic(i)}${t('a11y_' + k)}</button>`).join('')}</div>`;
  const cons = [['essential', 'pEssential', 'pEssentialD'], ['personal', 'pPersonal', 'pPersonalD'], ['location', 'pLocation', 'pLocationD'], ['notif', 'pNotif', 'pNotifD']];
  return `
  ${topbar(editing ? t('editTitle') : t('regTitle'), '')}
  <div class="pad stack" style="padding-top:4px">
    <div class="reg-hero">${shieldPersonSVG()}<div class="stack-sm"><h1>${editing ? t('editTitle') : t('regTitle')}</h1><p class="muted">${t('regSub')}</p></div></div>
    <div class="card stack">
      ${field('name', t('fullName'), `<div class="input-wrap${inv('name')}">${ic('user-round')}<input id="f-name" data-f="name" autocomplete="name" placeholder="${t('fullNamePh')}" value="${esc(f.name)}"></div>`)}
      ${field('mobile', t('mobile'), mobileRow)}
      ${field('state', t('state'), `<button type="button" class="input-wrap picker${inv('state')}" id="f-state" data-a="pickState">${ic('map-pin')}<span class="grow ${f.state ? '' : 'muted'}">${esc(f.state || t('statePh'))}</span>${ic('chevron-down')}</button>`)}
      ${field('district', t('district'), districtInner, { hint: f.state && !dlist ? t('districtNote') : '' })}
      ${field('village', t('village'), `<div class="input-wrap${inv('village')}">${ic('house')}<input id="f-village" data-f="village" placeholder="${t('villagePh')}" value="${esc(f.village)}"></div>
         <button type="button" class="link-btn" data-a="useLocation" style="justify-self:start">${ic('locate-fixed')}${t('useLocation')}</button>`, { opt: true })}
      ${field('age', t('ageGroup'), ageSeg)}
      ${field('lang', t('prefLang'), `<div class="input-wrap">${ic('languages')}<span class="grow">${esc(curLang(state.prefLang).native)} · ${esc(curLang(state.prefLang).eng)}</span><button type="button" class="link-btn" data-a="go" data-to="language">${t('change')}</button></div>`)}
    </div>
    <div class="card stack">
      <h3>${t('optionalHead')}</h3>
      ${field('occ', t('occupation'), occChips, { opt: true })}
      ${field('a11y', t('a11yPref'), a11yChips, { opt: true })}
    </div>
    <div class="card">
      <h3 class="row">${ic('shield-check')}${t('privacyTitle')}</h3>
      ${cons.map(([k, a, b]) => `<label class="check-row"><input type="checkbox" data-c="consent" data-k="${k}" ${state.consent[k] ? 'checked' : ''}><span class="grow"><b>${t(a)}</b><span class="small muted">${t(b)}</span></span></label>`).join('')}
      <div class="err" id="err-consent">${UI.errors.consent ? ic('circle-alert') + `<span>${esc(UI.errors.consent)}</span>` : ''}</div>
      <div class="notice card card-tight card-blue" style="margin-top:10px">${ic('info')}<span>${t('aadhaarNote')}</span></div>
    </div>
    <div class="stack-sm">
      <button class="btn btn-primary btn-block" data-a="submitReg">${ic('shield-check')}${editing ? t('saveChanges') : t('verifyContinue')}</button>
      ${editing ? '' : `<button class="btn btn-ghost btn-block" data-a="skipReg">${t('skip')}</button><p class="hint" style="text-align:center">${t('skipNote')}</p>`}
    </div>
  </div>`;
};

function svcCard(cls, icon, icoCls, title, desc, btn, to, extra = '') {
  return `<button class="svc-card ${cls}" data-a="go" data-to="${to}"><span class="ico ${icoCls}">${ic(icon)}</span><h3>${title}</h3><p>${desc}</p>${extra}<span class="go">${btn}${ic('arrow-right')}</span></button>`;
}
SCREENS.home = () => {
  const p = getP();
  const first = state.profile && state.profile.name ? state.profile.name.trim().split(/\s+/)[0] : '';
  const area = areaLabel();
  const alertOn = state.simAlert;
  const updates = visibleNotifs().slice(0, 3);
  return `
  <div class="home-head"><span class="mini-logo">${logoSVG()}</span><b class="grow">JanSahayak AI</b>${langPill()}${bell()}</div>
  <div class="greet">
    <div class="hello">${esc(t('namaste', { name: first ? ', ' + first : '' }))}</div>
    <div class="muted">${t('helpToday')}</div>
    ${area ? `<span class="place">${ic('map-pin')}${esc(area)}</span>` : ''}
  </div>
  <div class="pad stack">
    ${!state.profile ? `<div class="card card-tight row"><span class="ico ico-saffron">${ic('map-pin')}</span><span class="grow small"><b>${t('guestNudge')}</b></span><button class="btn btn-soft btn-sm" data-a="go" data-to="register">${t('setupProfile')}</button></div>` : ''}
    <section class="ai-card" aria-labelledby="aiCardT">
      <div class="ai-top">${botSVG()}<div class="stack-sm"><h2 id="aiCardT">${t('aiCardTitle')}</h2><p class="small">${t('aiCardSub')}</p></div></div>
      <div class="ai-actions">
        <button class="mic-big" data-a="micFromHome"><span class="mic-circle">${ic('mic')}</span>${t('speak')}</button>
        <button class="type-btn" data-a="typeFromHome">${ic('message-circle')}${t('typeQ')}</button>
      </div>
    </section>
    <div class="svc-grid">
      ${svcCard('t-green', 'landmark', '', t('svcSchemes'), t('svcSchemesD'), t('svcSchemesB'), 'schemes')}
      ${svcCard('t-sage', 'badge-check', 'ico-green', t('svcForMe'), t('svcForMeD'), t('svcForMeB'), 'match')}
      ${svcCard('t-blue', 'heart-pulse', 'ico-blue', t('svcHealth'), t('svcHealthD'), t('svcHealthB'), 'health')}
      ${svcCard(alertOn ? 't-alert' : '', 'shield-alert', alertOn ? 'ico-red' : 'ico-grey', t('svcAlerts'), alertOn ? `<b style="color:var(--red)">${t('svcAlertsActive')}</b>` : t('svcAlertsD'), t('svcAlertsB'), 'alerts')}
    </div>
    <section class="stack-sm">
      <div class="section-head"><h2>${t('nearby')}</h2>${area ? `<span class="small muted">${esc(p.district || '')}</span>` : ''}</div>
      ${area || p.district ? `<div class="nearby-grid">
        <button data-a="healthTab" data-tab="hosp"><span class="ico ico-blue">${ic('hospital')}</span>${t('nb_hospital')}</button>
        <button data-a="healthTab" data-tab="phc"><span class="ico ico-blue">${ic('building-2')}</span>${t('nb_phc')}</button>
        <button data-a="healthTab" data-tab="camps"><span class="ico ico-blue">${ic('tent')}</span>${t('nb_camp')}</button>
        <button data-a="healthTab" data-tab="hosp"><span class="ico ico-sage">${ic('landmark')}</span>${t('nb_csc')}</button>
      </div>` : `<div class="card card-tight row"><span class="ico ico-grey">${ic('map-pinned')}</span><span class="grow small">${t('nearbyNoLoc')}</span><button class="btn btn-soft btn-sm" data-a="setArea">${t('addVillage')}</button></div>`}
    </section>
    <section class="card">
      <div class="section-head"><h2>${t('latest')}</h2><button class="link-btn" data-a="go" data-to="notifications">${t('seeAll')}</button></div>
      ${updates.map(n => `<button class="update" data-a="notifGo" data-id="${n.id}"><span class="ico ico-${n.tone}">${ic(n.icon)}</span><span class="grow"><b>${esc(L(n.t))}</b><span class="meta"><span>${ic('badge-info')}${esc(n.src)}</span><span>${ic('clock')}${ago(n.at)}</span><span>${ic('map-pin')}${esc(L(n.rel))}</span></span></span></button>`).join('')}
    </section>
    <section class="stack-sm">
      <h2>${t('quick')}</h2>
      <div class="quick-grid">
        <button data-a="go" data-to="schemes">${ic('search-check')}${t('qCheck')}</button>
        <button data-a="go" data-to="assistant">${ic('bot')}${t('qAsk')}</button>
        <button data-a="healthTab" data-tab="hosp">${ic('hospital')}${t('qHospital')}</button>
        <button data-a="hearAlerts">${ic('volume-2')}${t('qHear')}</button>
      </div>
    </section>
    <p class="tiny muted" style="text-align:center">${t('notOfficial')}</p>
  </div>`;
};

SCREENS.services = () => {
  const items = [
    ['schemes', 'landmark', 'ico-green', t('svcSchemes'), t('svcSchemesD')],
    ['match', 'badge-check', 'ico-sage', t('svcForMe'), t('svcForMeD')],
    ['health', 'heart-pulse', 'ico-blue', t('svcHealth'), t('svcHealthD')],
    ['alerts', 'shield-alert', state.simAlert ? 'ico-red' : 'ico-grey', t('svcAlerts'), state.simAlert ? t('svcAlertsActive') : t('svcAlertsD')],
    ['notifications', 'bell', 'ico-saffron', t('nTitle'), t('svNotifD')],
    ['assistant', 'bot', 'ico-green', t('navAssistant'), t('aiCardSub')],
  ];
  return `${topbar(t('svTitle'), bell())}
  <div class="pad stack" style="padding-top:4px"><p class="muted">${t('svSub')}</p>
    <div class="services-list">${items.map(([to, i, c, a, b]) => `<button data-a="go" data-to="${to}"><span class="ico ${c}">${ic(i)}</span><span class="grow"><b>${a}</b><span class="small muted">${b}</span></span>${ic('chevron-right', 'chev')}</button>`).join('')}</div>
  </div>`;
};

/* ---------- Assistant ---------- */
function renderMsg(m, i) {
  if (m.role === 'user') {
    return `<div class="msg user"><div class="bubble">${esc(m.text)}</div>${m.voice ? `<span class="via">${ic('mic')}${t('viaVoice')}</span>` : ''}</div>`;
  }
  const chips = (m.chips || []).length ? `<div class="follow-chips">${m.chips.map((c, j) => `<button class="chip" data-a="chip" data-i="${i}" data-j="${j}">${c.icon ? ic(c.icon) : ''}${esc(c.label)}</button>`).join('')}</div>` : '';
  return `<div class="msg bot"><div class="who">${ic('bot')}JanSahayak AI</div><div class="bubble">${m.html}
    <div class="ans-tools"><button data-a="say" data-i="${i}">${ic('volume-2')}${t('readAloud')}</button>${m.scheme ? `<button data-a="scheme" data-id="${m.scheme}">${ic('file-text')}${t('a_openDetails')}</button>` : ''}</div>
    ${chips}</div></div>`;
}
SCREENS.assistant = () => {
  const empty = !UI.chat.length;
  const sug = SUGGEST[isHi() ? 'hi' : 'en'];
  const ctxS = UI.ctx && SCHEMES.find(s => s.id === UI.ctx);
  const micBtnCompact = `<button class="mic-orb compact${UI.rec ? ' rec' : ''}" data-a="mic" aria-label="${UI.rec ? t('tapToStop') : t('tapToSpeak')}">${ic(UI.rec ? 'square' : 'mic')}</button>`;
  const hero = `<div class="asst-hero">
      ${botSVG('bot')}
      <div class="greeting">${t('asstGreeting')}</div>
      ${UI.rec ? `<span class="rec-indicator" role="status">${t('recording')}</span>` : ''}
      <button class="mic-orb${UI.rec ? ' rec' : ''}" data-a="mic" aria-label="${UI.rec ? t('tapToStop') : t('tapToSpeak')}">${ic(UI.rec ? 'square' : 'mic')}</button>
      ${UI.rec ? `<div class="bars" aria-hidden="true">${[0, 1, 2, 3, 4, 5, 6].map(k => `<i style="animation-delay:${k * 0.1}s"></i>`).join('')}</div><div class="tap-label">${t('listening')}</div>` : `<div class="tap-label">${t('tapToSpeak')}</div>`}
      ${curLang().voice ? '' : `<p class="small muted">${t('voiceUnsupported', { lang: curLang().eng })}</p>`}
    </div>`;
  const suggest = `<div class="pad stack" style="padding-top:8px">
      <div class="divider-label">${t('tryAsking')}</div>
      <div class="suggest-list">${sug.map(q => `<button data-a="ask" data-q="${esc(q)}">${ic('sparkles')}${esc(q)}</button>`).join('')}</div>
      <div class="divider-label">Hinglish</div>
      <div class="chip-scroll">${SUGGEST.hinglish.map(q => `<button class="chip" data-a="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <p class="tiny muted">${t('asstDisclaimer')}</p>
    </div>`;
  const log = `<div class="chat-log" aria-live="polite">
      ${ctxS ? `<span class="badge b-green" style="justify-self:start">${ic('file-text')}${esc(t('aboutScheme', { s: L(ctxS.name) }))}</span>` : ''}
      ${UI.chat.map(renderMsg).join('')}
      ${UI.typing ? `<div class="typing" aria-label="${t('thinking')}"><i></i><i style="animation-delay:.15s"></i><i style="animation-delay:.3s"></i></div>` : ''}
      ${UI.rec ? `<div class="row" style="justify-content:center"><span class="rec-indicator" role="status">${t('recording')} · ${t('listening')}</span></div>` : ''}
    </div>`;
  return `<div class="asst">
    ${topbar('JanSahayak AI', `${langPill()}${empty ? '' : `<button class="icon-btn" data-a="newChat" aria-label="${t('newChat')}">${ic('message-square-plus')}</button>`}`)}
    ${empty ? hero + suggest : log}
    <div class="composer">
      ${UI.heard ? `<div class="heard-note">${ic('ear')}${t('heard')}</div><div class="tiny muted">${t('speechSim')}</div>` : ''}
      <div class="bar">
        ${empty ? '' : micBtnCompact}
        <div class="input-wrap">${ic('keyboard')}<textarea id="chatInput" rows="1" placeholder="${t('typeHere')}" aria-label="${t('typeHere')}">${esc(UI.draft)}</textarea>
          <button class="send-btn" data-a="send" id="sendBtn" aria-label="${t('send')}" ${UI.draft.trim() ? '' : 'disabled'}>${ic('arrow-up')}</button></div>
      </div>
    </div>
  </div>`;
};

/* ---------- Assistant engine: grounded, rule-based answers over the local records ---------- */
const SCHEME_KEYS = {
  kcc: ['kisan credit', 'kcc', 'किसान क्रेडिट', 'क्रेडिट कार्ड'],
  pmkisan: ['pm-kisan', 'pm kisan', 'pmkisan', 'kisan samman', 'किसान सम्मान', 'पीएम-किसान', 'पीएम किसान'],
  pmjay: ['ayushman', 'pmjay', 'pm-jay', 'आयुष्मान', 'golden card', 'vay vandana'],
  ignoaps: ['old age pension', 'vridha', 'वृद्धा', 'वृद्धावस्था', 'nsap'],
  pmayg: ['awas', 'awaas', 'आवास', 'pmay'],
  pmuy: ['ujjwala', 'उज्ज्वला', 'lpg', 'gas connection', 'गैस कनेक्शन'],
  mgnrega: ['nrega', 'मनरेगा', 'नरेगा', 'job card', 'जॉब कार्ड'],
  pmfby: ['fasal bima', 'फ़सल बीमा', 'फसल बीमा', 'crop insurance', 'pmfby'],
  pmjdy: ['jan dhan', 'जन धन', 'jandhan', 'zero balance'],
  pmsby: ['suraksha bima', 'सुरक्षा बीमा', 'accident insurance', 'pmsby'],
  pmjjby: ['jeevan jyoti', 'जीवन ज्योति', 'life insurance', 'pmjjby'],
  apy: ['atal pension', 'अटल पेंशन', ' apy '],
  pmmvy: ['matru vandana', 'मातृ वंदना', 'pmmvy'],
  ssy: ['sukanya', 'सुकन्या'],
  nsp: ['scholarship', 'छात्रवृत्ति', 'vajifa', 'वज़ीफ़ा', 'वजीफा'],
  pmkvy: ['kaushal', 'कौशल', 'skill india', 'pmkvy'],
  nfsa: [' ration', 'राशन', 'free grain', 'anaj', 'अनाज', 'nfsa'],
  udid: ['udid', 'divyang', 'दिव्यांग', 'viklang', 'विकलांग', 'disability'],
  mksy: ['kanya sumangala', 'कन्या सुमंगला'],
};
function findScheme(q) {
  for (const [id, keys] of Object.entries(SCHEME_KEYS)) if (keys.some(k => q.includes(k))) return SCHEMES.find(s => s.id === id);
  return null;
}
const byId = id => SCHEMES.find(s => s.id === id);
const pTag = s => `<p>${s}</p>`;
const ulH = arr => `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
const olH = arr => `<ol>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
const secA = (i, h, body) => `<div class="ans-sec"><h4>${ic(i)}${h}</h4>${body}</div>`;
function srcBox(s) {
  return `<div class="src-box"><div class="row-wrap"><span class="badge b-green">${ic('badge-check')}${t('a_sources')}</span>${demoBadge()}</div>
    ${extLink(s.portal || s.source, s.portalName || s.sourceName)}${s.portal ? extLink(s.source, s.sourceName) : ''}
    <div class="muted">${t('lastVerified')}: ${t('notVerified')} · ${t('infoAsOf')}: ${INFO_AS_OF}</div><div class="muted">${t('a_unverified')}</div></div>`;
}
function srcPlain(url, name, note) {
  return `<div class="src-box"><div class="row-wrap"><span class="badge b-green">${ic('badge-check')}${t('a_sources')}</span>${note ? demoBadge(true) : ''}</div>${extLink(url, name)}${note ? `<div class="muted">${note}</div>` : ''}</div>`;
}
function miniList(list) {
  return `<div class="mini-list">${list.map(s => `<button class="mini-s" data-a="scheme" data-id="${s.id}"><span class="ico ico-${catTone(s)}">${ic(s.icon)}</span><span class="grow"><b>${esc(L(s.name))}</b><span class="small muted">${esc(L(s.benefit))}</span></span>${ic('chevron-right', 'chev')}</button>`).join('')}</div>`;
}
function reply(html, say, extra = {}) { return Object.assign({ html, say, chips: [] }, extra); }
const plain = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function ansScheme(s, focus) {
  const d = s.detail;
  const parts = [];
  if (focus === 'docs') parts.push(pTag(`<b>${esc(L(s.name))}</b>`), secA('file-text', t('a_docs'), ulH(L(d.documents))));
  else if (focus === 'apply') parts.push(pTag(`<b>${esc(L(s.name))}</b>`), secA('list-ordered', t('a_how'), olH(L(d.steps))));
  else if (focus === 'status') parts.push(pTag(t('a_applied')), secA('search-check', t('a_status'), pTag(esc(L(d.status)))));
  else {
    parts.push(pTag(`<b>${esc(L(s.name))}</b> — ${esc(L(d.overview))}`));
    parts.push(secA('gift', t('a_benefit'), ulH(L(d.benefits))));
    parts.push(secA('users-round', t('a_who'), ulH(L(d.who))));
    if (L(d.exclusions).length) parts.push(secA('ban', t('d_exclusions'), ulH(L(d.exclusions).slice(0, 4))));
    parts.push(secA('file-text', t('a_docs'), ulH(L(d.documents))));
    parts.push(secA('list-ordered', t('a_how'), olH(L(d.steps))));
    parts.push(secA('search-check', t('a_status'), pTag(esc(L(d.status)))));
  }
  if (s.uncertain) parts.push(`<div class="notice card card-tight card-saffron">${ic('triangle-alert')}<span><b>${t('a_uncertain')}:</b> ${esc(L(s.uncertain))}</span></div>`);
  parts.push(srcBox(s));
  const chips = [];
  const p = getP();
  if (s.id === 'pmkisan' && !p.land && focus !== 'status') {
    parts.push(pTag(`<b>${t('a_whoAsk')}</b>`));
    chips.push(...landChips());
  }
  if (focus !== 'docs') chips.push({ label: t('a_docsQ'), q: t('a_docsQ') });
  if (focus !== 'apply') chips.push({ label: t('a_applyQ'), q: t('a_applyQ') });
  if (focus !== 'status') chips.push({ label: t('a_statusQ'), q: t('a_statusQ') });
  UI.ctx = s.id;
  const say = focus ? plain(parts.slice(0, 2).join(' ')) : `${L(s.name)}. ${L(d.simple)}`;
  return reply(parts.join(''), say, { chips, scheme: s.id });
}
function landChips() {
  return [
    { label: t('a_landYes'), run: () => { setAns('occ', 'farmer'); setAns('land', 'yes'); return reply(pTag(t('a_landYesR')) + srcBox(byId('pmkisan')), t('a_landYesR'), { scheme: 'pmkisan', chips: [{ label: t('a_applyQ'), q: t('a_applyQ') }, { label: t('svcForMeB'), go: 'match' }] }); } },
    { label: t('a_landNo'), run: () => { setAns('occ', 'farmer'); setAns('land', 'no'); return reply(pTag(t('a_landNoR')) + miniList([byId('pmfby'), byId('kcc')]), t('a_landNoR')); } },
    { label: t('a_forOther'), run: () => reply(pTag(t('a_otherR')) + srcBox(byId('pmkisan')), t('a_otherR'), { scheme: 'pmkisan' }) },
  ];
}
function ansForMe() {
  const p = getP();
  if (!p.occ && !p.age) {
    return reply(pTag(t('a_needOcc')), t('a_needOcc'), { chips: OCCS.map(o => ({ label: t('occ_' + o), run: () => { setAns('occ', o); if (o === 'senior') setAns('age', '60'); return ansForMe(); } })) });
  }
  const res = SCHEMES.map(s => ({ s, r: evalScheme(s, p) }));
  const match = res.filter(x => x.r.st === 'match').map(x => x.s);
  const more = res.filter(x => x.r.st === 'more').map(x => x.s);
  let html = pTag(t('a_matchIntro'));
  if (match.length) html += `<div class="ans-sec"><h4>${ic('circle-check')}${t('m_match')} (${match.length})</h4>${miniList(match.slice(0, 5))}</div>`;
  if (more.length) html += `<div class="ans-sec"><h4>${ic('circle-help')}${t('m_more')} (${more.length})</h4>${miniList(more.slice(0, 3))}</div>`;
  html += `<p class="tiny muted">${t('matchNote')}</p>`;
  const say = `${t('a_matchIntro')} ${match.slice(0, 5).map(s => L(s.name)).join(', ')}`;
  return reply(html, say, { chips: [{ label: t('svcForMeB'), icon: 'badge-check', go: 'match' }, { label: t('answerQs'), icon: 'list-checks', go: 'quiz' }] });
}
function parseAge(q) {
  const d = q.replace(/[०-९]/g, c => '०१२३४५६७८९'.indexOf(c));
  const m = d.match(/(\d{2,3})\s*(saal|sal|years?|yrs?|साल|वर्ष|बरस)/) || d.match(/age\s*(\d{2,3})/);
  return m ? Number(m[1]) : null;
}
function ansPension(q) {
  const age = parseAge(q);
  const p = getP();
  const list = [byId('ignoaps')];
  if (age == null || age <= 40) list.push(byId('apy'));
  if (age == null || age >= 70) list.push(byId('pmjay'));
  let html = pTag(age ? t('a_pensionAge', { n: age }) : t('a_pensionIntro')) + miniList(list);
  if (age && age >= 70) html += pTag(t('a_70plus'));
  if (!p.state) html += `<div class="notice small">${ic('map-pin')}<span>${t('a_stateVaries')}</span></div>`;
  html += pTag(`<b>${t('a_pensionBpl')}</b>`);
  const chips = [
    { label: t('a_yes'), run: () => { setAns('bpl', 'yes'); return reply(pTag(t('a_bplYes')) + srcBox(byId('ignoaps')), t('a_bplYes'), { scheme: 'ignoaps' }); } },
    { label: t('a_no'), run: () => { setAns('bpl', 'no'); return reply(pTag(t('a_bplNo')), t('a_bplNo')); } },
    { label: t('a_notSure'), run: () => reply(pTag(t('a_bplUnsure')), t('a_bplUnsure')) },
  ];
  UI.ctx = 'ignoaps';
  return reply(html, plain(html), { chips });
}
function ansCamps() {
  const p = getP();
  if (!p.district) {
    return reply(pTag(t('a_campNeedArea')), t('a_campNeedArea'), {
      chips: [{ label: tr('Set my area', 'मेरा क्षेत्र चुनें'), icon: 'map-pin', go: 'area' }, { label: tr('Try Barabanki, Uttar Pradesh', 'बाराबंकी, उत्तर प्रदेश आज़माएँ'), run: () => { setAns('state', 'Uttar Pradesh'); setAns('district', 'Barabanki'); return ansCamps(); } }],
    });
  }
  const camps = CAMPS[p.district];
  if (!camps) {
    const html = pTag(t('a_campNo')) + srcPlain('https://nhm.gov.in', 'nhm.gov.in');
    return reply(html, t('a_campNo'), { chips: [{ label: t('h_phc'), icon: 'building-2', go: 'health:phc' }] });
  }
  const html = pTag(t('a_campYes', { d: p.district })) + `<div class="mini-list">${camps.map(c => `<button class="mini-s" data-a="healthTab" data-tab="camps"><span class="ico ico-blue">${ic('calendar-days')}</span><span class="grow"><b>${esc(L(c.name))}</b><span class="small muted">${fmtDate(c.when)} · ${esc(c.until)} · ${esc(L(c.venue))}</span></span>${ic('chevron-right', 'chev')}</button>`).join('')}</div>`
    + `<div class="row-wrap">${demoBadge(true)}</div>`;
  return reply(html, plain(html), { chips: [{ label: t('h_camps'), icon: 'calendar-days', go: 'health:camps' }] });
}
function ansAlerts() {
  if (state.simAlert) {
    const a = SIM_ALERT;
    const html = pTag(t('a_alertOn')) + `<div class="notice card card-tight card-red">${ic(a.icon)}<span><b>${esc(L(a.title))}</b> — ${esc(L(a.severity))}<br><span class="tiny">${esc(L(a.authority))}</span></span></div>` + olH(L(a.instr)) + srcPlain(a.link, a.linkName, t('simAlertBadge'));
    return reply(html, `${L(a.title)}. ${L(a.severity)}. ${L(a.instr).join('. ')}`, { chips: [{ label: t('svcAlertsB'), icon: 'shield-alert', go: 'alerts' }] });
  }
  const html = pTag(t('a_alertOff')) + srcPlain('https://sachet.ndma.gov.in', 'sachet.ndma.gov.in') + srcPlain('https://mausam.imd.gov.in', 'mausam.imd.gov.in');
  return reply(html, t('a_alertOff'), { chips: [{ label: t('svcAlertsB'), icon: 'shield-alert', go: 'alerts' }] });
}
function ansTopic(introKey, ids) {
  const list = ids.map(byId).filter(Boolean);
  const html = pTag(t(introKey)) + miniList(list) + `<p class="tiny muted">${t('matchNote')}</p>`;
  return reply(html, `${t(introKey)} ${list.map(s => L(s.name)).join(', ')}`);
}
function emNumbersHTML() {
  return `<div class="mini-list">${[['112', 'em_112'], ['108', 'em_108']].map(([n, k]) => `<a class="mini-s" href="tel:${n}"><span class="ico ico-red">${ic('phone-call')}</span><span class="grow"><b class="callout-num" style="font-size:1.2rem">${n}</b><span class="small muted">${t(k)}</span></span></a>`).join('')}</div>`;
}

function answer(raw) {
  const q = ' ' + raw.toLowerCase().replace(/[?!.,।]/g, ' ') + ' ';
  const has = (...w) => w.some(x => q.includes(x));
  const s = findScheme(q);
  const ctx = UI.ctx && byId(UI.ctx);

  if (has(' otp', 'password', 'पासवर्ड', 'ओटीपी', ' upi', 'bank pin', 'atm pin', ' cvv') || (has(' pin ') && !has('pin code', 'pincode'))) {
    return reply(`<div class="notice card card-tight card-red">${ic('lock-keyhole')}<span>${t('a_secret')}</span></div>`, t('a_secret'));
  }
  if (has('chest pain', 'सीने में दर्द', 'saans nahi', 'सांस नहीं', 'साँस नहीं', 'unconscious', 'behosh', 'बेहोश', 'bleeding', 'heart attack', 'saanp', 'साँप', 'सांप', 'snake bite', 'emergency', 'आपातकाल', 'ambulance', 'एम्बुलेंस')) {
    return reply(`<div class="notice card card-tight card-red">${ic('siren')}<span><b>${t('a_emergency')}</b></span></div>` + emNumbersHTML(), t('a_emergency'));
  }
  const docsQ = has('document', 'kagaz', 'kaagaz', 'dastavez', 'दस्तावेज़', 'दस्तावेज', 'कागज़', 'कागज', 'papers');
  const applyQ = has('apply', 'aavedan', 'avedan', 'आवेदन', 'अप्लाई', 'register', 'पंजीकरण');
  const statusQ = has('status', 'स्थिति', 'approved', 'kab aayega', 'kist nahi', 'paisa nahi', 'पैसा नहीं', 'installment');
  if (statusQ && (s || ctx)) return ansScheme(s || ctx, 'status');
  if (docsQ) {
    if (s || ctx) return ansScheme(s || ctx, 'docs');
    return reply(pTag(t('a_docsNeedScheme')), t('a_docsNeedScheme'), { chips: ['pmkisan', 'pmjay', 'ignoaps', 'pmayg'].map(id => ({ label: L(byId(id).name).split('(')[0].trim(), run: () => ansScheme(byId(id), 'docs') })) });
  }
  if (applyQ && (s || ctx)) return ansScheme(s || ctx, 'apply');
  if (s && s.id !== 'udid') return ansScheme(s);
  if (has('pension', 'पेंशन', 'budhapa', 'बुढ़ापा', 'retire')) return ansPension(q);
  if (has('camp', 'कैंप', 'कैम्प', 'shivir', 'शिविर')) return ansCamps();
  if (has('vaccin', 'teeka', 'tika ', 'टीका', 'टीके', 'immunis', 'immuniz')) {
    const html = pTag(t('a_vax')) + srcPlain('https://uwin.mohfw.gov.in', 'uwin.mohfw.gov.in') + srcPlain('https://mohfw.gov.in', 'mohfw.gov.in');
    return reply(html, t('a_vax'), { chips: [{ label: t('h_vax'), icon: 'syringe', go: 'health:vax' }] });
  }
  if (has('hospital', 'aspatal', 'अस्पताल', 'doctor', 'डॉक्टर', ' phc', 'health centre', 'health center', 'dawakhana')) return reply(pTag(t('a_hospital')) + emNumbersHTML(), t('a_hospital'), { chips: [{ label: t('h_hosp'), icon: 'hospital', go: 'health:hosp' }] });
  if (has('alert', 'अलर्ट', 'disaster', 'आपदा', 'flood', 'baadh', 'बाढ़', 'toofan', 'तूफ़ान', 'तूफान', 'cyclone', 'barish', 'बारिश', ' rain', 'weather', 'mausam', 'मौसम', 'heatwave', ' loo ', 'लू ', 'earthquake', 'भूकंप')) return ansAlerts();
  if (has('fever', 'bukhar', 'बुखार', 'dard', 'दर्द', ' pain', 'cough', 'khansi', 'खांसी', 'खाँसी', ' sick', 'bimar', 'बीमार', 'symptom')) return reply(`<div class="notice card card-tight card-blue">${ic('stethoscope')}<span>${t('a_health')}</span></div>`, t('a_health'), { chips: [{ label: t('h_phc'), icon: 'building-2', go: 'health:phc' }] });
  if (has('farmer', 'kisan', 'किसान', 'kheti', 'खेती', 'fasal', 'फ़सल', 'फसल')) {
    setAns('occ', 'farmer');
    const html = pTag(t('a_farmerIntro')) + miniList(['pmkisan', 'pmfby', 'kcc'].map(byId)) + pTag(`<b>${t('a_whoAsk')}</b>`);
    return reply(html, `${t('a_farmerIntro')} ${['pmkisan', 'pmfby', 'kcc'].map(id => L(byId(id).name)).join(', ')}. ${t('a_whoAsk')}`, { chips: landChips() });
  }
  if (s) return ansScheme(s);
  if (has('mahila', 'महिला', 'women', 'woman', 'beti', 'बेटी', ' girl', 'mother', 'maa ', 'pregnan', 'गर्भवती')) return ansTopic('a_women', ['pmmvy', 'pmuy', 'ssy', getP().state === 'Uttar Pradesh' ? 'mksy' : null]);
  if (has('student', 'padhai', 'पढ़ाई', 'vidyarthi', 'विद्यार्थी', 'school', 'college', 'छात्र')) return ansTopic('a_student', ['nsp', 'pmkvy']);
  if (has('ghar', 'घर', 'house', 'makaan', 'makan', 'मकान', 'housing')) return ansTopic('a_housing', ['pmayg']);
  if (has(' job', 'naukri', 'नौकरी', 'rozgar', 'रोज़गार', 'रोजगार', 'kaam', 'काम', ' work', 'skill')) return ansTopic('a_work', ['mgnrega', 'pmkvy', 'apy']);
  if (has('insurance', 'bima', 'बीमा')) return ansTopic('a_matchIntro', ['pmjay', 'pmsby', 'pmjjby', 'pmfby']);
  if (has('mere liye', 'for me', 'मेरे लिए', 'yojana', 'योजना', 'scheme', 'eligible', 'patra', 'पात्र', 'benefit', 'labh', 'लाभ')) return ansForMe();
  const sug = SUGGEST[isHi() ? 'hi' : 'en'];
  return reply(pTag(t('a_unknown')), t('a_unknown'), { chips: [sug[0], sug[2], sug[4]].map(x => ({ label: x, q: x })) });
}

function sendChat(text, voice = false) {
  text = (text || '').trim();
  if (!text) return;
  UI.chat.push({ role: 'user', text, voice });
  UI.draft = ''; UI.heard = false; UI.typing = true;
  if (state.screen !== 'assistant') go('assistant'); else renderChat();
  setTimeout(() => {
    UI.typing = false;
    const r = answer(text);
    UI.chat.push(Object.assign({ role: 'bot' }, r));
    renderChat(true);
    if (state.autoRead) speak(r.say);
  }, 700);
}
function botTurn(label, fn) {
  UI.chat.push({ role: 'user', text: label });
  UI.typing = true; renderChat();
  setTimeout(() => { UI.typing = false; const r = fn(); UI.chat.push(Object.assign({ role: 'bot' }, r)); renderChat(true); if (state.autoRead) speak(r.say); }, 500);
}
function renderChat(toBot) {
  if (state.screen !== 'assistant') return;
  render();
  const scr = $('#screen');
  const msgs = $$('.msg', scr);
  const last = msgs[msgs.length - 1];
  if (toBot && last) scr.scrollTop = Math.max(0, last.offsetTop - 64);
  else scr.scrollTop = scr.scrollHeight;
}

/* ---------- Mic (simulated recognition; real STT needs a backend service) ---------- */
function micTap() {
  if (UI.rec) { stopRec(true); return; }
  if (!curLang().voice) { toast(t('voiceUnsupported', { lang: curLang().eng })); $('#chatInput')?.focus(); return; }
  if (state.mic !== 'granted') { micSheet(); return; }
  startRec();
}
function startRec() {
  stopSpeak();
  UI.rec = true; UI.heard = false; render();
  clearTimeout(UI.recTimer);
  UI.recTimer = setTimeout(() => stopRec(true), 2800);
}
function stopRec(withResult) {
  clearTimeout(UI.recTimer);
  if (!UI.rec) return;
  UI.rec = false;
  if (withResult) {
    const pool = SIM_SPEECH[isHi() ? 'hi' : 'en'];
    UI.simIdx = ((UI.simIdx ?? -1) + 1) % pool.length;
    UI.draft = pool[UI.simIdx];
    UI.heard = true;
  }
  render();
  const ta = $('#chatInput');
  if (ta) { autoGrow(ta); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}
function micSheet() {
  openSheet(`<div class="sheet-head"><h2>${t('micTitle')}</h2><button class="icon-btn" data-a="closeSheet" aria-label="${t('close')}">${ic('x')}</button></div>
    <div class="stack">
      <div class="row"><span class="ico ico-sage">${ic('mic')}</span><p class="grow">${t('micBody')}</p></div>
      <div class="notice card card-tight card-saffron">${ic('flask-conical')}<span>${t('speechSim')}</span></div>
      <button class="btn btn-primary btn-block" data-a="micAllow">${ic('mic')}${t('micAllow')}</button>
      <button class="btn btn-ghost btn-block" data-a="micDeny">${ic('keyboard')}${t('micDeny')}</button>
    </div>`);
}
function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px'; }

/* ---------- Eligibility rules (preliminary, explainable) ---------- */
function evalScheme(s, p) {
  const ok = [], miss = [], no = [];
  let core = false;
  const O = (en, hi) => ok.push(tr(en, hi));
  const M = (en, hi, soft) => { miss.push(tr(en, hi)); if (!soft) core = true; };
  const N = (en, hi) => no.push(tr(en, hi));
  const ageU = () => M('Your age group', 'आपका आयु वर्ग');
  const farmer = () => { if (!p.occ) M('Whether you farm', 'क्या आप खेती करते हैं'); else if (p.occ === 'farmer') O('You are a farmer', 'आप किसान हैं'); else N('Your occupation is not farming', 'आपका व्यवसाय खेती नहीं है'); };
  const bank = soft => { if (p.bank === 'yes') O('Has a bank account', 'बैंक खाता है'); else if (p.bank === 'no') M('Needs a bank or post office account', 'बैंक या डाकघर खाता चाहिए', soft); else M('Whether you have a bank account', 'क्या आपका बैंक खाता है', true); };
  switch (s.id) {
    case 'pmkisan':
      farmer();
      if (p.land === 'yes') O('Farm land is recorded in your name', 'खेती की ज़मीन आपके नाम दर्ज है');
      else if (p.land === 'no') N('Land is not recorded in your name', 'ज़मीन आपके नाम दर्ज नहीं है');
      else if (!p.occ || p.occ === 'farmer') M('Whether land is recorded in your name', 'क्या ज़मीन आपके नाम दर्ज है');
      if (p.tax === 'yes') N('A family member pays income tax (excluded)', 'परिवार में कोई आयकर देता है (बाहर)');
      else if (p.tax === 'no') O('No income-tax payer in the family', 'परिवार में कोई आयकरदाता नहीं');
      else M('Income-tax status (taxpayers are excluded)', 'आयकर की स्थिति (आयकरदाता बाहर हैं)', true);
      break;
    case 'pmfby': farmer(); M('Crop and area must be notified for the season', 'फ़सल और क्षेत्र मौसम के लिए अधिसूचित हों', true); break;
    case 'kcc': farmer(); M('Bank checks land or cultivation proof', 'बैंक ज़मीन या खेती का प्रमाण जाँचता है', true); break;
    case 'pmjay':
      if (p.seventy === 'yes') O('Someone in the household is 70 or older (Vay Vandana card)', 'घर में कोई 70 या अधिक उम्र का है (वय वंदना कार्ड)');
      else {
        M('Whether your family is on the PM-JAY list — check at beneficiary.nha.gov.in', 'क्या परिवार पीएम-जय सूची में है — beneficiary.nha.gov.in पर देखें');
        if (!p.seventy) M('Whether anyone at home is 70 or older', 'क्या घर में कोई 70+ उम्र का है', true);
      }
      break;
    case 'ignoaps':
      if (p.age === '60') O('Aged 60 or above', '60 या अधिक उम्र'); else if (p.age) N('Below 60 years', '60 वर्ष से कम'); else ageU();
      if (p.bpl === 'yes') O('Household is on the BPL list', 'परिवार बीपीएल सूची में है'); else if (p.bpl === 'no') N('Household is not on the BPL list', 'परिवार बीपीएल सूची में नहीं है'); else M('Whether your household is on the BPL list', 'क्या परिवार बीपीएल सूची में है');
      break;
    case 'pmayg':
      if (p.house === 'yes') { O('Kutcha house or no house', 'कच्चा घर या घर नहीं'); M('Name must be on the Awaas+ list, approved by the Gram Sabha', 'नाम आवास+ सूची में हो, ग्राम सभा की मंज़ूरी से', true); }
      else if (p.house === 'no') N('You have a pucca house', 'आपके पास पक्का घर है');
      else M('Your housing situation', 'आपके घर की स्थिति');
      break;
    case 'pmuy':
      if (p.lpg === 'yes') O('Adult woman at home and no LPG connection', 'घर में वयस्क महिला है और एलपीजी कनेक्शन नहीं'); else if (p.lpg === 'no') N('Household has LPG already or no adult woman', 'घर में एलपीजी है या वयस्क महिला नहीं'); else M('Whether there is an LPG connection at home', 'क्या घर में एलपीजी कनेक्शन है');
      if (p.bpl === 'yes') O('Poor household (BPL / ration card)', 'ग़रीब परिवार (बीपीएल / राशन कार्ड)'); else M('Poor-household status — a self-declaration may be accepted', 'ग़रीब परिवार की स्थिति — स्व-घोषणा मान्य हो सकती है', true);
      break;
    case 'mgnrega':
      if (p.age === 'u18') N('Under 18', '18 से कम'); else if (p.age) O('Adult (18+)', 'वयस्क (18+)'); else ageU();
      M('Rules may have changed — confirm on the official portal', 'नियम बदले हो सकते हैं — आधिकारिक पोर्टल पर पुष्टि करें', true);
      break;
    case 'pmjdy':
      if (p.bank === 'no') O('No bank account yet', 'अभी बैंक खाता नहीं'); else if (p.bank === 'yes') N('You already have a bank account', 'आपका बैंक खाता पहले से है'); else M('Whether you have a bank account', 'क्या आपका बैंक खाता है');
      break;
    case 'pmsby':
      if (p.age === 'u18') N('Under 18', '18 से कम'); else if (p.age === '60') M('Must be 70 or younger', '70 या कम उम्र होनी चाहिए'); else if (p.age) O('Age within 18–70', '18–70 उम्र में'); else ageU();
      bank(false); break;
    case 'pmjjby':
      if (p.age === '18_35') O('Age within 18–50', '18–50 उम्र में'); else if (p.age === '36_59') M('Must join by age 50', '50 की उम्र तक जुड़ना होगा'); else if (p.age) N('Outside the 18–50 joining age', '18–50 की उम्र सीमा से बाहर'); else ageU();
      bank(false); break;
    case 'apy':
      if (p.age === '18_35') O('Age within 18–40', '18–40 उम्र में'); else if (p.age === '36_59') M('Must be 40 or younger to join', 'जुड़ने के लिए 40 या कम उम्र'); else if (p.age) N('Outside the 18–40 joining age', '18–40 की उम्र सीमा से बाहर'); else ageU();
      if (p.tax === 'yes') N('Income-tax payers cannot join', 'आयकरदाता नहीं जुड़ सकते'); else if (p.tax !== 'no') M('Income-tax status', 'आयकर की स्थिति', true);
      bank(true); break;
    case 'pmmvy':
      if (p.preg === 'yes') O('Pregnant or breastfeeding woman at home', 'घर में गर्भवती या स्तनपान कराने वाली महिला'); else if (p.preg === 'no') N('No pregnant or breastfeeding woman at home', 'घर में कोई गर्भवती या स्तनपान कराने वाली महिला नहीं'); else M('Whether anyone is pregnant or breastfeeding', 'क्या कोई गर्भवती या स्तनपान कराने वाली है');
      break;
    case 'ssy':
      if (p.girl === 'yes') O('Girl under 10 in the family', 'परिवार में 10 साल से छोटी बेटी'); else if (p.girl === 'no') N('No girl under 10 in the family', 'परिवार में 10 साल से छोटी बेटी नहीं'); else M('Whether there is a girl under 10', 'क्या 10 साल से छोटी बेटी है');
      break;
    case 'nsp':
      if (p.occ === 'student' || p.age === 'u18') { O('Student', 'विद्यार्थी'); M('Income, category and marks rules of each scholarship', 'हर छात्रवृत्ति के आय, वर्ग और अंक नियम', true); }
      else if (p.occ) N('Not a student', 'विद्यार्थी नहीं'); else M('Whether you are a student', 'क्या आप विद्यार्थी हैं');
      break;
    case 'pmkvy':
      if (p.age === 'u18' || p.age === '18_35') O('Young person', 'युवा'); else if (p.age === '36_59') M('Age limit depends on the course', 'उम्र सीमा कोर्स पर निर्भर'); else if (p.age) N('Above the usual age for these courses', 'इन कोर्स की सामान्य उम्र से अधिक'); else ageU();
      M('Course rules', 'कोर्स के नियम', true); break;
    case 'nfsa':
      if (p.bpl === 'yes') O('Priority or Antyodaya ration card', 'प्राथमिकता या अंत्योदय राशन कार्ड'); else if (p.bpl === 'no') M('You may apply for a ration card through your state food department', 'राज्य खाद्य विभाग से राशन कार्ड के लिए आवेदन कर सकते हैं'); else M('Whether you have a priority or Antyodaya ration card', 'क्या प्राथमिकता या अंत्योदय राशन कार्ड है');
      break;
    case 'udid':
      if (p.disab === 'yes') O('Someone at home has a disability', 'घर में किसी को दिव्यांगता है'); else if (p.disab === 'no') N('No disability in the household', 'घर में कोई दिव्यांगता नहीं'); else M('Whether anyone has a disability', 'क्या किसी को दिव्यांगता है');
      break;
    case 'mksy':
      if (!p.state) M('Your state', 'आपका राज्य'); else if (p.state === 'Uttar Pradesh') O('Resident of Uttar Pradesh', 'उत्तर प्रदेश के निवासी'); else N('Only for Uttar Pradesh', 'केवल उत्तर प्रदेश के लिए');
      if (p.girl === 'yes') O('Girl in the family', 'परिवार में बेटी'); else if (p.girl === 'no') N('No young girl in the family', 'परिवार में छोटी बेटी नहीं'); else M('Whether there is a young girl in the family', 'क्या परिवार में छोटी बेटी है');
      M('Family income rules set by the state', 'राज्य द्वारा तय पारिवारिक आय नियम', true);
      break;
    default: M('Details', 'विवरण');
  }
  return { st: no.length ? 'no' : core ? 'more' : 'match', ok, miss, no };
}

const YN = [['yes', 'a_yes'], ['no', 'a_no'], ['unsure', 'a_notSure']];
const QUESTIONS = [
  { k: 'age', q: 'q_age', opts: AGES.map(a => [a, 'age_' + a]), when: p => !p.age },
  { k: 'occ', q: 'q_occ', opts: OCCS.map(o => [o, 'occ_' + o]), when: p => !p.occ },
  { k: 'land', q: 'q_land', why: 'r_land', when: p => (p.occ === 'farmer') && !p.land },
  { k: 'tax', q: 'q_tax', why: 'r_tax', when: p => !p.tax },
  { k: 'bpl', q: 'q_bpl', why: 'r_bpl', when: p => !p.bpl },
  { k: 'house', q: 'q_house', when: p => !p.house },
  { k: 'bank', q: 'q_bank', when: p => !p.bank },
  { k: 'lpg', q: 'q_lpg', when: p => !p.lpg },
  { k: 'preg', q: 'q_preg', when: p => !p.preg },
  { k: 'girl', q: 'q_girl', when: p => !p.girl },
  { k: 'seventy', q: 'q_seventy', when: p => !p.seventy },
  { k: 'disab', q: 'q_disab', when: p => !p.disab },
];
function startQuiz(all) {
  const p = getP();
  UI.qList = all ? QUESTIONS.filter(q => q.k !== 'land' || p.occ === 'farmer') : QUESTIONS.filter(q => q.when(p));
  if (!UI.qList.length) UI.qList = QUESTIONS.filter(q => q.k !== 'land' || p.occ === 'farmer');
  UI.qi = 0;
  quizSheet();
}
function quizSheet() {
  const q = UI.qList[UI.qi];
  if (!q) { closeSheet(); toast(t('qDone')); render(); return; }
  const opts = q.opts || YN;
  const cur = getP()[q.k];
  openSheet(`<div class="sheet-head"><h2 class="tiny muted" style="padding-top:14px;font-size:.85rem">${t('qOf', { i: UI.qi + 1, n: UI.qList.length })}</h2><button class="icon-btn" data-a="closeSheet" aria-label="${t('close')}">${ic('x')}</button></div>
    <div class="stack">
      <div class="q-progress"><i style="width:${(UI.qi / UI.qList.length) * 100}%"></i></div>
      <h2 style="font-size:1.3rem">${t(q.q)}</h2>
      ${q.why ? `<p class="small muted">${t('q_why', { r: t(q.why) })}</p>` : ''}
      <div class="q-options">${opts.map(([v, k]) => `<button data-a="qAns" data-v="${v}" ${cur === v ? 'aria-pressed="true" style="border-color:var(--green);background:var(--sage)"' : ''}>${ic(cur === v ? 'circle-check' : 'circle')}${t(k)}</button>`).join('')}
        <button class="skip" data-a="qAns" data-v="">${ic('skip-forward')}${t('qSkip')}</button></div>
      ${UI.qi > 0 ? `<button class="link-btn" data-a="qBack">${ic('arrow-left')}${t('back')}</button>` : ''}
    </div>`);
}

SCREENS.match = () => {
  const p = getP();
  const known = [];
  if (p.age) known.push(t('age_' + p.age));
  if (p.occ) known.push(t('occ_' + p.occ));
  if (p.state) known.push(p.state);
  const anyInfo = known.length || Object.keys(state.answers).length;
  const res = SCHEMES.map(s => ({ s, r: evalScheme(s, p) }));
  const groups = { match: res.filter(x => x.r.st === 'match'), more: res.filter(x => x.r.st === 'more'), no: res.filter(x => x.r.st === 'no') };
  const card = ({ s, r }) => {
    const pill = { match: ['st-match', 'circle-check', 'm_match'], more: ['st-more', 'circle-help', 'm_more'], no: ['st-no', 'circle-minus', 'm_no'] }[r.st];
    return `<article class="card match-card" id="m-${s.id}" ${UI.matchFocus === s.id ? 'style="border-color:var(--green);border-width:2px"' : ''}>
      <div class="row" style="justify-content:space-between"><span class="status-pill ${pill[0]}">${ic(pill[1])}${t(pill[2])}</span>${levelBadge(s)}</div>
      <div class="row" style="align-items:flex-start"><span class="ico ico-${catTone(s)}">${ic(s.icon)}</span><div class="grow stack-sm" style="gap:2px"><h3>${esc(L(s.name))}</h3><p class="small muted">${esc(L(s.benefit))}</p></div></div>
      ${r.ok.length ? `<div><div class="tiny bold muted">${t('m_matched')}</div><ul class="crit">${r.ok.map(x => `<li class="ok">${ic('check')}${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${r.miss.length ? `<div><div class="tiny bold muted">${t('m_missing')}</div><ul class="crit">${r.miss.map(x => `<li class="miss">${ic('circle-help')}${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${r.no.length ? `<div><div class="tiny bold muted">${t('m_unmet')}</div><ul class="crit">${r.no.map(x => `<li class="no">${ic('x')}${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="card-actions"><button class="btn btn-secondary btn-sm" data-a="scheme" data-id="${s.id}">${ic('file-text')}${t('checkDetails')}</button><button class="btn btn-soft btn-sm" data-a="askScheme" data-id="${s.id}">${ic('bot')}${t('askAI')}</button></div>
    </article>`;
  };
  return `${topbar(t('svcForMe'))}
  <div class="pad stack" style="padding-top:4px">
    <div class="stack-sm"><h1>${t('matchTitle')}</h1><p class="muted">${t('matchSub')}</p></div>
    ${!state.consent.personal ? `<div class="notice card card-tight card-saffron">${ic('shield-off')}<span>${t('personalOff')}</span></div>` : ''}
    ${anyInfo ? `<div class="card card-tight row-wrap" style="align-items:center"><span class="tiny bold muted">${t('usingInfo')}:</span>${known.map(k => `<span class="badge b-green">${esc(k)}</span>`).join('')}${Object.keys(state.answers).filter(k => !['age', 'occ', 'state', 'district'].includes(k)).length ? `<span class="badge b-grey">+${Object.keys(state.answers).filter(k => !['age', 'occ', 'state', 'district'].includes(k)).length}</span>` : ''}<button class="link-btn" data-a="quizAll" style="margin-left:auto">${ic('pencil')}${t('editAnswers')}</button></div>` : ''}
    <button class="btn btn-primary btn-block" data-a="quiz">${ic('list-checks')}${t('answerQs')}</button>
    ${!anyInfo ? `<div class="empty card"><div class="ico ico-sage">${ic('clipboard-list')}</div><p>${t('noInfoYet')}</p></div>` : `
      ${groups.match.length ? `<div class="divider-label">${t('m_match')} · ${groups.match.length}</div>${groups.match.map(card).join('')}` : `<div class="empty card"><div class="ico ico-sage">${ic('search-x')}</div><p>${t('emptyMatch')}</p><button class="btn btn-soft btn-sm" data-a="go" data-to="assistant">${ic('bot')}${t('askAI')}</button></div>`}
      ${groups.more.length ? `<div class="divider-label">${t('m_more')} · ${groups.more.length}</div>${groups.more.map(card).join('')}` : ''}
      ${groups.no.length ? `<button class="btn btn-ghost btn-block" data-a="toggleNoMatch">${ic(UI.showNoMatch ? 'chevron-up' : 'chevron-down')}${UI.showNoMatch ? t('hideNoMatch') : t('showNoMatch', { n: groups.no.length })}</button>${UI.showNoMatch ? groups.no.map(card).join('') : ''}` : ''}`}
    <div class="notice card card-tight card-blue">${ic('info')}<span>${t('matchNote')}</span></div>
  </div>`;
};

/* ---------- Schemes directory ---------- */
const STOP = new Set(['the', 'for', 'and', 'with', 'need', 'help', 'want', 'scheme', 'schemes', 'yojana', 'what', 'how', 'can', 'get', 'my', 'me', 'i', 'a', 'to', 'of', 'in', 'is', 'mujhe', 'mere', 'liye', 'ke', 'ki', 'ka', 'hai', 'के', 'की', 'का', 'है', 'लिए', 'मुझे', 'योजना']);
const SYN = { farmer: 'farm', farming: 'farm', kisan: 'farm', किसान: 'farm', pension: 'pension', old: 'pension', senior: 'pension', बुज़ुर्ग: 'pension', scholarship: 'edu', student: 'edu', school: 'edu', house: 'housing', housing: 'housing', home: 'housing', ghar: 'housing', घर: 'housing', women: 'women', woman: 'women', girl: 'women', mother: 'women', महिला: 'women', health: 'health', hospital: 'health', insurance: 'health', bima: 'health', job: 'employ', employment: 'employ', work: 'employ', rozgar: 'employ', रोज़गार: 'employ', bank: 'finance', loan: 'finance', food: 'food', ration: 'food', grain: 'food', राशन: 'food', disability: 'disability', disabled: 'disability', village: 'rural', rural: 'rural' };
function haystack(s) {
  return [s.name.en, s.name.hi, s.short.en, s.short.hi, s.benefit.en, s.elig.en, ...s.cats.map(c => S['cat_' + c].join(' ')), s.tags.join(' '), (SCHEME_KEYS[s.id] || []).join(' ')].join(' ').toLowerCase();
}
function filterSchemes() {
  const q = state.schemeQ.trim().toLowerCase();
  const toks = q.split(/[\s,.?!]+/).filter(w => w.length > 1 && !STOP.has(w));
  let list = SCHEMES.slice();
  if (state.schemeLvl === 'central') list = list.filter(s => s.level === 'central');
  if (state.schemeLvl === 'state') list = list.filter(s => s.level === 'state');
  if (state.schemeLvl === 'district') list = [];
  if (state.schemeLvl === 'ongoing') list = list.filter(s => s.status === 'ongoing');
  if (state.schemeCat) list = list.filter(s => s.cats.includes(state.schemeCat));
  if (toks.length) {
    list = list.map(s => {
      const h = haystack(s);
      const score = toks.reduce((n, w) => n + (h.includes(w) ? 2 : 0) + (SYN[w] && s.cats.includes(SYN[w]) ? 3 : 0), 0);
      return { s, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.s);
  }
  return list;
}
function schemeCard(s) {
  return `<article class="card scheme-card">
    <div class="top"><span class="ico ico-${catTone(s)}">${ic(s.icon)}</span><div class="grow stack-sm" style="gap:4px"><h3>${esc(L(s.name))}</h3><div class="row-wrap">${levelBadge(s)}${statusBadge(s)}<span class="badge b-grey">${catName(s.cats[0])}</span></div></div></div>
    <p class="small">${esc(L(s.short))}</p>
    <dl class="kv"><dt>${ic('gift')}${t('benefit')}</dt><dd>${esc(L(s.benefit))}</dd><dt>${ic('users-round')}${t('whoFor')}</dt><dd>${esc(L(s.elig))}</dd></dl>
    ${s.uncertain ? `<div class="notice small" style="color:var(--saffron-ink)">${ic('triangle-alert')}<span>${esc(L(s.uncertain))}</span></div>` : ''}
    ${verifyLine(s)}
    <div class="card-actions"><button class="btn btn-secondary btn-sm" data-a="scheme" data-id="${s.id}">${t('viewDetails')}</button><button class="btn btn-primary btn-sm" data-a="checkElig" data-id="${s.id}">${t('checkMyElig')}</button></div>
  </article>`;
}
function schemeListHTML() {
  const list = filterSchemes();
  if (state.schemeLvl === 'district') return `<div class="empty card"><div class="ico ico-sage">${ic('map')}</div><p>${t('noDistrict')}</p><button class="btn btn-soft btn-sm" data-a="go" data-to="assistant">${ic('bot')}${t('askAI')}</button></div>`;
  if (!list.length) return `<div class="empty card"><div class="ico ico-sage">${ic('search-x')}</div><p>${t('noSchemes')}</p><div class="row-wrap" style="justify-content:center"><button class="btn btn-soft btn-sm" data-a="clearFilters">${t('clearFilters')}</button><button class="btn btn-primary btn-sm" data-a="askFromSearch">${ic('bot')}${t('askAI')}</button></div></div>`;
  return `<div class="small muted">${list.length === 1 ? t('results1') : t('results', { n: list.length })}</div>${list.map(schemeCard).join('')}`;
}
SCREENS.schemes = () => {
  const lv = [['all', 'allSchemes'], ['central', 'f_central'], ['state', 'f_state'], ['district', 'f_district'], ['ongoing', 'f_ongoing']];
  return `${topbar(t('schTitle'), bell())}
  <div class="pad stack" style="padding-top:4px">
    <div class="stack-sm"><h1>${t('schTitle')}</h1><p class="muted">${t('schSub')}</p></div>
    <div class="input-wrap">${ic('search')}<input id="schemeSearch" type="search" placeholder="${t('schSearchPh')}" value="${esc(state.schemeQ)}" aria-label="${t('schSearchPh')}" autocomplete="off"></div>
    <div class="chip-scroll" aria-label="${t('example')}">${[1, 2, 3, 4, 5, 6].map(i => `<button class="chip" data-a="exSearch" data-q="${esc(t('ex_' + i))}">${ic('sparkles')}${t('ex_' + i)}</button>`).join('')}</div>
    <div class="chip-scroll" role="group" aria-label="Filter">${lv.map(([v, k]) => `<button class="chip" data-a="setLvl" data-v="${v}" aria-pressed="${state.schemeLvl === v}">${t(k)}</button>`).join('')}</div>
    <section class="stack-sm"><h2>${t('categories')}</h2>
      <div class="cat-grid">${CATEGORIES.map(c => `<button data-a="setCat" data-v="${c.id}" aria-pressed="${state.schemeCat === c.id}"><span class="ico ico-${c.tone === 'green' ? 'sage' : c.tone}">${ic(c.icon)}</span>${catName(c.id)}</button>`).join('')}</div>
    </section>
    <div class="stack" id="schemeList">${schemeListHTML()}</div>
    <div class="notice card card-tight card-saffron">${ic('database')}<span>${t('notComplete', { n: SCHEMES.length })}</span></div>
  </div>`;
};

/* ---------- Scheme detail ---------- */
SCREENS.detail = () => {
  const s = byId(state.detailId) || SCHEMES[0];
  const d = s.detail;
  const open = UI.open[s.id] || (UI.open[s.id] = [0, 2, 3]);
  const fbN = o => (isFallback(o) ? `<div class="fallback-note">${ic('languages')}${t('trSection')}</div>` : '');
  const list = (o, empty) => (L(o).length ? ulH(L(o)) + fbN(o) : `<p class="muted">${empty}</p>`);
  const docs = L(d.documents);
  const have = state.docs[s.id] || [];
  const sections = [
    [t('d_overview'), pTag(esc(L(d.overview))) + fbN(d.overview)],
    [t('d_purpose'), pTag(esc(L(d.purpose))) + fbN(d.purpose)],
    [t('d_benefits'), list(d.benefits, t('d_none'))],
    [t('d_who'), list(d.who, t('d_none'))],
    [t('d_conditions'), list(d.conditions, t('d_none'))],
    [t('d_exclusions'), list(d.exclusions, t('d_none'))],
    [t('d_documents'), `<div class="small muted">${t('d_docTick')} · <span id="docCount">${t('d_haveN', { a: have.length, b: docs.length })}</span></div>
      ${docs.map((x, i) => `<label class="doc-check"><input type="checkbox" data-c="docTick" data-id="${s.id}" data-i="${i}" ${have.includes(i) ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}${fbN(d.documents)}`],
    [t('d_steps'), `<ol class="steps">${L(d.steps).map(x => `<li><span>${esc(x)}</span></li>`).join('')}</ol>${fbN(d.steps)}`],
    [t('d_status'), pTag(esc(L(d.status))) + fbN(d.status)],
    [t('d_deadlines'), pTag(esc(L(d.deadlines))) + fbN(d.deadlines)],
    [t('d_portal'), `${extLink(s.portal || s.source, s.portalName || s.sourceName, 'btn btn-secondary btn-sm')}<p class="tiny muted">${t('neverAsk')}</p>`],
    [t('d_helpline'), s.helpline ? `<div class="row"><b class="callout-num" style="font-size:1.25rem">${esc(s.helpline)}</b><button class="btn btn-soft btn-sm" data-a="copy" data-text="${esc(s.helpline)}">${ic('copy')}${t('copyNum')}</button></div>` : `<p class="muted">${t('d_noHelp')}</p>`],
    [t('d_source'), `<div class="stack-sm small">${extLink(s.source, s.sourceName)}<div>${esc(L(s.authority))}</div><div class="muted">${t('lastVerified')}: ${t('notVerified')} · ${t('infoAsOf')}: ${INFO_AS_OF}</div>${demoBadge()}</div>`],
  ];
  const allOpen = open.length === sections.length;
  return `${topbar(esc(L(s.name).split('(')[0].trim()), `<button class="icon-btn" data-a="listenPage" aria-label="${t('listenPage')}">${ic('volume-2')}</button>`)}
  <div class="pad stack" style="padding-top:4px">
    <div class="detail-hero">
      <div class="row-wrap">${levelBadge(s)}${statusBadge(s)}<span class="badge b-grey">${catName(s.cats[0])}</span>${demoBadge()}</div>
      <h1>${esc(L(s.name))}</h1>
      <p>${esc(L(s.short))}</p>
      <p class="small muted">${esc(L(s.authority))}</p>
      <div class="card card-sage card-tight row"><span class="ico ico-green">${ic('gift')}</span><div class="grow"><div class="tiny bold muted">${t('benefit')}</div><b>${esc(L(s.benefit))}</b></div></div>
    </div>
    ${s.uncertain ? `<div class="notice card card-tight card-saffron">${ic('triangle-alert')}<span><b>${t('a_uncertain')}:</b> ${esc(L(s.uncertain))}</span></div>` : ''}
    <div class="detail-actions">
      <button class="btn btn-secondary btn-sm" data-a="listenPage">${ic('volume-2')}${t('listenPage')}</button>
      <button class="btn btn-soft btn-sm" data-a="simple">${ic('sparkles')}${t('simpleExplain')}</button>
      <button class="btn btn-primary wide" data-a="askScheme" data-id="${s.id}">${ic('bot')}${t('askAboutScheme')}</button>
    </div>
    ${UI.showSimple[s.id] ? `<div class="simple-box"><h3>${ic('sparkles')}${t('simpleTitle')}</h3><p>${esc(L(d.simple))}</p><div class="row-wrap"><button class="btn btn-soft btn-sm" data-a="saySimple">${ic('volume-2')}${t('listen')}</button></div></div>` : ''}
    <div class="row" style="justify-content:flex-end"><button class="link-btn" data-a="accAll">${ic(allOpen ? 'chevrons-down-up' : 'chevrons-up-down')}${allOpen ? t('sectionsClose') : t('sectionsOpen')}</button></div>
    <div>${sections.map(([h, b], i) => `<div class="acc" data-open="${open.includes(i)}"><button data-a="acc" data-i="${i}" aria-expanded="${open.includes(i)}"><span class="num">${i + 1}</span><span class="grow">${h}</span>${ic('chevron-down', 'chev')}</button><div class="acc-body">${b}</div></div>`).join('')}</div>
    <div class="notice card card-tight card-red">${ic('lock-keyhole')}<span>${t('neverAsk')}</span></div>
    <button class="btn btn-secondary btn-block" data-a="checkElig" data-id="${s.id}">${ic('badge-check')}${t('checkMyElig')}</button>
  </div>`;
};

/* ---------- Healthcare ---------- */
const HTABS = [['camps', 'calendar-days', 'h_camps'], ['vax', 'syringe', 'h_vax'], ['hosp', 'hospital', 'h_hosp'], ['phc', 'building-2', 'h_phc'], ['mch', 'baby', 'h_mch'], ['prev', 'heart-pulse', 'h_prev'], ['schemes', 'shield-check', 'h_schemes'], ['em', 'phone-call', 'h_em']];
function facilityCard(f) {
  const d = getP().district;
  return `<article class="card list-card"><div class="row"><span class="ico ico-blue">${ic(f.type === 'csc' ? 'landmark' : f.type === 'hospital' ? 'hospital' : 'building-2')}</span><div class="grow"><h3>${esc(L(f.name))}${d && f.type === 'hospital' ? ', ' + esc(d) : ''}</h3><div class="small muted">${t('f_dist', { n: f.dist })}</div></div>${demoBadge(true)}</div>
    <div class="facts"><div>${ic('clock')}<span>${esc(L(f.open))}</span></div><div>${ic('phone')}<span>${t('f_phoneNA')}</span></div></div>
    <div class="row-wrap"><button class="btn btn-soft btn-sm" data-a="toast" data-k="c_dirNA">${ic('navigation')}${t('c_dir')}</button></div></article>`;
}
function healthPanel() {
  const p = getP();
  const tab = state.healthTab;
  const needArea = `<div class="empty card"><div class="ico ico-blue">${ic('map-pinned')}</div><p>${t('f_needLoc')}</p><button class="btn btn-soft btn-sm" data-a="setArea">${ic('map-pin')}${t('h_setArea')}</button></div>`;
  if (tab === 'camps') {
    if (!p.district) return needArea;
    const camps = CAMPS[p.district];
    if (!camps) {
      return `<div class="empty card"><div class="ico ico-blue">${ic('calendar-x')}</div><p>${t('noCamps')}</p></div>
        ${facilityCard(FACILITIES.find(f => f.type === 'phc'))}${srcPlain('https://nhm.gov.in', 'nhm.gov.in')}`;
    }
    return camps.map(c => {
      const on = state.reminders.includes(c.id);
      return `<article class="card list-card">
        <div class="row" style="justify-content:space-between"><span class="badge b-blue">${ic('calendar-days')}${until(c.when)}</span>${demoBadge(true)}</div>
        <h3>${esc(L(c.name))}</h3>
        <div class="facts">
          <div>${ic('clock')}<span><b>${t('c_when')}:</b> ${fmtDate(c.when)} · ${esc(c.until)}</span></div>
          <div>${ic('map-pin')}<span><b>${t('c_venue')}:</b> ${esc(L(c.venue))}, ${esc(p.district)}</span></div>
          <div>${ic('stethoscope')}<span><b>${t('c_services')}:</b> ${esc(L(c.services))}</span></div>
          <div>${ic('users-round')}<span><b>${t('c_for')}:</b> ${esc(L(c.audience))}</span></div>
          <div>${ic('clipboard-check')}<span><b>${t('c_reg')}:</b> ${esc(L(c.reg))}</span></div>
          <div>${ic('building')}<span><b>${t('c_org')}:</b> ${esc(L(c.org))}</span></div>
          <div>${ic('phone')}<span><b>${t('c_contact')}:</b> ${t('c_contactNA')}</span></div>
        </div>
        <div class="row-wrap"><button class="btn ${on ? 'btn-soft' : 'btn-secondary'} btn-sm" data-a="remind" data-id="${c.id}" aria-pressed="${on}">${ic(on ? 'bell-ring' : 'bell-plus')}${t('c_remind')}</button>
          <button class="btn btn-soft btn-sm" data-a="toast" data-k="c_dirNA">${ic('navigation')}${t('c_dir')}</button>
          <button class="btn btn-soft btn-sm" data-a="sayCamp" data-id="${c.id}">${ic('volume-2')}${t('listen')}</button></div>
      </article>`;
    }).join('');
  }
  if (tab === 'vax') {
    return `<div class="card stack-sm"><p>${t('vax_intro')}</p>
      <div class="tbl-wrap"><table class="vax"><thead><tr><th>${t('vax_age')}</th><th>${t('vax_v')}</th></tr></thead><tbody>${VAX.map(r => `<tr><td><b>${esc(L(r.age))}</b></td><td>${esc(r.v)}</td></tr>`).join('')}</tbody></table></div>
      <div class="tiny muted">${tr('National Immunization Schedule, Ministry of Health & Family Welfare (summary). Ask your health worker for the full schedule.', 'राष्ट्रीय टीकाकरण सारणी, स्वास्थ्य एवं परिवार कल्याण मंत्रालय (सार)। पूरी सारणी के लिए स्वास्थ्य कार्यकर्ता से पूछें।')}</div></div>
      <div class="card stack-sm"><h3>${t('vax_local')}</h3><p class="small">${t('vax_localNA')}</p></div>
      ${srcPlain('https://uwin.mohfw.gov.in', 'uwin.mohfw.gov.in')}${srcPlain('https://mohfw.gov.in', 'mohfw.gov.in')}`;
  }
  if (tab === 'hosp') return p.district ? FACILITIES.filter(f => f.type !== 'phc').map(facilityCard).join('') + `<p class="tiny muted">${tr('Distances and hours are approximate. Confirm before you travel.', 'दूरी और समय अनुमानित हैं। जाने से पहले पुष्टि करें।')}</p>` : needArea;
  if (tab === 'phc') return p.district ? FACILITIES.filter(f => f.type === 'phc' || f.type === 'hwc').map(facilityCard).join('') : needArea;
  if (tab === 'mch') {
    return `<div class="card stack-sm"><ul class="crit">${[1, 2, 3, 4].map(i => `<li class="ok">${ic('check')}${t('mch_' + i)}</li>`).join('')}</ul></div>
      ${miniList([byId('pmmvy'), byId('pmjay')])}${srcPlain('https://pmsma.mohfw.gov.in', 'pmsma.mohfw.gov.in')}`;
  }
  if (tab === 'prev') return `<div class="card stack-sm"><ul class="crit">${[1, 2, 3, 4, 5].map(i => `<li class="ok">${ic('check')}${t('prev_' + i)}</li>`).join('')}</ul><p class="tiny muted">${t('prev_note')}</p></div>`;
  if (tab === 'schemes') return miniList([byId('pmjay'), byId('pmmvy'), byId('udid')]);
  return `<div class="em-grid">${[['112', 'em_112'], ['108', 'em_108'], ['102', 'em_102'], ['104', 'em_104'], ['14416', 'em_14416']].map(([n, k], i) => `<a class="${i === 0 ? 'em-call' : ''}" href="tel:${n}"><span class="ico ${i === 0 ? '' : 'ico-red'}">${ic('phone-call')}</span><span class="grow"><span class="callout-num" style="font-size:1.15rem;display:block">${n}</span><span class="small">${t(k)}</span></span></a>`).join('')}</div>
    <p class="tiny muted">${t('em_note')}</p>
    <div class="card card-tight row"><span class="ico ico-blue">${ic('video')}</span><span class="grow small">${t('telemed')}</span>${extLink('https://esanjeevani.mohfw.gov.in', 'eSanjeevani')}</div>`;
}
SCREENS.health = () => {
  const p = getP();
  const hq = isHi() ? ['मेरा सबसे नज़दीकी सरकारी अस्पताल कहाँ है?', 'क्या मेरे गाँव में हेल्थ कैंप है?', 'टीकाकरण की आधिकारिक जानकारी कहाँ मिलेगी?'] : ['Where is my nearest government hospital?', 'Is there a health camp in my village?', 'Where can I find official vaccination information?'];
  return `${topbar(t('svcHealth'), bell())}
  <div class="pad stack" style="padding-top:4px">
    <div class="stack-sm"><h1>${t('hTitle')}</h1><p class="muted">${t('hSub')}</p></div>
    <div class="card card-tight row"><span class="ico ico-blue">${ic('map-pin')}</span><span class="grow small"><span class="muted">${t('h_area')}</span><br><b>${esc(areaLabel() || t('h_noArea'))}</b></span><button class="btn btn-soft btn-sm" data-a="setArea">${t('h_setArea')}</button></div>
    <div class="h-grid" role="group">${HTABS.map(([k, i, l]) => `<button data-a="setHTab" data-v="${k}" aria-pressed="${state.healthTab === k}"><span class="ico ${k === 'em' ? 'ico-red' : 'ico-blue'}">${ic(i)}</span><span>${t(l)}</span></button>`).join('')}</div>
    <h2 id="hPanel">${t(HTABS.find(h => h[0] === state.healthTab)[2])}</h2>
    <div class="stack">${healthPanel()}</div>
    <div class="card card-blue stack-sm"><h3 class="row">${ic('bot')}${t('askAI')}</h3><div class="follow-chips">${hq.map(q => `<button class="chip" data-a="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div><p class="tiny muted">${t('prev_note')}</p></div>
  </div>`;
};

/* ---------- Alerts ---------- */
SCREENS.alerts = () => {
  const a = SIM_ALERT;
  const on = state.simAlert;
  const valid = new Date(a.issued.getTime() + a.validHours * 3600e3);
  const types = [['flood', 'waves'], ['rain', 'cloud-rain'], ['cyclone', 'wind'], ['quake', 'activity'], ['slide', 'mountain'], ['heat', 'sun'], ['cold', 'thermometer-snowflake'], ['other', 'triangle-alert']];
  const p = getP();
  return `${topbar(t('svcAlerts'), bell())}
  <div class="pad stack" style="padding-top:4px">
    <div class="alert-hero ${on ? 'active' : ''}"><span class="ico">${ic(on ? 'shield-alert' : 'shield-check')}</span><div class="stack-sm" style="gap:2px"><h1 style="font-size:1.3rem">${t('aTitle')}</h1><p>${t('aSub')}</p></div></div>
    ${on && isOffline() ? `<div class="cache-warn">${ic('wifi-off')}<span>${t('cachedAt', { t: fmtDate(a.issued) + ' ' + fmtTime(a.issued) })}</span></div>` : ''}
    ${on ? `<section class="stack-sm"><h2>${t('activeAlerts')}</h2>
      <article class="alert-card">
        <div class="ah">${ic(a.icon)}<div class="grow"><b>${esc(L(a.title))}</b><div class="tiny">${t('simAlertBadge')}</div></div></div>
        <div class="ab">
          <dl class="kv">
            <dt>${ic('landmark')}${t('issuedBy')}</dt><dd>${esc(L(a.authority))}</dd>
            <dt>${ic('map-pin')}${t('area')}</dt><dd>${esc(p.district ? p.district + ' ' + tr('district', 'ज़िला') : tr('Your selected area', 'आपका चुना हुआ क्षेत्र'))}</dd>
            <dt>${ic('gauge')}${t('severity')}</dt><dd><span class="sev">${esc(L(a.severity))}</span></dd>
            <dt>${ic('clock')}${t('issuedAt')}</dt><dd>${fmtDate(a.issued)} · ${fmtTime(a.issued)}</dd>
            <dt>${ic('timer')}${t('validTill')}</dt><dd>${fmtDate(valid)} · ${fmtTime(valid)}</dd>
          </dl>
          <div><h3 style="margin-bottom:6px">${t('whatToDo')}</h3><ol class="instr">${L(a.instr).map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>
          <div class="card-actions"><button class="btn btn-danger btn-sm" data-a="sayAlert">${ic('volume-2')}${t('listenAlert')}</button>${extLink(a.link, t('viewAdvisory'), 'btn btn-danger-outline btn-sm')}</div>
          ${state.alertDismissed ? `<p class="tiny muted">${t('criticalKeep')}</p>` : `<button class="link-btn" data-a="dismissAlert" style="justify-self:start;color:var(--ink-2)">${ic('bell-off')}${t('dismiss')}</button>`}
        </div>
      </article></section>`
      : `<div class="empty card"><div class="ico ico-blue">${ic('shield-check')}</div><p><b>${t('noAlerts')}</b></p><p class="tiny muted">${esc(areaLabel() || t('h_noArea'))}</p></div>`}
    <section class="stack-sm"><h2>${t('emActions')}</h2>
      <div class="em-grid">
        <a class="em-call" href="tel:112"><span class="ico">${ic('phone-call')}</span><span class="grow">${t('callEm')}<span class="small" style="display:block;font-weight:500">${t('callEmD')}</span></span></a>
        <button data-a="safeLoc"><span class="ico ico-blue">${ic('map-pinned')}</span>${t('safeLoc')}</button>
        <a href="https://ndma.gov.in" data-a="ext" data-url="https://ndma.gov.in" data-name="ndma.gov.in"><span class="ico ico-blue">${ic('file-text')}</span>${t('viewInstr')}</a>
        <button data-a="shareAlert"><span class="ico ico-blue">${ic('share-2')}</span>${t('shareAlert')}</button>
        <button data-a="sayInstr"><span class="ico ico-blue">${ic('volume-2')}</span>${t('listenInstr')}</button>
      </div>
      <p class="tiny muted">${t('em_note')}</p>
    </section>
    <section class="stack-sm"><h2>${t('alertTypes')}</h2>
      <div class="atype-grid">${types.map(([k, i]) => `<div class="${on && k === 'rain' ? 'on' : ''}">${ic(i)}${t('at_' + k)}</div>`).join('')}</div>
    </section>
    <section class="card stack-sm"><h3>${t('officialSources')}</h3>${extLink('https://mausam.imd.gov.in', 'India Meteorological Department — mausam.imd.gov.in')}${extLink('https://sachet.ndma.gov.in', 'NDMA SACHET — sachet.ndma.gov.in')}</section>
  </div>`;
};
/* ---------- Notifications ---------- */
SCREENS.notifications = () => {
  const cats = [['all', 'nAll'], ['scheme', 'n_scheme'], ['camp', 'n_camp'], ['vax', 'n_vax'], ['alert', 'n_alert'], ['service', 'n_service']];
  const list = visibleNotifs().filter(n => state.notifFilter === 'all' || n.kind === state.notifFilter);
  return `${topbar(t('nTitle'), `<button class="icon-btn" data-a="notifSettings" aria-label="${t('nSettings')}">${ic('settings-2')}</button>`)}
  <div class="pad stack" style="padding-top:4px">
    <div class="chip-scroll" role="group">${cats.map(([v, k]) => `<button class="chip" data-a="setNF" data-v="${v}" aria-pressed="${state.notifFilter === v}">${t(k)}</button>`).join('')}</div>
    <div class="row" style="justify-content:space-between"><span class="small muted">${t('nNoUrgency')}</span><button class="link-btn" data-a="markAll">${ic('check-check')}${t('markAll')}</button></div>
    ${!state.consent.notif ? `<div class="notice card card-tight card-saffron">${ic('bell-off')}<span>${t('nOffConsent')}</span></div>` : ''}
    <div class="stack-sm">${list.length ? list.map(n => `<button class="notif ${state.read.includes(n.id) ? '' : 'unread'}" data-a="notifGo" data-id="${n.id}"><span class="ico ico-${n.tone}">${ic(n.icon)}</span><span class="body"><span class="t">${esc(L(n.t))}</span><span class="meta"><span>${t('source')}: ${esc(n.src)}</span><span>${ago(n.at)}</span><span>${esc(L(n.rel))}</span></span></span></button>`).join('')
      : `<div class="empty card"><div class="ico ico-sage">${ic('bell')}</div><p>${t('nEmpty')}</p></div>`}</div>
    <button class="btn btn-secondary btn-block" data-a="notifSettings">${ic('settings-2')}${t('nSettings')}</button>
  </div>`;
};
function notifSettingsSheet() {
  const rows = [['scheme', 'n_scheme', 'landmark'], ['camp', 'n_camp', 'calendar-days'], ['vax', 'n_vax', 'syringe'], ['service', 'n_service', 'bell'], ['reminder', 'n_reminder', 'alarm-clock']];
  const ready = LANGUAGES.filter(l => l.ready);
  openSheet(`<div class="sheet-head"><h2>${t('nSettings')}</h2><button class="icon-btn" data-a="closeSheet" aria-label="${t('close')}">${ic('x')}</button></div>
    <div class="card">
      <div class="set-row"><span class="ico ico-red">${ic('shield-alert')}</span><span class="grow"><b>${t('nCritical')}</b><span class="small muted">${t('nCriticalD')}</span></span>${sw('np-critical', true, 'noop', '', true)}</div>
      ${rows.map(([k, l, i]) => `<div class="set-row"><span class="ico ico-sage">${ic(i)}</span><label class="grow" for="np-${k}"><b>${t(l)}</b>${k === 'reminder' ? `<span class="small muted">${t('nReminderD')}</span>` : ''}</label>${sw('np-' + k, state.notifPrefs[k] && state.consent.notif, 'notifPref', `data-k="${k}"`, !state.consent.notif)}</div>`).join('')}
    </div>
    ${!state.consent.notif ? `<p class="small muted" style="margin-top:10px">${t('nOffConsent')}</p>` : ''}
    <div class="field" style="margin-top:14px"><label for="alertLang">${t('nLang')}</label><div class="input-wrap">${ic('languages')}<select id="alertLang" data-c="alertLang"><option value="same" ${state.alertLang === 'same' ? 'selected' : ''}>${esc(curLang().native)} (${t('prefLang')})</option>${ready.map(l => `<option value="${l.code}" ${state.alertLang === l.code ? 'selected' : ''}>${esc(l.native)} · ${l.eng}</option>`).join('')}</select>${ic('chevron-down')}</div></div>
    <button class="btn btn-primary btn-block" style="margin-top:16px" data-a="closeSheet">${t('done')}</button>`);
}

/* ---------- Profile ---------- */
SCREENS.profile = () => {
  const pr = state.profile;
  const initials = pr ? pr.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() : '';
  const masked = pr ? `+91 ${pr.mobile.slice(0, 2)}••••••${pr.mobile.slice(-2)}` : '';
  const sizeK = state.textScale >= 1.3 ? 'ts_xl' : state.textScale > 1 ? 'ts_large' : 'ts_normal';
  const a11y = pr && pr.a11y && pr.a11y.length ? pr.a11y.map(k => t('a11y_' + k)).join(', ') : '—';
  const notifOn = Object.entries(state.notifPrefs).filter(([, v]) => v).length;
  const item = (a, i, c, label, val = '', cls = '') => `<button class="${cls}" data-a="${a}"><span class="ico ${c}">${ic(i)}</span><span class="grow">${label}</span>${val ? `<span class="val">${esc(val)}</span>` : ''}${ic('chevron-right', 'chev')}</button>`;
  return `${topbar(t('pTitle'))}
  <div class="pad stack" style="padding-top:4px">
    <div class="card prof-head">
      ${pr ? `<span class="avatar">${esc(initials)}</span><div class="grow stack-sm" style="gap:2px"><h2>${esc(pr.name)}</h2><span class="small row" style="gap:6px">${esc(masked)}<span class="verified-tag" style="font-size:.78rem">${ic('circle-check')}${t('verified')}</span></span><span class="small muted">${esc([pr.village, pr.district, pr.state].filter(Boolean).join(', '))}</span></div>`
        : `<span class="avatar" style="background:var(--sage);color:var(--green)">${ic('user-round')}</span><div class="grow stack-sm" style="gap:4px"><h2>${t('pGuest')}</h2><span class="small muted">${t('pGuestD')}</span><button class="btn btn-primary btn-sm" data-a="go" data-to="register" style="justify-self:start">${t('setupProfile')}</button></div>`}
    </div>
    ${pr ? `<div class="card card-tight"><dl class="kv"><dt>${ic('languages')}${t('prefLang')}</dt><dd>${esc(curLang(state.prefLang).native)}</dd><dt>${ic('accessibility')}${t('a11yPref')}</dt><dd>${esc(a11y)}</dd><dt>${ic('bell')}${t('nTitle')}</dt><dd>${state.consent.notif ? notifOn + ' / 5' : '—'}</dd></dl></div>` : ''}
    <div class="menu">
      ${pr ? item('editProfile', 'user-round-pen', 'ico-sage', t('mEdit')) : ''}
      ${item('goLang', 'languages', 'ico-sage', t('mLang'), curLang().native)}
      ${item('voiceSheet', 'speech', 'ico-sage', t('mVoice'))}
      ${item('textSheet', 'a-large-small', 'ico-sage', t('mText'), t(sizeK))}
      ${item('privacySheet', 'shield-check', 'ico-sage', t('mPrivacy'))}
      ${item('notifSettings', 'bell', 'ico-sage', t('mNotif'))}
    </div>
    <div class="menu">
      ${item('helpSheet', 'circle-help', 'ico-blue', t('mHelp'))}
      ${item('aboutSheet', 'info', 'ico-blue', t('mAbout'))}
    </div>
    ${pr ? `<div class="menu">${item('signOut', 'log-out', 'ico-grey', t('mOut'))}${item('deleteAcc', 'user-round-x', 'ico-red', t('mDelete'), '', 'danger')}</div>` : ''}
    ${location.hash === '#demo' ? `<div class="card" style="border-style:dashed">
      <h3 class="row">${ic('flask-conical')}${t('mProto')}</h3>
      <div class="set-row"><label class="grow" for="pc-alert">${t('pc_alert')}</label>${sw('pc-alert', state.simAlert, 'simAlert')}</div>
      <div class="set-row"><label class="grow" for="pc-off">${t('pc_offline')}</label>${sw('pc-off', state.offline, 'offline')}</div>
      <div class="set-row"><span class="grow">${t('pc_reset')}</span><button class="btn btn-soft btn-sm" data-a="resetDemo">${ic('rotate-ccw')}${t('pc_reset')}</button></div>
    </div>` : ''}
    <p class="tiny muted" style="text-align:center">${t('notOfficial')}</p>
  </div>`;
};

/* ---------- Sheets ---------- */
let lastFocus = null;
function openSheet(html) {
  lastFocus = document.activeElement;
  $('#layer').innerHTML = `<div class="scrim" data-a="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  icons();
  const first = $('#layer .sheet input:not([type=hidden]), #layer .sheet button:not([data-a=closeSheet]), #layer .sheet a');
  setTimeout(() => first && first.focus({ preventScroll: true }), 30);
}
function closeSheet() {
  clearInterval(UI.otpTimer);
  $('#layer').innerHTML = '';
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}
function sheetHead(title) { return `<div class="sheet-head"><h2>${title}</h2><button class="icon-btn" data-a="closeSheet" aria-label="${t('close')}">${ic('x')}</button></div>`; }

function otpSheet() {
  openSheet(`${sheetHead(t('otpTitle'))}
    <div class="stack">
      <p>${t('otpSent', { n: state.form.mobile.replace(/(\d{5})(\d{5})/, '$1 $2') })}</p>
      <div class="notice card card-tight card-saffron">${ic('flask-conical')}<span>${t('otpDemo')}</span></div>
      <div class="otp-boxes" id="otpBoxes">${[1, 2, 3, 4, 5, 6].map(i => `<input type="password" inputmode="numeric" maxlength="1" autocomplete="${i === 1 ? 'one-time-code' : 'off'}" aria-label="${tr('Digit', 'अंक')} ${i}">`).join('')}</div>
      <div class="err" id="otpErr"></div>
      <button class="btn btn-primary btn-block" data-a="otpVerify">${ic('shield-check')}${t('otpVerify')}</button>
      <div class="row" id="otpResend" style="justify-content:center"></div>
      <p class="tiny muted" style="text-align:center">${ic('lock-keyhole')} ${t('otpNever')}</p>
    </div>`);
  startOtpTimer();
}
function startOtpTimer() {
  UI.otpLeft = 30;
  const tick = () => {
    const el = $('#otpResend');
    if (!el) { clearInterval(UI.otpTimer); return; }
    el.innerHTML = UI.otpLeft > 0 ? `<span class="small muted">${t('otpResendIn', { s: UI.otpLeft })}</span>` : `<button class="link-btn" data-a="otpResend">${t('otpResend')}</button>`;
    UI.otpLeft--;
    if (UI.otpLeft < -1) clearInterval(UI.otpTimer);
  };
  clearInterval(UI.otpTimer);
  tick();
  UI.otpTimer = setInterval(tick, 1000);
}
function otpError(msg) {
  const e = $('#otpErr');
  if (e) e.innerHTML = msg ? ic('circle-alert') + `<span>${esc(msg)}</span>` : '';
  $('#otpBoxes')?.classList.toggle('invalid', !!msg);
  icons();
}

function pickerSheet(kind) {
  const target = UI.pickerFor === 'area' ? state.answers : state.form;
  const items = kind === 'state' ? STATES : (DISTRICTS[target.state] || []);
  openSheet(`${sheetHead(kind === 'state' ? t('state') : t('district'))}
    <div class="stack-sm">
      <div class="input-wrap">${ic('search')}<input id="pickSearch" type="search" placeholder="${tr('Search', 'खोजें')}" autocomplete="off" aria-label="${tr('Search', 'खोजें')}"></div>
      <div class="menu" id="pickList">${items.map(x => `<button data-a="pickItem" data-kind="${kind}" data-v="${esc(x)}" data-name="${esc(x.toLowerCase())}"><span class="grow">${esc(x)}</span>${target[kind] === x ? ic('circle-check') : ''}</button>`).join('')}</div>
    </div>`);
}
function areaSheet() {
  const a = state.answers;
  const dl = DISTRICTS[a.state];
  openSheet(`${sheetHead(t('h_setArea'))}
    <div class="stack">
      <p class="small muted">${tr('Choose your area to see local camps, facilities and alerts. You do not need an account.', 'स्थानीय शिविर, सुविधाएँ और अलर्ट देखने के लिए अपना क्षेत्र चुनें। खाते की ज़रूरत नहीं।')}</p>
      <div class="field"><span class="label">${t('state')}</span><button type="button" class="input-wrap picker" data-a="areaPick" data-kind="state">${ic('map-pin')}<span class="grow ${a.state ? '' : 'muted'}">${esc(a.state || t('statePh'))}</span>${ic('chevron-down')}</button></div>
      <div class="field"><span class="label">${t('district')}</span>${!a.state ? `<button type="button" class="input-wrap picker" disabled>${ic('map')}<span class="grow muted">${t('districtFirst')}</span></button>` : dl ? `<button type="button" class="input-wrap picker" data-a="areaPick" data-kind="district">${ic('map')}<span class="grow ${a.district ? '' : 'muted'}">${esc(a.district || t('districtPh'))}</span>${ic('chevron-down')}</button>` : `<div class="input-wrap">${ic('map')}<input id="areaDistrict" placeholder="${t('districtType')}" value="${esc(a.district || '')}"></div><div class="hint">${t('districtNote')}</div>`}</div>
      <button class="btn btn-primary btn-block" data-a="areaDone">${t('done')}</button>
      <button class="link-btn" data-a="areaDemo" style="justify-self:center">${ic('flask-conical')}${tr('Try Barabanki, Uttar Pradesh', 'बाराबंकी, उत्तर प्रदेश आज़माएँ')}</button>
    </div>`);
}
function extSheet(url, name) {
  let host = name;
  try { host = new URL(url).hostname; } catch (e) { /* keep name */ }
  openSheet(`${sheetHead(t('leaveTitle'))}
    <div class="stack">
      <div class="row"><span class="ico ico-blue">${ic('external-link')}</span><p class="grow">${esc(t('leaveBody', { site: host }))}</p></div>
      <div class="notice card card-tight card-red">${ic('lock-keyhole')}<span>${t('neverAsk')}</span></div>
      <a class="btn btn-primary btn-block" href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-a="extGo">${ic('external-link')}${t('openSite')}</a>
      <button class="btn btn-ghost btn-block" data-a="closeSheet">${t('stayHere')}</button>
    </div>`);
}
function confirmSheet(title, body, btnLabel, act, danger, extra = '') {
  openSheet(`${sheetHead(title)}<div class="stack"><p>${body}</p>${extra}<button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" data-a="${act}" id="confirmBtn">${btnLabel}</button><button class="btn btn-ghost btn-block" data-a="closeSheet">${t('cancel')}</button></div>`);
}
function voiceSheet() {
  const l = curLang();
  openSheet(`${sheetHead(t('mVoice'))}
    <div class="stack">
      <div class="notice card card-tight ${l.voice ? 'card-sage' : 'card-saffron'}">${ic('audio-lines')}<span>${t('v_support', { lang: l.eng, s: l.voice ? t('v_yes') : t('v_no') })}</span></div>
      <div class="field"><label for="ttsRate">${t('v_rate')}: <b id="rateVal">${state.ttsRate.toFixed(2)}×</b></label><input type="range" id="ttsRate" min="0.6" max="1.4" step="0.1" value="${state.ttsRate}" data-c="rate"><div class="row small muted" style="justify-content:space-between"><span>${t('v_slow')}</span><span>${t('v_fast')}</span></div></div>
      <button class="btn btn-soft btn-sm" data-a="testVoice" style="justify-self:start">${ic('volume-2')}${t('v_test')}</button>
      <div class="card card-tight">
        <div class="set-row"><label class="grow" for="autoRead">${t('v_auto')}</label>${sw('autoRead', state.autoRead, 'autoRead')}</div>
        <div class="set-row"><span class="grow">${t('v_mic')}<span class="small muted" style="display:block">${state.mic === 'granted' ? t('v_micOn') : state.mic === 'denied' ? t('v_micOff') : t('v_micAsk')}</span></span>${sw('micPerm', state.mic === 'granted', 'micPerm')}</div>
      </div>
      <p class="tiny muted">${t('speechSim')}</p>
      <button class="btn btn-primary btn-block" data-a="closeSheet">${t('done')}</button>
    </div>`);
}
function textSheet() {
  const opts = [[1, 'ts_normal', '1rem'], [1.15, 'ts_large', '1.2rem'], [1.3, 'ts_xl', '1.4rem']];
  openSheet(`${sheetHead(t('mText'))}
    <div class="stack">
      <div class="size-opts">${opts.map(([v, k, fs]) => `<button data-a="setSize" data-v="${v}" aria-pressed="${state.textScale === v}"><span class="aa" style="font-size:${fs}">Aa अ</span>${t(k)}</button>`).join('')}</div>
      <div class="card"><p>${t('ts_preview')}</p><p class="muted small">${t('aiCardSub')}</p></div>
      <button class="btn btn-primary btn-block" data-a="closeSheet">${t('done')}</button>
    </div>`);
}
function privacySheet() {
  const cons = [['personal', 'pPersonal', 'pPersonalD'], ['location', 'pLocation', 'pLocationD'], ['notif', 'pNotif', 'pNotifD']];
  openSheet(`${sheetHead(t('mPrivacy'))}
    <div class="stack">
      <p class="small">${t('pv_intro')}</p>
      <div class="card">
        <div class="set-row"><span class="grow"><b>${t('pEssential')}</b><span class="small muted" style="display:block">${t('pEssentialD')}</span></span>${sw('pv-essential', true, 'noop', '', true)}</div>
        ${cons.map(([k, a, b]) => `<div class="set-row"><label class="grow" for="pv-${k}"><b>${t(a)}</b><span class="small muted" style="display:block">${t(b)}</span></label>${sw('pv-' + k, state.consent[k], 'consent', `data-k="${k}"`)}</div>`).join('')}
      </div>
      <div class="card card-tight stack-sm"><h3>${t('pv_stored')}</h3><p class="small">${t('pv_storedD')}</p></div>
      <div class="card card-tight stack-sm"><h3>${t('pv_withdraw')}</h3><p class="small">${t('pv_withdrawD')}</p></div>
      <div class="notice card card-tight card-blue">${ic('info')}<span>${t('aadhaarNote')}</span></div>
      <button class="btn btn-primary btn-block" data-a="closeSheet">${t('done')}</button>
    </div>`);
}
function helpSheet() {
  openSheet(`${sheetHead(t('mHelp'))}<div class="stack"><p>${t('helpBody')}</p>
    ${[1, 2, 3].map(i => `<details class="card card-tight"><summary class="bold">${t('faq' + i + 'q')}</summary><p class="small" style="margin-top:8px">${t('faq' + i + 'a')}</p></details>`).join('')}
    <button class="btn btn-secondary btn-block" data-a="helpAsk">${ic('bot')}${t('askAI')}</button></div>`);
}
function aboutSheet() {
  openSheet(`${sheetHead(t('mAbout'))}<div class="stack"><div class="row"><span class="mini-logo" style="width:56px">${logoSVG()}</span><div><b>JanSahayak AI</b><div class="small muted">${S.tagline[0]}</div></div></div>
    <p>${t('aboutBody')}</p><div class="notice card card-tight card-saffron">${ic('flask-conical')}<span>${t('aboutDemo')}</span></div><p class="small muted">${t('notOfficial')}</p></div>`);
}

/* ---------- Text-to-speech ---------- */
function speak(text, bcp) {
  if (!text) return;
  if (!('speechSynthesis' in window)) { toast(t('noTts')); return; }
  stopSpeak(true);
  bcp = bcp || contentBcp();
  const prefix = bcp.split('-')[0];
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith(prefix));
  if (voices.length && !voice && prefix !== 'en') { toast(t('noVoiceDevice', { lang: (LANGUAGES.find(l => l.bcp.startsWith(prefix)) || {}).eng || prefix })); return; }
  const chunks = (text.match(/[^.!?।]+[.!?।]?/g) || [text]).reduce((acc, s) => {
    if (acc.length && (acc[acc.length - 1] + s).length < 220) acc[acc.length - 1] += s; else acc.push(s);
    return acc;
  }, []);
  UI.ttsQueue = chunks.length;
  UI.speaking = true; renderSysbar();
  chunks.forEach(c => {
    const u = new SpeechSynthesisUtterance(c.trim());
    u.lang = bcp; if (voice) u.voice = voice; u.rate = state.ttsRate;
    u.onend = u.onerror = () => { UI.ttsQueue--; if (UI.ttsQueue <= 0) { UI.speaking = false; renderSysbar(); } };
    speechSynthesis.speak(u);
  });
}
function stopSpeak(silent) {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  UI.ttsQueue = 0;
  if (UI.speaking) { UI.speaking = false; if (!silent) renderSysbar(); }
}
if ('speechSynthesis' in window) { try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; } catch (e) { /* ignore */ } }

/* ---------- Toast + clipboard ---------- */
let toastT = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3200);
}
function copyText(text, okMsg) {
  const fallback = () => openSheet(`${sheetHead(t('shareAlert'))}<textarea class="card" style="width:100%;min-height:160px" readonly id="copyArea">${esc(text)}</textarea><p class="small muted" style="margin-top:8px">${tr('Select the text and copy it.', 'टेक्स्ट चुनकर कॉपी करें।')}</p>`);
  try {
    navigator.clipboard.writeText(text).then(() => toast(okMsg || t('copied')), fallback);
  } catch (e) { fallback(); }
}

/* ---------- Navigation ---------- */
const TABS = [['home', 'house', 'navHome'], ['assistant', 'message-circle', 'navAssistant'], ['services', 'grid-2x2', 'navServices'], ['profile', 'user-round', 'navProfile']];
const TAB_OF = { home: 'home', assistant: 'assistant', services: 'services', schemes: 'services', match: 'services', detail: 'services', health: 'services', alerts: 'services', notifications: 'services', profile: 'profile' };
function go(screen) {
  if (screen === state.screen) { $('#screen').scrollTop = 0; return; }
  UI.hist.push(state.screen);
  if (UI.hist.length > 30) UI.hist.shift();
  state.screen = screen;
  stopRec(false);
  render();
  $('#screen').scrollTop = 0;
}
function tab(screen) { UI.hist = []; if (state.screen === screen) { $('#screen').scrollTop = 0; return; } state.screen = screen; stopRec(false); render(); $('#screen').scrollTop = 0; }
function back() {
  const prev = UI.hist.pop();
  state.screen = prev || (state.langChosen ? 'home' : 'splash');
  render();
  $('#screen').scrollTop = 0;
}
function goTarget(to) {
  if (!to) return;
  if (to === 'match') return go('match');
  if (to === 'quiz') { go('match'); return startQuiz(false); }
  if (to === 'area') return areaSheet();
  if (to.startsWith('health:')) { state.healthTab = to.split(':')[1]; return go('health'); }
  if (to.startsWith('scheme:')) { state.detailId = to.split(':')[1]; return go('detail'); }
  go(to);
}

function renderNav() {
  const nav = $('#bottomNav');
  const tb = TAB_OF[state.screen];
  nav.hidden = !tb;
  if (!tb) { nav.innerHTML = ''; return; }
  nav.innerHTML = TABS.map(([s, i, k]) => `<button data-a="tab" data-to="${s}" ${tb === s ? 'aria-current="page"' : ''}><span class="pill">${ic(i)}</span>${t(k)}</button>`).join('');
}
function renderSysbar() {
  let h = '';
  if (isOffline()) h += `<div class="offline-bar">${ic('wifi-off')}<span>${t('offline')}</span></div>`;
  const onboarding = ['splash', 'language', 'register'].includes(state.screen);
  if (state.simAlert && !state.alertDismissed && !onboarding && state.screen !== 'alerts') {
    h += `<button class="alert-strip" data-a="go" data-to="alerts">${ic('shield-alert')}<span>${esc(t('alertStrip', { t: L(SIM_ALERT.title) }))}</span>${ic('chevron-right')}</button>`;
  }
  if (UI.speaking) h += `<div class="speaking-bar" role="status"><span class="wave" aria-hidden="true"><i></i><i style="animation-delay:.15s"></i><i style="animation-delay:.3s"></i></span><span>${t('speaking')}</span><button data-a="stopSpeak">${ic('square')}${t('stop')}</button></div>`;
  $('#sysbar').innerHTML = h;
  icons();
}
const PANEL = [['splash', 'Splash & welcome'], ['language', 'Language selection'], ['register', 'Registration & privacy'], ['home', 'Home dashboard'], ['assistant', 'AI voice assistant'], ['schemes', 'Schemes directory'], ['match', 'Schemes for me'], ['detail', 'Scheme details'], ['health', 'Healthcare'], ['alerts', 'Disaster alerts'], ['notifications', 'Notifications'], ['profile', 'Profile & settings']];
function renderPanel() {
  const ol = $('#ppScreens');
  if (!ol) return;
  if (!ol.childElementCount) {
    $('#ppLogo').innerHTML = logoSVG();
    ol.innerHTML = PANEL.map(([s, l]) => `<li><button data-a="jump" data-to="${s}">${l}</button></li>`).join('');
    $('#ppToggles').innerHTML = `<label>Active alert (simulated) ${sw('pp-alert', state.simAlert, 'simAlert')}</label>
      <label>Offline mode ${sw('pp-off', state.offline, 'offline')}</label>
      <label>Larger text ${sw('pp-text', state.textScale > 1, 'ppText')}</label>
      <button class="pp-reset" data-a="resetDemo">Reset demo data</button>`;
  }
  $$('#ppScreens button').forEach(b => b.setAttribute('aria-current', String(b.dataset.to === state.screen)));
  $('#pp-alert').checked = state.simAlert;
  $('#pp-off').checked = state.offline;
  $('#pp-text').checked = state.textScale > 1;
}

function render() {
  fbUsed = false;
  const fn = SCREENS[state.screen] || SCREENS.home;
  let html = fn();
  if (fbUsed && state.lang !== 'en') html = `<div class="tr-note">${ic('languages')}<span>${S.trPending[isHi() ? 1 : 0]}</span></div>` + html;
  $('#screen').innerHTML = html;
  const l = curLang();
  const app = $('#app');
  app.lang = l.bcp.split('-')[0];
  app.dir = l.rtl ? 'rtl' : 'ltr';
  document.documentElement.style.fontSize = (16 * state.textScale) + 'px';
  renderNav(); renderSysbar(); renderPanel();
  icons();
  const ta = $('#chatInput');
  if (ta) autoGrow(ta);
  save();
}

/* ---------- Actions ---------- */
function rerenderKeepScroll() { const s = $('#screen'); const y = s.scrollTop; render(); s.scrollTop = y; }
const ACT = {
  go: el => go(el.dataset.to),
  tab: el => tab(el.dataset.to),
  back: () => back(),
  jump: el => {
    closeSheet();
    const to = el.dataset.to;
    if (to === 'register') UI.editing = !!state.profile;
    if (to === 'register' && state.profile) state.form = JSON.parse(JSON.stringify(state.profile));
    UI.hist = TAB_OF[to] && to !== 'home' ? ['home'] : [];
    if (['language', 'register'].includes(to) && state.langChosen) UI.hist = ['home'];
    state.screen = to; stopRec(false); render(); $('#screen').scrollTop = 0;
  },
  closeSheet: () => closeSheet(),
  toast: el => toast(t(el.dataset.k)),

  pickLang: el => {
    const l = curLang(el.dataset.code);
    if (!l.ready) {
      UI.pendingLang = null;
      openSheet(`${sheetHead(t('langLimitTitle', { lang: l.eng }))}<div class="stack"><p>${t('langLimitBody', { lang: l.eng })}</p>
        <button class="btn btn-primary btn-block" data-a="langFallback" data-code="${l.code}">${t('useEnglish')}</button>
        <button class="btn btn-ghost btn-block" data-a="closeSheet">${t('pickAnother')}</button></div>`);
      return;
    }
    UI.pendingLang = l.code; state.prefLang = l.code; state.lang = l.code;
    rerenderKeepScroll();
  },
  langFallback: el => { state.prefLang = el.dataset.code; state.lang = 'en'; UI.pendingLang = el.dataset.code; closeSheet(); rerenderKeepScroll(); },
  sample: el => { const l = curLang(el.dataset.code); speak(l.greet, l.bcp); },
  langContinue: () => {
    state.langChosen = true; UI.pendingLang = null;
    if (UI.hist.length && UI.hist[UI.hist.length - 1] !== 'splash') { back(); return; }
    UI.hist = ['language'];
    state.screen = state.profile ? 'home' : 'register';
    if (state.profile) UI.hist = [];
    render(); $('#screen').scrollTop = 0;
  },

  sampleFill: () => {
    Object.assign(state.form, { name: 'Ramesh Kumar', mobile: '9876543210', state: 'Uttar Pradesh', district: 'Barabanki', village: 'Haidergarh', age: '36_59', occ: 'farmer' });
    if (state.profile && state.profile.mobile === '9876543210') state.form.verified = true;
    UI.errors = {}; rerenderKeepScroll();
  },
  setForm: el => { state.form[el.dataset.k] = state.form[el.dataset.k] === el.dataset.v && el.dataset.k === 'occ' ? '' : el.dataset.v; delete UI.errors[el.dataset.k]; rerenderKeepScroll(); },
  toggleA11y: el => {
    const k = el.dataset.k, a = state.form.a11y;
    const i = a.indexOf(k);
    if (i >= 0) a.splice(i, 1); else a.push(k);
    if (k === 'text') state.textScale = a.includes('text') ? 1.15 : 1;
    if (k === 'voice') state.autoRead = a.includes('voice');
    rerenderKeepScroll();
  },
  pickState: () => { UI.pickerFor = 'form'; pickerSheet('state'); },
  pickDistrict: () => { UI.pickerFor = 'form'; pickerSheet('district'); },
  areaPick: el => { UI.pickerFor = 'area'; pickerSheet(el.dataset.kind); },
  pickItem: el => {
    const kind = el.dataset.kind, v = el.dataset.v;
    const target = UI.pickerFor === 'area' ? state.answers : state.form;
    if (kind === 'state' && target.state !== v) target.district = '';
    target[kind] = v;
    delete UI.errors[kind];
    closeSheet();
    if (UI.pickerFor === 'area') { save(); areaSheet(); } else rerenderKeepScroll();
  },
  setArea: () => { if (state.profile) { ACT.editProfile(); } else areaSheet(); },
  areaDone: () => {
    const inp = $('#areaDistrict');
    if (inp) state.answers.district = inp.value.trim();
    save(); closeSheet(); rerenderKeepScroll();
  },
  areaDemo: () => { state.answers.state = 'Uttar Pradesh'; state.answers.district = 'Barabanki'; save(); closeSheet(); rerenderKeepScroll(); },
  useLocation: () => {
    openSheet(`${sheetHead(t('locTitle'))}<div class="stack"><div class="row"><span class="ico ico-blue">${ic('locate-fixed')}</span><p class="grow">${t('locBody')}</p></div>
      <button class="btn btn-primary btn-block" data-a="locAllow">${t('locAllow')}</button><button class="btn btn-ghost btn-block" data-a="closeSheet">${t('cancel')}</button></div>`);
  },
  locAllow: () => { closeSheet(); toast(t('locDemo')); setTimeout(() => $('#f-village')?.focus(), 50); },
  changeMobile: () => { state.form.verified = false; rerenderKeepScroll(); setTimeout(() => $('#f-mobile')?.focus(), 30); },
  sendOtp: () => {
    if (!/^[6-9]\d{9}$/.test(state.form.mobile)) { UI.errors.mobile = t('err_mobile'); rerenderKeepScroll(); $('#f-mobile')?.focus(); return; }
    delete UI.errors.mobile;
    otpSheet();
  },
  otpVerify: () => {
    const boxes = $$('#otpBoxes input');
    const code = boxes.map(b => b.value).join('');
    if (code.length < 6) { otpError(t('otpIncomplete')); boxes.find(b => !b.value)?.focus(); return; }
    if (code === '000000') { otpError(t('otpWrong')); boxes.forEach(b => { b.value = ''; }); boxes[0].focus(); return; }
    boxes.forEach(b => { b.value = ''; });
    state.form.verified = true; delete UI.errors.mobile;
    closeSheet(); rerenderKeepScroll(); toast(t('otpOk'));
  },
  otpResend: () => { otpError(''); $$('#otpBoxes input').forEach(b => { b.value = ''; }); startOtpTimer(); toast(t('otpResent')); },
  submitReg: () => {
    const f = state.form, e = {};
    if (f.name.trim().length < 2) e.name = t('err_name');
    if (!/^[6-9]\d{9}$/.test(f.mobile)) e.mobile = t('err_mobile'); else if (!f.verified) e.mobile = t('err_verify');
    if (!f.state) e.state = t('err_state');
    if (!f.district.trim()) e.district = t('err_district');
    const v = f.village.trim();
    if (v && /^\d+$/.test(v) && !/^\d{6}$/.test(v)) e.village = t('err_pin');
    if (!f.age) e.age = t('err_age');
    if (!state.consent.essential) e.consent = t('err_consent');
    UI.errors = e;
    if (Object.keys(e).length) {
      rerenderKeepScroll(); toast(t('fixErrors'));
      const firstKey = ['name', 'mobile', 'state', 'district', 'village', 'age', 'consent'].find(k => e[k]);
      const target = firstKey === 'consent' ? $('#err-consent') : $('#f-' + firstKey);
      target?.scrollIntoView({ block: 'center' });
      if (target && target.focus) target.focus({ preventScroll: true });
      return;
    }
    const wasEditing = UI.editing && state.profile;
    state.profile = JSON.parse(JSON.stringify(f));
    state.profile.name = f.name.trim();
    state.langChosen = true; UI.editing = false;
    if (wasEditing) { toast(t('saved')); back(); return; }
    UI.hist = []; state.screen = 'home'; render(); $('#screen').scrollTop = 0;
    toast(t('welcomeDone', { name: state.profile.name.split(/\s+/)[0] }));
  },
  skipReg: () => { state.langChosen = true; UI.errors = {}; tab('home'); },
  editProfile: () => { state.form = JSON.parse(JSON.stringify(state.profile)); UI.editing = true; UI.errors = {}; go('register'); },

  micFromHome: () => { go('assistant'); micTap(); },
  typeFromHome: () => { go('assistant'); setTimeout(() => $('#chatInput')?.focus(), 30); },
  mic: () => micTap(),
  micAllow: () => { state.mic = 'granted'; save(); closeSheet(); startRec(); },
  micDeny: () => { state.mic = 'denied'; save(); closeSheet(); toast(t('micDenied')); setTimeout(() => $('#chatInput')?.focus(), 30); },
  send: () => sendChat($('#chatInput')?.value || '', UI.heard),
  ask: el => sendChat(el.dataset.q),
  newChat: () => { UI.chat = []; UI.ctx = null; UI.draft = ''; UI.heard = false; stopSpeak(); render(); },
  chip: el => {
    const m = UI.chat[+el.dataset.i];
    const c = m && m.chips[+el.dataset.j];
    if (!c) return;
    m.chips = [];
    if (c.go) { renderChat(); goTarget(c.go); return; }
    if (c.q) { sendChat(c.q); return; }
    if (c.run) botTurn(c.label, c.run);
  },
  say: el => { const m = UI.chat[+el.dataset.i]; if (m) speak(m.say); },
  stopSpeak: () => stopSpeak(),
  askScheme: el => {
    const s = byId(el.dataset.id);
    UI.ctx = s.id;
    sendChat(tr(`Tell me about ${L(s.name)}`, `${L(s.name)} के बारे में बताओ`));
  },
  helpAsk: () => { closeSheet(); tab('assistant'); },

  scheme: el => { state.detailId = el.dataset.id; go('detail'); },
  checkElig: el => { UI.matchFocus = el.dataset.id; go('match'); setTimeout(() => { const c = $('#m-' + el.dataset.id); if (c) $('#screen').scrollTop = c.offsetTop - 70; }, 30); },
  exSearch: el => { state.schemeQ = el.dataset.q; const i = $('#schemeSearch'); if (i) i.value = state.schemeQ; refreshSchemeList(); },
  setLvl: el => { state.schemeLvl = el.dataset.v; rerenderKeepScroll(); },
  setCat: el => { state.schemeCat = state.schemeCat === el.dataset.v ? null : el.dataset.v; rerenderKeepScroll(); },
  clearFilters: () => { state.schemeQ = ''; state.schemeCat = null; state.schemeLvl = 'all'; rerenderKeepScroll(); },
  askFromSearch: () => sendChat(state.schemeQ || SUGGEST[isHi() ? 'hi' : 'en'][0]),
  quiz: () => startQuiz(false),
  quizAll: () => startQuiz(true),
  qAns: el => { const q = UI.qList[UI.qi]; if (el.dataset.v) setAns(q.k, el.dataset.v); UI.qi++; quizSheet(); rerenderKeepScroll(); },
  qBack: () => { UI.qi = Math.max(0, UI.qi - 1); quizSheet(); },
  toggleNoMatch: () => { UI.showNoMatch = !UI.showNoMatch; rerenderKeepScroll(); },

  acc: el => {
    const s = state.detailId, i = +el.dataset.i;
    const open = UI.open[s];
    const k = open.indexOf(i);
    if (k >= 0) open.splice(k, 1); else open.push(i);
    const box = el.parentElement;
    box.dataset.open = String(k < 0);
    el.setAttribute('aria-expanded', String(k < 0));
  },
  accAll: () => { const s = state.detailId; UI.open[s] = UI.open[s].length === 13 ? [] : [...Array(13).keys()]; rerenderKeepScroll(); },
  simple: () => { UI.showSimple[state.detailId] = !UI.showSimple[state.detailId]; rerenderKeepScroll(); },
  saySimple: () => speak(L(byId(state.detailId).detail.simple)),
  listenPage: () => {
    const s = byId(state.detailId), d = s.detail;
    speak([L(s.name), L(d.overview), t('d_benefits') + ': ' + L(d.benefits).join('. '), t('d_who') + ': ' + L(d.who).join('. '), t('d_steps') + ': ' + L(d.steps).join('. ')].join('. '));
  },
  copy: el => copyText(el.dataset.text),
  ext: el => extSheet(el.dataset.url, el.dataset.name),
  extGo: () => setTimeout(closeSheet, 100),

  healthTab: el => { state.healthTab = el.dataset.tab; go('health'); },
  setHTab: el => { state.healthTab = el.dataset.v; rerenderKeepScroll(); },
  remind: el => {
    if (!state.consent.notif) { toast(t('nOffConsent')); return; }
    const id = el.dataset.id, i = state.reminders.indexOf(id);
    if (i >= 0) state.reminders.splice(i, 1); else { state.reminders.push(id); toast(t('c_reminded')); }
    rerenderKeepScroll();
  },
  sayCamp: el => { const c = (CAMPS[getP().district] || []).find(x => x.id === el.dataset.id); if (c) speak(`${L(c.name)}. ${fmtDate(c.when)}, ${c.until}. ${L(c.venue)}. ${L(c.services)}.`); },

  sayAlert: () => { const a = SIM_ALERT; speak(`${L(a.title)}. ${L(a.severity)}. ${L(a.authority)}. ${L(a.instr).join('. ')}`); },
  sayInstr: () => { if (state.simAlert) speak(L(SIM_ALERT.instr).join('. ')); else speak(t('noAlerts')); },
  hearAlerts: () => { if (state.simAlert) ACT.sayAlert(); else speak(t('noAlerts')); },
  dismissAlert: () => { state.alertDismissed = true; rerenderKeepScroll(); },
  safeLoc: () => openSheet(`${sheetHead(t('safeLoc'))}<div class="stack"><div class="row"><span class="ico ico-blue">${ic('map-pinned')}</span><p class="grow">${t('safeLocNA')}</p></div><a class="btn btn-danger btn-block" href="tel:112">${ic('phone-call')}112</a><button class="btn btn-ghost btn-block" data-a="closeSheet">${t('close')}</button></div>`),
  shareAlert: () => {
    if (!state.simAlert) { copyText(`${t('noAlerts')} — JanSahayak AI, ${fmtDate(new Date())} ${fmtTime(new Date())}`, t('shareNote')); return; }
    const a = SIM_ALERT;
    copyText(`[${t('simAlertBadge')}]\n${L(a.title)} — ${L(a.severity)}\n${t('issuedBy')}: ${L(a.authority)}\n${t('issuedAt')}: ${fmtDate(a.issued)} ${fmtTime(a.issued)}\n${L(a.instr).map((x, i) => `${i + 1}. ${x}`).join('\n')}\n${t('source')}: ${a.link}`, t('shareNote'));
  },

  notifGo: el => {
    const n = NOTIFS.find(x => x.id === el.dataset.id);
    if (!state.read.includes(n.id)) state.read.push(n.id);
    goTarget(n.to.startsWith('health') && !n.to.includes(':') ? 'health' : n.to);
  },
  setNF: el => { state.notifFilter = el.dataset.v; rerenderKeepScroll(); },
  markAll: () => { state.read = NOTIFS.map(n => n.id); rerenderKeepScroll(); },
  notifSettings: () => notifSettingsSheet(),

  goLang: () => go('language'),
  voiceSheet: () => voiceSheet(),
  testVoice: () => speak(isHi() ? curLang('hi').greet : curLang().greet || curLang('en').greet, isHi() ? 'hi-IN' : curLang().bcp),
  textSheet: () => textSheet(),
  setSize: el => { state.textScale = +el.dataset.v; render(); textSheet(); },
  privacySheet: () => privacySheet(),
  helpSheet: () => helpSheet(),
  aboutSheet: () => aboutSheet(),
  signOut: () => confirmSheet(t('outTitle'), t('outBody'), t('mOut'), 'doSignOut', false),
  doSignOut: () => { state.profile = null; state.form = defaults().form; closeSheet(); tab('home'); toast(t('signedOut')); },
  deleteAcc: () => confirmSheet(t('delTitle'), t('delBody'), t('delBtn'), 'doDelete', true, `<div class="field"><label for="delConfirm">${t('delType')}</label><div class="input-wrap"><input id="delConfirm" autocomplete="off"></div></div>`),
  doDelete: () => {
    if (($('#delConfirm')?.value || '').trim().toUpperCase() !== 'DELETE') { $('#delConfirm')?.focus(); $('#delConfirm')?.parentElement.classList.add('invalid'); return; }
    const keep = { lang: state.lang, prefLang: state.prefLang };
    state = Object.assign(defaults(), keep, { langChosen: true });
    UI.chat = []; closeSheet(); tab('home'); toast(t('deleted'));
  },
  resetDemo: () => {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    state = defaults(); Object.assign(UI, { hist: [], chat: [], ctx: null, errors: {}, draft: '', heard: false, open: {}, showSimple: {} });
    closeSheet(); stopSpeak(); render(); $('#screen').scrollTop = 0;
  },
};

function refreshSchemeList() {
  const box = $('#schemeList');
  if (box) { box.innerHTML = schemeListHTML(); icons(); }
  save();
}

const CHG = {
  noop: () => {},
  simAlert: el => { state.simAlert = el.checked; state.alertDismissed = false; rerenderKeepScroll(); },
  offline: el => { state.offline = el.checked; rerenderKeepScroll(); },
  ppText: el => { state.textScale = el.checked ? 1.15 : 1; rerenderKeepScroll(); },
  consent: el => {
    const k = el.dataset.k;
    state.consent[k] = el.checked;
    if (k === 'personal' && !el.checked) { state.answers = {}; toast(t('pv_cleared')); }
    if (k === 'essential') delete UI.errors.consent;
    save();
    if ($('#layer .sheet')) { const y = $('#screen').scrollTop; render(); $('#screen').scrollTop = y; } else rerenderKeepScroll();
  },
  notifPref: el => { state.notifPrefs[el.dataset.k] = el.checked; save(); },
  alertLang: el => { state.alertLang = el.value; save(); },
  autoRead: el => { state.autoRead = el.checked; save(); },
  micPerm: el => { state.mic = el.checked ? 'granted' : 'denied'; save(); voiceSheet(); },
  rate: el => { state.ttsRate = +el.value; const r = $('#rateVal'); if (r) r.textContent = state.ttsRate.toFixed(2) + '×'; save(); },
  docTick: el => {
    const id = el.dataset.id, i = +el.dataset.i;
    const arr = state.docs[id] || (state.docs[id] = []);
    const k = arr.indexOf(i);
    if (el.checked && k < 0) arr.push(i); else if (!el.checked && k >= 0) arr.splice(k, 1);
    const docs = L(byId(id).detail.documents);
    const c = $('#docCount'); if (c) c.textContent = t('d_haveN', { a: arr.length, b: docs.length });
    save();
  },
};

/* ---------- Event wiring ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.a];
  if (!fn) return;
  if (el.dataset.a !== 'extGo') e.preventDefault();
  fn(el, e);
});
document.addEventListener('change', e => {
  const c = e.target.dataset && e.target.dataset.c;
  if (c && CHG[c]) CHG[c](e.target);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.f) {
    let v = el.value;
    if (el.dataset.f === 'mobile') { v = v.replace(/\D/g, '').slice(0, 10); el.value = v; state.form.verified = false; }
    state.form[el.dataset.f] = v;
    if (UI.errors[el.dataset.f]) { delete UI.errors[el.dataset.f]; const er = $('#err-' + el.dataset.f); if (er) er.innerHTML = ''; el.closest('.input-wrap')?.classList.remove('invalid'); }
    save();
    return;
  }
  if (el.dataset.c === 'rate') { CHG.rate(el); return; }
  if (el.id === 'langSearch') { UI.langQ = el.value; $('#langList').innerHTML = langListHTML(); icons(); return; }
  if (el.id === 'schemeSearch') { state.schemeQ = el.value; refreshSchemeList(); return; }
  if (el.id === 'chatInput') { UI.draft = el.value; autoGrow(el); const b = $('#sendBtn'); if (b) b.disabled = !el.value.trim(); return; }
  if (el.id === 'pickSearch') { const q = el.value.trim().toLowerCase(); $$('#pickList button').forEach(b => { b.hidden = q && !b.dataset.name.includes(q); }); return; }
  if (el.closest && el.closest('#otpBoxes')) {
    const boxes = $$('#otpBoxes input');
    const digits = el.value.replace(/\D/g, '');
    if (digits.length > 1) {
      const start = boxes.indexOf(el);
      digits.split('').slice(0, 6 - start).forEach((d, k) => { boxes[start + k].value = d; });
      boxes[Math.min(5, start + digits.length)].focus();
    } else {
      el.value = digits;
      if (digits) boxes[boxes.indexOf(el) + 1]?.focus();
    }
    otpError('');
  }
});
document.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key === 'Escape' && $('#layer .sheet')) { closeSheet(); return; }
  if (el.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(el.value, UI.heard); return; }
  if (el.closest && el.closest('#otpBoxes')) {
    const boxes = $$('#otpBoxes input');
    const i = boxes.indexOf(el);
    if (e.key === 'Backspace' && !el.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; e.preventDefault(); }
    if (e.key === 'Enter') ACT.otpVerify();
  }
  if (el.id === 'delConfirm' && e.key === 'Enter') ACT.doDelete();
});
document.addEventListener('paste', e => {
  const el = e.target;
  if (!el.closest || !el.closest('#otpBoxes')) return;
  const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
  if (!digits) return;
  e.preventDefault();
  const boxes = $$('#otpBoxes input');
  digits.split('').forEach((d, k) => { if (boxes[k]) boxes[k].value = d; });
  boxes[Math.min(5, digits.length)].focus();
});
$('#screen').addEventListener('scroll', () => { const tb = $('.topbar'); if (tb) tb.classList.toggle('scrolled', $('#screen').scrollTop > 4); }, { passive: true });
window.addEventListener('online', () => renderSysbar());
window.addEventListener('offline', () => renderSysbar());

render();
