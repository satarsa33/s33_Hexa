/* S33 - Hexa: motore FM a 6 operatori, 16 voci.
   Inviluppi, scaling di tastiera, velocity e livelli in "passi" logaritmici da 0.75 dB come sul DX7
   (seguendo il modello del progetto open source msfa / Dexed, riscritto da zero). */
const SC20 = [0,5,9,13,17,20,23,25,27,29,31,33,35,37,39,41,42,43,45,46];
const sc = l=>l >= 20 ? 28 + l : SC20[Math.max(0, l | 0)];          // livello 0..99 → passi 0..127
const EXPD = [0,1,2,3,4,5,6,7,8,9,11,14,16,19,23,27,33,39,47,56,66,80,94,112,133,158,188,224,256,256,256,256,256];
function curve(group, depth, c){ let s = (c === 0 || c === 3) ? (group * depth * 329) >> 12 : (EXPD[Math.min(group, 32)] * depth * 329) >> 15; return c < 2 ? -s : s; }
function kbdScale(n, op){ const off = n - op.bp - 17; return off >= 0 ? curve(((off + 1) / 3) | 0, op.rd, op.rc) : curve(((-(off - 1)) / 3) | 0, op.ld, op.lc); }
function velScale(vel, sens){ const v = 254 * Math.sqrt(Math.max(1, vel) / 127) - 239; return sens * v / 16; }
/* algoritmi: per ogni operatore (1..6) gli operatori che modula; carrier = esce in audio; fb = [da, a] */
const ALG = [
 {m:{2:[1],4:[3],5:[4],6:[5]}, c:[1,3], fb:[6,6]}, {m:{2:[1],4:[3],5:[4],6:[5]}, c:[1,3], fb:[2,2]},
 {m:{2:[1],3:[2],5:[4],6:[5]}, c:[1,4], fb:[6,6]}, {m:{2:[1],3:[2],5:[4],6:[5]}, c:[1,4], fb:[4,6]},
 {m:{2:[1],4:[3],6:[5]}, c:[1,3,5], fb:[6,6]}, {m:{2:[1],4:[3],6:[5]}, c:[1,3,5], fb:[5,6]},
 {m:{2:[1],4:[3],5:[3],6:[5]}, c:[1,3], fb:[6,6]}, {m:{2:[1],4:[3],5:[3],6:[5]}, c:[1,3], fb:[4,4]},
 {m:{2:[1],4:[3],5:[3],6:[5]}, c:[1,3], fb:[2,2]}, {m:{2:[1],3:[2],5:[4],6:[4]}, c:[1,4], fb:[3,3]},
 {m:{2:[1],3:[2],5:[4],6:[4]}, c:[1,4], fb:[6,6]}, {m:{2:[1],4:[3],5:[3],6:[3]}, c:[1,3], fb:[2,2]},
 {m:{2:[1],4:[3],5:[3],6:[3]}, c:[1,3], fb:[6,6]}, {m:{2:[1],4:[3],5:[4],6:[4]}, c:[1,3], fb:[6,6]},
 {m:{2:[1],4:[3],5:[4],6:[4]}, c:[1,3], fb:[2,2]}, {m:{2:[1],3:[1],4:[3],5:[1],6:[5]}, c:[1], fb:[6,6]},
 {m:{2:[1],3:[1],4:[3],5:[1],6:[5]}, c:[1], fb:[2,2]}, {m:{2:[1],3:[1],4:[1],5:[4],6:[5]}, c:[1], fb:[3,3]},
 {m:{2:[1],3:[2],6:[4,5]}, c:[1,4,5], fb:[6,6]}, {m:{3:[1,2],5:[4],6:[4]}, c:[1,2,4], fb:[3,3]},
 {m:{3:[1,2],6:[4,5]}, c:[1,2,4,5], fb:[3,3]}, {m:{2:[1],6:[3,4,5]}, c:[1,3,4,5], fb:[6,6]},
 {m:{3:[2],6:[4,5]}, c:[1,2,4,5], fb:[6,6]}, {m:{6:[3,4,5]}, c:[1,2,3,4,5], fb:[6,6]},
 {m:{6:[4,5]}, c:[1,2,3,4,5], fb:[6,6]}, {m:{3:[2],5:[4],6:[4]}, c:[1,2,4], fb:[6,6]},
 {m:{3:[2],5:[4],6:[4]}, c:[1,2,4], fb:[3,3]}, {m:{2:[1],4:[3],5:[4]}, c:[1,3,6], fb:[5,5]},
 {m:{4:[3],6:[5]}, c:[1,2,3,5], fb:[6,6]}, {m:{4:[3],5:[4]}, c:[1,2,3,6], fb:[5,5]},
 {m:{6:[5]}, c:[1,2,3,4,5], fb:[6,6]}, {m:{}, c:[1,2,3,4,5,6], fb:[6,6]}];
