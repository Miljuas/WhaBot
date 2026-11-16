const fs = require("fs");
const crypto = require("crypto");
const dbUtils = require("./db");
const {
  PATH_LOG,
  PATH_TELEMETRIA,
  PATH_MEMORIA,
  PATH_MEMORIA_TMP,
  NUMEROS_VIP,
  HORAS_AUTO_DESBLOQUEO_PASO99,
  esNumeroVIP,
} = require("./config");
const { MENSAJE_ACTIVACION } = require("./mensajes");

const PATH_MEMORIA_BAK = `${PATH_MEMORIA}.bak`;

// ============================================================================
// SISTEMA DE MEMORIA PERSISTENTE CON VINCULACIÓN TELÉFONO <-> @LID Y MODO CAÍDA
// ============================================================================
let memoriaDisco = {
  mensajesProcesados: [],
  idsMensajesDelBot: [],
  ultimoTsIntervencionManual: {},
  esperandoComprobante: {},
  mapaContactos: {},
  infoPaso99: {},
  buzonPaso99: {},
  ultimoPasoValido: {},
  historialChat: {},
  operadorDetectado: {},
  credencialesEnviadas: {},
  soporteNivel1Enviado: {},
  ventasProactivas: {},
  chequeoInicialEnviado: {}, // { numeroLimpioOUserVeltrix: timestampSegundos } -> Chequeo de los 30 min
  seguimientoPruebaEnviado: {}, // { numeroLimpioOUserVeltrix: timestampSegundos } -> Aviso de las 20 hs
  modoCaidaActivo: false, // Pausa global cuando se envía el comando VIP "caida"
  tsInicioCaida: 0, // Timestamp (segundos) en que se activó el modo caída
  colaCaida: {}, // { numeroLimpio: { remoteJid, textos:[], textoCitado:"", idsMensajes:[], tsPrimerMensaje, tsUltimoMensaje } }
};

function hidratarObjetoMemoria(data) {
  if (!data || typeof data !== "object") return false;
  memoriaDisco.mensajesProcesados = Array.isArray(data.mensajesProcesados)
    ? data.mensajesProcesados
    : [];
  memoriaDisco.idsMensajesDelBot = Array.isArray(data.idsMensajesDelBot)
    ? data.idsMensajesDelBot
    : [];
  memoriaDisco.ultimoTsIntervencionManual =
    data.ultimoTsIntervencionManual || {};
  memoriaDisco.esperandoComprobante = data.esperandoComprobante || {};
  memoriaDisco.mapaContactos = data.mapaContactos || {};
  memoriaDisco.infoPaso99 = data.infoPaso99 || {};
  memoriaDisco.buzonPaso99 = data.buzonPaso99 || {};
  memoriaDisco.ultimoPasoValido = data.ultimoPasoValido || {};
  memoriaDisco.historialChat = data.historialChat || {};
  memoriaDisco.operadorDetectado = data.operadorDetectado || {};
  memoriaDisco.credencialesEnviadas = data.credencialesEnviadas || {};
  memoriaDisco.soporteNivel1Enviado = data.soporteNivel1Enviado || {};
  memoriaDisco.ventasProactivas = data.ventasProactivas || {};
  memoriaDisco.chequeoInicialEnviado = data.chequeoInicialEnviado || {};
  memoriaDisco.seguimientoPruebaEnviado = data.seguimientoPruebaEnviado || {};
  memoriaDisco.modoCaidaActivo = Boolean(data.modoCaidaActivo);
  memoriaDisco.tsInicioCaida = Number(data.tsInicioCaida) || 0;
  memoriaDisco.colaCaida = data.colaCaida || {};

  for (const vipId of NUMEROS_VIP) {
    delete memoriaDisco.infoPaso99[vipId];
    delete memoriaDisco.buzonPaso99[vipId];
    delete memoriaDisco.ultimoTsIntervencionManual[vipId];
    delete memoriaDisco.colaCaida[vipId];
  }
  return true;
}

function cargarMemoriaDisco() {
  try {
    if (fs.existsSync(PATH_MEMORIA)) {
      const data = JSON.parse(fs.readFileSync(PATH_MEMORIA, "utf8"));
      hidratarObjetoMemoria(data);
      return;
    }
  } catch (e) {
    console.error(
      "⚠️ Error leyendo memoria_bot.json, intentando recuperar desde backup (.bak)...",
    );
  }

  try {
    if (fs.existsSync(PATH_MEMORIA_BAK)) {
      const dataBak = JSON.parse(fs.readFileSync(PATH_MEMORIA_BAK, "utf8"));
      if (hidratarObjetoMemoria(dataBak)) {
        console.log(
          "✅ Memoria recuperada exitosamente desde memoria_bot.json.bak",
        );
      }
    }
  } catch (eBak) {
    console.error(
      "⚠️ No se pudo leer memoria_bot.json ni su backup, iniciando memoria limpia.",
    );
  }
}

