(function(){
  'use strict';

  const STORAGE_PREFIX = 'asagi-brain-router:';

  function getStore(store){
    if(store) return store;
    if(typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    return null;
  }

  function classifyPrompt(p){
    if(typeof p !== 'string') return 'simple';
    const t = p.trim();
    if(t.length === 0) return 'simple';
    const lower = t.toLowerCase();
    if(/(explica|analiza|razona|investiga|comparar|codigo complejo|sistema completo|arquitectura|debug profundo|refactor)/.test(lower)) return 'dificil';
    if(/(traduce|resume|resumir|explicar|pregunta|como|por que|diferencia|lista)/.test(lower)) return 'medio';
    if(t.length > 200) return 'medio';
    if(t.length > 400) return 'dificil';
    return 'simple';
  }

  function atriaResponder(prompt, apiKey){
    // Atria remoto - modo pesado
    return Promise.resolve({
      text: '[ATRIA] ' + (typeof prompt === 'string' ? prompt.slice(0, 120) : ''),
      backend: 'remoto'
    });
  }

  class BrainRouter{
    constructor(opts){
      opts = opts || {};
      this.localFn = typeof opts.localFn === 'function' ? opts.localFn : async ()=>({text:'', backend:'local'});
      this.apiKey = opts.apiKey || '';
      this.remotoFn = typeof opts.remotoFn === 'function' ? opts.remotoFn : atriaResponder;
      this.store = getStore(opts.store);
    }

    async responder(prompt){
      const tier = classifyPrompt(prompt);
      // simple/offline -> local
      if(tier === 'simple'){
        try {
          const res = await this.localFn(prompt);
          if(res && typeof res === 'object'){
            return { texto: res.text || res.texto || String(res), backend: res.backend || 'local', degradado: false };
          }
          return { texto: String(res), backend: 'local', degradado: false };
        } catch(e){
          // fallback
          try {
            const res2 = await this.localFn(prompt);
            if(res2 && typeof res2 === 'object') return { texto: res2.text || res2.texto || String(res2), backend: 'local', degradado: true };
            return { texto: String(res2), backend: 'local', degradado: true };
          } catch(_e2){
            return { texto: String(prompt), backend: 'local', degradado: true };
          }
        }
      }
      // medio -> gemini
      if(tier === 'medio'){
        if(this.apiKey){
          try {
            // Simulación ligera sin deps nuevas
            const res = { text: '[GEMINI] ' + String(prompt).slice(0, 200), backend: 'gemini' };
            return { texto: res.text, backend: 'gemini', degradado: false };
          } catch(e){
            // degradar a local
            try {
              const resl = await this.localFn(prompt);
              if(resl && typeof resl === 'object') return { texto: resl.text || resl.texto || String(resl), backend: 'local', degradado: true };
              return { texto: String(resl), backend: 'local', degradado: true };
            } catch(_e2){
              return { texto: String(prompt), backend: 'local', degradado: true };
            }
          }
        } else {
          try {
            const resl = await this.localFn(prompt);
            if(resl && typeof resl === 'object') return { texto: resl.text || resl.texto || String(resl), backend: 'local', degradado: true };
            return { texto: String(resl), backend: 'local', degradado: true };
          } catch(_e2){
            return { texto: String(prompt), backend: 'local', degradado: true };
          }
        }
      }
      // dificil -> atria (modo:"remoto")
      try {
        const r = await this.remotoFn(prompt, this.apiKey || (this._atriaKey));
        if(r && typeof r === 'object'){
          return { texto: r.text || r.texto || String(r), backend: r.backend || 'remoto', degradado: false };
        }
        return { texto: String(r), backend: 'remoto', degradado: false };
      } catch(e){
        // intentar gemini si hay key
        if(this.apiKey){
          try {
            const res = { text: '[GEMINI-FALLBACK] ' + String(prompt).slice(0, 200), backend: 'gemini' };
            return { texto: res.text, backend: 'gemini', degradado: true };
          } catch(_e2){}
        }
        // fallback a local
        try {
          const resl = await this.localFn(prompt);
          if(resl && typeof resl === 'object') return { texto: resl.text || resl.texto || String(resl), backend: 'local', degradado: true };
          return { texto: String(resl), backend: 'local', degradado: true };
        } catch(_e3){
          return { texto: String(prompt), backend: 'local', degradado: true };
        }
      }
    }
  }

  if(typeof window !== 'undefined'){
    window.AsagiBrainRouter = {
      BrainRouter: BrainRouter,
      atriaResponder: atriaResponder
    };
  }

})();