const PMS = [0, 10, 20, 33, 55, 92, 153, 255], AMS = [0, 10, 22, 50];
const TL = 4096, TAB = new Float32Array(TL + 1); for(let i = 0; i <= TL; i++) TAB[i] = Math.sin(i / TL * 2 * Math.PI);
const SIN = p=>{ p -= Math.floor(p); const x = p * TL, i = x | 0; return TAB[i] + (TAB[i + 1] - TAB[i]) * (x - i); };
const lfoF = s=>0.0628 * Math.exp(s * 0.0713);
const peSemi = l=>{ const d = (l - 50) / 50; return Math.sign(d) * Math.pow(Math.abs(d), 1.6) * 48; };
class Env {
  constructor(){ this.e = 0; this.st = 4; this.down = false; }
  start(){ this.down = true; this.st = 0; this.set(); }
  rel(){ this.down = false; this.st = 3; this.set(); }
  set(){ const L = this.L[this.st]; this.tg = sc(L); this.rising = this.tg > this.e; if(this.rising && this.e < 53 && this.st < 3) this.e = 53;
    const q = Math.min(63, ((this.R[this.st] * 41) >> 6) + this.rsc); this.inc = (4 + (q & 3)) * Math.pow(2, (q >> 2) - 19) * this.k; }
  step(n){ // avanza di n campioni, ritorna il livello in passi (0..127)
    if(this.st > 3) return this.e;
    if(this.st === 3 && !this.down){ /* release */ }
    else if(this.st === 2 && this.down && this.e === this.tg) return this.e;  // sustain
    let d = this.inc * n;
    if(this.rising){ d *= 1.1 + (127 - this.e) / 127 * 9; this.e += d; if(this.e >= this.tg){ this.e = this.tg; this.next(); } }
    else { this.e -= d; if(this.e <= this.tg){ this.e = this.tg; this.next(); } }
    return this.e;
  }
  next(){ if(this.st < 2){ this.st++; this.set(); } else if(this.st === 3) this.st = 4; }
}
class Voice {
  constructor(){ this.note = -1; this.on = false; this.age = 0; this.ops = [0,1,2,3,4,5].map(()=>({ ph:0, y1:0, y2:0, env:new Env(), g:0, gt:0, f:0, base:0, out:0 }));
    this.pe = { e:50, st:4, t:0 }; this.f0 = 440; this.ft = 440; this.lfoAge = 0; }
}
class Hexa extends AudioWorkletProcessor {
  constructor(){
    super(); this.V = null; this.vs = Array.from({ length:16 }, ()=>new Voice()); this.t = 0; this.lfoPh = 0; this.sh = 0; this.bend = 0; this.wheel = 0;
    this.P = { mode:0, bendR:2, glide:0, poly:16, vsx:1, perf:{ bright:0, atk:0, dec:0, rel:0, metal:0 } }; this.held = []; this.sus = false;
    this.port.onmessage = e=>this.msg(e.data); this.peak = new Float32Array(6); this.cnt = 0;
  }
  msg(m){
    if(m.t === "voice"){ this.V = m.v; this.vs.forEach(v=>{ if(v.note >= 0 && (v.on || v.ops.some(o=>o.env.st < 4))) this.prep(v, v.note, v.vel, false); }); return; }
    if(m.t === "p"){ Object.assign(this.P, m.p); if(this.V) this.vs.forEach(v=>{ if(v.note >= 0) this.prep(v, v.note, v.vel, false); }); return; }
    // le note possono arrivare con l'istante in cui devono suonare (nella Mother Board): si tengono in coda fino ad allora
    if((m.t === "on" || m.t === "off") && m.at > currentTime + .0015){ const q = this.tq || (this.tq = []); q.push(m); if(q.length > 1 && q[q.length - 2].at > m.at) q.sort((x, y)=>x.at - y.at); return; }
    if(m.t === "on") return this.noteOn(m.n, m.v);
    if(m.t === "off") return this.noteOff(m.n);
    if(m.t === "bend"){ this.bend = m.v; return; }
    if(m.t === "wheel"){ this.wheel = m.v; return; }
    if(m.t === "sus"){ this.sus = m.v; if(!m.v) this.vs.forEach(v=>{ if(v.susp){ v.susp = false; this.release(v); } }); return; }
    if(m.t === "panic"){ this.tq = []; this.held = []; this.vs.forEach(v=>{ v.on = false; v.note = -1; v.susp = false; v.ops.forEach(o=>{ o.env.st = 4; o.env.e = 0; o.g = o.gt = 0; }); }); return; }
  }
  /* calcola frequenze e livelli fissi di un operatore per questa nota (si rifà anche quando cambia la voce) */
  prep(v, n, vel, trig){
    const V = this.V, P = this.P, pf = P.perf, A = ALG[V.alg], sr = sampleRate;
    v.alg = A; v.vel = vel;
    const nt = n + (V.trans - 24);
    for(let i = 0; i < 6; i++){
      const op = V.ops[i], o = v.ops[i], car = A.c.includes(i + 1);
      let f;
      if(op.mode){ f = Math.pow(10, op.fc & 3) * Math.pow(10, op.ff / 100); }
      else { let r = (op.fc === 0 ? .5 : op.fc) * (1 + op.ff / 100); if(!car && pf.metal) r *= 1 + pf.metal * .0021 * (i + 1) * (i % 2 ? 1 : -1); f = r; }
      o.mult = op.mode ? 0 : f; o.fixed = op.mode ? f : 0; o.det = Math.pow(2, (op.det - 7) * 0.0031 / 1);
      let lvl = sc(op.ol) + kbdScale(nt, op) + velScale(vel, Math.min(7, op.kvs * P.vsx));
      if(!car) lvl += pf.bright * 1.0;
      lvl = Math.max(0, Math.min(127, lvl)); o.lvl = lvl; o.car = car; o.ams = op.ams; o.on = op.on !== false;
      const env = o.env, rsc = (op.rs * Math.min(31, Math.max(0, ((nt / 3) | 0) - 7))) >> 3;
      env.R = op.r.slice(); env.L = op.l.slice(); env.rsc = rsc; env.k = 49096 / sr;
      if(car){ env.R[0] = Math.max(0, Math.min(99, env.R[0] - pf.atk)); env.R[1] = Math.max(0, Math.min(99, env.R[1] - pf.dec)); env.R[2] = Math.max(0, Math.min(99, env.R[2] - pf.dec)); env.R[3] = Math.max(0, Math.min(99, env.R[3] - pf.rel)); }
      if(trig){ if(V.oks){ o.ph = 0; } o.y1 = o.y2 = 0; env.start(); }
      else if(env.st < 4) env.set();
    }
    v.fb = V.fb ? Math.pow(2, V.fb - 8) : 0;
  }
  alloc(n){
    let v = this.vs.find(v=>v.note === n);
    if(!v) v = this.vs.find(v=>v.note < 0 || v.ops.every(o=>o.env.st >= 4));
    if(!v){ let best = null; for(const x of this.vs) if(!x.on && (!best || x.age < best.age)) best = x; v = best; }
    if(!v){ let best = this.vs[0]; for(const x of this.vs) if(x.age < best.age) best = x; v = best; }
    return v;
  }
  noteOn(n, vel){
    if(!this.V) return;
    const P = this.P, hz = k=>440 * Math.pow(2, (k + this.V.trans - 24 - 69) / 12);
    if(P.mode > 0){ // mono: una voce sola; in MONO GLIDE le note legate scivolano senza ripartire
      const v = this.vs[0], legato = this.held.length > 0 && v.on;
      this.held = this.held.filter(x=>x !== n); this.held.push(n);
      this.vs.forEach((x, i)=>{ if(i && x.on) this.release(x); });
      v.ft = hz(n);
      const trig = !(legato && P.mode === 2);
      if(!(P.mode === 2 && P.glide > 0 && v.note >= 0)) v.f0 = v.ft;
      v.note = n; v.on = true; v.susp = false; v.age = ++this.t; this.prep(v, n, vel, trig);
      if(trig){ v.pe.st = 0; v.pe.e = this.V.pl[3]; v.lfoAge = 0; }
      return;
    }
    const v = this.alloc(n); v.note = n; v.on = true; v.susp = false; v.age = ++this.t; v.f0 = v.ft = hz(n); this.prep(v, n, vel, true);
    v.pe.st = 0; v.pe.e = this.V.pl[3]; v.lfoAge = 0;
  }
  release(v){ v.on = false; v.ops.forEach(o=>o.env.rel()); v.pe.st = 3; }
  noteOff(n){
    if(this.P.mode > 0){
      this.held = this.held.filter(x=>x !== n); const v = this.vs[0]; if(v.note !== n) return;
      if(this.held.length){ const k = this.held[this.held.length - 1]; v.note = k; v.ft = 440 * Math.pow(2, (k + this.V.trans - 24 - 69) / 12); if(this.P.mode === 1){ v.f0 = v.ft; this.prep(v, k, v.vel, true); } return; }
      if(this.sus){ v.susp = true; return; } this.release(v); return;
    }
    this.vs.forEach(v=>{ if(v.note === n && v.on){ if(this.sus) v.susp = true; else this.release(v); } });
  }
  process(_, out){
    if(this.tq && this.tq.length){ const lim = currentTime + .0015; while(this.tq.length && this.tq[0].at <= lim){ const m = this.tq.shift(); m.at = 0; this.msg(m); } }
    const L = out[0][0], R = out[0][1] || out[0][0], N = L.length; L.fill(0); R.fill(0);
    if(!this.V) return true;
    const V = this.V, sr = sampleRate, P = this.P;
    // LFO globale (la forma la sceglie la voce)
    const lf = lfoF(V.lfo.speed); this.lfoPh += lf * N / sr; if(this.lfoPh >= 1){ this.lfoPh -= 1; this.sh = Math.random() * 2 - 1; }
    const ph = this.lfoPh, w = V.lfo.wave;
    const lfo = w === 0 ? (ph < .5 ? 4 * ph - 1 : 3 - 4 * ph) : w === 1 ? 1 - 2 * ph : w === 2 ? 2 * ph - 1 : w === 3 ? (ph < .5 ? 1 : -1) : w === 4 ? Math.sin(ph * 2 * Math.PI) : this.sh;
    const pmd = Math.min(1, V.lfo.pmd / 99 + this.wheel), amd = V.lfo.amd / 99;
    const delayS = V.lfo.delay / 99 * 4;
    const bendSemi = this.bend * P.bendR;
    const glideK = P.glide > 0 ? 1 - Math.exp(-N / (sr * (.01 + P.glide / 100 * 1.2))) : 1;
    for(let k = 0; k < 6; k++) this.peak[k] *= .9;
    for(const v of this.vs){
      if(v.note < 0) continue;
      const ops = v.ops; if(ops.every(o=>o.env.st >= 4)){ v.note = -1; continue; }
      // ritardo dell'LFO per nota
      v.lfoAge += N / sr; const lfoAmt = delayS ? Math.min(1, Math.max(0, (v.lfoAge - delayS * .5) / (delayS * .5 + .001))) : 1;
      // pitch envelope
      const pe = v.pe; if(pe.st < 4){ const tg = V.pl[pe.st], sp = Math.pow(2, V.pr[pe.st] * .12) * .02 * N / sr * 50; if(pe.e < tg){ pe.e = Math.min(tg, pe.e + sp); } else { pe.e = Math.max(tg, pe.e - sp); }
        if(pe.e === tg){ if(pe.st < 2) pe.st++; else if(pe.st === 3) pe.st = 4; } }
      v.f0 += (v.ft - v.f0) * glideK;
      const semi = bendSemi + peSemi(pe.e) + lfo * lfoAmt * pmd * PMS[V.lfo.pms] / 255 * 12;
      const fm = v.f0 * Math.pow(2, semi / 12);
      const A = v.alg, fbSrc = A.fb[0] - 1, fbDst = A.fb[1] - 1;
      // inviluppi: livello a inizio e fine blocco, poi interpolato
      for(let k = 0; k < 6; k++){ const o = ops[k]; o.g = o.gt; const e = o.env.step(N);
        const am = o.ams ? (lfo * lfoAmt + 1) / 2 * amd * AMS[o.ams] : 0;
        const tot = e + o.lvl - 254 - am; o.gt = o.on && o.env.st < 4 && tot > -120 ? Math.pow(2, tot / 8) : 0;
        o.inc = (o.fixed ? o.fixed : fm * o.mult) * o.det / sr; if(o.inc > .49) o.inc = .49; }
      const mods = A.m, fbAmt = v.fb;
      for(let s = 0; s < N; s++){
        const t = (s + 1) / N; let sum = 0;
        const mod = [0,0,0,0,0,0];
        for(let k = 5; k >= 0; k--){
          const o = ops[k]; o.ph += o.inc; if(o.ph >= 1) o.ph -= 1;
          let m = mod[k]; if(k === fbDst && fbAmt){ const src = ops[fbSrc]; m += (src.y1 + src.y2) * .5 * fbAmt; }
          const g = o.g + (o.gt - o.g) * t, y = g ? SIN(o.ph + m) * g : 0;
          o.y2 = o.y1; o.y1 = y;
          const tg = mods[k + 1]; if(tg) for(let j = 0; j < tg.length; j++) mod[tg[j] - 1] += y;
          if(o.car) sum += y;
        }
        L[s] += sum;
      }
      for(let k = 0; k < 6; k++){ const g = ops[k].gt; if(g > this.peak[k]) this.peak[k] = g; }
    }
    for(let s = 0; s < N; s++){ const x = L[s] * .22; L[s] = x; R[s] = x; }
    if(++this.cnt % 8 === 0) this.port.postMessage({ t:"pk", p:Array.from(this.peak), a:this.vs.filter(v=>v.note >= 0).length });
    return true;
  }
}
try{ registerProcessor("s33-hexa", Hexa); }catch(e){}