function guardarMemoriaSincrono() {
  try {
    if (memoriaDisco.mensajesProcesados.length > 3500) {
      memoriaDisco.mensajesProcesados =
        memoriaDisco.mensajesProcesados.slice(-3500);
    }
    if (memoriaDisco.idsMensajesDelBot.length > 3500) {
      memoriaDisco.idsMensajesDelBot =
        memoriaDisco.idsMensajesDelBot.slice(-3500);
    }
    const serializado = JSON.stringify(memoriaDisco, null, 2);
    fs.writeFileSync(PATH_MEMORIA_TMP, serializado, "utf8");
    if (fs.existsSync(PATH_MEMORIA)) {
      try {
        fs.writeFileSync(PATH_MEMORIA_BAK, serializado, "utf8");
      } catch (eBak) {}
    }
    fs.renameSync(PATH_MEMORIA_TMP, PATH_MEMORIA);
  } catch (e) {
    console.error("⚠️ Error guardando memoria_bot.json:", e.message);
  }
}

let timerGuardadoMemoria = null;
function guardarMemoriaDisco() {
  if (timerGuardadoMemoria) clearTimeout(timerGuardadoMemoria);
  timerGuardadoMemoria = setTimeout(guardarMemoriaSincrono, 800);
}

cargarMemoriaDisco();

// ============================================================================
// MAPAS Y SETS DE CONTROL EN TIEMPO DE EJECUCIÓN
// ============================================================================
const setMensajesProcesados = new Set(memoriaDisco.mensajesProcesados);
const setIdsMensajesDelBot = new Set(memoriaDisco.idsMensajesDelBot);
const intentosFallidos = new Map();
const audiosSeguidos = new Map();
const abortarEnvioEnCurso = new Set();
const enviosBotEnVuelo = new Map();
const ultimoEnvioBotTs = new Map();
const ultimaAlertaVigiasTs = new Map();
const ultimoCierreCordialTs = new Map();
const ultimoMenuEnviadoTs = new Map();
const colaMensajes = new Map();
const temporizadoresDebounce = new Map();
const procesandoUsuario = new Map();
const creandoPruebaEnCurso = new Set();
const chatsBloqueados = new Set();
const metadatosClasificacionIA = new Map();
const ultimaRespuestaGenerada = new Map();
const ultimaRespuestaGeneradaTs = new Map();

function marcarMensajeProcesado(msgId) {
  if (!msgId) return;
  if (!setMensajesProcesados.has(msgId)) {
    setMensajesProcesados.add(msgId);
    memoriaDisco.mensajesProcesados.push(msgId);
    guardarMemoriaDisco();
  }
}

function registrarIdMensajeDelBot(msgId) {
  if (!msgId) return;
  if (!setIdsMensajesDelBot.has(msgId)) {
    setIdsMensajesDelBot.add(msgId);
    memoriaDisco.idsMensajesDelBot.push(msgId);
    guardarMemoriaDisco();
  }
}

function registrarTsIntervencionManual(numeroLimpio, tsWhatsApp) {
  if (esNumeroVIP(numeroLimpio)) return;
  const actual = memoriaDisco.ultimoTsIntervencionManual[numeroLimpio] || 0;
  if (tsWhatsApp >= actual) {
    memoriaDisco.ultimoTsIntervencionManual[numeroLimpio] = tsWhatsApp;
    guardarMemoriaDisco();
  }
}

function registrarEnHistorialChat(numeroLimpio, rol, texto) {
  const txt = String(texto || "").trim();
  if (!txt) return;
  if (!Array.isArray(memoriaDisco.historialChat[numeroLimpio])) {
    memoriaDisco.historialChat[numeroLimpio] = [];
  }
  const lista = memoriaDisco.historialChat[numeroLimpio];
  const ultimo = lista[lista.length - 1];
  const ahoraSeg = Math.floor(Date.now() / 1000);
  const recorte = txt.slice(0, 300);

  if (
    ultimo &&
    ultimo.rol === rol &&
    ultimo.texto === recorte &&
    ahoraSeg - ultimo.ts <= 3
  ) {
    return;
  }

  lista.push({
    rol,
    texto: recorte,
    ts: ahoraSeg,
  });
  if (lista.length > 10) {
    memoriaDisco.historialChat[numeroLimpio] = lista.slice(-10);
  }
  guardarMemoriaDisco();
}

