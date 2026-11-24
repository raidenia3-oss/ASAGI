// --- SomaFM radio: 30+ canales sin anuncios, streams MP3 publicos sin key ---
(function initSomaFM() {
  var API = 'https://api.somafm.com/channels.json';
  var cache = null, cacheTs = 0;
  var audio = null, actual = null;

  function recordar(id) { try { localStorage.setItem('asagi-soma-last', id || ''); } catch (e) {} }
  function ultimo() { try { return localStorage.getItem('asagi-soma-last') || ''; } catch (e) { return ''; } }

  function asegurarAudio() {
    if (audio) return audio;
    audio = document.createElement('audio');
    audio.crossOrigin = 'anonymous';
    return audio;
  }

  function detener() {
    if (audio) { try { audio.pause(); audio.src = ''; } catch (e) {} }
    actual = null;
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
    return /^(?:pon (?:radio|musica|musica de fondo)|soma fm|soma|radio ambiental|radio para (?:trabajar|concentrar)|cambia de (?:radio|emisora)|lista radios|canales de radio|que radios hay|emisoras disponibles|apaga(?:r)? (?:la )?radio|quita (?:la )?radio|para (?:la )?radio|silencia (?:la )?radio|que radio suena|que estoy escuchando)/.test(t);
  }

  function ejecutar(texto) {
    var t = String(texto || '').toLowerCase().trim();
    if (/^(?:apaga(?:r)? (?:la )?radio|quita (?:la )?radio|para (?:la )?radio|silencia (?:la )?radio)$/.test(t)) {
      if (!actual) return Promise.resolve('📻 No hay radio sonando.');
      detener(); return Promise.resolve('📻 Radio apagada.');
    }
    if (/^(?:que radio suena|que estoy escuchando)$/.test(t)) {
      return Promise.resolve(actual ? '📻 ' + actual.title + ' (' + actual.id + ').' : '📻 No hay radio sonando. Di «pon radio» o «pon radio ambiental».');
    }
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
      // sin nombre: retoma el último canal que pusiste; si no hay, el primero.
      var buscar = nombre || ultimo() || (chans[0] && chans[0].id);
      var canal = buscarCanal(chans, buscar) || (chans[0] || null);
      if (!canal) {
        var sug = [];
        for (var i = 0; i < Math.min(chans.length, 6); i++) sug.push(chans[i].id);
        return 'No encontré «' + nombre + '». Canales: ' + sug.join(', ') + '. Di "lista radios" para ver todos.';
      }
      var url = 'https://ice1.somafm.com/' + canal.id + '-128-mp3';   // el mount necesita el sufijo o es 404
      detener();
      var a = asegurarAudio();
      a.src = url;
      a.play().catch(function () { /* el navegador puede bloquear autoplay sin interaccion previa */ });
      actual = canal; recordar(canal.id);                            // lo recuerdo para el próximo «pon radio»
      return '🎵 SomaFM: ' + canal.title + ' (' + canal.id + ').\n' + (canal.description || '');
    });
  }

  window.AsagiSoma = { esComando: esComando, ejecutar: ejecutar, fetchChannels: fetchChannels, detener: detener };
})();
