(function(){
  'use strict';

  // Clasifica la dificultad del prompt para elegir backend.
  function classifyPrompt(p){
    if(typeof p !== 'string') return 'simple';
    const t = p.trim(); if(t.length === 0) return 'simple';
    const lower = t.toLowerCase();
    if(/(explica|analiza|razona|investiga|comparar|codigo complejo|sistema completo|arquitectura|debug profundo|refactor)/.test(lower)) return 'dificil';
    if(t.length > 400) return 'dificil';
    if(/(traduce|resume|resumir|explicar|pregunta|como|por que|diferencia|lista)/.test(lower)) return 'medio';
    if(t.length > 200) return 'medio';
    return 'simple';
  }

  // --- Responders REALES (fetch). Devuelven {text, backend}. Lanzan si fallan. ---

  // Gemini (Google Generative Language API). Formato propio de Google.
  async function geminiResponder(prompt, key, model){
    model = model || 'gemini-3.8-flash';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key);
    const body = { contents: [{ parts: [{ text: prompt }] }] };
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if(!r.ok) throw new Error('gemini ' + r.status);
    const j = await r.json();
    const cand = j && j.candidates && j.candidates[0];
    const text = (cand && cand.content && cand.content.parts || []).map(function(p){ return p.text || ''; }).join('');
    if(!text) throw new Error('gemini vacío');
    return { text: text, backend: 'gemini' };
  }

  // Mistral (OpenAI-compatible). Fuerte en código (codestral).
  async function mistralResponder(prompt, key, model){
    model = model || 'mistral-small-latest';
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer ' + key},
      body: JSON.stringify({ model: model, messages: [{ role:'user', content: prompt }] })
    });
    if(!r.ok) throw new Error('mistral ' + r.status);
    const j = await r.json();
    const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
    if(!text) throw new Error('mistral vacío');
    return { text: text, backend: 'mistral' };
  }

  // Atria (OpenAI-compatible).
  async function atriaResponder(prompt, key, model){
    model = model || 'Atria-Dawn';
    const r = await fetch('https://api.atria-asi.ai/v1/chat/completions', {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer ' + key},
      body: JSON.stringify({ model: model, messages: [{ role:'user', content: prompt }] })
    });
    if(!r.ok) throw new Error('atria ' + r.status);
    const j = await r.json();
    const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
    if(!text) throw new Error('atria vacío');
    return { text: text, backend: 'atria' };
  }


  // --- Keys gratis en cadena (idea de OmniRoute, pero dentro de la app, sin servidor) ---
  // Proveedores compatibles con OpenAI. Cada uno con su plan gratis; si una key se agota (429) o
  // es rechazada (401/403) se "enfría" y se pasa sola a la siguiente.
  const PROVEEDORES = {
    groq:       { url: 'https://api.groq.com/openai/v1/chat/completions', modelo: 'llama-3.3-70b-versatile' },
    openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', modelo: 'meta-llama/llama-3.3-70b-instruct:free' },
    cerebras:   { url: 'https://api.cerebras.ai/v1/chat/completions', modelo: 'gpt-oss-120b' },
    mistral:    { url: 'https://api.mistral.ai/v1/chat/completions', modelo: 'mistral-small-latest' },
    atria:      { url: 'https://api.atria-asi.ai/v1/chat/completions', modelo: 'Atria-Dawn' },
    github:     { url: 'https://models.github.ai/inference/chat/completions', modelo: 'openai/gpt-4.1-mini' }
  };

  async function openaiResponder(prov, prompt, key, model){
    const P = PROVEEDORES[prov]; if(!P) throw new Error('proveedor desconocido ' + prov);
    const r = await fetch(P.url, {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer ' + key},
      body: JSON.stringify({ model: model || P.modelo, messages: [{ role:'user', content: prompt }] })
    });
    if(!r.ok){ const e = new Error(prov + ' ' + r.status); e.status = r.status; throw e; }
    const j = await r.json();
    const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
    if(!text) throw new Error(prov + ' vacío');
    return { text: text, backend: prov };
  }

  // "groq: gsk_…" | "openrouter/modelo:free: sk-or-…" | "gemini: AIza…"  (una por línea; # = comentario). PURO.
  function parsearClaves(texto){
    const out = [];
    String(texto || '').split(/[\n;]+/).forEach(function(l){
      l = l.trim(); if(!l || l[0] === '#') return;
      const m = l.match(/^([a-zA-Z]+)(?:\/(\S+?))?\s*[:=]\s*(\S+)$/);
      if(!m) return;
      const prov = m[1].toLowerCase();
      if(prov !== 'gemini' && !PROVEEDORES[prov]) return;
      out.push({ prov: prov, modelo: m[2] || '', key: m[3] });
    });
    return out;
  }

  const K_FRIO = 'asagi-keys-frio';
  function _id(c){ return c.prov + ':' + String(c.key).slice(-6); }
  function _frio(store){ try { return JSON.parse((store && store.getItem(K_FRIO)) || '{}'); } catch(e){ return {}; } }
  // Cuánto descansa una key según el error: agotada 15 min, rechazada 12 h, otro fallo 1 min.
  function descanso(status){ return status === 429 ? 15*60e3 : (status === 401 || status === 403) ? 12*3600e3 : 60e3; }

  // Arma UNA función que prueba las keys en orden, saltando las que están descansando.
  function cadena(claves, opts){
    opts = opts || {};
    const store = opts.store || (typeof window !== 'undefined' ? window.localStorage : null);
    const ahora = opts.ahora || function(){ return Date.now(); };
    const llamar = opts.llamar || function(c, p){ return c.prov === 'gemini' ? geminiResponder(p, c.key, c.modelo || undefined) : openaiResponder(c.prov, p, c.key, c.modelo || undefined); };
    if(!claves || !claves.length) return null;
    return async function(prompt){
      const frio = _frio(store), t = ahora();
      // las que descansan van al final (por si todas descansan, igual se intenta)
      const orden = claves.filter(function(c){ return !(frio[_id(c)] > t); }).concat(claves.filter(function(c){ return frio[_id(c)] > t; }));
      let ultimo = null;
      for(let i = 0; i < orden.length; i++){
        try { return await llamar(orden[i], prompt); }
        catch(e){
          ultimo = e;
          const st = e && (e.status || parseInt((String(e.message).match(/\b(\d{3})\b/) || [])[1], 10));
          frio[_id(orden[i])] = ahora() + descanso(st);
          try { store && store.setItem(K_FRIO, JSON.stringify(frio)); } catch(e2){}
        }
      }
      throw ultimo || new Error('sin keys');
    };
  }

  // Desde el estado del cerebro (campos de siempre + la lista extra) arma geminiFn y remotoFn.
  // Las casillas Gemini/Mistral/Atria aceptan varias keys separadas por coma.
  function armarNube(b, opts){
    b = b || {};
    const lista = function(v){ return String(v || '').split(/[,\s]+/).map(function(x){ return x.trim(); }).filter(Boolean); };
    const extra = parsearClaves(b.clavesExtra);
    const gem = lista(b.geminiKey).map(function(k){ return { prov:'gemini', key:k, modelo:'' }; }).concat(extra.filter(function(c){ return c.prov === 'gemini'; }));
    const rem = lista(b.mistralKey).map(function(k){ return { prov:'mistral', key:k, modelo:(opts && opts.modeloMistral) || '' }; })
      .concat(extra.filter(function(c){ return c.prov !== 'gemini'; }))
      .concat(lista(b.atriaKey).map(function(k){ return { prov:'atria', key:k, modelo:'' }; }));
    // si un lado no tiene keys, usa las del otro como respaldo
    const g = cadena(gem.length ? gem.concat(rem) : [], opts), r = cadena(rem.length ? rem.concat(gem) : [], opts);
    return { geminiFn: g, remotoFn: r, hay: gem.length + rem.length };
  }

  // Router: elige backend por dificultad y degrada en cadena si uno falla.
  class BrainRouter{
    constructor(opts){
      opts = opts || {};
      this.localFn = typeof opts.localFn === 'function' ? opts.localFn : null;   // modelo nativo
      this.geminiFn = typeof opts.geminiFn === 'function' ? opts.geminiFn : null;
      this.remotoFn = typeof opts.remotoFn === 'function' ? opts.remotoFn : null; // mistral o atria
      this.testFn = typeof opts.testFn === 'function' ? opts.testFn : null;       // respuesta de prueba
      this.apiKey = opts.apiKey || '';
      this.store = opts.store || (typeof window !== 'undefined' ? window.localStorage : null);
    }

    _fn(step){ return step === 'local' ? this.localFn : step === 'gemini' ? this.geminiFn : step === 'remoto' ? this.remotoFn : null; }

    async responder(prompt){
      const tier = classifyPrompt(prompt);
      const chain = tier === 'simple' ? ['local','gemini','remoto']
                  : tier === 'medio' ? ['gemini','local','remoto']
                  : ['remoto','gemini','local'];
      let degradado = false;
      for(let i=0; i<chain.length; i++){
        const fn = this._fn(chain[i]);
        if(typeof fn !== 'function') continue;
        try {
          const res = await fn(prompt);
          const texto = (res && typeof res === 'object') ? (res.text || res.texto || '') : String(res || '');
          if(!texto) throw new Error('vacío');
          return { texto: texto, backend: (res && res.backend) || chain[i], degradado: degradado };   // degradado solo si un cerebro de verdad falló
        } catch(e){ degradado = true; }
      }
      // sin ningún cerebro disponible -> respuesta de prueba o eco, marcado honesto
      if(this.testFn){ try { return { texto: String(this.testFn(prompt)), backend: 'prueba', degradado: true }; } catch(e){} }
      return { texto: 'No hay cerebro disponible. Pon una key gratis (Gemini, Groq, OpenRouter, Cerebras, Mistral…) en el Asistente, o descarga el modelo local.', backend: 'ninguno', degradado: true };
    }
  }

  if(typeof window !== 'undefined'){
    window.AsagiBrainRouter = {
      BrainRouter: BrainRouter,
      geminiResponder: geminiResponder,
      mistralResponder: mistralResponder,
      atriaResponder: atriaResponder,
      classifyPrompt: classifyPrompt,
      openaiResponder: openaiResponder, parsearClaves: parsearClaves, cadena: cadena, armarNube: armarNube, PROVEEDORES: PROVEEDORES
    };
  }
  if(typeof module !== 'undefined' && module.exports){
    module.exports = { BrainRouter: BrainRouter, geminiResponder: geminiResponder, mistralResponder: mistralResponder, atriaResponder: atriaResponder, classifyPrompt: classifyPrompt,
      openaiResponder: openaiResponder, parsearClaves: parsearClaves, cadena: cadena, armarNube: armarNube, PROVEEDORES: PROVEEDORES };
  }
})();