function guardarEnBuzonPaso99(numeroLimpio, texto, msgId, tsSegundos) {
  if (esNumeroVIP(numeroLimpio)) return;
  const txt = String(texto || "").trim();
  if (!txt) return;
  if (!Array.isArray(memoriaDisco.buzonPaso99[numeroLimpio])) {
    memoriaDisco.buzonPaso99[numeroLimpio] = [];
  }
  const lista = memoriaDisco.buzonPaso99[numeroLimpio];
  if (msgId && lista.some((item) => item.id === msgId)) return;

  lista.push({
    id: msgId || `${Date.now()}`,
    texto: txt,
    ts: tsSegundos || Math.floor(Date.now() / 1000),
  });

  if (lista.length > 10) {
    memoriaDisco.buzonPaso99[numeroLimpio] = lista.slice(-10);
  }
  guardarMemoriaDisco();
  const nombre = memoriaDisco.mapaContactos[numeroLimpio]?.nombre || "Cliente";
  console.log(
    `📥 [BUZÓN PASO 99] "${nombre}" (${numeroLimpio}) escribió en pausa: "${txt}"`,
  );
}

// ============================================================================
// GESTIÓN DE MODO CAÍDA Y COLA DE CHATS ACUMULADOS DURANTE EL CORTE
// ============================================================================
function activarModoCaida() {
  memoriaDisco.modoCaidaActivo = true;
  if (!memoriaDisco.tsInicioCaida) {
    memoriaDisco.tsInicioCaida = Math.floor(Date.now() / 1000);
  }
  if (!memoriaDisco.colaCaida || typeof memoriaDisco.colaCaida !== "object") {
    memoriaDisco.colaCaida = {};
  }
  guardarMemoriaDisco();
}

function desactivarModoCaida() {
  memoriaDisco.modoCaidaActivo = false;
  memoriaDisco.tsInicioCaida = 0;
  guardarMemoriaDisco();
}

function guardarEnColaCaida(
  numeroLimpio,
  remoteJid,
  texto,
  textoCitado = "",
  msgId = null,
  tsSegundos = null,
) {
  if (!numeroLimpio || esNumeroVIP(numeroLimpio)) return;
  if (!memoriaDisco.colaCaida || typeof memoriaDisco.colaCaida !== "object") {
    memoriaDisco.colaCaida = {};
  }

  const ahoraSeg = tsSegundos || Math.floor(Date.now() / 1000);
  const txt = String(texto || "").trim();
  const citado = String(textoCitado || "").trim();

  if (!memoriaDisco.colaCaida[numeroLimpio]) {
    memoriaDisco.colaCaida[numeroLimpio] = {
      numeroLimpio,
      remoteJid: remoteJid || obtenerJidDeUsuario(numeroLimpio),
      textos: [],
      textoCitado: "",
      idsMensajes: [],
      tsPrimerMensaje: ahoraSeg,
      tsUltimoMensaje: ahoraSeg,
    };
  }

  const item = memoriaDisco.colaCaida[numeroLimpio];
  if (remoteJid) item.remoteJid = remoteJid;
  item.tsUltimoMensaje = Math.max(item.tsUltimoMensaje || 0, ahoraSeg);

  if (msgId && item.idsMensajes.includes(msgId)) {
    return;
  }
  if (msgId) {
    item.idsMensajes.push(msgId);
  }
  if (txt) {
    item.textos.push(txt);
  }
  if (citado) {
    item.textoCitado = citado;
  }

  guardarMemoriaDisco();
  const nombre = memoriaDisco.mapaContactos[numeroLimpio]?.nombre || "Cliente";
  console.log(
    `⏸️ [COLA MODO CAÍDA] Mensaje guardado de "${nombre}" (${numeroLimpio}): "${txt || "[MULTIMEDIA]"}"`,
  );
}

function limpiarUsuarioDeColaCaida(idUsuario) {
  if (!idUsuario || !memoriaDisco.colaCaida) return;
  const vinculados = obtenerIdsVinculados(idUsuario);
  delete memoriaDisco.colaCaida[idUsuario];
  for (const v of vinculados) {
    delete memoriaDisco.colaCaida[v];
  }
  guardarMemoriaDisco();
}

function guardarDatosContacto(numeroLimpio, remoteJid, msg) {
  const previo = memoriaDisco.mapaContactos[numeroLimpio] || {
    nombre: "Cliente",
    telefonoReal: null,
    jidOriginal: remoteJid,
  };
  const pushName = msg?.pushName || previo.nombre || "Cliente";
  const senderPn = msg?.key?.senderPn
    ? msg.key.senderPn.replace(/@.+$/, "").replace(/\D/g, "")
    : null;
  const participantPn =
    !senderPn &&
    msg?.key?.participant &&
    msg.key.participant.includes("@s.whatsapp.net")
      ? msg.key.participant.replace(/@.+$/, "").replace(/\D/g, "")
      : null;

  const telefonoReal =
    senderPn ||
    participantPn ||
    (numeroLimpio.startsWith("54")
      ? numeroLimpio
      : previo.telefonoReal || null);

  memoriaDisco.mapaContactos[numeroLimpio] = {
    nombre: pushName,
    telefonoReal,
    jidOriginal: remoteJid || previo.jidOriginal,
  };

  if (telefonoReal && telefonoReal !== numeroLimpio) {
    const prevTel = memoriaDisco.mapaContactos[telefonoReal] || {};
    memoriaDisco.mapaContactos[telefonoReal] = {
      nombre:
        pushName !== "Cliente"
          ? pushName
          : prevTel.nombre || `Cliente +${telefonoReal}`,
      telefonoReal,
      jidOriginal: prevTel.jidOriginal || `${telefonoReal}@s.whatsapp.net`,
      lidVinculado: numeroLimpio,
    };
  }

  guardarMemoriaDisco();
}

