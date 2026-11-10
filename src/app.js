const $ = s=>document.querySelector(s);
const BOARD = !!window.S33;
const KEY = "s33-hexa-v1", CLS = "S33 CLASSICS";
const clone = o=>JSON.parse(JSON.stringify(o));
const NN = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const noteName = n=>NN[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 2);   // come sul DX7: il Do centrale è C3
/* ===================== STATO ===================== */
let ST = { bank:CLS, banks:{}, cur:6, edit:null, page:"easy",
  perf:{ bright:0, atk:0, dec:0, rel:0, metal:0, vel:100, tone:0, vol:85 }, fx:{ chorus:35, delay:12, reverb:22 }, play:{ bendR:2, wheel:60, trans:0, glide:0, mode:0 } };
try{ const s = JSON.parse(localStorage.getItem(KEY) || "null"); if(s && s.banks){ ST = Object.assign(ST, s); ST.perf = Object.assign({ bright:0, atk:0, dec:0, rel:0, metal:0, vel:100, tone:0, vol:85 }, s.perf); ST.fx = Object.assign({ chorus:35, delay:12, reverb:22 }, s.fx); ST.play = Object.assign({ bendR:2, wheel:60, trans:0, glide:0, mode:0 }, s.play); } }catch(e){}
if(!ST.banks[CLS]) ST.banks[CLS] = classics();
if(!ST.banks[ST.bank]) ST.bank = CLS;
const bank = ()=>ST.banks[ST.bank];
if(!ST.edit) ST.edit = clone(bank()[ST.cur] || initVoice());
let saveT = 0;
function save(){ clearTimeout(saveT); saveT = setTimeout(()=>{ try{ localStorage.setItem(KEY, JSON.stringify(ST)); }catch(e){ msg("STORAGE FULL"); } }, 300); }
const V = ()=>ST.edit;
const edited = ()=>JSON.stringify(ST.edit) !== JSON.stringify(bank()[ST.cur]) || ["bright","atk","dec","rel","metal"].some(k=>ST.perf[k]);

