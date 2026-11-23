// --- SomaFM radio: 30+ canales sin anuncios, streams MP3 publicos sin key ---
(function initSomaFM() {
  var API = 'https://api.somafm.com/channels.json';
  var cache = null, cacheTs = 0;
  var audio = null;

  function asegurarAudio() {
    if (audio) return audio;
    audio = document.createElement('audio');
    audio.crossOrigin = 'anonymous';
    return audio;
  }

  function detener() {
    if (audio) { try { audio.pause(); audio.src = ''; } catch (e) {} }
  }

  function fetchChannels() {
    var ahora = Date.now();
    if (cache && ahora - cacheTs < 30 * 60 * 1000) return Promise.resolve(cache);
    return fetch(API, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      var chans = (data && data.channels) || data || [];
      cache = chans; cacheTs = ahora;
      return chans;
    }).catch(function () { return cache || []; });
  }

  function buscarCanal(chans, nombre) {
    var n = String(nombre || '').toLowerCase().trim();
    for (var i = 0; i < chans.length; i++) {
      var c = chans[i];
      if (!c || typeof c !== 'object') continue;
      var cid = String(c.id || '').toLowerCase();
      var ct = String(c.title || '').toLowerCase();
      var cd = String(c.description || '').toLowerCase();
      if (n === cid || ct.indexOf(n) >= 0 || cd.indexOf(n) >= 0) return c;
    }
    return null;
  }

  function esComando(texto) {
    var t = String(texto || '').toLowerCase().trim();
    return /^(?:pon (?:radio|musica|musica de fondo)|soma fm|soma|radio ambiental|radio para (?:trabajar|concentrar)|cambia de (?:radio|emisora)|lista radios|canales de radio|que radios hay|emisoras disponibles)/.test(t);
  }

  function ejecutar(texto) {
    var t = String(texto || '').toLowerCase().trim();
    var m = t.match(/^(?:pon (?:radio|musica|musica de fondo)|soma fm|soma|cambia de (?:radio|emisora))\s+(.+)$/);
    var nombre = m ? m[1] : '';
    var listar = /^(?:lista radios|canales de radio|que radios hay|emisoras disponibles)$/.test(t);

    if (listar) {
      return fetchChannels().then(function (chans) {
        var lineas = ['SomaFM - canales disponibles:'];
        for (var i = 0; i < Math.min(chans.length, 12); i++) {
          var c = chans[i];
          lineas.push('- ' + c.id + ': ' + c.title);
        }
        if (chans.length > 12) lineas.push('... y ' + (chans.length - 12) + ' mas.');
        lineas.push('Di "pon radio <nombre>" para escuchar.');
        return lineas.join('\n');
      });
    }

    return fetchChannels().then(function (chans) {
      var canal = buscarCanal(chans, nombre || (chans[0] && chans[0].id));
      if (!canal) {
        var sug = [];
        for (var i = 0; i < Math.min(chans.length, 6); i++) sug.push(chans[i].id);
        return 'No encontré «' + nombre + '». Canales: ' + sug.join(', ') + '. Di "lista radios" para ver todos.';
      }
      var url = 'https://ice1.somafm.com/' + canal.id;
      detener();
      var a = asegurarAudio();
      a.src = url;
      a.play().catch(function () { /* el navegador puede bloquear autoplay sin interaccion previa */ });
      return '🎵 SomaFM: ' + canal.title + ' (' + canal.id + '). Reproduciendo ' + url + '.\n' + (canal.description || '');
    });
  }

  window.AsagiSoma = { esComando: esComando, ejecutar: ejecutar, fetchChannels: fetchChannels, detener: detener };
})();
