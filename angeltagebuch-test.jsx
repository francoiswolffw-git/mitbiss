import { useState, useEffect, useCallback, useRef } from "react";

// ─── STORAGE (persistent via window.storage) ────────────────────────────────
const STORAGE_KEY = "angeltagebuch-eintraege";
const SETTINGS_KEY = "angeltagebuch-settings";

async function loadEntries() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : [];
  } catch { return []; }
}
async function saveEntries(entries) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(entries)); } catch {}
}
async function loadSettings() {
  try {
    const r = await window.storage.get(SETTINGS_KEY);
    return r ? JSON.parse(r.value) : {};
  } catch { return {}; }
}
async function saveSettings(s) {
  try { await window.storage.set(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

const MONATE = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
function fmtDatum(d) {
  if (!d) return "–";
  const [y,m,day] = d.split("-");
  return `${parseInt(day)}. ${MONATE[parseInt(m)-1]} ${y}`;
}
const WETTER_EMOJI = { sonnig:"☀️", bewölkt:"⛅", wechselhaft:"🌤️", regnerisch:"🌧️", nebelig:"🌫️", stürmisch:"⛈️" };
const WIND_LABEL = { windstill:"Windstill", schwach:"Schwach", mittel:"Mäßig", stark:"Stark", stürmisch:"Stürmisch" };

function sterne(n, total=5) {
  return "★".repeat(n||0) + "☆".repeat(total-(n||0));
}

function compressImage(file, maxW=1200, quality=0.82) {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let {width:w, height:h} = img;
        if (w > maxW) { h = (h*maxW)/w; w = maxW; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        res(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function emptyEntry() {
  const now = new Date();
  return {
    datum: now.toISOString().split("T")[0],
    uhrzeit: now.toTimeString().slice(0,5),
    gewässer:"", spot:"", wetter:"sonnig", temperatur:"", wind:"schwach",
    köder:"", zielfisch:"", gefangene_fischart:"", anzahl:"", größe:"", gewicht:"",
    begleitperson:"", notizen:"", fotos:[], tagesbewertung:3, gps_text:"", syncStatus:"lokal"
  };
}

function exportCSV(entries) {
  if(!entries.length) return;
  const headers = ["id","datum","uhrzeit","gewässer","spot","wetter","temperatur","wind","köder","zielfisch","gefangene_fischart","anzahl","größe","gewicht","begleitperson","tagesbewertung","gps_text","notizen","syncStatus"];
  const rows = entries.map(e => headers.map(h => `"${(e[h]??'').toString().replace(/"/g,'""')}"`).join(","));
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=`angeltagebuch-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}
function exportJSON(entries) {
  const blob = new Blob([JSON.stringify({exportDatum:new Date().toISOString(), eintraege: entries.map(e=>({...e,fotos:`[${e.fotos?.length||0} Foto(s)]`}))},null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`angeltagebuch-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
}

// ─── FISCH / KÖDER LISTS ───────────────────────────────────────────────────
const FISCHE = ["Hecht","Zander","Barsch","Aal","Karpfen","Schleie","Brassen","Rotauge","Forelle","Lachs","Wels","Döbel"];
const KÖDER  = ["Wobbler","Spinner","Gummifisch","Naturköder","Mais","Boilies","Tauwurm","Brot","Fliege","Pilker","Blinker"];

// ─── STYLES ─────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,700;1,500&family=DM+Sans:wght@400;500;600&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#003878;--navy-dark:#001e3c;--navy-mid:#004fa3;--navy-light:#e8f0fb;
  --gold:#c8922a;--gold-light:#fdf3e3;
  --white:#fff;--surface:#f2f5f9;--border:#dde3ec;
  --text:#1a2332;--muted:#5a6a7e;--light:#9aabb8;
  --success:#1a7a4a;--danger:#c0392b;--warn:#b45309;
  --shadow-sm:0 1px 3px rgba(0,30,60,.09),0 1px 2px rgba(0,30,60,.05);
  --shadow-md:0 4px 14px rgba(0,30,60,.13),0 2px 4px rgba(0,30,60,.06);
  --shadow-lg:0 10px 32px rgba(0,30,60,.18),0 4px 8px rgba(0,30,60,.08);
  --r-sm:6px;--r-md:12px;--r-lg:16px;--r-xl:22px;--r-full:9999px;
  --font-display:'Lora',Georgia,serif;
  --font:'DM Sans',system-ui,sans-serif;
  --nav:64px;
}
html,body,#root{height:100%;font-family:var(--font);background:var(--surface);color:var(--text)}
body{overflow-x:hidden}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}

/* ── LAYOUT ── */
.app{display:flex;flex-direction:column;height:100%;max-width:480px;margin:0 auto;position:relative;background:var(--white);box-shadow:0 0 40px rgba(0,30,60,.12)}
.page{flex:1;overflow-y:auto;padding-bottom:calc(var(--nav) + 16px)}
.page-inner{padding:0 16px 16px}

/* ── HEADER ── */
.hdr{background:var(--navy-dark);color:#fff;display:flex;align-items:center;gap:12px;padding:0 16px;height:56px;flex-shrink:0;position:sticky;top:0;z-index:50}
.hdr-logo{font-family:var(--font-display);font-size:1.2rem;font-weight:700;color:#fff;flex:1;display:flex;align-items:center;gap:8px}
.hdr-logo span{color:var(--gold)}
.hdr-back{background:none;border:none;color:rgba(255,255,255,.8);cursor:pointer;font-size:.85rem;display:flex;align-items:center;gap:4px;padding:6px 4px;border-radius:6px}
.hdr-back:hover{color:#fff}
.hdr-title{flex:1;font-size:1rem;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hdr-action{background:none;border:1px solid rgba(255,255,255,.3);color:#fff;cursor:pointer;font-size:.8rem;font-weight:600;padding:5px 12px;border-radius:var(--r-full);font-family:var(--font);white-space:nowrap}
.hdr-action:hover{background:rgba(255,255,255,.1)}

/* ── BOTTOM NAV ── */
.bnav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;height:var(--nav);background:var(--navy-dark);display:flex;align-items:center;justify-content:space-around;border-top:1px solid rgba(255,255,255,.07);z-index:50}
.bnav-item{display:flex;flex-direction:column;align-items:center;gap:2px;color:rgba(255,255,255,.45);cursor:pointer;padding:8px 20px;border-radius:var(--r-md);transition:color .15s;font-size:.72rem;font-weight:500;border:none;background:none;font-family:var(--font)}
.bnav-item:hover,.bnav-item.active{color:#fff}
.bnav-item.active .bnav-icon{color:var(--gold)}
.bnav-icon{font-size:22px;line-height:1}

/* ── LOCAL BANNER ── */
.local-bar{background:rgba(0,30,60,.95);color:rgba(255,255,255,.6);font-size:.72rem;display:flex;align-items:center;gap:8px;padding:5px 16px;flex-shrink:0}
.local-dot{width:6px;height:6px;background:var(--gold);border-radius:50%;animation:pulse 2s infinite;flex-shrink:0}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}

/* ── HERO ── */
.hero{position:relative;min-height:180px;display:flex;align-items:flex-end;overflow:hidden;flex-shrink:0;background:linear-gradient(135deg,var(--navy-dark) 0%,var(--navy) 100%)}
.hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.4}
.hero-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,20,50,.88) 0%,rgba(0,30,70,.25) 100%)}
.hero-content{position:relative;z-index:1;padding:20px 18px;width:100%}
.hero-title{font-family:var(--font-display);font-size:1.55rem;font-weight:700;color:#fff;line-height:1.2;margin-bottom:4px}
.hero-sub{font-size:.82rem;color:rgba(255,255,255,.65)}

/* ── FILTER BAR ── */
.filter-bar{padding:12px 16px;background:var(--white);border-bottom:1px solid var(--border);flex-shrink:0}
.search-wrap{position:relative;margin-bottom:8px}
.search-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none;font-size:16px}
.search-input{width:100%;padding:10px 12px 10px 36px;border:1.5px solid var(--border);border-radius:var(--r-full);font-size:.9rem;font-family:var(--font);color:var(--text);background:var(--surface)}
.search-input:focus{outline:none;border-color:var(--navy);box-shadow:0 0 0 3px rgba(0,56,120,.1)}
.filter-toggle{background:none;border:none;color:var(--muted);font-size:.78rem;font-weight:600;cursor:pointer;padding:2px 0;font-family:var(--font)}
.filter-toggle:hover{color:var(--navy)}
.filter-row{display:flex;gap:8px;margin-top:8px}
.filter-sel{flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.82rem;font-family:var(--font);color:var(--text);background:var(--white)}
.filter-sel:focus{outline:none;border-color:var(--navy)}
.filter-clear{background:none;border:none;color:var(--danger);font-size:.78rem;font-weight:600;cursor:pointer;padding:0 4px;font-family:var(--font)}

/* ── ENTRY CARDS ── */
.entries{padding:12px 12px 0;display:flex;flex-direction:column;gap:12px}
.ecard{background:var(--white);border-radius:var(--r-lg);box-shadow:var(--shadow-sm);overflow:hidden;cursor:pointer;transition:box-shadow .2s,transform .15s;border:1px solid var(--border)}
.ecard:hover{box-shadow:var(--shadow-md);transform:translateY(-1px)}
.ecard:active{transform:scale(.985)}
.ecard-cover{height:130px;background:var(--navy-dark);position:relative;overflow:hidden;flex-shrink:0}
.ecard-cover img{width:100%;height:100%;object-fit:cover;opacity:.82}
.ecard-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:44px;background:linear-gradient(135deg,var(--navy-dark) 0%,var(--navy) 100%)}
.ecard-cover-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,20,50,.72) 0%,transparent 55%)}
.ecard-cover-meta{position:absolute;bottom:8px;left:12px;right:12px;display:flex;align-items:flex-end;justify-content:space-between}
.ecard-date{color:#fff;font-size:.78rem;font-weight:600}
.ecard-stars{color:var(--gold);font-size:.78rem}
.ecard-body{padding:11px 14px 13px}
.ecard-title{font-family:var(--font-display);font-size:1.02rem;font-weight:700;color:var(--text);margin-bottom:2px}
.ecard-sub{font-size:.78rem;color:var(--muted);margin-bottom:7px}
.tags{display:flex;flex-wrap:wrap;gap:4px}
.tag{font-size:.7rem;font-weight:600;padding:2px 8px;border-radius:var(--r-full);background:var(--navy-light);color:var(--navy)}
.tag-fish{background:#e8f8f0;color:var(--success)}
.tag-weather{background:#fff8e1;color:var(--warn)}

/* ── EMPTY STATE ── */
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;text-align:center;gap:14px}
.empty-icon{font-size:60px;opacity:.45}
.empty-title{font-family:var(--font-display);font-size:1.3rem;font-weight:700}
.empty-text{color:var(--muted);font-size:.9rem;max-width:260px;line-height:1.6}

/* ── FAB ── */
.fab{position:fixed;bottom:calc(var(--nav) + 14px);right:calc(50% - 240px + 16px);max-right:16px;width:52px;height:52px;background:var(--gold);color:#fff;border:none;border-radius:50%;font-size:26px;cursor:pointer;box-shadow:0 6px 20px rgba(200,146,42,.45);display:flex;align-items:center;justify-content:center;z-index:40;transition:transform .15s,box-shadow .15s}
.fab:hover{transform:scale(1.07);box-shadow:0 8px 28px rgba(200,146,42,.55)}
.fab:active{transform:scale(.93)}

/* ── FORM ── */
.form-stack{display:flex;flex-direction:column;gap:14px;padding:14px 0 0}
.fsec{background:var(--white);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm);border:1px solid var(--border)}
.fsec-hdr{padding:11px 16px;background:var(--navy-light);font-size:.75rem;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.04em;display:flex;align-items:center;gap:6px}
.ffields{padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.fgroup{display:flex;flex-direction:column;gap:4px}
.flabel{font-size:.74rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.flabel-req::after{content:" *";color:var(--danger)}
.finput,.fselect,.ftextarea{width:100%;padding:11px 13px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.92rem;font-family:var(--font);color:var(--text);background:var(--white);-webkit-appearance:none;transition:border-color .15s,box-shadow .15s}
.finput:focus,.fselect:focus,.ftextarea:focus{outline:none;border-color:var(--navy);box-shadow:0 0 0 3px rgba(0,56,120,.1)}
.finput::placeholder,.ftextarea::placeholder{color:var(--light)}
.ftextarea{min-height:110px;resize:vertical;line-height:1.6}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.fgps-row{display:flex;gap:8px}
.fgps-row .finput{flex:1}
.fgps-btn{padding:8px 13px;border:1.5px solid var(--border);background:var(--surface);border-radius:var(--r-md);font-size:.82rem;font-weight:600;color:var(--navy);cursor:pointer;white-space:nowrap;font-family:var(--font)}
.fgps-btn:hover{background:var(--navy-light)}

/* ── STAR RATING ── */
.stars-row{display:flex;gap:2px}
.star-btn{font-size:28px;background:none;border:none;cursor:pointer;padding:2px;transition:transform .1s;line-height:1}
.star-btn:hover{transform:scale(1.2)}
.star-active{filter:none}
.star-inactive{filter:grayscale(1) opacity(.35)}

/* ── PHOTO UPLOAD ── */
.photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.photo-item{position:relative;aspect-ratio:1;border-radius:var(--r-md);overflow:hidden}
.photo-item img{width:100%;height:100%;object-fit:cover}
.photo-rm{position:absolute;top:4px;right:4px;width:22px;height:22px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.photo-rm:hover{background:var(--danger)}
.photo-add{aspect-ratio:1;border:2px dashed var(--border);border-radius:var(--r-md);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--muted);font-size:.7rem;cursor:pointer;transition:border-color .15s,background .15s;background:none}
.photo-add:hover{border-color:var(--navy);background:var(--navy-light);color:var(--navy)}
.photo-hint{font-size:.71rem;color:var(--muted);margin-top:4px}

/* ── SAVE BTN ── */
.save-btn{width:100%;padding:13px;background:var(--navy);color:#fff;border:none;border-radius:var(--r-lg);font-size:1rem;font-weight:700;cursor:pointer;font-family:var(--font);margin-top:6px;transition:background .15s,transform .1s}
.save-btn:hover{background:var(--navy-mid)}
.save-btn:active{transform:scale(.98)}
.save-btn:disabled{opacity:.6;cursor:default}
.save-hint{text-align:center;font-size:.72rem;color:var(--muted);margin-top:6px}

/* ── DETAIL ── */
.detail-hero{height:210px;background:var(--navy-dark);position:relative;overflow:hidden;flex-shrink:0}
.detail-hero img{width:100%;height:100%;object-fit:cover;opacity:.78;cursor:pointer}
.detail-hero-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:72px;background:linear-gradient(135deg,var(--navy-dark),var(--navy))}
.detail-hero-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,20,50,.82) 0%,transparent 50%)}
.detail-hero-meta{position:absolute;bottom:14px;left:16px;right:16px;color:#fff}
.detail-hero-title{font-family:var(--font-display);font-size:1.4rem;font-weight:700;line-height:1.2}
.detail-hero-date{font-size:.8rem;opacity:.78;margin-top:2px}
.detail-inner{padding:14px 14px 0;display:flex;flex-direction:column;gap:12px}
.detail-stars-row{display:flex;align-items:center;gap:10px}
.detail-stars{color:var(--gold);font-size:1.15rem;letter-spacing:2px}
.detail-stars-label{font-size:.78rem;color:var(--muted)}
.dgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ditem{background:var(--white);border:1px solid var(--border);border-radius:var(--r-md);padding:11px 13px;box-shadow:var(--shadow-sm)}
.ditem-full{grid-column:1/-1}
.ditem-catch{background:#e8f8f0;border-color:#b8e6cc}
.ditem-label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:2px}
.ditem-label-catch{color:var(--success)}
.ditem-val{font-size:.95rem;font-weight:600;color:var(--text)}
.ditem-val-lg{font-size:1.1rem}
.detail-notizen{background:var(--white);border:1px solid var(--border);border-radius:var(--r-md);padding:14px;white-space:pre-wrap;font-size:.92rem;line-height:1.7;box-shadow:var(--shadow-sm)}
.detail-sec-label{font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:6px}
.galerie{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px}
.galerie-item{aspect-ratio:1;border-radius:var(--r-md);overflow:hidden;cursor:pointer}
.galerie-item img{width:100%;height:100%;object-fit:cover;transition:transform .2s}
.galerie-item:hover img{transform:scale(1.05)}
.detail-meta{background:var(--surface);border-radius:var(--r-md);padding:11px 14px;font-size:.75rem;color:var(--muted);display:flex;flex-direction:column;gap:3px}
.sync-dot{display:inline-flex;align-items:center;gap:5px;font-weight:600}
.detail-actions{display:flex;gap:10px;padding-bottom:16px}
.btn-edit{flex:1;padding:12px;background:var(--white);color:var(--navy);border:1.5px solid var(--border);border-radius:var(--r-lg);font-weight:700;font-size:.9rem;cursor:pointer;font-family:var(--font)}
.btn-edit:hover{background:var(--navy-light)}
.btn-del{flex:1;padding:12px;background:var(--danger);color:#fff;border:none;border-radius:var(--r-lg);font-weight:700;font-size:.9rem;cursor:pointer;font-family:var(--font)}
.btn-del:hover{background:#a93226}

/* ── LIGHTBOX ── */
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
.lightbox img{max-width:100%;max-height:90vh;border-radius:var(--r-md);object-fit:contain}
.lightbox-close{position:absolute;top:14px;right:14px;background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:50%;width:38px;height:38px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}

/* ── CONFIRM DIALOG ── */
.backdrop{position:fixed;inset:0;background:rgba(0,20,50,.5);backdrop-filter:blur(4px);z-index:150;display:flex;align-items:flex-end;justify-content:center;padding:16px}
.dialog{background:#fff;border-radius:var(--r-xl) var(--r-xl) var(--r-md) var(--r-md);padding:28px 22px;width:100%;max-width:440px;display:flex;flex-direction:column;gap:12px;animation:slideup .18s ease}
@keyframes slideup{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.dialog-title{font-family:var(--font-display);font-size:1.2rem;font-weight:700}
.dialog-text{color:var(--muted);font-size:.9rem}
.dialog-actions{display:flex;gap:10px;margin-top:4px}
.dialog-actions button{flex:1;padding:12px;border-radius:var(--r-lg);font-weight:700;font-size:.9rem;cursor:pointer;font-family:var(--font);border:none}
.btn-cancel{background:var(--surface);color:var(--text)}
.btn-danger-confirm{background:var(--danger);color:#fff}

/* ── TOAST ── */
.toast-wrap{position:fixed;bottom:calc(var(--nav) + 16px);left:50%;transform:translateX(-50%);z-index:180;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none}
.toast{background:var(--text);color:#fff;padding:9px 22px;border-radius:var(--r-full);font-size:.82rem;font-weight:600;box-shadow:var(--shadow-lg);animation:slideup .2s ease;white-space:nowrap}
.toast-success{background:var(--success)}
.toast-error{background:var(--danger)}

/* ── SETTINGS ── */
.settings-hero{background:linear-gradient(135deg,var(--navy-dark),var(--navy));padding:22px 18px;color:#fff;flex-shrink:0}
.settings-hero-title{font-family:var(--font-display);font-size:1.5rem;font-weight:700;margin-bottom:4px}
.settings-hero-sub{font-size:.82rem;opacity:.68}
.stat-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 14px 0}
.stat-card{background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px;text-align:center;box-shadow:var(--shadow-sm)}
.stat-num{font-family:var(--font-display);font-size:2.2rem;font-weight:700;color:var(--navy)}
.stat-num-warn{color:var(--warn)}
.stat-label{font-size:.75rem;color:var(--muted);margin-top:2px}
.ssec{background:var(--white);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm);border:1px solid var(--border);margin:14px 14px 0}
.ssec-hdr{padding:10px 16px;background:var(--navy-light);font-size:.73rem;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.04em}
.sitem{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s}
.sitem:last-child{border-bottom:none}
.sitem:hover{background:var(--surface)}
.sitem-icon{font-size:20px;width:28px;text-align:center;flex-shrink:0}
.sitem-text{flex:1}
.sitem-label{font-weight:600;font-size:.9rem}
.sitem-desc{font-size:.75rem;color:var(--muted);margin-top:1px}
.sitem-arrow{color:var(--light);font-size:1.1rem}
.sitem-badge{font-size:.65rem;background:var(--navy-light);color:var(--navy);padding:2px 8px;border-radius:var(--r-full);font-weight:700;flex-shrink:0}
.cover-preview{width:100%;height:120px;object-fit:cover;display:block}
.app-info{padding:14px 14px 0;text-align:center;font-size:.76rem;color:var(--muted);line-height:1.7;padding-bottom:16px}
.app-info strong{color:var(--text);display:block;font-size:.85rem;margin-bottom:4px}

/* ── LOADING ── */
.loading{display:flex;align-items:center;justify-content:center;gap:10px;padding:40px;color:var(--muted)}
.spin{width:22px;height:22px;border:2px solid var(--border);border-top-color:var(--navy);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
`;

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function Toast({ toasts }) {
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast${t.type==="success"?" toast-success":t.type==="error"?" toast-error":""}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

function StarRating({ value, onChange, readOnly=false }) {
  return (
    <div className="stars-row">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button"
          className={`star-btn ${n<=value?"star-active":"star-inactive"}`}
          onClick={() => !readOnly && onChange(n)}
          disabled={readOnly}>
          {n<=value?"★":"☆"}
        </button>
      ))}
    </div>
  );
}

function PhotoUpload({ fotos, onChange }) {
  const ref = useRef();
  async function handleFiles(e) {
    const files = Array.from(e.target.files);
    const remaining = 8 - (fotos?.length||0);
    const compressed = await Promise.all(files.slice(0,remaining).map(f=>compressImage(f)));
    onChange([...(fotos||[]), ...compressed]);
    e.target.value="";
  }
  function remove(i) { onChange((fotos||[]).filter((_,idx)=>idx!==i)); }
  const canAdd = (fotos?.length||0) < 8;
  return (
    <div>
      <div className="photo-grid">
        {(fotos||[]).map((src,i) => (
          <div key={i} className="photo-item">
            <img src={src} alt={`Foto ${i+1}`}/>
            <button type="button" className="photo-rm" onClick={()=>remove(i)}>×</button>
          </div>
        ))}
        {canAdd && (
          <label className="photo-add">
            <span style={{fontSize:24}}>📷</span>
            <span>Hinzufügen</span>
            <input ref={ref} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles}/>
          </label>
        )}
      </div>
      {(fotos?.length||0)>0 && <div className="photo-hint">{fotos.length}/8 Fotos · lokal gespeichert</div>}
    </div>
  );
}

function ConfirmDialog({ title, text, onConfirm, onCancel }) {
  return (
    <div className="backdrop" onClick={onCancel}>
      <div className="dialog" onClick={e=>e.stopPropagation()}>
        <div className="dialog-title">{title}</div>
        {text && <div className="dialog-text">{text}</div>}
        <div className="dialog-actions">
          <button className="btn-cancel" onClick={onCancel}>Abbrechen</button>
          <button className="btn-danger-confirm" onClick={onConfirm}>Ja, löschen</button>
        </div>
      </div>
    </div>
  );
}

function EntryCard({ entry, onClick }) {
  const cover = entry.fotos?.[0];
  return (
    <div className="ecard" onClick={()=>onClick(entry.id)}>
      <div className="ecard-cover">
        {cover
          ? <><img src={cover} alt=""/><div className="ecard-cover-overlay"/></>
          : <div className="ecard-placeholder">🎣</div>
        }
        <div className="ecard-cover-meta">
          <span className="ecard-date">{fmtDatum(entry.datum)}</span>
          {entry.tagesbewertung>0 && <span className="ecard-stars">{"★".repeat(entry.tagesbewertung)}</span>}
        </div>
      </div>
      <div className="ecard-body">
        <div className="ecard-title">{entry.gewässer||"Unbekanntes Gewässer"}{entry.spot?` · ${entry.spot}`:""}</div>
        {entry.uhrzeit && <div className="ecard-sub">🕐 {entry.uhrzeit} Uhr{entry.begleitperson?` · mit ${entry.begleitperson}`:""}</div>}
        <div className="tags">
          {entry.wetter && <span className="tag tag-weather">{WETTER_EMOJI[entry.wetter]||"🌤️"} {entry.wetter}</span>}
          {entry.gefangene_fischart && <span className="tag tag-fish">🐟 {entry.gefangene_fischart}{entry.anzahl>0?` (${entry.anzahl}×)`:""}</span>}
          {(entry.fotos?.length||0)>0 && <span className="tag">📷 {entry.fotos.length}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── PAGES ───────────────────────────────────────────────────────────────────

function HomePage({ entries, settings, onNavigate, onNew }) {
  const [query, setQuery] = useState("");
  const [filterGewässer, setFilterGewässer] = useState("");
  const [filterVon, setFilterVon] = useState("");
  const [filterBis, setFilterBis] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  const gewässerList = [...new Set(entries.map(e=>e.gewässer).filter(Boolean))].sort();

  const filtered = entries.filter(e => {
    if (filterGewässer && e.gewässer !== filterGewässer) return false;
    if (filterVon && e.datum < filterVon) return false;
    if (filterBis && e.datum > filterBis) return false;
    if (query) {
      const q = query.toLowerCase();
      return [e.gewässer, e.spot, e.gefangene_fischart, e.notizen, e.begleitperson]
        .some(v => v?.toLowerCase().includes(q));
    }
    return true;
  });

  const hasFilter = query||filterGewässer||filterVon||filterBis;
  const reset = () => { setQuery(""); setFilterGewässer(""); setFilterVon(""); setFilterBis(""); };

  return (
    <>
      <div className="hero">
        {settings.coverBild && <img className="hero-bg" src={settings.coverBild} alt=""/>}
        <div className="hero-overlay"/>
        <div className="hero-content">
          <div className="hero-title">🎣 Mein Angeltagebuch</div>
          <div className="hero-sub">
            {entries.length>0 ? `${entries.length} Ausflug${entries.length!==1?"e":""} dokumentiert` : "Leg los mit deinem ersten Eintrag!"}
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input className="search-input" type="search" placeholder="Suche nach Gewässer, Fisch, Notizen…"
            value={query} onChange={e=>setQuery(e.target.value)}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button className="filter-toggle" onClick={()=>setShowFilter(f=>!f)}>
            {showFilter?"▲ Filter ausblenden":"▼ Filter einblenden"}
          </button>
          {hasFilter && <button className="filter-clear" onClick={reset}>✕ Reset</button>}
        </div>
        {showFilter && (
          <>
            <div className="filter-row">
              <select className="filter-sel" value={filterGewässer} onChange={e=>setFilterGewässer(e.target.value)}>
                <option value="">Alle Gewässer</option>
                {gewässerList.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="filter-row">
              <input type="date" className="filter-sel" value={filterVon} onChange={e=>setFilterVon(e.target.value)} placeholder="Von"/>
              <input type="date" className="filter-sel" value={filterBis} onChange={e=>setFilterBis(e.target.value)} placeholder="Bis"/>
            </div>
          </>
        )}
      </div>

      <div className="page" style={{overflowY:"auto"}}>
        {filtered.length===0 ? (
          <div className="empty">
            <div className="empty-icon">🎣</div>
            <div className="empty-title">{hasFilter?"Keine Treffer":"Noch nichts hier"}</div>
            <div className="empty-text">
              {hasFilter?"Andere Suchbegriffe oder Filter zurücksetzen.":"Tipp auf + und starte deinen ersten Eintrag."}
            </div>
            {hasFilter && <button className="btn-edit" style={{padding:"10px 20px",marginTop:4}} onClick={reset}>Filter zurücksetzen</button>}
          </div>
        ) : (
          <div className="entries">
            {filtered.map(e=><EntryCard key={e.id} entry={e} onClick={id=>onNavigate("detail",id)}/>)}
          </div>
        )}
      </div>

      <button className="fab" onClick={onNew}>+</button>
    </>
  );
}

function EntryFormPage({ entry: initial, onSave, onBack, mode="new", toast }) {
  const [form, setForm] = useState(initial || emptyEntry());
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(p=>({...p,[k]:v})); }

  function getGPS() {
    if (!navigator.geolocation) { toast("GPS nicht verfügbar","error"); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { set("gps_text",`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`); toast("Standort ermittelt ✓","success"); },
      () => toast("GPS konnte nicht ermittelt werden","error")
    );
  }

  async function handleSave() {
    if (!form.datum) { toast("Bitte ein Datum angeben","error"); return; }
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  }

  return (
    <>
      <header className="hdr">
        <button className="hdr-back" onClick={onBack}>← Zurück</button>
        <div className="hdr-title">{mode==="edit"?"Eintrag bearbeiten":"Neuer Eintrag"}</div>
        <button className="hdr-action" onClick={handleSave} disabled={saving}>
          {saving?"…":"💾 Speichern"}
        </button>
      </header>

      <div className="page" style={{overflowY:"auto"}}>
        <div className="page-inner">
          <div className="form-stack">

            {/* Datum & Ort */}
            <div className="fsec">
              <div className="fsec-hdr">📅 Datum & Ort</div>
              <div className="ffields">
                <div className="frow">
                  <div className="fgroup">
                    <label className="flabel flabel-req">Datum</label>
                    <input type="date" className="finput" value={form.datum} onChange={e=>set("datum",e.target.value)}/>
                  </div>
                  <div className="fgroup">
                    <label className="flabel">Uhrzeit</label>
                    <input type="time" className="finput" value={form.uhrzeit} onChange={e=>set("uhrzeit",e.target.value)}/>
                  </div>
                </div>
                <div className="fgroup">
                  <label className="flabel flabel-req">Gewässer</label>
                  <input type="text" className="finput" placeholder="z.B. Schweriner See"
                    value={form.gewässer} onChange={e=>set("gewässer",e.target.value)}/>
                </div>
                <div className="fgroup">
                  <label className="flabel">Angelplatz / Spot</label>
                  <input type="text" className="finput" placeholder="z.B. Nordstrand, Steg 3"
                    value={form.spot} onChange={e=>set("spot",e.target.value)}/>
                </div>
                <div className="fgroup">
                  <label className="flabel">Mit dabei</label>
                  <input type="text" className="finput" placeholder="z.B. Norbert"
                    value={form.begleitperson} onChange={e=>set("begleitperson",e.target.value)}/>
                </div>
                <div className="fgroup">
                  <label className="flabel">Standort (GPS)</label>
                  <div className="fgps-row">
                    <input type="text" className="finput" placeholder="53.63, 11.40"
                      value={form.gps_text} onChange={e=>set("gps_text",e.target.value)}/>
                    <button type="button" className="fgps-btn" onClick={getGPS}>📍 GPS</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Wetter */}
            <div className="fsec">
              <div className="fsec-hdr">🌤️ Wetter</div>
              <div className="ffields">
                <div className="frow">
                  <div className="fgroup">
                    <label className="flabel">Wetterlage</label>
                    <select className="fselect" value={form.wetter} onChange={e=>set("wetter",e.target.value)}>
                      {["sonnig","bewölkt","wechselhaft","regnerisch","nebelig","stürmisch"].map(w=>(
                        <option key={w} value={w}>{w.charAt(0).toUpperCase()+w.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="fgroup">
                    <label className="flabel">Wind</label>
                    <select className="fselect" value={form.wind} onChange={e=>set("wind",e.target.value)}>
                      {["windstill","schwach","mittel","stark","stürmisch"].map(w=>(
                        <option key={w} value={w}>{w.charAt(0).toUpperCase()+w.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="fgroup">
                  <label className="flabel">Temperatur (°C)</label>
                  <input type="number" className="finput" placeholder="z.B. 18" min="-20" max="45"
                    value={form.temperatur} onChange={e=>set("temperatur",e.target.value)}/>
                </div>
              </div>
            </div>

            {/* Angeln */}
            <div className="fsec">
              <div className="fsec-hdr">🎣 Angeln</div>
              <div className="ffields">
                <div className="fgroup">
                  <label className="flabel">Zielfisch</label>
                  <input type="text" className="finput" list="ziel-list" placeholder="z.B. Zander"
                    value={form.zielfisch} onChange={e=>set("zielfisch",e.target.value)}/>
                  <datalist id="ziel-list">{FISCHE.map(f=><option key={f} value={f}/>)}</datalist>
                </div>
                <div className="fgroup">
                  <label className="flabel">Köder</label>
                  <input type="text" className="finput" list="köder-list" placeholder="z.B. Gummifisch"
                    value={form.köder} onChange={e=>set("köder",e.target.value)}/>
                  <datalist id="köder-list">{KÖDER.map(k=><option key={k} value={k}/>)}</datalist>
                </div>
              </div>
            </div>

            {/* Fang */}
            <div className="fsec">
              <div className="fsec-hdr">🐟 Fang</div>
              <div className="ffields">
                <div className="fgroup">
                  <label className="flabel">Fischart</label>
                  <input type="text" className="finput" list="fang-list" placeholder="z.B. Hecht"
                    value={form.gefangene_fischart} onChange={e=>set("gefangene_fischart",e.target.value)}/>
                  <datalist id="fang-list">{FISCHE.map(f=><option key={f} value={f}/>)}</datalist>
                </div>
                <div className="frow">
                  <div className="fgroup">
                    <label className="flabel">Anzahl</label>
                    <input type="number" className="finput" placeholder="0" min="0"
                      value={form.anzahl} onChange={e=>set("anzahl",e.target.value)}/>
                  </div>
                  <div className="fgroup">
                    <label className="flabel">Länge (cm)</label>
                    <input type="number" className="finput" placeholder="0" min="0"
                      value={form.größe} onChange={e=>set("größe",e.target.value)}/>
                  </div>
                </div>
                <div className="fgroup">
                  <label className="flabel">Gewicht (g)</label>
                  <input type="number" className="finput" placeholder="0" min="0"
                    value={form.gewicht} onChange={e=>set("gewicht",e.target.value)}/>
                </div>
              </div>
            </div>

            {/* Fotos */}
            <div className="fsec">
              <div className="fsec-hdr">📷 Fotos</div>
              <div className="ffields">
                <PhotoUpload fotos={form.fotos} onChange={f=>set("fotos",f)}/>
              </div>
            </div>

            {/* Notizen & Bewertung */}
            <div className="fsec">
              <div className="fsec-hdr">📝 Notizen & Bewertung</div>
              <div className="ffields">
                <div className="fgroup">
                  <label className="flabel">Notizen</label>
                  <textarea className="ftextarea"
                    placeholder="Wie war der Tag? Besondere Momente, Stimmung, Tipps…"
                    value={form.notizen} onChange={e=>set("notizen",e.target.value)}/>
                </div>
                <div className="fgroup">
                  <label className="flabel">Tagesbewertung</label>
                  <StarRating value={form.tagesbewertung} onChange={v=>set("tagesbewertung",v)}/>
                </div>
              </div>
            </div>

            <button className="save-btn" onClick={handleSave} disabled={saving}>
              {saving?"⏳ Speichern…":mode==="edit"?"✓ Änderungen speichern":"💾 Eintrag speichern"}
            </button>
            <div className="save-hint">💾 Wird lokal auf diesem Gerät gespeichert</div>
          </div>
        </div>
      </div>
    </>
  );
}

function DetailPage({ entry, onBack, onEdit, onDelete, toast }) {
  const [confirm, setConfirm] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const cover = entry.fotos?.[0];

  return (
    <>
      <header className="hdr">
        <button className="hdr-back" onClick={onBack}>← Zurück</button>
        <div className="hdr-title">{entry.gewässer||"Angelausflug"}</div>
        <button className="hdr-action" onClick={onEdit}>✏️ Bearbeiten</button>
      </header>

      <div className="page" style={{overflowY:"auto"}}>
        <div className="detail-hero">
          {cover
            ? <><img src={cover} alt="" onClick={()=>setLightbox(cover)}/><div className="detail-hero-overlay"/></>
            : <div className="detail-hero-placeholder">🎣</div>
          }
          <div className="detail-hero-meta">
            <div className="detail-hero-title">{entry.gewässer||"Angelausflug"}{entry.spot?` · ${entry.spot}`:""}</div>
            <div className="detail-hero-date">{fmtDatum(entry.datum)}{entry.uhrzeit?` · ${entry.uhrzeit} Uhr`:""}</div>
          </div>
        </div>

        <div className="detail-inner">
          {entry.tagesbewertung>0 && (
            <div className="detail-stars-row">
              <span className="detail-stars">{sterne(entry.tagesbewertung)}</span>
              <span className="detail-stars-label">Tagesbewertung</span>
            </div>
          )}

          <div className="dgrid">
            {entry.wetter && <div className="ditem"><div className="ditem-label">Wetter</div><div className="ditem-val">{WETTER_EMOJI[entry.wetter]||"🌤️"} {entry.wetter}</div></div>}
            {entry.temperatur!==""&&entry.temperatur!==undefined && <div className="ditem"><div className="ditem-label">Temperatur</div><div className="ditem-val">🌡️ {entry.temperatur} °C</div></div>}
            {entry.wind && <div className="ditem"><div className="ditem-label">Wind</div><div className="ditem-val">💨 {WIND_LABEL[entry.wind]||entry.wind}</div></div>}
            {entry.begleitperson && <div className="ditem"><div className="ditem-label">Mit dabei</div><div className="ditem-val">👤 {entry.begleitperson}</div></div>}
            {entry.köder && <div className="ditem"><div className="ditem-label">Köder</div><div className="ditem-val">🪝 {entry.köder}</div></div>}
            {entry.zielfisch && <div className="ditem"><div className="ditem-label">Zielfisch</div><div className="ditem-val">🎯 {entry.zielfisch}</div></div>}
            {entry.gefangene_fischart && (
              <div className="ditem ditem-full ditem-catch">
                <div className="ditem-label ditem-label-catch">🐟 Gefangen</div>
                <div className="ditem-val ditem-val-lg">
                  {entry.gefangene_fischart}
                  {entry.anzahl>0?` · ${entry.anzahl}×`:""}
                  {entry.größe>0?` · ${entry.größe} cm`:""}
                  {entry.gewicht>0?` · ${entry.gewicht>999?(entry.gewicht/1000).toFixed(2)+" kg":entry.gewicht+" g"}`:""}
                </div>
              </div>
            )}
            {entry.gps_text && <div className="ditem ditem-full"><div className="ditem-label">📍 Standort</div><div className="ditem-val" style={{fontSize:".82rem",fontWeight:400}}>{entry.gps_text}</div></div>}
          </div>

          {entry.notizen && (
            <div>
              <div className="detail-sec-label">📝 Notizen</div>
              <div className="detail-notizen">{entry.notizen}</div>
            </div>
          )}

          {(entry.fotos?.length||0)>0 && (
            <div>
              <div className="detail-sec-label">📷 Fotos ({entry.fotos.length})</div>
              <div className="galerie">
                {entry.fotos.map((src,i)=>(
                  <div key={i} className="galerie-item" onClick={()=>setLightbox(src)}>
                    <img src={src} alt={`Foto ${i+1}`} loading="lazy"/>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="detail-meta">
            <div className="sync-dot">💾 Lokal gespeichert</div>
            {entry.createdAt && <div>Erstellt: {new Date(entry.createdAt).toLocaleString("de-DE")}</div>}
          </div>

          <div className="detail-actions">
            <button className="btn-edit" onClick={onEdit}>✏️ Bearbeiten</button>
            <button className="btn-del" onClick={()=>setConfirm(true)}>🗑 Löschen</button>
          </div>
        </div>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={()=>setLightbox(null)}>
          <button className="lightbox-close" onClick={()=>setLightbox(null)}>✕</button>
          <img src={lightbox} alt="Vergrößert" onClick={e=>e.stopPropagation()}/>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title="Eintrag löschen?"
          text="Dieser Schritt kann nicht rückgängig gemacht werden."
          onConfirm={onDelete}
          onCancel={()=>setConfirm(false)}
        />
      )}
    </>
  );
}

function SettingsPage({ entries, settings, onSaveSettings, toast }) {
  const coverRef = useRef();
  const unsynced = entries.filter(e=>e.syncStatus==="lokal").length;

  async function handleCover(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, 1400, 0.85);
    await onSaveSettings({ ...settings, coverBild: compressed });
    toast("Titelbild gespeichert ✓","success");
    e.target.value="";
  }
  async function removeCover() {
    const s = { ...settings }; delete s.coverBild;
    await onSaveSettings(s);
    toast("Titelbild entfernt","default");
  }

  return (
    <>
      <div className="settings-hero">
        <div className="settings-hero-title">⚙️ Einstellungen</div>
        <div className="settings-hero-sub">Export, Titelbild & App-Infos</div>
      </div>

      <div className="page" style={{overflowY:"auto"}}>
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-num">{entries.length}</div>
            <div className="stat-label">Einträge gesamt</div>
          </div>
          <div className="stat-card">
            <div className={`stat-num ${unsynced>0?"stat-num-warn":""}`}>{unsynced}</div>
            <div className="stat-label">Nicht synchronisiert</div>
          </div>
        </div>

        {/* Titelbild */}
        <div className="ssec">
          <div className="ssec-hdr">Titelbild Startseite</div>
          {settings.coverBild && <img className="cover-preview" src={settings.coverBild} alt="Cover"/>}
          <div className="sitem" onClick={()=>coverRef.current?.click()}>
            <span className="sitem-icon">🖼️</span>
            <div className="sitem-text">
              <div className="sitem-label">{settings.coverBild?"Titelbild ändern":"Titelbild festlegen"}</div>
              <div className="sitem-desc">Persönliches Foto für die Startseite</div>
            </div>
            <span className="sitem-arrow">›</span>
          </div>
          {settings.coverBild && (
            <div className="sitem" onClick={removeCover} style={{color:"var(--danger)"}}>
              <span className="sitem-icon">🗑</span>
              <div className="sitem-text"><div className="sitem-label" style={{color:"var(--danger)"}}>Titelbild entfernen</div></div>
            </div>
          )}
          <input ref={coverRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleCover}/>
        </div>

        {/* Export */}
        <div className="ssec">
          <div className="ssec-hdr">Daten exportieren</div>
          <div className="sitem" onClick={()=>{exportCSV(entries);toast("CSV-Export gestartet ✓","success")}}>
            <span className="sitem-icon">📊</span>
            <div className="sitem-text"><div className="sitem-label">Als CSV exportieren</div><div className="sitem-desc">Für Excel, Numbers oder Tabellenkalkulationen</div></div>
            <span className="sitem-arrow">›</span>
          </div>
          <div className="sitem" onClick={()=>{exportJSON(entries);toast("JSON-Export gestartet ✓","success")}}>
            <span className="sitem-icon">📄</span>
            <div className="sitem-text"><div className="sitem-label">Als JSON exportieren</div><div className="sitem-desc">Kompakt, ohne Fotos</div></div>
            <span className="sitem-arrow">›</span>
          </div>
        </div>

        {/* Sync V2 */}
        <div className="ssec">
          <div className="ssec-hdr">Synchronisation</div>
          <div className="sitem" style={{opacity:.55,cursor:"default"}}>
            <span className="sitem-icon">☁️</span>
            <div className="sitem-text"><div className="sitem-label">Google Konto verbinden</div><div className="sitem-desc">Sync via Google Sheets · Kommt in V2</div></div>
            <span className="sitem-badge">V2</span>
          </div>
        </div>

        <div className="app-info">
          <strong>🎣 Angeltagebuch</strong>
          Version 1.0 · Offline-First PWA<br/>
          💾 Alle Daten werden lokal auf diesem Gerät gespeichert.<br/>
          Kein Server. Kein Account. Kein Cloud-Zwang.
        </div>
      </div>
    </>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [entries, setEntries] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("home");     // home|new|detail|edit|settings
  const [activeId, setActiveId] = useState(null);
  const [toasts, setToasts] = useState([]);

  // Load
  useEffect(() => {
    Promise.all([loadEntries(), loadSettings()]).then(([e,s]) => {
      setEntries(e); setSettings(s); setLoading(false);
    });
  }, []);

  // Toast
  const toast = useCallback((message, type="default") => {
    const id = Date.now();
    setToasts(p=>[...p,{id,message,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)), 2800);
  }, []);

  // Save entries
  async function persistEntries(updated) {
    setEntries(updated);
    await saveEntries(updated);
  }

  async function handleSaveEntry(form) {
    const now = new Date().toISOString();
    if (page==="edit" && activeId) {
      const updated = entries.map(e => e.id===activeId
        ? { ...e, ...form, updatedAt:now, syncStatus:"lokal" }
        : e
      );
      await persistEntries(updated);
      toast("Eintrag aktualisiert ✓","success");
      setPage("detail");
    } else {
      const newEntry = { ...form, id:uid(), createdAt:now, updatedAt:now, syncStatus:"lokal" };
      const updated = [newEntry, ...entries].sort((a,b)=>b.datum.localeCompare(a.datum));
      await persistEntries(updated);
      setActiveId(newEntry.id);
      toast("Eintrag gespeichert ✓","success");
      setPage("detail");
    }
  }

  async function handleDelete() {
    const updated = entries.filter(e=>e.id!==activeId);
    await persistEntries(updated);
    toast("Eintrag gelöscht","default");
    setPage("home");
  }

  async function handleSaveSettings(s) {
    setSettings(s);
    await saveSettings(s);
  }

  const activeEntry = entries.find(e=>e.id===activeId);

  function nav(p) { setPage(p); setActiveId(null); }

  if (loading) return (
    <>
      <style>{CSS}</style>
      <div className="app"><div className="loading"><div className="spin"/><span>Lade Tagebuch…</span></div></div>
    </>
  );

  const showHeader = page==="home"||page==="settings";
  const isDetailOrForm = page==="detail"||page==="new"||page==="edit";

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* Lokaler Speicher Banner */}
        <div className="local-bar">
          <span className="local-dot"/>
          <span>Offline-Modus · Alle Daten lokal gespeichert</span>
        </div>

        {/* Header nur auf Home & Settings */}
        {showHeader && (
          <header className="hdr">
            <div className="hdr-logo">🎣 <span>Angel</span>tagebuch</div>
          </header>
        )}

        {/* Pages */}
        {page==="home" && (
          <HomePage
            entries={entries}
            settings={settings}
            onNavigate={(p,id)=>{setPage(p);setActiveId(id);}}
            onNew={()=>setPage("new")}
          />
        )}

        {page==="new" && (
          <EntryFormPage
            mode="new"
            onSave={handleSaveEntry}
            onBack={()=>setPage("home")}
            toast={toast}
          />
        )}

        {page==="edit" && activeEntry && (
          <EntryFormPage
            mode="edit"
            entry={activeEntry}
            onSave={handleSaveEntry}
            onBack={()=>setPage("detail")}
            toast={toast}
          />
        )}

        {page==="detail" && activeEntry && (
          <DetailPage
            entry={activeEntry}
            onBack={()=>setPage("home")}
            onEdit={()=>setPage("edit")}
            onDelete={handleDelete}
            toast={toast}
          />
        )}

        {page==="settings" && (
          <SettingsPage
            entries={entries}
            settings={settings}
            onSaveSettings={handleSaveSettings}
            toast={toast}
          />
        )}

        {/* Bottom Nav */}
        <nav className="bnav">
          <button className={`bnav-item ${page==="home"?"active":""}`} onClick={()=>nav("home")}>
            <span className="bnav-icon">🏠</span>
            <span>Übersicht</span>
          </button>
          <button className={`bnav-item ${page==="new"?"active":""}`} onClick={()=>setPage("new")}>
            <span className="bnav-icon">➕</span>
            <span>Neu</span>
          </button>
          <button className={`bnav-item ${page==="settings"?"active":""}`} onClick={()=>nav("settings")}>
            <span className="bnav-icon">⚙️</span>
            <span>Einstellungen</span>
          </button>
        </nav>

        <Toast toasts={toasts}/>
      </div>
    </>
  );
}