function vincularIdentidades(idA, idB, jidOpcional = null) {
  const limpioA = String(idA || "").replace(/\D/g, "");
  const limpioB = String(idB || "").replace(/\D/g, "");
  if (!limpioA || !limpioB || limpioA === limpioB) return;

  const telReal = limpioA.startsWith("54")
    ? limpioA
    : limpioB.startsWith("54")
      ? limpioB
      : null;
  const idLid = limpioA !== telReal ? limpioA : limpioB;

  const contactoA = memoriaDisco.mapaContactos[limpioA] || {};
  const contactoB = memoriaDisco.mapaContactos[limpioB] || {};
  const nombreComun =
    (contactoA.nombre && !contactoA.nombre.startsWith("Cliente")
      ? contactoA.nombre
      : null) ||
    (contactoB.nombre && !contactoB.nombre.startsWith("Cliente")
      ? contactoB.nombre
      : null) ||
    contactoA.nombre ||
    contactoB.nombre ||
    (telReal ? `Cliente +${telReal}` : "Cliente");

  if (telReal && idLid) {
    memoriaDisco.mapaContactos[idLid] = {
      nombre: nombreComun,
      telefonoReal: telReal,
      jidOriginal:
        jidOpcional && jidOpcional.endsWith("@lid")
          ? jidOpcional
          : contactoB.jidOriginal || `${idLid}@lid`,
    };
    memoriaDisco.mapaContactos[telReal] = {
      nombre: nombreComun,
      telefonoReal: telReal,
      jidOriginal: `${telReal}@s.whatsapp.net`,
      lidVinculado: idLid,
    };
  }

  const cred =
    memoriaDisco.credencialesEnviadas[limpioA] ||
    memoriaDisco.credencialesEnviadas[limpioB];
  if (cred) {
    memoriaDisco.credencialesEnviadas[limpioA] = cred;
    memoriaDisco.credencialesEnviadas[limpioB] = cred;
  }

  const op =
    memoriaDisco.operadorDetectado[limpioA] ||
    memoriaDisco.operadorDetectado[limpioB];
  if (op) {
    memoriaDisco.operadorDetectado[limpioA] = op;
    memoriaDisco.operadorDetectado[limpioB] = op;
  }

  guardarMemoriaDisco();
}

function obtenerIdsVinculados(idUsuario) {
  const base = String(idUsuario || "").replace(/\D/g, "");
  if (!base) return [];
  const ids = new Set([base]);

  const numArg = normalizarNumeroArgentino(base);
  if (numArg && numArg.startsWith("549")) {
    ids.add(numArg);
  }

  const info = memoriaDisco.mapaContactos[base];
  if (info?.telefonoReal) ids.add(String(info.telefonoReal));
  if (info?.lidVinculado) ids.add(String(info.lidVinculado));

  for (const [idGuardado, datos] of Object.entries(
    memoriaDisco.mapaContactos || {},
  )) {
    if (
      datos?.telefonoReal &&
      (datos.telefonoReal === base ||
        datos.telefonoReal === numArg ||
        ids.has(String(datos.telefonoReal)))
    ) {
      ids.add(idGuardado);
      ids.add(String(datos.telefonoReal));
    }
    if (datos?.lidVinculado && ids.has(String(datos.lidVinculado))) {
      ids.add(idGuardado);
    }
  }

  const credBase = memoriaDisco.credencialesEnviadas[base];
  if (credBase?.usuario) {
    for (const [idCred, datosCred] of Object.entries(
      memoriaDisco.credencialesEnviadas || {},
    )) {
      if (datosCred?.usuario === credBase.usuario) {
        ids.add(idCred);
      }
    }
  }

  return Array.from(ids).filter(Boolean);
}

