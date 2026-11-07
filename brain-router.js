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
          return { texto: texto, backend: (res && res.backend) || chain[i], degradado: degradado || i > 0 };
        } catch(e){ degradado = true; }
      }
      // sin ningún cerebro disponible -> respuesta de prueba o eco, marcado honesto
      if(this.testFn){ try { return { texto: String(this.testFn(prompt)), backend: 'prueba', degradado: true }; } catch(e){} }
      return { texto: 'No hay cerebro disponible. Pon tu key de Gemini, Mistral o Atria en el Asistente, o descarga el modelo local.', backend: 'ninguno', degradado: true };
    }
  }

  if(typeof window !== 'undefined'){
    window.AsagiBrainRouter = {
      BrainRouter: BrainRouter,
      geminiResponder: geminiResponder,
      mistralResponder: mistralResponder,
      atriaResponder: atriaResponder,
      classifyPrompt: classifyPrompt
    };
  }
  if(typeof module !== 'undefined' && module.exports){
    module.exports = { BrainRouter: BrainRouter, geminiResponder: geminiResponder, mistralResponder: mistralResponder, atriaResponder: atriaResponder, classifyPrompt: classifyPrompt };
  }
})();