/* ===================== AUDIO ===================== */
let ctx = null, node = null, an = null, starting = null, master = null, lowS = null, highS = null, dlyT = null, dlyMix = null, chMix = null, rvMix = null, rvConv = null, chD = [];
const send = m=>{ if(node) node.port.postMessage(m); };
let cmpOn = false;
function sendVoice(){ send({ t:"voice", v:cmpOn ? bank()[ST.cur] : V() }); }
function sendPerf(){ const p = ST.perf; send({ t:"p", p:{ mode:ST.play.mode, bendR:ST.play.bendR, glide:ST.play.glide, vsx:p.vel / 100, perf:{ bright:p.bright, atk:p.atk, dec:p.dec, rel:p.rel, metal:p.metal } } }); }
function impulse(c, sec){ const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate); for(let ch = 0; ch < 2; ch++){ const d = b.getChannelData(ch); for(let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); } return b; }
function power(){
  if(starting) return starting;
  starting = (async ()=>{
    try{
      if(BOARD){ S33.started = true; ctx = await S33.getCtx(); } else ctx = new AudioContext({ latencyHint:"interactive" });
      if(ctx.state === "suspended") try{ await ctx.resume(); }catch(e){}
      await ctx.audioWorklet.addModule("data:text/javascript;charset=utf-8," + encodeURIComponent($("#wk").textContent));
      node = new AudioWorkletNode(ctx, "s33-hexa", { numberOfInputs:0, outputChannelCount:[2] });
      node.port.onmessage = e=>{ if(e.data.t === "pk"){ peaks = e.data.p; active = e.data.a; } };
      // tono (inclinazione), poi chorus, delay e riverbero in parallelo
      lowS = ctx.createBiquadFilter(); lowS.type = "lowshelf"; lowS.frequency.value = 400;
      highS = ctx.createBiquadFilter(); highS.type = "highshelf"; highS.frequency.value = 2500;
      node.connect(lowS); lowS.connect(highS);
      master = ctx.createGain(); const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -8; lim.ratio.value = 6; lim.attack.value = .003; lim.release.value = .2;
      master.connect(lim); an = ctx.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = .7; lim.connect(an);
      lim.connect(BOARD ? S33.out : ctx.destination);
      highS.connect(master);
      chMix = ctx.createGain(); const mrg = ctx.createChannelMerger(2);
      [0, 1].forEach(i=>{ const d = ctx.createDelay(.05); d.delayTime.value = .012 + i * .006; const o = ctx.createOscillator(); o.frequency.value = .33 + i * .11; const g = ctx.createGain(); g.gain.value = .0028; o.connect(g); g.connect(d.delayTime); o.start(); highS.connect(d); d.connect(mrg, 0, i); chD.push(d); });
      mrg.connect(chMix); chMix.connect(master);
      dlyT = ctx.createDelay(2); const fb = ctx.createGain(); fb.gain.value = .32; const dlp = ctx.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 3800;
      dlyMix = ctx.createGain(); highS.connect(dlyT); dlyT.connect(dlp); dlp.connect(fb); fb.connect(dlyT); dlp.connect(dlyMix); dlyMix.connect(master);
      rvConv = ctx.createConvolver(); rvConv.buffer = impulse(ctx, 2.6); rvMix = ctx.createGain(); highS.connect(rvConv); rvConv.connect(rvMix); rvMix.connect(master);
      applyFx(); sendVoice(); sendPerf();
      $("#pow").classList.add("on"); initMIDI(); lcd();
    }catch(e){ console.error(e); msg("ENGINE ERROR"); starting = null; ctx = node = null; }
  })();
  return starting;
}
function applyFx(){
  if(!ctx) return; const t = ctx.currentTime, p = ST.perf, f = ST.fx;
  master.gain.setTargetAtTime(Math.pow(p.vol / 100, 1.5) * 1.1, t, .02);
  lowS.gain.setTargetAtTime(-p.tone * .6, t, .03); highS.gain.setTargetAtTime(p.tone, t, .03);
  chMix.gain.setTargetAtTime(f.chorus / 100 * .8, t, .03); dlyMix.gain.setTargetAtTime(f.delay / 100 * .7, t, .03); rvMix.gain.setTargetAtTime(f.reverb / 100 * .9, t, .03);
  const bpm = (BOARD && S33.clockBpm && S33.clockBpm()) || 120; dlyT.delayTime.setTargetAtTime(Math.min(1.9, 30 / bpm * 1.5), t, .05);   // 1/8 puntato
}
$("#pow").onclick = ()=>power();
let peaks = [0,0,0,0,0,0], active = 0;
/* ===================== NOTE ===================== */
const tr = n=>n + ST.play.trans;
/* "at": l'istante in cui la nota deve suonare. Nella Mother Board, mentre consegna una nota, ctx.currentTime è già quell'istante */
async function noteOn(n, v){ const at = ctx ? ctx.currentTime : 0; if(!node){ await power(); if(!node) return; } send({ t:"on", n:tr(n), v, at }); }
function noteOff(n){ send({ t:"off", n:tr(n), at:ctx ? ctx.currentTime : 0 }); }
function onMIDI(e){
  const d = e.data, s = d[0] & 0xF0;
  if(s === 0x90 && d[2] > 0) noteOn(d[1], d[2]);
  else if(s === 0x80 || (s === 0x90 && d[2] === 0)) noteOff(d[1]);
  else if(s === 0xE0) send({ t:"bend", v:((d[2] << 7 | d[1]) - 8192) / 8192 });
  else if(s === 0xB0){
    if(d[1] === 1) send({ t:"wheel", v:d[2] / 127 * ST.play.wheel / 100 });
    else if(d[1] === 64) send({ t:"sus", v:d[2] >= 64 });
    else if(d[1] === 123 || d[1] === 120) send({ t:"panic" });
  }
}
async function initMIDI(){
  if(!navigator.requestMIDIAccess){ $("#midi").textContent = "MIDI: NOT SUPPORTED"; return; }
  try{ const a = await navigator.requestMIDIAccess(); const hook = ()=>{ const nm = []; a.inputs.forEach(i=>{ i.onmidimessage = onMIDI; nm.push(i.name); }); $("#midi").textContent = BOARD ? "MIDI: FROM THE BOARD" : nm.length ? "MIDI: " + nm.join(", ").toUpperCase().slice(0, 30) : "MIDI: NO DEVICE"; }; hook(); a.onstatechange = hook; }
  catch(e){ $("#midi").textContent = "MIDI: NOT ALLOWED"; }
}
const KM = { a:0, w:1, s:2, e:3, d:4, f:5, t:6, g:7, y:8, h:9, u:10, j:11, k:12 }, comp = new Map();
addEventListener("keydown", e=>{
  if(e.repeat || e.metaKey || e.ctrlKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if(e.code === "Space"){ e.preventDefault(); noteOn(60, 100); comp.set(" ", 60); return; }
  const o = KM[e.key]; if(o === undefined) return; const n = 60 + o; comp.set(e.key, n); noteOn(n, 100); });
addEventListener("keyup", e=>{ const k = e.code === "Space" ? " " : e.key, n = comp.get(k); if(n !== undefined){ comp.delete(k); noteOff(n); } });
addEventListener("blur", ()=>{ comp.forEach(n=>noteOff(n)); comp.clear(); });

/* ===================== COMPONENTI ===================== */
let lcdTmp = "", lcdT = 0;
function msg(t){ lcdTmp = t; clearTimeout(lcdT); lcdT = setTimeout(()=>{ lcdTmp = ""; lcd(); }, 1600); lcd(); }
function lcd(){
  const v = V(), l1 = (edited() ? "*" : "I") + String(ST.cur + 1).padStart(2, "0") + " " + (v.name.toUpperCase() + "          ").slice(0, 10) + "   ALG " + String(v.alg + 1).padStart(2, "0");
  const l2 = lcdTmp || (!ctx ? "PRESS ⏻ TO START" : ("BANK: " + ST.bank.toUpperCase()).slice(0, 21).padEnd(23) + "VOICE " + String(ST.cur + 1).padStart(2, "0") + "/32");
  const el = $("#lcd"); if(el.querySelector("input")) return;
  el.innerHTML = ""; el.append(l1); const s = document.createElement("div"); s.className = "l2"; s.textContent = l2; el.appendChild(s);
}
$("#lcd").ondblclick = ()=>{ const el = $("#lcd"); el.innerHTML = ""; const i = document.createElement("input"); i.maxLength = 10; i.value = V().name; el.appendChild(i); i.focus(); i.select();
  const done = ()=>{ V().name = i.value.toUpperCase().replace(/[^\x20-\x7e]/g, "").slice(0, 10) || "VOICE"; el.innerHTML = ""; save(); lcd(); };
  i.onkeydown = e=>{ e.stopPropagation(); if(e.key === "Enter") i.blur(); if(e.key === "Escape"){ i.value = V().name; i.blur(); } }; i.onblur = done; };
function arcD(a0, a1, r){ const p = a=>[Math.sin(a) * r, -Math.cos(a) * r], [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; }
const KN = [];
function knob(host, o){
  const sz = o.size || 56, e = document.createElement("div"); e.className = "kn";
  e.innerHTML = `<svg viewBox="-24 -24 48 48" width="${sz}" height="${sz}"><circle r="22" fill="#14110f"/><path d="${arcD(-2.4, 2.4, 19)}" fill="none" stroke="#3b332d" stroke-width="3.5" stroke-linecap="round"/><path class="v" fill="none" stroke="${o.color || "#efe7d6"}" stroke-width="3.5" stroke-linecap="round"/><circle r="14" fill="url(#kg)"/><line class="p" x1="0" y1="-4" x2="0" y2="-12" stroke="#efe7d6" stroke-width="2.4" stroke-linecap="round"/></svg><b>${o.label}</b><em></em>${o.sub ? `<small>${o.sub}</small>` : ""}`;
  host.appendChild(e);
  const st = o.step || 1, set = x=>{ x = Math.max(o.min, Math.min(o.max, Math.round(x / st) * st)); if(x !== o.get()){ o.set(x); draw(); if(o.after) o.after(x); } };
  const draw = ()=>{ const x = o.get(), f = (x - o.min) / (o.max - o.min), a = -2.4 + 4.8 * f, from = o.min < 0 && o.max > 0 ? 0 : -2.4;
    e.querySelector(".v").setAttribute("d", Math.abs(a - from) < .02 ? "" : arcD(Math.min(a, from), Math.max(a, from), 19)); e.querySelector(".p").setAttribute("transform", `rotate(${a * 180 / Math.PI})`);
    e.querySelector("em").textContent = o.fmt ? o.fmt(x) : x; };
  e.onpointerdown = ev=>{ ev.preventDefault(); e.setPointerCapture(ev.pointerId); const y0 = ev.clientY, v0 = o.get(); e.onpointermove = m=>set(v0 + (y0 - m.clientY) / (m.shiftKey ? 600 : 150) * (o.max - o.min)); e.onpointerup = ()=>{ e.onpointermove = e.onpointerup = null; }; };
  e.onwheel = ev=>{ ev.preventDefault(); set(o.get() - Math.sign(ev.deltaY) * Math.max(st, (o.max - o.min) / (ev.shiftKey ? 200 : 50))); };
  e.ondblclick = ()=>set(o.def ?? o.min);
  draw(); KN.push(draw); return draw;
}
function dragNum(el, get, set, min, max, scale){
  el.onpointerdown = ev=>{ ev.preventDefault(); ev.stopPropagation(); el.setPointerCapture(ev.pointerId); const y0 = ev.clientY, v0 = get();
    el.onpointermove = m=>{ const x = Math.max(min, Math.min(max, Math.round(v0 + (y0 - m.clientY) / (m.shiftKey ? 12 : (scale || 4))))); if(x !== get()) set(x); };
    el.onpointerup = ()=>{ el.onpointermove = el.onpointerup = null; }; };
  el.onwheel = ev=>{ ev.preventDefault(); const x = Math.max(min, Math.min(max, get() - Math.sign(ev.deltaY))); if(x !== get()) set(x); };
}
document.body.insertAdjacentHTML("afterbegin", '<svg width="0" height="0" style="position:absolute"><defs><radialGradient id="kg" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#55493f"/><stop offset="1" stop-color="#211c19"/></radialGradient></defs></svg>');
/* una modifica alla voce: al motore, al display, al salvataggio */
function changed(label){ sendVoice(); if(label) msg(label); else lcd(); save(); drawBankMark(); }

/* ===================== BANCO ===================== */
function drawBank(){
  $("#bank").innerHTML = bank().map((v, i)=>`<span data-i="${i}" class="${i === ST.cur ? "on" : ""}" title="${v.name}"><b>${String(i + 1).padStart(2, "0")}</b><i>${v.name}</i></span>`).join("");
  $("#bank").querySelectorAll("span").forEach(s=>s.onclick = ()=>pick(+s.dataset.i));
  const sel = $("#banksel"); sel.innerHTML = Object.keys(ST.banks).map(n=>`<option>${n}</option>`).join("") + `<option value="__del">✕ Remove this bank</option>`; sel.value = ST.bank;
}
function drawBankMark(){ const s = $("#bank").children[ST.cur]; if(s) s.querySelector("i").textContent = (edited() ? "* " : "") + V().name; }
function resetPerf(){ Object.assign(ST.perf, { bright:0, atk:0, dec:0, rel:0, metal:0 }); KN.forEach(d=>d()); sendPerf(); }
function pick(i){ ST.cur = i; ST.edit = clone(bank()[i]); resetPerf(); drawBank(); drawAll(); sendVoice(); save(); lcd(); }
$("#banksel").onchange = e=>{ const v = e.target.value;
  if(v === "__del"){ if(ST.bank === CLS){ msg("CAN'T REMOVE S33 CLASSICS"); drawBank(); return; } delete ST.banks[ST.bank]; ST.bank = CLS; }
  else ST.bank = v;
  pick(0); };
$("#load").onclick = ()=>$("#file").click();
$("#file").onchange = async e=>{ const f = e.target.files[0]; e.target.value = ""; if(!f) return;
  const vs = parseSyx(new Uint8Array(await f.arrayBuffer()));
  if(!vs.length){ msg("NOT A DX7 .SYX FILE"); return; }
  if(vs.length >= 32){ let n = f.name.replace(/\.syx$/i, "").slice(0, 24) || "BANK", k = n, j = 2; while(ST.banks[k]) k = n + " " + j++; ST.banks[k] = vs.slice(0, 32); ST.bank = k; pick(0); msg("LOADED " + vs.length + " VOICES"); }
  else { ST.edit = vs[0]; resetPerf(); drawAll(); changed("VOICE LOADED · STORE TO KEEP"); } };
$("#savesyx").onclick = ()=>{ const b = new Blob([makeSyx(bank())], { type:"application/octet-stream" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = ST.bank.replace(/[^\w\- ]/g, "") + ".syx"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000); msg("BANK SAVED AS .SYX"); };
/* STORE: la voce modificata (con le manopole EASY dentro) torna nel banco */
function bake(){
  const v = clone(V()), p = ST.perf, A = ALG[v.alg];
  v.ops.forEach((o, i)=>{ const car = A.c.includes(i + 1);
    if(!car){ o.ol = Math.max(0, Math.min(99, o.ol + p.bright));
      if(p.metal && !o.mode){ const r = (o.fc === 0 ? .5 : o.fc) * (1 + o.ff / 100) * (1 + p.metal * .0021 * (i + 1) * (i % 2 ? 1 : -1)); const [c, f] = ratio(r); o.fc = Math.min(31, c); o.ff = Math.max(0, Math.min(99, f)); } }
    else { o.r[0] = Math.max(0, Math.min(99, o.r[0] - p.atk)); o.r[1] = Math.max(0, Math.min(99, o.r[1] - p.dec)); o.r[2] = Math.max(0, Math.min(99, o.r[2] - p.dec)); o.r[3] = Math.max(0, Math.min(99, o.r[3] - p.rel)); }
    o.kvs = Math.max(0, Math.min(7, Math.round(o.kvs * p.vel / 100))); });
  return v;
}
$("#store").onclick = ()=>{ const v = bake(); bank()[ST.cur] = v; ST.edit = clone(v); ST.perf.vel = 100; resetPerf(); drawBank(); drawAll(); sendVoice(); save(); msg("STORED IN " + String(ST.cur + 1).padStart(2, "0")); };
const cmp = $("#cmp");
cmp.onpointerdown = ()=>{ cmpOn = true; cmp.classList.add("on"); sendVoice(); msg("COMPARE: AS IN THE BANK"); };
const cmpOff = ()=>{ if(!cmpOn) return; cmpOn = false; cmp.classList.remove("on"); sendVoice(); lcd(); };
cmp.onpointerup = cmpOff; cmp.onpointerleave = cmpOff;
const ini = $("#init"); ini.onclick = ()=>{ if(!ini.classList.contains("warn")){ ini.classList.add("warn"); ini.textContent = "SURE?"; clearTimeout(ini._t); ini._t = setTimeout(()=>{ ini.classList.remove("warn"); ini.textContent = "INIT"; }, 2200); return; }
  ini.classList.remove("warn"); ini.textContent = "INIT"; ST.edit = initVoice(); resetPerf(); drawAll(); changed("INIT VOICE"); };

/* ===================== PAGINA EASY ===================== */
const sgn = x=>(x > 0 ? "+" : "") + x;
function buildEasy(){
  const m = $("#macros"), p = ST.perf, A = (k, o)=>Object.assign({ get:()=>p[k], set:x=>{ p[k] = x; }, after:()=>{ sendPerf(); applyFx(); save(); lcd(); drawBankMark(); }, size:96 }, o);
  knob(m, A("bright", { label:"BRIGHTNESS", min:-30, max:30, def:0, fmt:sgn, color:"var(--m2)", sub:"How much the modulators bite: soft ↔ glassy" }));
  knob(m, A("atk", { label:"ATTACK", min:-40, max:60, def:0, fmt:x=>x ? (x > 0 ? "slower " : "faster ") + Math.abs(x) : "as stored", color:"var(--m1)", sub:"Slower = pad" }));
  knob(m, A("dec", { label:"DECAY", min:-40, max:60, def:0, fmt:x=>x ? (x > 0 ? "longer " : "shorter ") + Math.abs(x) : "as stored", color:"var(--m1)", sub:"How long the sound rings" }));
  knob(m, A("rel", { label:"RELEASE", min:-40, max:60, def:0, fmt:x=>x ? (x > 0 ? "longer " : "shorter ") + Math.abs(x) : "as stored", color:"var(--m1)", sub:"After you lift the key" }));
  knob(m, A("metal", { label:"METAL", min:0, max:100, def:0, fmt:x=>x || "—", color:"var(--m3)", sub:"Detunes the ratios: bells and gongs" }));
  knob(m, A("vel", { label:"VELOCITY", min:0, max:200, def:100, fmt:x=>x + "%", color:"var(--m2)", sub:"How much playing hard opens the sound" }));
  knob(m, A("tone", { label:"TONE", min:-12, max:12, def:0, fmt:x=>x ? sgn(x) + " dB" : "0", color:"var(--m3)", sub:"Dark ↔ bright, after the operators" }));
  knob(m, A("vol", { label:"VOLUME", min:0, max:100, def:85, color:"var(--m4)" }));
  const f = $("#fxk"), F = (k, l, d)=>knob(f, { label:l, min:0, max:100, def:d, get:()=>ST.fx[k], set:x=>{ ST.fx[k] = x; }, after:()=>{ applyFx(); save(); }, fmt:x=>x + "%", color:"var(--m3)" });
  F("chorus", "CHORUS", 35); F("delay", "DELAY 1/8.", 12); F("reverb", "REVERB", 22);
  const pk = $("#playk"), Y = (k, o)=>knob(pk, Object.assign({ get:()=>ST.play[k], set:x=>{ ST.play[k] = x; }, after:()=>{ sendPerf(); save(); }, color:"var(--m4)" }, o));
  Y("bendR", { label:"PITCH BEND", min:0, max:12, def:2, fmt:x=>"±" + x });
  Y("wheel", { label:"MOD WHEEL", min:0, max:100, def:60, fmt:x=>x + "% VIB" });
  Y("trans", { label:"TRANSPOSE", min:-24, max:24, def:0, fmt:sgn, after:()=>{ send({ t:"panic" }); save(); } });
  Y("glide", { label:"GLIDE", min:0, max:100, def:0, fmt:x=>x || "off" });
  const md = $("#modes"); md.innerHTML = ["POLY","MONO","MONO GLIDE"].map((l, i)=>`<button class="mb dark" data-m="${i}">${l}</button>`).join("");
  md.querySelectorAll("button").forEach(b=>b.onclick = ()=>{ ST.play.mode = +b.dataset.m; send({ t:"panic" }); sendPerf(); save(); drawModes(); });
}
function drawModes(){ $("#modes").querySelectorAll("button").forEach(b=>b.className = "mb " + (+b.dataset.m === ST.play.mode ? "on" : "dark")); }
/* gli armonici veri, dall'uscita */
const spec = $("#spec"), sx = spec.getContext("2d"); let fbuf = null;
function drawSpec(){
  const w = spec.clientWidth * 2, h = spec.clientHeight * 2; if(!w) return; if(spec.width !== w){ spec.width = w; spec.height = h; }
  sx.clearRect(0, 0, w, h); if(!an) return; if(!fbuf) fbuf = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(fbuf);
  const n = 64, sr = ctx.sampleRate;
  for(let i = 0; i < n; i++){ const f0 = 40 * Math.pow(500, i / n), f1 = 40 * Math.pow(500, (i + 1) / n); let m = -140;
    for(let b = Math.floor(f0 / sr * an.fftSize); b <= Math.ceil(f1 / sr * an.fftSize) && b < fbuf.length; b++) m = Math.max(m, fbuf[b]);
    const a = Math.max(0, Math.min(1, (m + 90) / 70)), bw = w / n;
    sx.fillStyle = i < n * .35 ? "#e8b04a" : "#7fb3c9"; sx.globalAlpha = .9; sx.fillRect(i * bw + 2, h - 6 - a * (h - 14), bw - 4, a * (h - 14)); }
  sx.globalAlpha = 1;
}

/* ===================== PAGINA OPERATORI ===================== */
const algSvg = $("#alg");
function layoutAlg(a){ // posizioni degli operatori: i carrier in basso, i modulatori sopra chi modulano
  const A = ALG[a], tgt = {}; for(let i = 1; i <= 6; i++) tgt[i] = A.m[i] || [];
  const depth = {}; const d = i=>depth[i] ?? (depth[i] = tgt[i].length ? 1 + Math.max(...tgt[i].map(d)) : 0); for(let i = 1; i <= 6; i++) d(i);
  const kids = {}; for(let i = 1; i <= 6; i++) kids[i] = []; for(let i = 1; i <= 6; i++) if(tgt[i].length) kids[Math.min(...tgt[i])].push(i);
  const x = {}; let col = 0; const place = i=>{ kids[i].sort((p, q)=>p - q); if(!kids[i].length){ x[i] = col++; return; } kids[i].forEach(place); x[i] = kids[i].reduce((s, k)=>s + x[k], 0) / kids[i].length; };
  A.c.slice().sort((p, q)=>p - q).forEach(place);
  for(let i = 1; i <= 6; i++) if(x[i] == null) x[i] = col++;
  for(let i = 1; i <= 6; i++) if(tgt[i].length > 1) x[i] = tgt[i].reduce((s, k)=>s + x[k], 0) / tgt[i].length;
  const maxD = Math.max(...Object.values(depth)), W = Math.max(1, col - 1), pos = {};
  for(let i = 1; i <= 6; i++) pos[i] = [col === 1 ? 150 : 40 + x[i] / W * 220, 240 - depth[i] * (maxD > 3 ? 46 : maxD > 2 ? 60 : 82)];
  return { A, pos, tgt, bw:col > 5 ? 38 : 48 };
}
function drawAlg(){
  const v = V(), { A, pos, tgt, bw } = layoutAlg(v.alg), hw = bw / 2; let s = "";
  for(let i = 1; i <= 6; i++) tgt[i].forEach(t=>{ const [x0, y0] = pos[i], [x1, y1] = pos[t]; s += `<path d="M${x0} ${y0 + 20} C${x0} ${(y0 + y1) / 2} ${x1} ${(y0 + y1) / 2} ${x1} ${y1 - 20}" fill="none" stroke="#7fb3c9" stroke-width="3"/>`; });
  const [fa, fb] = A.fb; const [fx, fy] = pos[fa], [tx, ty] = pos[fb];
  const fbx = Math.min(292, Math.max(fx, tx) + (fa === fb ? 38 : 44));
  if(fa === fb) s += `<path d="M${fx + 24} ${fy} H${fbx} V${fy - 34} H${fx} V${fy - 20}" fill="none" stroke="#c8644f" stroke-width="3"/><text x="${fbx}" y="${fy - 40}" text-anchor="end" fill="#c8644f" font-size="10" font-weight="800" font-family="sans-serif">FB ${v.fb}</text>`;
  else s += `<path d="M${fx + 24} ${fy} H${fbx} V${ty - 34} H${tx} V${ty - 20}" fill="none" stroke="#c8644f" stroke-width="3"/><text x="${fbx}" y="${ty - 40}" text-anchor="end" fill="#c8644f" font-size="10" font-weight="800" font-family="sans-serif">FB ${v.fb}</text>`;
  const xs = A.c.map(c=>pos[c][0]); s += `<line x1="${Math.min(...xs) - 20}" y1="282" x2="${Math.max(...xs) + 20}" y2="282" stroke="#e8b04a" stroke-width="3"/>`;
  A.c.forEach(c=>s += `<line x1="${pos[c][0]}" y1="${pos[c][1] + 20}" x2="${pos[c][0]}" y2="282" stroke="#e8b04a" stroke-width="3"/>`);
  s += `<text x="150" y="297" text-anchor="middle" fill="#9c9182" font-size="9" font-weight="800" letter-spacing="2" font-family="sans-serif">OUT</text>`;
  for(let i = 1; i <= 6; i++){ const [x, y] = pos[i], c = A.c.includes(i), off = v.ops[i - 1].on === false;
    s += `<g class="ab" data-op="${i}" style="cursor:pointer" opacity="${off ? .35 : 1}"><rect x="${x - hw}" y="${y - 20}" width="${bw}" height="40" rx="8" fill="${c ? "#e8b04a" : "#7fb3c9"}" stroke="${selOp === i - 1 ? "#fff" : "#000"}" stroke-width="2"/><text x="${x}" y="${y + 7}" text-anchor="middle" font-size="20" font-weight="800" fill="#1b1714" font-family="Helvetica Neue,Arial">${i}</text></g>`; }
  s += `<text x="8" y="16" fill="#e8b04a" font-size="9" font-weight="700" font-family="sans-serif" letter-spacing="1.5">■ CARRIER (YOU HEAR IT)</text><text x="8" y="30" fill="#7fb3c9" font-size="9" font-weight="700" font-family="sans-serif" letter-spacing="1.5">■ MODULATOR (SHAPES THE TONE)</text>`;
  algSvg.innerHTML = s; algSvg.querySelectorAll(".ab").forEach(g=>g.onclick = ()=>{ selOp = +g.dataset.op - 1; drawOps(); drawAlg(); });
  $("#algn").textContent = String(v.alg + 1).padStart(2, "0") + " / 32";
  $("#algs").querySelectorAll("span").forEach((e, i)=>e.classList.toggle("on", i === v.alg));
  $("#chr").textContent = "ALGORITHM " + String(v.alg + 1).padStart(2, "0") + " · " + A.c.length + (A.c.length > 1 ? " CARRIERS" : " CARRIER") + " · FEEDBACK " + v.fb;
}
let selOp = 1;
const CRV = ["−LN","−EX","+EX","+LN"];
function freqText(o){ if(o.mode) { const f = Math.pow(10, o.fc & 3) * Math.pow(10, o.ff / 100); return f >= 1000 ? (f / 1000).toFixed(2) + "k" : f.toFixed(f < 10 ? 2 : f < 100 ? 1 : 0); } return ((o.fc === 0 ? .5 : o.fc) * (1 + o.ff / 100)).toFixed(2); }
function buildOps(){
  const box = $("#ops"); box.innerHTML = "";
  for(let i = 0; i < 6; i++){
    const e = document.createElement("div"); e.className = "op"; e.dataset.i = i;
    e.innerHTML = `<div class="h"><b>${i + 1}</b><em></em><span class="tg" title="Operator on/off"></span></div>
      <div class="fr"><span class="fq" title="Drag: coarse · Shift: fine"></span><small class="md" title="Click: ratio or fixed frequency"></small><span class="dt" style="margin-left:auto;font-size:12px" title="Detune"></span><small>DET</small></div>
      <div class="lvl"><span class="cap">OUT</span><div class="bar" title="Output level"><i></i></div><span class="ol"></span></div>
      <canvas class="env" title="Drag the points: up/down = level, left/right = rate"></canvas>
      <div class="nums">${["R1","R2","R3","R4"].map((l, k)=>`<div data-r="${k}">${l}<br><b></b></div>`).join("")}${["L1","L2","L3","L4"].map((l, k)=>`<div data-l="${k}">${l}<br><b></b></div>`).join("")}</div>
      <div class="small"><div data-k="kvs" title="Velocity sensitivity 0–7">VEL<b></b></div><div data-k="rs" title="Rate scaling: higher notes are faster">RATE SC<b></b></div><div class="clk ksb" style="grid-column:1/-1" title="Keyboard level scaling: click to edit">KBD SCALE<b></b></div><div data-k="ams" title="Amplitude modulation sensitivity 0–3 (LFO)">AMS<b></b></div><div class="clk mdb" title="Click: ratio or fixed">MODE<b></b></div></div>
      <div class="ks"><div class="row"><span class="cap">KEYBOARD SCALING · OP ${i + 1}</span><span class="sp"></span><button class="mb dark" style="height:22px;padding:0 8px" data-x>✕</button></div>
        <div class="small"><div data-s="bp" style="grid-column:1/-1">BREAK POINT<b></b></div><div data-s="ld">L DEPTH<b></b></div><div data-s="rd">R DEPTH<b></b></div><div class="clk" data-c="lc">L CURVE<b></b></div><div class="clk" data-c="rc">R CURVE<b></b></div></div></div>
      <span class="meter"></span>`;
    box.appendChild(e);
    const op = ()=>V().ops[i];
    e.onpointerdown = ()=>{ if(selOp !== i){ selOp = i; drawOps(); drawAlg(); } };
    e.querySelector(".tg").onclick = ev=>{ ev.stopPropagation(); op().on = op().on === false; changed("OP" + (i + 1) + (op().on ? " ON" : " OFF")); drawOps(); drawAlg(); };
    dragNum(e.querySelector(".fq"), ()=>op().fc, x=>{ op().fc = x; changed(`OP${i + 1} ${op().mode ? "FIXED" : "RATIO"} ${freqText(op())}`); drawOps(); }, 0, 31, 6);
    const fq = e.querySelector(".fq"), dn = fq.onpointerdown;
    fq.onpointerdown = ev=>{ if(!ev.shiftKey) return dn(ev); ev.preventDefault(); fq.setPointerCapture(ev.pointerId); const y0 = ev.clientY, v0 = op().ff;
      fq.onpointermove = m=>{ const x = Math.max(0, Math.min(99, Math.round(v0 + (y0 - m.clientY) / 3))); if(x !== op().ff){ op().ff = x; changed(`OP${i + 1} FINE ${x} · ${freqText(op())}`); drawOps(); } }; fq.onpointerup = ()=>{ fq.onpointermove = fq.onpointerup = null; }; };
    const tm = ()=>{ op().mode = op().mode ? 0 : 1; changed(`OP${i + 1} ${op().mode ? "FIXED FREQ" : "RATIO"}`); drawOps(); };
    e.querySelector(".md").onclick = tm; e.querySelector(".mdb").onclick = tm;
    dragNum(e.querySelector(".dt"), ()=>op().det, x=>{ op().det = x; changed(`OP${i + 1} DETUNE ${sgn(x - 7)}`); drawOps(); }, 0, 14, 8);
    const bar = e.querySelector(".bar"); bar.onpointerdown = ev=>{ ev.preventDefault(); ev.stopPropagation(); bar.setPointerCapture(ev.pointerId); const r = bar.getBoundingClientRect();
      const mv = m=>{ const x = Math.max(0, Math.min(99, Math.round((m.clientX - r.left) / r.width * 99))); if(x !== op().ol){ op().ol = x; changed(`OP${i + 1} OUTPUT LEVEL ${x}`); drawOps(); } }; mv(ev); bar.onpointermove = mv; bar.onpointerup = ()=>{ bar.onpointermove = bar.onpointerup = null; }; };
    e.querySelectorAll("[data-r]").forEach(c=>{ const k = +c.dataset.r; dragNum(c, ()=>op().r[k], x=>{ op().r[k] = x; changed(`OP${i + 1} RATE ${k + 1}  ${x}`); drawOps(); }, 0, 99, 2); });
    e.querySelectorAll("[data-l]").forEach(c=>{ const k = +c.dataset.l; dragNum(c, ()=>op().l[k], x=>{ op().l[k] = x; changed(`OP${i + 1} LEVEL ${k + 1}  ${x}`); drawOps(); }, 0, 99, 2); });
    const lim = { kvs:7, rs:7, ams:3 }, nm = { kvs:"VELOCITY", rs:"RATE SCALING", ams:"AMS" };
    e.querySelectorAll(".small [data-k]").forEach(c=>{ const k = c.dataset.k; dragNum(c, ()=>op()[k], x=>{ op()[k] = x; changed(`OP${i + 1} ${nm[k]} ${x}`); drawOps(); }, 0, lim[k], 10); });
    const ks = e.querySelector(".ks"); e.querySelector(".ksb").onclick = ()=>{ ks.classList.add("on"); drawOps(); }; ks.querySelector("[data-x]").onclick = ev=>{ ev.stopPropagation(); ks.classList.remove("on"); };
    ks.querySelectorAll("[data-s]").forEach(c=>{ const k = c.dataset.s; dragNum(c, ()=>op()[k], x=>{ op()[k] = x; changed(`OP${i + 1} ${k === "bp" ? "BREAK POINT " + noteName(x + 21) : (k === "ld" ? "LEFT DEPTH " : "RIGHT DEPTH ") + x}`); drawOps(); }, 0, 99, 3); });
    ks.querySelectorAll("[data-c]").forEach(c=>c.onclick = ()=>{ const k = c.dataset.c; op()[k] = (op()[k] + 1) % 4; changed(`OP${i + 1} ${k === "lc" ? "LEFT" : "RIGHT"} CURVE ${CRV[op()[k]]}`); drawOps(); });
    envDrag(e.querySelector(".env"), ()=>op(), "OP" + (i + 1));
  }
}
/* inviluppo disegnato: x dai rate (più lento = segmento più lungo), y dai livelli */
function envPts(R, L, W, H, pitch){
  const seg = r=>(100 - r) / 100 * (W - 40) / 4 + 3, y = l=>pitch ? H / 2 - (l - 50) / 50 * (H / 2 - 6) : H - 5 - l / 99 * (H - 12);
  let x = 4; const pts = [[x, y(L[3])]]; for(let k = 0; k < 3; k++){ x += seg(R[k]); pts.push([x, y(L[k])]); } x += 18; pts.push([x, y(L[2])]); x += seg(R[3]); pts.push([x, y(L[3])]); return { pts, seg, y };
}
function drawEnv(cv, R, L, col, pitch){
  const W = cv.clientWidth, H = cv.clientHeight; if(!W) return; const dpr = 2; if(cv.width !== W * dpr){ cv.width = W * dpr; cv.height = H * dpr; }
  const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const { pts } = envPts(R, L, W, H, pitch);
  if(pitch){ c.strokeStyle = "#2b2521"; c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke(); }
  c.setLineDash([3, 3]); c.strokeStyle = "#3b332d"; [3, 4].forEach(k=>{ c.beginPath(); c.moveTo(pts[k][0], 3); c.lineTo(pts[k][0], H); c.stroke(); }); c.setLineDash([]);
  c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); pts.forEach((p, k)=>k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
  c.fillStyle = "#efe7d6"; [1, 2, 3, 5].forEach(k=>{ c.beginPath(); c.arc(pts[k][0], pts[k][1], 3.6, 0, 7); c.fill(); });
}
function envDrag(cv, get, name, pitch){
  cv.onpointerdown = ev=>{ ev.preventDefault(); ev.stopPropagation(); const r = cv.getBoundingClientRect(), W = r.width, H = r.height, o = get(), R = pitch ? o.pr : o.r, L = pitch ? o.pl : o.l;
    const { pts } = envPts(R, L, W, H, pitch), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    let best = 1, bd = 1e9; [1, 2, 3, 5].forEach(k=>{ const d = Math.hypot(pts[k][0] - mx, pts[k][1] - my); if(d < bd){ bd = d; best = k; } });
    const seg = best === 5 ? 3 : best - 1, prevX = best === 5 ? pts[4][0] : pts[best - 1][0];
    cv.setPointerCapture(ev.pointerId);
    cv.onpointermove = m=>{ const x = m.clientX - r.left, y = m.clientY - r.top;
      const lv = pitch ? Math.round(50 + (H / 2 - y) / (H / 2 - 6) * 50) : Math.round((H - 5 - y) / (H - 12) * 99);
      const len = Math.max(3, x - prevX), rt = Math.round(100 - (len - 3) / ((W - 40) / 4) * 100);
      L[seg] = Math.max(0, Math.min(99, lv)); R[seg] = Math.max(0, Math.min(99, rt));
      changed(`${name} R${seg + 1} ${R[seg]}  L${seg + 1} ${L[seg]}`); drawOps(); drawPE(); };
    cv.onpointerup = ()=>{ cv.onpointermove = cv.onpointerup = null; }; };
}
function drawOps(){
  const v = V(), A = ALG[v.alg];
  $("#ops").querySelectorAll(".op").forEach((e, i)=>{ const o = v.ops[i], car = A.c.includes(i + 1), col = car ? "#e8b04a" : "#7fb3c9";
    e.classList.toggle("sel", selOp === i); e.classList.toggle("off", o.on === false);
    const em = e.querySelector(".h em"); em.textContent = car ? "CARRIER" : "MODULATOR"; em.style.background = col;
    e.querySelector(".fq").textContent = freqText(o); e.querySelector(".md").textContent = o.mode ? "Hz" : "RATIO"; e.querySelector(".dt").textContent = sgn(o.det - 7);
    const b = e.querySelector(".bar i"); b.style.width = o.ol / 99 * 100 + "%"; b.style.background = col; e.querySelector(".ol").textContent = o.ol;
    e.querySelectorAll("[data-r] b").forEach((x, k)=>x.textContent = o.r[k]); e.querySelectorAll("[data-l] b").forEach((x, k)=>x.textContent = o.l[k]);
    e.querySelector("[data-k=kvs] b").textContent = o.kvs; e.querySelector("[data-k=rs] b").textContent = o.rs; e.querySelector("[data-k=ams] b").textContent = o.ams;
    e.querySelector(".ksb b").textContent = (o.ld || o.rd) ? `${noteName(o.bp + 21)} ${o.ld ? CRV[o.lc] + o.ld : ""} ${o.rd ? CRV[o.rc] + o.rd : ""}` : "0"; e.querySelector(".mdb b").textContent = o.mode ? "FIXED" : "RATIO";
    e.querySelector("[data-s=bp] b").textContent = noteName(o.bp + 21); e.querySelector("[data-s=ld] b").textContent = o.ld; e.querySelector("[data-s=rd] b").textContent = o.rd;
    e.querySelector("[data-c=lc] b").textContent = CRV[o.lc]; e.querySelector("[data-c=rc] b").textContent = CRV[o.rc];
    e.querySelector(".meter").style.background = col;
    drawEnv(e.querySelector("canvas"), o.r, o.l, col); });
}
function drawPE(){ const v = V(); drawEnv($("#pe"), v.pr, v.pl, "#d9a441", true); $("#pen").querySelectorAll("[data-r] b").forEach((x, k)=>x.textContent = v.pr[k]); $("#pen").querySelectorAll("[data-l] b").forEach((x, k)=>x.textContent = v.pl[k]); }
function buildDeep(){
  $("#algs").innerHTML = Array.from({ length:32 }, (_, i)=>`<span data-a="${i}">${String(i + 1).padStart(2, "0")}</span>`).join("");
  $("#algs").querySelectorAll("span").forEach(s=>s.onclick = ()=>{ V().alg = +s.dataset.a; changed("ALGORITHM " + (V().alg + 1)); drawAlg(); drawOps(); });
  const ak = $("#algk");
  knob(ak, { label:"FEEDBACK", min:0, max:7, def:0, size:48, color:"var(--m1)", get:()=>V().fb, set:x=>{ V().fb = x; }, after:x=>{ changed("FEEDBACK " + x); drawAlg(); } });
  const tg = (lab, get, set, t)=>{ const w = document.createElement("div"); w.className = "kn"; w.style.cursor = "pointer"; w.title = t; w.innerHTML = `<button class="mb dark" style="height:30px;min-width:64px"></button><b>${lab}</b><em></em>`; ak.appendChild(w);
    const d = ()=>{ const on = get(); w.querySelector("button").className = "mb " + (on ? "on" : "dark"); w.querySelector("button").textContent = on ? "ON" : "OFF"; }; w.onclick = ()=>{ set(!get()); d(); changed(lab + (get() ? " ON" : " OFF")); }; d(); KN.push(d); };
  tg("OSC SYNC", ()=>!!V().oks, x=>V().oks = x ? 1 : 0, "Every note starts its operators from the same phase");
  tg("LFO SYNC", ()=>!!V().lfo.sync, x=>V().lfo.sync = x ? 1 : 0, "The LFO restarts with each note");
  buildOps();
  const pen = $("#pen"); pen.innerHTML = ["R1","R2","R3","R4"].map((l, k)=>`<div data-r="${k}">${l}<br><b></b></div>`).join("") + ["L1","L2","L3","L4"].map((l, k)=>`<div data-l="${k}">${l}<br><b></b></div>`).join("");
  pen.querySelectorAll("[data-r]").forEach(c=>{ const k = +c.dataset.r; dragNum(c, ()=>V().pr[k], x=>{ V().pr[k] = x; changed("PITCH EG R" + (k + 1) + " " + x); drawPE(); }, 0, 99, 2); });
  pen.querySelectorAll("[data-l]").forEach(c=>{ const k = +c.dataset.l; dragNum(c, ()=>V().pl[k], x=>{ V().pl[k] = x; changed("PITCH EG L" + (k + 1) + " " + x); drawPE(); }, 0, 99, 2); });
  envDrag($("#pe"), ()=>V(), "PITCH EG", true);
  const lk = $("#lfok"), L = (k, l, mx, f)=>knob(lk, { label:l, min:0, max:mx, def:0, size:42, color:"var(--m3)", fmt:f, get:()=>V().lfo[k], set:x=>{ V().lfo[k] = x; }, after:x=>changed("LFO " + l + " " + (f ? f(x) : x)) });
  L("wave", "WAVE", 5, x=>["TRI","SAW↓","SAW↑","SQR","SIN","S/H"][x]); L("speed", "SPEED", 99, x=>x + " · " + (0.0628 * Math.exp(x * 0.0713)).toFixed(1) + "Hz"); L("delay", "DELAY", 99); L("pmd", "PMD", 99); L("amd", "AMD", 99); L("pms", "PMS", 7);
  const vk = $("#vk");
  knob(vk, { label:"TRANSPOSE", min:0, max:48, def:24, size:42, color:"var(--m4)", fmt:x=>noteName(x + 36), get:()=>V().trans, set:x=>{ V().trans = x; }, after:x=>{ send({ t:"panic" }); changed("TRANSPOSE " + noteName(x + 36)); } });
  knob(vk, { label:"VOLUME", min:0, max:100, def:85, size:42, color:"var(--m4)", get:()=>ST.perf.vol, set:x=>{ ST.perf.vol = x; }, after:()=>{ applyFx(); save(); } });
  knob(vk, { label:"CHORUS", min:0, max:100, def:35, size:42, color:"var(--m3)", fmt:x=>x + "%", get:()=>ST.fx.chorus, set:x=>{ ST.fx.chorus = x; }, after:()=>{ applyFx(); save(); } });
  knob(vk, { label:"REVERB", min:0, max:100, def:22, size:42, color:"var(--m3)", fmt:x=>x + "%", get:()=>ST.fx.reverb, set:x=>{ ST.fx.reverb = x; }, after:()=>{ applyFx(); save(); } });
}
function drawAll(){ KN.forEach(d=>d()); drawAlg(); drawOps(); drawPE(); drawModes(); lcd(); }
/* pagine */
function page(p){ ST.page = p; document.querySelectorAll(".page").forEach(e=>e.classList.toggle("on", e.id === p)); document.querySelectorAll("#tabs span").forEach(s=>s.classList.toggle("on", s.dataset.p === p)); save(); if(p === "deep") requestAnimationFrame(()=>{ drawOps(); drawPE(); }); }
document.querySelectorAll("#tabs span").forEach(s=>s.onclick = ()=>page(s.dataset.p));
/* luci degli operatori e armonici */
(function loop(){ requestAnimationFrame(loop);
  if(ST.page === "easy") drawSpec();
  else $("#ops").querySelectorAll(".meter").forEach((m, i)=>{ m.style.opacity = Math.min(1, peaks[i] * 1.2); }); })();

/* ===================== S33 BOARD ===================== */
if(BOARD){
  S33.start = ()=>{ if(!S33.started) power(); };
  S33.onClock = ()=>applyFx();
  S33.hexaView = ()=>({ name:V().name, alg:V().alg, pk:peaks, act:active, n:ST.cur });
}
/* ===================== ADATTAMENTO ===================== */
const stage = $("#stage"), fit = $("#fit");
function fitStage(){ const pad = BOARD ? 6 : 14, s = Math.max(.25, Math.min(1.6, (innerWidth - 2 * pad) / 1400, (innerHeight - 2 * pad) / stage.offsetHeight)); fit.style.padding = pad + "px 0"; stage.style.transform = `scale(${s})`; fit.style.height = (stage.offsetHeight * s + 2 * pad) + "px"; }
addEventListener("resize", ()=>{ fitStage(); drawOps(); drawPE(); });
buildEasy(); buildDeep(); drawBank(); page(ST.page); drawAll(); fitStage();
if(!BOARD && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)) addEventListener("load", ()=>{ navigator.serviceWorker.register("sw.js").then(r=>r.update()).catch(()=>{}); });