function vincularListaContactos(contactos) {
  if (!Array.isArray(contactos)) return;
  let huboCambios = false;
  for (const c of contactos) {
    const id1 = c?.id ? c.id.replace(/@.+$/, "").replace(/\D/g, "") : null;
    const lid = c?.lid ? c.lid.replace(/@.+$/, "").replace(/\D/g, "") : null;
    const pn = c?.phoneNumber
      ? c.phoneNumber.replace(/@.+$/, "").replace(/\D/g, "")
      : null;
    const telReal = (id1 && id1.startsWith("54") ? id1 : null) || pn;
    const idLid = (id1 && !id1.startsWith("54") ? id1 : null) || lid;

    if (telReal && idLid) {
      const previo = memoriaDisco.mapaContactos[idLid] || {};
      const nombreContacto =
        c.notify || c.name || previo.nombre || `Cliente +${telReal}`;
      memoriaDisco.mapaContactos[idLid] = {
        nombre: nombreContacto,
        telefonoReal: telReal,
        jidOriginal: `${idLid}@lid`,
      };
      const prevTel = memoriaDisco.mapaContactos[telReal] || {};
      memoriaDisco.mapaContactos[telReal] = {
        nombre: nombreContacto,
        telefonoReal: telReal,
        jidOriginal: prevTel.jidOriginal || `${telReal}@s.whatsapp.net`,
        lidVinculado: idLid,
      };
      huboCambios = true;
    }
  }
  if (huboCambios) guardarMemoriaDisco();
}

function registrarLog(numeroLimpio, tipo, contenido) {
  try {
    const log = `[${new Date().toISOString()}] [${tipo}] ${numeroLimpio}: ${contenido}\n`;
    fs.appendFileSync(PATH_LOG, log, "utf8");
  } catch (e) {}
}

function anonimizarIdentificador(numeroLimpio) {
  return crypto
    .createHash("sha256")
    .update(String(numeroLimpio || "anon"))
    .digest("hex")
    .slice(0, 12);
}

function sanitizarTextoTelemetria(texto) {
  return String(texto || "")
    .replace(/\b\d{8,15}\b/g, "[NUM_OCULTO]")
    .slice(0, 350);
}

function registrarTelemetriaIA(datos) {
  try {
    const registro = {
      timestamp: new Date().toISOString(),
      usuarioHash: anonimizarIdentificador(datos.numeroLimpio),
      mensajeRecibido: sanitizarTextoTelemetria(datos.mensajeRecibido),
      respuestaGenerada: sanitizarTextoTelemetria(datos.respuestaGenerada),
      intencionDetectada: datos.intencionDetectada || "NINGUNA",
      metodoDeteccion: datos.metodoDeteccion || "REGLA",
      funcionSeleccionada: datos.funcionSeleccionada || "respuesta_estatica",
      argumentosUtilizados: datos.argumentosUtilizados || {},
      resultadoFuncion: datos.resultadoFuncion || "OK",
      errorProducido: datos.errorProducido || null,
      pasoPrevio: datos.pasoPrevio ?? 0,
      pasoNuevo: datos.pasoNuevo ?? datos.pasoPrevio ?? 0,
      resueltoAutonomamente: Boolean(datos.resueltoAutonomamente),
      requirioIntervencionHumana: Boolean(datos.requirioIntervencionHumana),
    };
    fs.appendFileSync(PATH_TELEMETRIA, JSON.stringify(registro) + "\n", "utf8");
  } catch (e) {}
}

// Busca credencial en el ID actual o cruzando con su teléfono real / @lid vinculado
function buscarCredencialCruzada(numeroLimpio) {
  let cred = memoriaDisco.credencialesEnviadas[numeroLimpio];
  if (cred && cred.usuario && cred.password) return cred;

  const infoActual = memoriaDisco.mapaContactos[numeroLimpio];
  if (infoActual?.telefonoReal) {
    const credPorTel =
      memoriaDisco.credencialesEnviadas[infoActual.telefonoReal];
    if (credPorTel && credPorTel.usuario && credPorTel.password) {
      memoriaDisco.credencialesEnviadas[numeroLimpio] = credPorTel;
      guardarMemoriaDisco();
      return credPorTel;
    }
  }
  if (infoActual?.lidVinculado) {
    const credPorLid =
      memoriaDisco.credencialesEnviadas[infoActual.lidVinculado];
    if (credPorLid && credPorLid.usuario && credPorLid.password) {
      memoriaDisco.credencialesEnviadas[numeroLimpio] = credPorLid;
      guardarMemoriaDisco();
      return credPorLid;
    }
  }

  for (const [idGuardado, datosContacto] of Object.entries(
    memoriaDisco.mapaContactos || {},
  )) {
    if (
      (datosContacto?.telefonoReal === numeroLimpio ||
        datosContacto?.lidVinculado === numeroLimpio) &&
      memoriaDisco.credencialesEnviadas[idGuardado]
    ) {
      const credVinculada = memoriaDisco.credencialesEnviadas[idGuardado];
      memoriaDisco.credencialesEnviadas[numeroLimpio] = credVinculada;
      guardarMemoriaDisco();
      return credVinculada;
    }
  }

  return null;
}

function obtenerPruebaVigente24h(numeroLimpio) {
  const cred = buscarCredencialCruzada(numeroLimpio);
  if (!cred || !cred.usuario || !cred.password) return null;

  const ahoraSeg = Math.floor(Date.now() / 1000);
  const tsCreacion = cred.tsCreacion || ahoraSeg;
  const maxHoras = cred.duracionHoras || 24;
  const horasTranscurridas = (ahoraSeg - tsCreacion) / 3600;

  if (horasTranscurridas < maxHoras) {
    const horasRestantes = Math.max(
      1,
      Math.ceil(maxHoras - horasTranscurridas),
    );
    return {
      ...cred,
      horasRestantes,
    };
  }
  return null;
}

function obtenerPruebaVencida(numeroLimpio) {
  const cred = buscarCredencialCruzada(numeroLimpio);
  if (!cred || !cred.usuario || !cred.tsCreacion) return null;

  const ahoraSeg = Math.floor(Date.now() / 1000);
  const maxHoras = cred.duracionHoras || 24;
  const horasTranscurridas = (ahoraSeg - cred.tsCreacion) / 3600;

  if (horasTranscurridas >= maxHoras) {
    return {
      ...cred,
      horasTranscurridas: Math.floor(horasTranscurridas),
    };
  }
  return null;
}

function validarPermisoCreacionPrueba(
  numeroLimpio,
  yaTuvoPruebaReal,
  forzadoPorAdmin = false,
) {
  if (forzadoPorAdmin) {
    return { permitido: true, motivo: "FORZADO_POR_ADMIN" };
  }
  const credVigente = obtenerPruebaVigente24h(numeroLimpio);
  if (credVigente) {
    return {
      permitido: false,
      motivo: "TIENE_PRUEBA_VIGENTE_24H",
      credVigente,
    };
  }
  if (yaTuvoPruebaReal) {
    return {
      permitido: false,
      motivo: "PRUEBA_PREVIA_VENCIDA",
      credVigente: null,
    };
  }
  return { permitido: true, motivo: "CLIENTE_APTO_PRUEBA" };
}

function construirMensajeDuracionPrueba(numeroLimpio) {
  const cred = buscarCredencialCruzada(numeroLimpio);
  if (cred && cred.tsCreacion) {
    const ahoraSeg = Math.floor(Date.now() / 1000);
    const maxHoras = cred.duracionHoras || 24;
    const segTranscurridos = Math.max(0, ahoraSeg - cred.tsCreacion);
    const segTotales = maxHoras * 3600;
    const fechaFin = new Date((cred.tsCreacion + segTotales) * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const horaFinStr = `${pad(fechaFin.getHours())}:${pad(fechaFin.getMinutes())} hs`;

    if (segTranscurridos < segTotales) {
      const segRestantes = segTotales - segTranscurridos;
      const hRest = Math.floor(segRestantes / 3600);
      const mRest = Math.max(1, Math.floor((segRestantes % 3600) / 60));
      return (
        `⏳ *Estado de tu prueba gratuita:*\n\n` +
        `Tu cuenta de prueba de *${maxHoras} horas corridas* (usuario \`${cred.usuario}\`) se encuentra activa. ` +
        `Le restan aproximadamente *${hRest} horas y ${mRest} minutos* de vigencia (finaliza a las *${horaFinStr}*).\n\n` +
        `Podés conectar y desconectar todas las veces que necesites durante ese período. 🚀`
      );
    } else {
      return (
        `⏰ *Tu prueba gratuita de ${maxHoras} horas (usuario \`${cred.usuario}\`) ya finalizó* (venció a las ${horaFinStr}).\n\n` +
        `Si el servicio funcionó como esperabas y deseás activar un plan ilimitado, estas son las opciones disponibles:\n\n` +
        MENSAJE_ACTIVACION
      );
    }
  }

  return (
    `⏳ *Duración de la prueba gratuita:*\n\n` +
    `Nuestra prueba sin cargo tiene una duración de *24 horas corridas* de internet 100% ilimitado desde el momento en que se genera tu usuario, para que puedas comprobar la velocidad y estabilidad del servicio en tu celular.`
  );
}

function normalizarNumeroArgentino(rawInput) {
  let num = String(rawInput || "").replace(/\D/g, "");
  if (!num) return "";
  if (num.startsWith("00")) num = num.slice(2);
  if (num.startsWith("0")) num = num.slice(1);
  if (num.length === 10 && !num.startsWith("54")) {
    num = "549" + num;
  } else if (
    num.length === 12 &&
    num.startsWith("54") &&
    !num.startsWith("549")
  ) {
    num = "549" + num.slice(2);
  }
  return num;
}

function hayVentaProactivaReciente(numeroLimpio, telefonoReal) {
  const ahoraSeg = Math.floor(Date.now() / 1000);
  const ventas = memoriaDisco.ventasProactivas || {};

  if (ventas[numeroLimpio] && ahoraSeg - ventas[numeroLimpio] < 12 * 3600) {
    return numeroLimpio;
  }
  if (
    telefonoReal &&
    ventas[telefonoReal] &&
    ahoraSeg - ventas[telefonoReal] < 12 * 3600
  ) {
    return telefonoReal;
  }
  return null;
}

function limpiarTextoBusquedaNombre(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolverIdUsuario(inputTextoONumero) {
  const raw = String(inputTextoONumero || "").trim();
  if (!raw) return null;

  const rawLower = raw.toLowerCase();

  // 1. Búsqueda directa por nombre de usuario VPN (ej: "reiniciar mnet5494")
  for (const [idGuardado, cred] of Object.entries(
    memoriaDisco.credencialesEnviadas || {},
  )) {
    if (cred?.usuario && String(cred.usuario).toLowerCase() === rawLower) {
      return idGuardado;
    }
  }

  const soloDigitos = raw.replace(/\D/g, "");
  const numArg = normalizarNumeroArgentino(soloDigitos);

  const existeEnMemoria = (id) =>
    Boolean(
      id &&
      (memoriaDisco.mapaContactos[id] ||
        memoriaDisco.infoPaso99[id] ||
        memoriaDisco.credencialesEnviadas[id] ||
        memoriaDisco.historialChat[id] ||
        memoriaDisco.ultimoPasoValido[id]),
    );

  // 2. Coincidencia exacta en estructuras de memoria
  if (existeEnMemoria(soloDigitos)) {
    const lidAsociado = memoriaDisco.mapaContactos[soloDigitos]?.lidVinculado;
    if (lidAsociado && existeEnMemoria(lidAsociado)) {
      return lidAsociado;
    }
    return soloDigitos;
  }
  if (existeEnMemoria(numArg)) {
    const lidAsociado = memoriaDisco.mapaContactos[numArg]?.lidVinculado;
    if (lidAsociado && existeEnMemoria(lidAsociado)) {
      return lidAsociado;
    }
    return numArg;
  }

  // 3. Búsqueda cruzada por teléfono real o sufijo (>= 8 dígitos, ej: "3436 57-0945")
  if (soloDigitos.length >= 8) {
    const ultimos10 = soloDigitos.slice(-10);
    for (const [idGuardado, datos] of Object.entries(
      memoriaDisco.mapaContactos || {},
    )) {
      const telGuardado = String(datos?.telefonoReal || "");
      if (
        telGuardado &&
        (telGuardado === soloDigitos ||
          telGuardado === numArg ||
          telGuardado.endsWith(soloDigitos) ||
          (ultimos10.length === 10 && telGuardado.endsWith(ultimos10)))
      ) {
        return datos?.lidVinculado || idGuardado;
      }
    }

    for (const idHist of Object.keys(memoriaDisco.historialChat || {})) {
      if (
        idHist === soloDigitos ||
        idHist === numArg ||
        idHist.endsWith(soloDigitos) ||
        (ultimos10.length === 10 && idHist.endsWith(ultimos10))
      ) {
        return idHist;
      }
    }
  }

  // 4. Búsqueda por nombre de contacto (tolerante a emojis, tildes y símbolos)
  const nombreBuscado = limpiarTextoBusquedaNombre(raw);
  if (nombreBuscado.length >= 2 && !/^\d+$/.test(nombreBuscado)) {
    // 4a. Primero coincidencia exacta de nombre limpio
    for (const [idGuardado, datos] of Object.entries(
      memoriaDisco.mapaContactos || {},
    )) {
      const nombreContacto = limpiarTextoBusquedaNombre(datos?.nombre);
      if (nombreContacto && nombreContacto === nombreBuscado) {
        return datos?.lidVinculado || idGuardado;
      }
    }
    // 4b. Luego coincidencia parcial (incluye término buscado)
    for (const [idGuardado, datos] of Object.entries(
      memoriaDisco.mapaContactos || {},
    )) {
      const nombreContacto = limpiarTextoBusquedaNombre(datos?.nombre);
      if (nombreContacto && nombreContacto.includes(nombreBuscado)) {
        return datos?.lidVinculado || idGuardado;
      }
    }
  }

  return numArg || soloDigitos || null;
}

function obtenerJidDeUsuario(idUsuario) {
  const guardado = memoriaDisco.mapaContactos[idUsuario]?.jidOriginal;
  if (guardado) return guardado;
  if (String(idUsuario).length >= 14 && !String(idUsuario).startsWith("54")) {
    return `${idUsuario}@lid`;
  }
  return `${idUsuario}@s.whatsapp.net`;
}

function cumplioTiempoAutoDesbloqueo(numeroLimpio) {
  const info = memoriaDisco.infoPaso99[numeroLimpio];
  if (!info || !info.ts) return false;
  const horasTranscurridas = (Date.now() / 1000 - info.ts) / 3600;
  return horasTranscurridas >= HORAS_AUTO_DESBLOQUEO_PASO99;
}

async function interpretarPasoDondeQuedo(numeroLimpio, usuarioBD) {
  let yaTuvoPrueba = Boolean(
    usuarioBD?.prueba_enviada === 1 ||
    usuarioBD?.prueba_enviada === true ||
    obtenerPruebaVigente24h(numeroLimpio) ||
    buscarCredencialCruzada(numeroLimpio),
  );
  const historial = Array.isArray(memoriaDisco.historialChat[numeroLimpio])
    ? memoriaDisco.historialChat[numeroLimpio]
    : [];
  const pasoGuardado =
    memoriaDisco.ultimoPasoValido[numeroLimpio] ||
    memoriaDisco.infoPaso99[numeroLimpio]?.pasoPrevio ||
    null;

  const mensajesSalientes = historial
    .filter((h) => h.rol === "OPERADOR" || h.rol === "BOT")
    .map((h) =>
      h.texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
    );

  const todoElHistorialSaliente = mensajesSalientes.join(" ");
  const ultimoSaliente = mensajesSalientes[mensajesSalientes.length - 1] || "";

  if (
    /\b(prueba vive online generada|tu prueba de 24 horas esta activa|tu prueba gratuita de 24 hs sigue activa|tu suscripcion mnet vpn esta activa|plan mnet vpn activado|aviso de vencimiento mnet vpn|pudiste descargar nuestra aplicacion|pocas horas|finalizo recientemente)\b/.test(
      todoElHistorialSaliente,
    )
  ) {
    if (!yaTuvoPrueba) {
      await dbUtils.marcarPruebaEnviada(numeroLimpio);
      yaTuvoPrueba = true;
    }
    return { paso: 3, yaTuvoPrueba: true };
  }

  if (yaTuvoPrueba) {
    return { paso: 3, yaTuvoPrueba: true };
  }

  if (
    /\b(elegi el operador|con que chip queres probar|con que chip vas a probar|que compania usas en tu celular|personal o claro|que compania|que operador|que empresa)\b/.test(
      ultimoSaliente,
    )
  ) {
    return { paso: 7, yaTuvoPrueba: false };
  }

  if (
    /\b(milciades\.genes|0000003100065619254321|activacion de servicio|planes y activacion)\b/.test(
      ultimoSaliente,
    )
  ) {
    memoriaDisco.esperandoComprobante[numeroLimpio] = true;
    guardarMemoriaDisco();
    return { paso: 4, yaTuvoPrueba: false };
  }

  if (
    /\b(exclusivamente con un chip personal|exclusivamente en dispositivos android|kiosco|no es compatible con movistar)\b/.test(
      ultimoSaliente,
    )
  ) {
    return { paso: 8, yaTuvoPrueba: false };
  }

  if (pasoGuardado && [1, 3, 4, 7, 8].includes(pasoGuardado)) {
    return { paso: pasoGuardado, yaTuvoPrueba };
  }

  if (memoriaDisco.esperandoComprobante[numeroLimpio]) {
    return { paso: 4, yaTuvoPrueba };
  }

  return { paso: 1, yaTuvoPrueba };
}

module.exports = {
  memoriaDisco,
  cargarMemoriaDisco,
  guardarMemoriaSincrono,
  guardarMemoriaDisco,
  setMensajesProcesados,
  setIdsMensajesDelBot,
  intentosFallidos,
  audiosSeguidos,
  abortarEnvioEnCurso,
  enviosBotEnVuelo,
  ultimoEnvioBotTs,
  ultimaAlertaVigiasTs,
  ultimoCierreCordialTs,
  ultimoMenuEnviadoTs,
  colaMensajes,
  temporizadoresDebounce,
  procesandoUsuario,
  creandoPruebaEnCurso,
  chatsBloqueados,
  metadatosClasificacionIA,
  ultimaRespuestaGenerada,
  ultimaRespuestaGeneradaTs,
  marcarMensajeProcesado,
  registrarIdMensajeDelBot,
  registrarTsIntervencionManual,
  registrarEnHistorialChat,
  guardarEnBuzonPaso99,
  activarModoCaida,
  desactivarModoCaida,
  guardarEnColaCaida,
  limpiarUsuarioDeColaCaida,
  guardarDatosContacto,
  vincularIdentidades,
  obtenerIdsVinculados,
  vincularListaContactos,
  registrarLog,
  registrarTelemetriaIA,
  buscarCredencialCruzada,
  obtenerPruebaVigente24h,
  obtenerPruebaVencida,
  validarPermisoCreacionPrueba,
  construirMensajeDuracionPrueba,
  normalizarNumeroArgentino,
  hayVentaProactivaReciente,
  resolverIdUsuario,
  obtenerJidDeUsuario,
  cumplioTiempoAutoDesbloqueo,
  interpretarPasoDondeQuedo,
};
