const fs = require("fs");
const { delay } = require("@whiskeysockets/baileys");
const dbUtils = require("./db");
const ultranet = require("./ultranet");
const {
  PATH_VIDEO_VPN,
  PATH_FOTO_APP,
  URL_PLAY_STORE,
  NUMERO_ADMIN_ALERTAS,
  HORAS_MAX_SIN_CONEXION,
  MINUTOS_CHEQUEO_INICIAL_PRUEBA,
  MINUTOS_MAX_VENTANA_CHEQUEO_INICIAL,
  HORAS_AVISO_FIN_PRUEBA,
  HORAS_MAX_VENTANA_SEGUIMIENTO,
  esNumeroVIP,
} = require("./config");
const {
  VARIACIONES_INICIAL,
  MENSAJE_BIENVENIDA_DIRECTA,
  MENSAJE_BIENVENIDA_PRUEBA_PASO0,
  MENSAJE_RETOMAR_PASO1,
  MENSAJE_RETOMAR_PASO4,
  MENSAJE_RETOMAR_PASO3,
  MENSAJE_MENU_INVALIDO,
  MENSAJE_ACTIVACION,
  MENSAJE_COMO_FUNCIONA,
  MENSAJE_GUIA_INSTALACION_PASO3,
  MENSAJE_SOPORTE_APK,
  MENSAJE_COMPARTIR_Y_TV,
  MENSAJE_NO_PERSONAL,
  MENSAJE_TIENE_ABONO,
  MENSAJE_TIENE_GIGAS_EN_PASO3,
  MENSAJE_DESPEDIDA_CHIP,
  MENSAJE_ELEGIR_OPERADOR,
  VARIACIONES_INSULTO,
  MENSAJE_YA_TUVO_PRUEBA,
  MENSAJE_EN_PROCESO_PRUEBA,
  MENSAJE_ACLARACION_PASO3,
  MENSAJE_CONEXION_EXITOSA,
  MENSAJE_POSTERGAR_COMPRA,
  MENSAJE_CIERRE_CORDIAL,
  MENSAJE_CIERRE_PASO4,
  MENSAJE_CIERRE_CLIENTE_PAGO,
  MENSAJE_CONEXION_EXITOSA_CLIENTE_PAGO,
  MENSAJE_ACLARACION_CLIENTE_PAGO,
  MENSAJE_NO_INTERESADO,
  MENSAJE_DERIVACION_HUMANO,
  MENSAJE_PAGO_RECIBIDO,
  MENSAJE_CAPTURA_RECIBIDA,
  obtenerAleatorio,
  construirRecordatorioHilo,
  construirMensajeChequeoInicialPrueba,
  construirMensajeSeguimientoPrueba,
} = require("./mensajes");
const {
  memoriaDisco,
  guardarMemoriaDisco,
  intentosFallidos,
  audiosSeguidos,
  abortarEnvioEnCurso,
  enviosBotEnVuelo,
  ultimoEnvioBotTs,
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
  registrarIdMensajeDelBot,
  registrarEnHistorialChat,
  obtenerIdsVinculados,
  buscarCredencialCruzada,
  registrarLog,
  registrarTelemetriaIA,
  obtenerPruebaVigente24h,
  validarPermisoCreacionPrueba,
  construirMensajeDuracionPrueba,
  obtenerJidDeUsuario,
} = require("./memoria");
const {
  detectarInsulto,
  esConfirmacionOCierreCorto,
  detectarMultiplesIntenciones,
  descubrirIntencionConIA,
} = require("./ia");

let sockActual = null;
let ejecutandoRevisionSeguimiento = false;

function setSockActual(sock) {
  sockActual = sock;
}

function getSockActual() {
  return sockActual;
}

// ============================================================================
// DESEMPAQUETADOR UNIVERSAL DE MENSAJES Y LECTURA DE CITAS (QUOTED)
// ============================================================================
function desenvolverMensaje(messageObj) {
  if (!messageObj) return null;
  let m = messageObj;
  for (let i = 0; i < 5; i++) {
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    else if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    else if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    else if (m.viewOnceMessageV2Extension?.message)
      m = m.viewOnceMessageV2Extension.message;
    else if (m.documentWithCaptionMessage?.message)
      m = m.documentWithCaptionMessage.message;
    else if (m.editedMessage?.message?.protocolMessage?.editedMessage) {
      m = m.editedMessage.message.protocolMessage.editedMessage;
    } else break;
  }
  return m;
}

function esEventoIgnorable(msg) {
  const m = desenvolverMensaje(msg?.message);
  if (!m) return true;
  if (
    m.reactionMessage ||
    m.protocolMessage ||
    m.pollUpdateMessage ||
    m.keepInChatMessage
  ) {
    return true;
  }
  return false;
}

function obtenerTimestampSegundos(msg) {
  const ts = msg?.messageTimestamp;
  if (!ts) return Math.floor(Date.now() / 1000);
  return typeof ts === "number"
    ? ts
    : Number(ts?.low || ts || Math.floor(Date.now() / 1000));
}

function esMensajeReciente(msg, maxHoras = HORAS_MAX_SIN_CONEXION) {
  const segundosMsg = obtenerTimestampSegundos(msg);
  const antiguedadHoras = (Date.now() / 1000 - segundosMsg) / 3600;
  return antiguedadHoras <= maxHoras;
}

function obtenerTextoDeMensaje(msg) {
  const m = desenvolverMensaje(msg?.message);
  if (!m) return "";
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  if (m.buttonsResponseMessage?.selectedDisplayText)
    return m.buttonsResponseMessage.selectedDisplayText;
  if (m.listResponseMessage?.title) return m.listResponseMessage.title;
  return "";
}

function obtenerTextoCitado(msg) {
  const m = desenvolverMensaje(msg?.message);
  const quoted =
    m?.extendedTextMessage?.contextInfo?.quotedMessage ||
    m?.imageMessage?.contextInfo?.quotedMessage ||
    m?.documentMessage?.contextInfo?.quotedMessage;
  if (!quoted) return "";
  const q = desenvolverMensaje(quoted);
  return (
    q?.conversation ||
    q?.extendedTextMessage?.text ||
    q?.imageMessage?.caption ||
    q?.videoMessage?.caption ||
    ""
  );
}

function esComprobanteOArchivo(msg) {
  const m = desenvolverMensaje(msg?.message);
  if (!m) return false;
  return Boolean(m.imageMessage || m.documentMessage || m.videoMessage);
}

function esAudio(msg) {
  const m = desenvolverMensaje(msg?.message);
  return Boolean(m?.audioMessage || m?.ptvMessage);
}

function esSticker(msg) {
  const m = desenvolverMensaje(msg?.message);
  return Boolean(m?.stickerMessage);
}

function esPosibleRenovacionOPagoEnPaso99(msg) {
  if (esComprobanteOArchivo(msg)) return true;
  const txt = obtenerTextoDeMensaje(msg)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!txt) return false;
  return /\b(ya pague|ya transferi|te transferi|ahi te pase|ahi transferi|ya abone|comprobante|renovar|renovacion|se me vencio|vencio|quiero pagar|te pase la plata)\b/.test(
    txt,
  );
}

// ============================================================================
// COMPUERTA DE SALIDA CONTROLADA Y FUNCIONES DE ENVÍO SEGURO
// ============================================================================
function hayMensajesNuevosEnEspera(numeroLimpio) {
  if (esNumeroVIP(numeroLimpio)) return false;
  if (temporizadoresDebounce.has(numeroLimpio)) return true;
  const pendientes = colaMensajes.get(numeroLimpio);
  return Array.isArray(pendientes) && pendientes.length > 0;
}

async function reaccionarConPulgar(
  sock,
  remoteJid,
  ultimoMensajeRaw,
  numeroLimpio,
) {
  const s = sockActual || sock;
  if (ultimoMensajeRaw?.key) {
    try {
      await s.sendMessage(remoteJid, {
        react: { text: "👍", key: ultimoMensajeRaw.key },
      });
      console.log(
        `👍 [${numeroLimpio}] Silencio inteligente: reacción enviada para evitar mensaje innecesario.`,
      );
      return true;
    } catch (e) {}
  }
  return false;
}

async function esperarRetardoHumano(sock, remoteJid, minSeg = 1, maxSeg = 3) {
  const s = sockActual || sock;
  const segundos = Math.floor(Math.random() * (maxSeg - minSeg + 1)) + minSeg;
  try {
    await s.sendPresenceUpdate("composing", remoteJid);
  } catch (e) {}
  await new Promise((resolve) => setTimeout(resolve, segundos * 1000));
  try {
    await s.sendPresenceUpdate("paused", remoteJid);
  } catch (e) {}
}

async function actualizarPasoSeguro(numeroLimpio, nuevoPaso) {
  if (
    nuevoPaso !== 99 &&
    abortarEnvioEnCurso.has(numeroLimpio) &&
    !esNumeroVIP(numeroLimpio)
  ) {
    return;
  }
  if (nuevoPaso !== 99 && nuevoPaso > 0) {
    memoriaDisco.ultimoPasoValido[numeroLimpio] = nuevoPaso;
    guardarMemoriaDisco();
  }
  await dbUtils.actualizarPaso(numeroLimpio, nuevoPaso);
}

async function enviarMensajeSeguro(
  sock,
  remoteJid,
  contenido,
  opciones = {},
  ignorarAborto = false,
) {
  const s = sockActual || sock;
  const numeroLimpio = remoteJid.replace(/@.+$/, "").replace(/\D/g, "");
  if (
    !ignorarAborto &&
    abortarEnvioEnCurso.has(numeroLimpio) &&
    !esNumeroVIP(numeroLimpio)
  ) {
    return null;
  }

  const textoRegistrable = contenido?.text || contenido?.caption;

  // Compuerta anti-duplicado inmediato: evita enviar exactamente el mismo párrafo dos veces en < 45 segundos
  // (Salvo credenciales cortas o envíos forzados por el administrador)
  if (
    !ignorarAborto &&
    !esNumeroVIP(numeroLimpio) &&
    textoRegistrable &&
    textoRegistrable.length > 40 &&
    !contenido?.image &&
    !contenido?.video &&
    !contenido?.document
  ) {
    const ultimaResp = ultimaRespuestaGenerada.get(numeroLimpio);
    const tsUltimaResp = ultimaRespuestaGeneradaTs.get(numeroLimpio) || 0;
    if (ultimaResp === textoRegistrable && Date.now() - tsUltimaResp < 45000) {
      console.log(
        `🛡️ [COMPUERTA SALIDA] Se evitó duplicar la misma respuesta a ${numeroLimpio} (<45s).`,
      );
      return null;
    }
  }

  enviosBotEnVuelo.set(
    numeroLimpio,
    (enviosBotEnVuelo.get(numeroLimpio) || 0) + 1,
  );
  ultimoEnvioBotTs.set(numeroLimpio, Date.now());

  try {
    const enviado = await s.sendMessage(remoteJid, contenido, opciones);
    if (enviado?.key?.id) {
      registrarIdMensajeDelBot(enviado.key.id);
    }
    if (textoRegistrable) {
      ultimaRespuestaGenerada.set(numeroLimpio, textoRegistrable);
      ultimaRespuestaGeneradaTs.set(numeroLimpio, Date.now());
      if (!esNumeroVIP(numeroLimpio)) {
        registrarEnHistorialChat(numeroLimpio, "BOT", textoRegistrable);
      }
    }
    return enviado;
  } finally {
    ultimoEnvioBotTs.set(numeroLimpio, Date.now());
    const restantes = (enviosBotEnVuelo.get(numeroLimpio) || 1) - 1;
    if (restantes <= 0) enviosBotEnVuelo.delete(numeroLimpio);
    else enviosBotEnVuelo.set(numeroLimpio, restantes);
  }
}

// Envía un mensaje acompañado de la imagen de la app (si existe media/foto_app.webp), o solo texto como respaldo
async function enviarMensajeConFotoApp(
  sock,
  remoteJid,
  texto,
  ignorarAborto = false,
) {
  if (PATH_FOTO_APP && fs.existsSync(PATH_FOTO_APP)) {
    try {
      return await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          image: { url: PATH_FOTO_APP },
          caption: texto,
        },
        {},
        ignorarAborto,
      );
    } catch (errImg) {
      console.error(
        `⚠️ No se pudo adjuntar foto_app, enviando texto:`,
        errImg.message,
      );
    }
  }
  return await enviarMensajeSeguro(
    sock,
    remoteJid,
    { text: texto },
    {},
    ignorarAborto,
  );
}

async function enviarBienvenidaSiEsNuevo(
  sock,
  numeroLimpio,
  remoteJid,
  pasoActual,
  yaTuvoPruebaReal,
  textoExtra = "",
  textoDelCliente = "",
  textoCitado = "",
) {
  if (pasoActual !== 0 || yaTuvoPruebaReal) return;
  if (abortarEnvioEnCurso.has(numeroLimpio) && !esNumeroVIP(numeroLimpio))
    return;

  const tLimpio = String(textoDelCliente || "")
    .trim()
    .toLowerCase();
  const respondeConNumeroDeMenu =
    /^(1|2|3|4|uno|dos|tres|1️⃣|2️⃣|3️⃣|opcion 1|opcion 2|opcion 3)$/.test(
      tLimpio,
    );
  const citaMenuDelBot = /mnet vpn|internet ilimitado|prueba gratis/i.test(
    String(textoCitado || ""),
  );
  const historial = memoriaDisco.historialChat[numeroLimpio] || [];
  const botYaHabloEnEsteChat = historial.some((h) => h.rol === "BOT");

  if (respondeConNumeroDeMenu || citaMenuDelBot || botYaHabloEnEsteChat) {
    await actualizarPasoSeguro(numeroLimpio, 1);
    return;
  }

  await esperarRetardoHumano(sock, remoteJid, 1, 2);
  const textoFinal = textoExtra
    ? `${MENSAJE_BIENVENIDA_DIRECTA}\n\n${textoExtra}`
    : MENSAJE_BIENVENIDA_DIRECTA;

  await enviarMensajeConFotoApp(sock, remoteJid, textoFinal);
  await actualizarPasoSeguro(numeroLimpio, 1);
}

// Envía una respuesta informativa unificando la bienvenida breve en un único mensaje si estaba en Paso 0
// (Evita mandar 2 mensajes separados para una sola consulta inicial)
async function responderConsultaConBienvenidaUnificada(
  sock,
  numeroLimpio,
  remoteJid,
  pasoActual,
  yaTuvoPruebaReal,
  textoRespuesta,
  textoDelCliente = "",
  textoCitado = "",
) {
  const historial = memoriaDisco.historialChat[numeroLimpio] || [];
  const botYaHabloEnEsteChat = historial.some((h) => h.rol === "BOT");
  const citaMenuDelBot = /mnet vpn|internet ilimitado|prueba gratis/i.test(
    String(textoCitado || ""),
  );

  if (
    pasoActual === 0 &&
    !yaTuvoPruebaReal &&
    !botYaHabloEnEsteChat &&
    !citaMenuDelBot
  ) {
    const yaEmpiezaConMNet = /mnet vpn/i.test(textoRespuesta.slice(0, 80));
    const textoIntegrado = yaEmpiezaConMNet
      ? `¡Hola! 👋 Te damos la bienvenida a *MNet VPN* ⚡\n🤖 _Soy el asistente virtual de atención automática._\n\n${textoRespuesta}`
      : `${MENSAJE_BIENVENIDA_DIRECTA}\n\n${textoRespuesta}`;

    await esperarRetardoHumano(sock, remoteJid, 1, 2);
    await enviarMensajeConFotoApp(sock, remoteJid, textoIntegrado);
    await actualizarPasoSeguro(numeroLimpio, 1);
    return 1;
  }

  await esperarRetardoHumano(sock, remoteJid, 1, 2);
  await enviarMensajeSeguro(sock, remoteJid, { text: textoRespuesta });
  if (pasoActual === 0 && !yaTuvoPruebaReal) {
    await actualizarPasoSeguro(numeroLimpio, 1);
    return 1;
  }
  return pasoActual;
}

async function notificarAlAdmin(sock, numeroLimpio, tipoAlerta, detalleTexto) {
  if (!NUMERO_ADMIN_ALERTAS || NUMERO_ADMIN_ALERTAS === "5491123456789") {
    console.log(
      `⚠️ [ALERTA ADMIN] Configurá NUMERO_ADMIN_ALERTAS para recibir avisos.`,
    );
    return;
  }

  const info = memoriaDisco.mapaContactos[numeroLimpio] || {
    nombre: "Cliente",
    telefonoReal: null,
  };
  const numParaLink =
    info.telefonoReal || (numeroLimpio.length <= 13 ? numeroLimpio : null);
  const lineaLink = numParaLink
    ? `📲 *Abrir chat:* https://wa.me/${numParaLink}`
    : `🆔 *ID Usuario:* \`${numeroLimpio}\` _(Buscalo en tu WhatsApp como *${info.nombre}*)_`;

  const adminJid = `${NUMERO_ADMIN_ALERTAS.replace(/\D/g, "")}@s.whatsapp.net`;

  const textoAlerta =
    `🚨 *ALERTA: ${tipoAlerta}* 🚨\n\n` +
    `👤 *Nombre en WA:* ${info.nombre}\n` +
    `${lineaLink}\n` +
    `💬 *Detalle:* ${detalleTexto}\n\n` +
    `💡 *Comandos rápidos:*\n` +
    `• \`venta ${numParaLink || numeroLimpio} 30 USUARIO CLAVE\`\n` +
    `• \`desbloquear ${numParaLink || numeroLimpio}\`\n` +
    `• \`mandarprueba ${numParaLink || numeroLimpio}\``;

  try {
    await enviarMensajeSeguro(sock, adminJid, { text: textoAlerta }, {}, true);
    console.log(
      `📲 [ALERTA ADMIN] Enviada a tu celular -> ${tipoAlerta} | Cliente: "${info.nombre}" (${numeroLimpio})`,
    );
  } catch (err) {
    console.error(`❌ Error enviando alerta al admin:`, err.message);
  }
}

async function silenciarBotParaCliente(
  numeroLimpio,
  motivo = "",
  pasoAnteriorOpcional = null,
) {
  if (esNumeroVIP(numeroLimpio)) {
    console.log(
      `ℹ️ [MODO VIP] "${numeroLimpio}" activó condición de Paso 99 (${motivo}), pero no se bloquea por ser VIP.`,
    );
    return;
  }

  const yaEstabaEnPaso99 =
    chatsBloqueados.has(numeroLimpio) ||
    Boolean(memoriaDisco.infoPaso99[numeroLimpio]);

  abortarEnvioEnCurso.add(numeroLimpio);
  chatsBloqueados.add(numeroLimpio);
  intentosFallidos.delete(numeroLimpio);
  audiosSeguidos.delete(numeroLimpio);
  if (temporizadoresDebounce.has(numeroLimpio)) {
    clearTimeout(temporizadoresDebounce.get(numeroLimpio));
    temporizadoresDebounce.delete(numeroLimpio);
  }
  colaMensajes.delete(numeroLimpio);

  let pasoPrevio =
    pasoAnteriorOpcional && pasoAnteriorOpcional !== 99
      ? pasoAnteriorOpcional
      : memoriaDisco.ultimoPasoValido[numeroLimpio] ||
        memoriaDisco.infoPaso99[numeroLimpio]?.pasoPrevio ||
        null;

  if (!pasoPrevio || pasoPrevio === 99) {
    try {
      const u = await dbUtils.getUsuario(numeroLimpio);
      if (u && u.paso_flujo && u.paso_flujo !== 99) {
        pasoPrevio = u.paso_flujo;
      } else if (u && (u.prueba_enviada === 1 || u.prueba_enviada === true)) {
        pasoPrevio = 3;
      } else {
        pasoPrevio = 1;
      }
    } catch (e) {
      pasoPrevio = 1;
    }
  }

  memoriaDisco.ultimoPasoValido[numeroLimpio] = pasoPrevio;
  memoriaDisco.infoPaso99[numeroLimpio] = {
    ts: Math.floor(Date.now() / 1000),
    motivo: motivo || "Atención humana",
    pasoPrevio,
  };
  if (!Array.isArray(memoriaDisco.buzonPaso99[numeroLimpio])) {
    memoriaDisco.buzonPaso99[numeroLimpio] = [];
  }
  guardarMemoriaDisco();

  await dbUtils.actualizarPaso(numeroLimpio, 99);

  if (!yaEstabaEnPaso99) {
    const nombre =
      memoriaDisco.mapaContactos[numeroLimpio]?.nombre || "Cliente";
    registrarLog(numeroLimpio, "DERIVADO_A_OPERADOR", motivo);
    console.log(
      `🔒 Bot PAUSADO (Paso 99) para "${nombre}" (${numeroLimpio}) | Guardado en Paso ${pasoPrevio} | Motivo: ${motivo}`,
    );
  }
}

// ============================================================================
// AUTOMATIZACIÓN Y REENVÍO DE PRUEBAS VPN (PLAY STORE + VIDEO + CREDENCIALES)
// ============================================================================
async function reenviarCredencialVigente(
  sock,
  numeroLimpio,
  remoteJid,
  credVigente,
  operadorOpcional = null,
) {
  const opFinal =
    operadorOpcional ||
    memoriaDisco.operadorDetectado[numeroLimpio] ||
    credVigente.operador ||
    "personal";

  const textoServidor =
    opFinal === "claro"
      ? "🔒 *Servidor a seleccionar:* `Claro Ultra`"
      : "🔒 *Servidor a seleccionar:* `Personal ULTRA 1 o 2`";

  const msgReenvio =
    `🔄 *TU PRUEBA GRATUITA DE 24 HS SIGUE ACTIVA* 🔄\n` +
    `_(Aún contás con aproximadamente ${credVigente.horasRestantes} hs de vigencia)_\n\n` +
    `📥 *Enlace oficial de descarga (Google Play Store):*\n${URL_PLAY_STORE}\n\n` +
    `👤 *Usuario:* \`${credVigente.usuario}\`\n` +
    `🔐 *Contraseña:* \`${credVigente.password}\`\n` +
    `${textoServidor}\n\n` +
    `👇 _A continuación te enviamos tu usuario y contraseña por separado para que puedas copiarlos y pegarlos directamente en la aplicación:_`;

  await enviarMensajeSeguro(sock, remoteJid, { text: msgReenvio });
  await delay(500);
  await enviarMensajeSeguro(sock, remoteJid, {
    text: String(credVigente.usuario),
  });
  await delay(500);
  await enviarMensajeSeguro(sock, remoteJid, {
    text: String(credVigente.password),
  });
  await delay(500);
  await enviarMensajeSeguro(sock, remoteJid, {
    text: "Probá ingresando esos dos datos sin espacios en blanco. Si te surge algún inconveniente, envianos una captura de pantalla de la aplicación por acá. 👍",
  });

  // Marca ventana de cierre para que si responde "Ok" o "Gracias" enseguida, no mande otro texto innecesario
  ultimoCierreCordialTs.set(numeroLimpio, Date.now());

  registrarLog(
    numeroLimpio,
    "REENVIO_PRUEBA_24H",
    `Se reenvió la misma prueba vigente User=${credVigente.usuario} (quedan ${credVigente.horasRestantes}h)`,
  );
  console.log(
    `♻️ [${numeroLimpio}] Prueba vigente (<24hs) reenviada sin gastar API: ${credVigente.usuario}`,
  );
}

// Envía la tarjeta de descarga en Google Play Store (con foto de la app) + el video tutorial
async function enviarVideoYApkVPN(
  sock,
  numeroLimpio,
  remoteJid,
  forzadoPorAdmin = false,
) {
  if (
    !forzadoPorAdmin &&
    abortarEnvioEnCurso.has(numeroLimpio) &&
    !esNumeroVIP(numeroLimpio)
  ) {
    return false;
  }

  const textoPlayStore =
    `📥 *Paso 1: Descargá nuestra aplicación oficial desde Google Play Store:*\n` +
    `${URL_PLAY_STORE}\n\n` +
    `✅ _Aplicación verificada y segura (Google Play Protect)._`;

  await enviarMensajeConFotoApp(
    sock,
    remoteJid,
    textoPlayStore,
    forzadoPorAdmin,
  );
  await delay(1500);

  if (
    !forzadoPorAdmin &&
    abortarEnvioEnCurso.has(numeroLimpio) &&
    !esNumeroVIP(numeroLimpio)
  ) {
    return false;
  }

  if (fs.existsSync(PATH_VIDEO_VPN)) {
    try {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          video: { url: PATH_VIDEO_VPN },
          caption:
            "🎥 *Paso 2: Mirá este breve video tutorial* para ver cómo elegir el servidor e ingresar tus credenciales.",
        },
        {},
        forzadoPorAdmin,
      );
      await delay(1500);
    } catch (errVideo) {
      console.error(
        `⚠️ No se pudo subir el video a ${numeroLimpio}:`,
        errVideo.message,
      );
    }
  }

  return true;
}

async function enviarPackVPN(
  sock,
  numeroLimpio,
  remoteJid,
  operador = "personal",
  forzadoPorAdmin = false,
) {
  delete memoriaDisco.esperandoComprobante[numeroLimpio];

  const idsCliente = obtenerIdsVinculados(numeroLimpio);
  if (idsCliente.length === 0) idsCliente.push(numeroLimpio);

  // Control de concurrencia e idempotencia: si ya se está generando una prueba para este cliente, no duplicar
  if (
    !forzadoPorAdmin &&
    idsCliente.some((id) => creandoPruebaEnCurso.has(id))
  ) {
    console.log(
      `🛡️ [IDEMPOTENCIA] Creación de prueba ya en curso para ${numeroLimpio}. Ignorando llamada duplicada.`,
    );
    return true;
  }

  idsCliente.forEach((id) => creandoPruebaEnCurso.add(id));

  try {
    const validacion = validarPermisoCreacionPrueba(
      numeroLimpio,
      false,
      forzadoPorAdmin,
    );
    if (!validacion.permitido && validacion.credVigente) {
      await esperarRetardoHumano(sock, remoteJid, 1, 2);
      await reenviarCredencialVigente(
        sock,
        numeroLimpio,
        remoteJid,
        validacion.credVigente,
        operador,
      );
      memoriaDisco.ultimoPasoValido[numeroLimpio] = 3;
      guardarMemoriaDisco();
      await dbUtils.actualizarPaso(numeroLimpio, 3);
      await dbUtils.marcarPruebaEnviada(numeroLimpio);
      return true;
    }

    await esperarRetardoHumano(sock, remoteJid, 1, 2);

    const okMedia = await enviarVideoYApkVPN(
      sock,
      numeroLimpio,
      remoteJid,
      forzadoPorAdmin,
    );
    if (!okMedia) return false;

    if (
      !forzadoPorAdmin &&
      abortarEnvioEnCurso.has(numeroLimpio) &&
      !esNumeroVIP(numeroLimpio)
    ) {
      return false;
    }

    const credVigente = obtenerPruebaVigente24h(numeroLimpio);
    let cred = credVigente
      ? {
          usuario: credVigente.usuario,
          password: credVigente.password,
          duracionHoras: credVigente.horasRestantes || 24,
        }
      : null;

    if (!cred) {
      try {
        cred = await ultranet.generarCredencialPruebaUltraNet();
      } catch (e) {
        console.error(`❌ Error UltraNet:`, e.message);
      }
    }

    if (!cred) {
      const infoC = memoriaDisco.mapaContactos[numeroLimpio] || {};
      await dbUtils.registrarIncidenteBD?.({
        numero: numeroLimpio,
        nombre: infoC.nombre || "Cliente",
        telefonoReal: infoC.telefonoReal || "",
        operador,
        paso: 7,
        tipoIncidente: "FALLO_API_VELTRIX",
        detalle: "El panel Veltrix no devolvió credenciales tras 2 intentos",
        resolucion: "OPERADOR (Paso 99)",
      });

      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text: "⚠️ Estamos experimentando una breve demora en el servidor de cuentas automáticas. Aguardanos unos minutos por favor y nuestro operador te enviará tu acceso manualmente. 🙌🏻",
        },
        {},
        true,
      );
      await silenciarBotParaCliente(
        numeroLimpio,
        "Fallo API Veltrix - Requiere envío manual",
        7,
      );
      await notificarAlAdmin(
        sock,
        numeroLimpio,
        "FALLO CREACIÓN DE PRUEBA (API)",
        "El panel Veltrix no devolvió credenciales tras 2 intentos.",
      );
      return false;
    }

    // Si mientras se subía el video el cliente escribió aclarando que tenía el otro operador, respetamos el último
    const opActualizado =
      memoriaDisco.operadorDetectado[numeroLimpio] || operador;

    const textoServidor =
      opActualizado === "claro"
        ? "🔒 *Servidor a seleccionar:* `Claro Ultra`"
        : "🔒 *Servidor a seleccionar:* `Personal ULTRA 1 o 2`";

    const msgCred =
      `✅ *TU PRUEBA DE 24 HORAS ESTÁ ACTIVA* ✅\n\n` +
      `👤 *Usuario:* \`${cred.usuario}\`\n` +
      `🔐 *Contraseña:* \`${cred.password}\`\n` +
      `🕒 *Vigencia:* ${cred.duracionHoras} horas corridas\n` +
      `${textoServidor}\n\n` +
      `💡 _Descargá la aplicación desde el enlace oficial de Google Play Store enviado arriba e ingresá tus datos respetando las minúsculas._\n\n` +
      `👇 *Paso 3: A continuación te dejamos tu usuario y contraseña por separado para que puedas copiarlos y pegarlos directamente en la app:*`;

    await enviarMensajeSeguro(sock, remoteJid, { text: msgCred }, {}, true);
    await delay(600);
    await enviarMensajeSeguro(
      sock,
      remoteJid,
      { text: String(cred.usuario) },
      {},
      true,
    );
    await delay(600);
    await enviarMensajeSeguro(
      sock,
      remoteJid,
      { text: String(cred.password) },
      {},
      true,
    );
    await delay(600);
    await enviarMensajeSeguro(
      sock,
      remoteJid,
      {
        text: "Copiá y pegá esos dos datos en la aplicación para conectarte. Cualquier consulta o novedad, avisanos por acá. 👍",
      },
      {},
      true,
    );

    const tsCreacion = Math.floor(Date.now() / 1000);
    if (!credVigente) {
      const objCred = {
        usuario: String(cred.usuario),
        password: String(cred.password),
        operador: opActualizado,
        duracionHoras: cred.duracionHoras || 24,
        tsCreacion,
      };
      for (const idVinc of idsCliente) {
        memoriaDisco.credencialesEnviadas[idVinc] = objCred;
        delete memoriaDisco.chequeoInicialEnviado[idVinc];
        delete memoriaDisco.seguimientoPruebaEnviado[idVinc];
      }
      delete memoriaDisco.chequeoInicialEnviado[`user_${cred.usuario}`];
      delete memoriaDisco.seguimientoPruebaEnviado[`user_${cred.usuario}`];

      const infoContacto = memoriaDisco.mapaContactos[numeroLimpio] || {};
      await dbUtils.registrarPruebaBD?.({
        numero: numeroLimpio,
        nombre: infoContacto.nombre || "Cliente",
        telefonoReal:
          infoContacto.telefonoReal ||
          (numeroLimpio.startsWith("54") ? numeroLimpio : ""),
        operador: opActualizado,
        usuario: String(cred.usuario),
        password: String(cred.password),
        duracionHoras: cred.duracionHoras || 24,
        tsCreacion,
      });
    }

    delete memoriaDisco.soporteNivel1Enviado[numeroLimpio];
    memoriaDisco.ultimoPasoValido[numeroLimpio] = 3;
    ultimoCierreCordialTs.set(numeroLimpio, Date.now());
    guardarMemoriaDisco();

    registrarLog(
      numeroLimpio,
      "PRUEBA_AUTOMATICA",
      `Op=${opActualizado} User=${cred.usuario} Pass=${cred.password}`,
    );
    console.log(
      `🎁 Prueba (${opActualizado.toUpperCase()}) enviada a ${numeroLimpio}: ${cred.usuario}`,
    );

    intentosFallidos.delete(numeroLimpio);
    await dbUtils.actualizarPaso(numeroLimpio, 3);
    await dbUtils.marcarPruebaEnviada(numeroLimpio);
    return true;
  } finally {
    idsCliente.forEach((id) => creandoPruebaEnCurso.delete(id));
  }
}

// ============================================================================
// MOTOR DE SEGUIMIENTO PROACTIVO (30 MIN, 20 HS Y VENCIMIENTO DE PLAN PAGO)
// ============================================================================
async function verificarYEnviarSeguimientosPrueba(sock) {
  const s = sockActual || sock;
  if (!s || ejecutandoRevisionSeguimiento || memoriaDisco.modoCaidaActivo) {
    return 0;
  }

  ejecutandoRevisionSeguimiento = true;
  let enviadosEnCiclo = 0;

  try {
    const ahoraSeg = Math.floor(Date.now() / 1000);
    const entradas = Object.entries(memoriaDisco.credencialesEnviadas || {});

    // BLOQUE 1: CHEQUEO INICIAL DE CONEXIÓN (30 min tras entregar prueba)
    for (const [idUsuario, cred] of entradas) {
      if (!cred || !cred.usuario || !cred.tsCreacion) continue;
      if (esNumeroVIP(idUsuario)) continue;
      if (cred.esVentaConfirmada || (cred.duracionHoras || 24) > 24) continue;

      const keyUsuarioVeltrix = `user_${cred.usuario}`;

      if (
        memoriaDisco.chequeoInicialEnviado[idUsuario] ||
        memoriaDisco.chequeoInicialEnviado[keyUsuarioVeltrix]
      ) {
        continue;
      }

      const minutosTranscurridos = (ahoraSeg - cred.tsCreacion) / 60;
      if (
        minutosTranscurridos < MINUTOS_CHEQUEO_INICIAL_PRUEBA ||
        minutosTranscurridos > MINUTOS_MAX_VENTANA_CHEQUEO_INICIAL
      ) {
        continue;
      }

      if (
        chatsBloqueados.has(idUsuario) ||
        memoriaDisco.infoPaso99[idUsuario] ||
        procesandoUsuario.get(idUsuario) ||
        memoriaDisco.esperandoComprobante[idUsuario]
      ) {
        continue;
      }

      const historial = memoriaDisco.historialChat[idUsuario] || [];
      const respondioDespuesDeLaPrueba = historial.some(
        (h) =>
          (h.rol === "CLIENTE" || h.rol === "OPERADOR") &&
          (h.ts || 0) >= cred.tsCreacion,
      );

      if (respondioDespuesDeLaPrueba) {
        memoriaDisco.chequeoInicialEnviado[idUsuario] = ahoraSeg;
        memoriaDisco.chequeoInicialEnviado[keyUsuarioVeltrix] = ahoraSeg;
        guardarMemoriaDisco();
        continue;
      }

      let uBD = null;
      try {
        uBD = await dbUtils.getUsuario(idUsuario);
      } catch (e) {}

      if (uBD && (uBD.es_cliente === 1 || uBD.paso_flujo === 99)) {
        memoriaDisco.chequeoInicialEnviado[idUsuario] = ahoraSeg;
        memoriaDisco.chequeoInicialEnviado[keyUsuarioVeltrix] = ahoraSeg;
        guardarMemoriaDisco();
        continue;
      }

      const jidDestino = obtenerJidDeUsuario(idUsuario);
      const textoChequeo = construirMensajeChequeoInicialPrueba(cred);

      try {
        await esperarRetardoHumano(s, jidDestino, 1, 2);
        const enviado = await enviarMensajeSeguro(
          s,
          jidDestino,
          { text: textoChequeo },
          {},
          false,
        );

        if (enviado) {
          memoriaDisco.chequeoInicialEnviado[idUsuario] = ahoraSeg;
          memoriaDisco.chequeoInicialEnviado[keyUsuarioVeltrix] = ahoraSeg;
          memoriaDisco.ultimoPasoValido[idUsuario] = 3;
          guardarMemoriaDisco();
          await dbUtils.actualizarPaso(idUsuario, 3);

          const nombre =
            memoriaDisco.mapaContactos[idUsuario]?.nombre || "Cliente";
          registrarLog(
            idUsuario,
            "CHEQUEO_INICIAL_30M",
            `Enviado chequeo de conexión inicial (${Math.round(minutosTranscurridos)}m sin responder) User=${cred.usuario}`,
          );
          console.log(
            `👋 [CHEQUEO 30 MIN] Enviado a "${nombre}" (${idUsuario}) | Usuario: ${cred.usuario}`,
          );
          enviadosEnCiclo++;

          await delay(8000);
        }
      } catch (errChequeo) {
        console.error(
          `⚠️ Error enviando chequeo inicial a ${idUsuario}:`,
          errChequeo.message,
        );
      }
    }

    // BLOQUE 2: SEGUIMIENTO PRE-VENCIMIENTO DE PRUEBA (20 hs a 36 hs)
    for (const [idUsuario, cred] of entradas) {
      if (!cred || !cred.usuario || !cred.tsCreacion) continue;
      if (esNumeroVIP(idUsuario)) continue;
      if (cred.esVentaConfirmada || (cred.duracionHoras || 24) > 24) continue;

      const keyUsuarioVeltrix = `user_${cred.usuario}`;

      if (
        memoriaDisco.seguimientoPruebaEnviado[idUsuario] ||
        memoriaDisco.seguimientoPruebaEnviado[keyUsuarioVeltrix]
      ) {
        continue;
      }

      const horasTranscurridas = (ahoraSeg - cred.tsCreacion) / 3600;
      if (
        horasTranscurridas < HORAS_AVISO_FIN_PRUEBA ||
        horasTranscurridas > HORAS_MAX_VENTANA_SEGUIMIENTO
      ) {
        continue;
      }

      if (
        chatsBloqueados.has(idUsuario) ||
        memoriaDisco.infoPaso99[idUsuario] ||
        procesandoUsuario.get(idUsuario) ||
        memoriaDisco.esperandoComprobante[idUsuario]
      ) {
        continue;
      }

      let uBD = null;
      try {
        uBD = await dbUtils.getUsuario(idUsuario);
      } catch (e) {}

      if (uBD && (uBD.es_cliente === 1 || uBD.paso_flujo === 99)) {
        memoriaDisco.seguimientoPruebaEnviado[idUsuario] = ahoraSeg;
        memoriaDisco.seguimientoPruebaEnviado[keyUsuarioVeltrix] = ahoraSeg;
        guardarMemoriaDisco();
        continue;
      }

      const historial = memoriaDisco.historialChat[idUsuario] || [];
      const ultimoMsg = historial[historial.length - 1];
      if (ultimoMsg && ahoraSeg - (ultimoMsg.ts || 0) < 30 * 60) {
        continue;
      }

      const jidDestino = obtenerJidDeUsuario(idUsuario);
      const textoSeguimiento = construirMensajeSeguimientoPrueba(
        cred,
        horasTranscurridas,
      );

      try {
        await esperarRetardoHumano(s, jidDestino, 1, 2);
        const enviado = await enviarMensajeSeguro(
          s,
          jidDestino,
          { text: textoSeguimiento },
          {},
          false,
        );

        if (enviado) {
          memoriaDisco.seguimientoPruebaEnviado[idUsuario] = ahoraSeg;
          memoriaDisco.seguimientoPruebaEnviado[keyUsuarioVeltrix] = ahoraSeg;
          memoriaDisco.ultimoPasoValido[idUsuario] = 3;
          guardarMemoriaDisco();
          await dbUtils.actualizarPaso(idUsuario, 3);
          await dbUtils.marcarSeguimientoPruebaBD?.(idUsuario, cred.usuario);

          const nombre =
            memoriaDisco.mapaContactos[idUsuario]?.nombre || "Cliente";
          registrarLog(
            idUsuario,
            "SEGUIMIENTO_FIN_PRUEBA",
            `Enviado seguimiento automático (${horasTranscurridas.toFixed(1)}h desde creación) User=${cred.usuario}`,
          );
          console.log(
            `🔔 [SEGUIMIENTO PRUEBA] Enviado a "${nombre}" (${idUsuario}) | Usuario: ${cred.usuario}`,
          );
          enviadosEnCiclo++;

          await delay(8000);
        }
      } catch (errEnvio) {
        console.error(
          `⚠️ Error enviando seguimiento de prueba a ${idUsuario}:`,
          errEnvio.message,
        );
      }
    }

    // BLOQUE 3: AVISO DE VENCIMIENTO DE PLANES PAGOS (Faltando <= 24 hs)
    if (dbUtils.obtenerEstadoSuscripcionesActuales) {
      const suscripciones = await dbUtils.obtenerEstadoSuscripcionesActuales();
      for (const sub of suscripciones) {
        if (!sub || sub.recordatorio_enviado === 1) continue;
        if (esNumeroVIP(sub.numero)) continue;

        const segRestantes = (sub.ts_vencimiento || 0) - ahoraSeg;
        if (segRestantes > 3600 && segRestantes <= 24 * 3600) {
          const horasRest = Math.ceil(segRestantes / 3600);
          const jidSub = obtenerJidDeUsuario(sub.numero);
          const msgRenovacion =
            `⏳ *AVISO DE VENCIMIENTO MNET VPN* ⏳\n\n` +
            `¡Hola *${sub.nombre}*! 👋 Te recordamos que a tu plan activo de *${sub.dias_plan} días* (usuario \`${sub.usuario_vpn}\`) le restan aproximadamente *${horasRest} horas* de vigencia.\n\n` +
            `• 🔄 Si deseás *renovarlo* para continuar con el servicio sin interrupciones (3 días x $2.000, 7 días x $3.000, 15 días x $5.000 o 30 días x $7.000), podés transferir al alias \`milciades.genes\` y enviarnos el comprobante por este medio.\n` +
            `• ¡Muchas gracias por elegirnos! 🚀🙌🏻`;

          try {
            await esperarRetardoHumano(s, jidSub, 1, 2);
            const envSub = await enviarMensajeSeguro(
              s,
              jidSub,
              { text: msgRenovacion },
              {},
              true,
            );
            if (envSub) {
              await dbUtils.marcarRecordatorioVentaEnviado(sub.id);
              memoriaDisco.esperandoComprobante[sub.numero] = true;
              guardarMemoriaDisco();
              console.log(
                `🔔 [AVISO RENOVACIÓN PLAN] Enviado a "${sub.nombre}" (${sub.numero}) - Usuario: ${sub.usuario_vpn}`,
              );
              await delay(8000);
            }
          } catch (e) {}
        }
      }
    }
  } finally {
    ejecutandoRevisionSeguimiento = false;
  }

  return enviadosEnCiclo;
}

async function retomarConversacionAlDesbloquear(
  sock,
  idObjetivo,
  jidObjetivo,
  pasoRestaurado,
) {
  await esperarRetardoHumano(sock, jidObjetivo, 1, 2);

  if (pasoRestaurado === 7) {
    await enviarMensajeSeguro(
      sock,
      jidObjetivo,
      { text: MENSAJE_ELEGIR_OPERADOR },
      {},
      true,
    );
  } else if (pasoRestaurado === 4) {
    await enviarMensajeSeguro(
      sock,
      jidObjetivo,
      { text: MENSAJE_RETOMAR_PASO4 },
      {},
      true,
    );
  } else if (pasoRestaurado === 3) {
    await enviarMensajeSeguro(
      sock,
      jidObjetivo,
      { text: MENSAJE_RETOMAR_PASO3 },
      {},
      true,
    );
  } else if (pasoRestaurado === 8) {
    await enviarMensajeSeguro(
      sock,
      jidObjetivo,
      { text: MENSAJE_DESPEDIDA_CHIP },
      {},
      true,
    );
  } else {
    await enviarMensajeSeguro(
      sock,
      jidObjetivo,
      { text: MENSAJE_RETOMAR_PASO1 },
      {},
      true,
    );
    await dbUtils.actualizarPaso(idObjetivo, 1);
    memoriaDisco.ultimoPasoValido[idObjetivo] = 1;
    guardarMemoriaDisco();
  }
}

// ============================================================================
// PROCESADOR INTELIGENTE DE MENSAJES Y MOTOR DE DECISIONES
// ============================================================================
async function procesarMensajeInteligente(
  sock,
  numeroLimpio,
  remoteJid,
  textoUnificado,
  textoCitado,
  pasoActual,
  yaTuvoPruebaReal,
  ultimoMensajeRaw,
) {
  const infoContacto = memoriaDisco.mapaContactos[numeroLimpio] || {
    nombre: "Cliente",
  };
  const credActivaCliente = buscarCredencialCruzada(numeroLimpio);
  const operadorCliente =
    memoriaDisco.operadorDetectado[numeroLimpio] ||
    credActivaCliente?.operador ||
    "personal";

  let uBDCliente = null;
  try {
    uBDCliente = await dbUtils.getUsuario(numeroLimpio);
  } catch (e) {}
  const esClientePago = Boolean(
    uBDCliente?.es_cliente === 1 || credActivaCliente?.esVentaConfirmada,
  );

  // Si un usuario quedó marcado en Paso 3 por error pero jamás recibió credencial ni es cliente pago,
  // y escribe pidiendo información inicial o prueba del anuncio (ej. caso 027030608b5f), restauramos a Paso 1
  const tMinusculaRevision = String(textoUnificado || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (
    pasoActual === 3 &&
    !credActivaCliente &&
    !esClientePago &&
    !yaTuvoPruebaReal &&
    /\b(interesad\w*|anuncio|publicacion|publi|informacion|info|prueba|prueva|probar|gratis)\b/.test(
      tMinusculaRevision,
    )
  ) {
    pasoActual = 1;
    await actualizarPasoSeguro(numeroLimpio, 1);
  }

  // Si el cliente ya recibió una prueba y escribe cualquier mensaje, desactivamos el chequeo de los 30 min
  if (
    (pasoActual === 3 || yaTuvoPruebaReal || credActivaCliente) &&
    !esNumeroVIP(numeroLimpio)
  ) {
    const ahoraSeg = Math.floor(Date.now() / 1000);
    memoriaDisco.chequeoInicialEnviado[numeroLimpio] = ahoraSeg;
    if (credActivaCliente?.usuario) {
      memoriaDisco.chequeoInicialEnviado[`user_${credActivaCliente.usuario}`] =
        ahoraSeg;
    }
    guardarMemoriaDisco();
  }

  console.log(
    `\n👀 USUARIO: "${infoContacto.nombre}" (${numeroLimpio}) | Paso BD: ${pasoActual} | Prueba Usada: ${yaTuvoPruebaReal} | Cliente Pago: ${esClientePago}`,
  );

  let intencion = "MULTIMEDIA";
  let funcionSeleccionada = "respuesta_estatica";
  let argumentosUtilizados = {};
  let resultadoFuncion = "OK";
  let errorProducido = null;
  let pasoNuevo = pasoActual;
  let requirioHumano = false;

  const finalizarYRegistrarTelemetria = () => {
    if (esNumeroVIP(numeroLimpio)) return;
    const metodoDeteccion =
      metadatosClasificacionIA.get(numeroLimpio) || "REGLA";
    const respuestaTexto =
      ultimaRespuestaGenerada.get(numeroLimpio) || "[SIN_TEXTO]";
    const resuelto =
      !requirioHumano && intencion !== "DESCONOCIDO" && !errorProducido;
    registrarTelemetriaIA({
      numeroLimpio,
      mensajeRecibido: textoUnificado || "[MULTIMEDIA]",
      respuestaGenerada: respuestaTexto,
      intencionDetectada: intencion,
      metodoDeteccion,
      funcionSeleccionada,
      argumentosUtilizados,
      resultadoFuncion,
      errorProducido,
      pasoPrevio: pasoActual,
      pasoNuevo,
      resueltoAutonomamente: resuelto,
      requirioIntervencionHumana: requirioHumano,
    });
  };

  // 1. Manejo inteligente de Imágenes/Archivos
  if (ultimoMensajeRaw && esComprobanteOArchivo(ultimoMensajeRaw)) {
    const tCap = (textoUnificado || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const mencionaErrorExplicito =
      /\b(error|no conecta|no me conecta|no anda|no funciona|problema|ayuda|captura|bloqueo)\b/.test(
        tCap,
      ) || Boolean(memoriaDisco.soporteNivel1Enviado[numeroLimpio]);
    const mencionaPago =
      /\b(pague|transferi|comprobante|pago|transferencia|listo|ya esta|abone|renovar)\b/.test(
        tCap,
      );
    const pidioAliasAntes = Boolean(
      memoriaDisco.esperandoComprobante[numeroLimpio],
    );

    const esPosibleComprobante =
      !mencionaErrorExplicito &&
      (mencionaPago ||
        (pidioAliasAntes && (pasoActual === 4 || !yaTuvoPruebaReal)));

    // Un cliente nuevo (Paso 0 o 1, sin prueba previa y sin haber pedido alias) que adjunta la imagen
    // de un flyer/anuncio de Meta o tutorial NO debe ser bloqueado en Paso 99
    const esFlyerDeClienteNuevo =
      (pasoActual === 0 || pasoActual === 1) &&
      !yaTuvoPruebaReal &&
      !pidioAliasAntes &&
      !mencionaPago &&
      !mencionaErrorExplicito;

    if (!esFlyerDeClienteNuevo) {
      await esperarRetardoHumano(sock, remoteJid, 1, 3);
      requirioHumano = true;
      pasoNuevo = 99;

      if (esPosibleComprobante) {
        intencion = "ARCHIVO_COMPROBANTE_PAGO";
        funcionSeleccionada = "silenciarBotParaCliente";
        console.log(
          `💸 [${numeroLimpio}] Envió posible comprobante de pago (Pendiente de comando 'venta' por Admin).`,
        );
        await enviarMensajeSeguro(sock, remoteJid, {
          text: MENSAJE_PAGO_RECIBIDO,
        });
        await silenciarBotParaCliente(
          numeroLimpio,
          "Envió posible comprobante de pago (Confirmar con comando 'venta')",
          pasoActual,
        );
        await notificarAlAdmin(
          sock,
          numeroLimpio,
          "POSIBLE COMPROBANTE DE PAGO 💸",
          textoUnificado
            ? `Archivo con texto: "${textoUnificado}" (Verificalo y activalo con el comando 'venta')`
            : "Envió imagen/PDF en espera de pago. (Verificalo antes de activar con 'venta').",
        );
      } else {
        intencion = "ARCHIVO_CAPTURA_SOPORTE";
        funcionSeleccionada = "silenciarBotParaCliente";
        console.log(
          `📎 [${numeroLimpio}] Envió captura de pantalla de la app / archivo.`,
        );

        await dbUtils.registrarIncidenteBD?.({
          numero: numeroLimpio,
          nombre: infoContacto.nombre || "Cliente",
          telefonoReal: infoContacto.telefonoReal || "",
          operador: operadorCliente,
          paso: pasoActual,
          tipoIncidente: "CAPTURA_PANTALLA_SOPORTE",
          detalle:
            textoUnificado || "Envió imagen/captura de pantalla sin texto",
          resolucion: "OPERADOR (Paso 99)",
        });

        await enviarMensajeSeguro(sock, remoteJid, {
          text: MENSAJE_CAPTURA_RECIBIDA,
        });
        await silenciarBotParaCliente(
          numeroLimpio,
          "Envió captura de pantalla de la app",
          pasoActual,
        );
        await notificarAlAdmin(
          sock,
          numeroLimpio,
          "CAPTURA DE PANTALLA DE LA APP 📎",
          textoUnificado
            ? `Captura con texto: "${textoUnificado}"`
            : "El cliente envió una captura de pantalla para revisar.",
        );
      }
      finalizarYRegistrarTelemetria();
      return;
    } else {
      console.log(
        `🖼️ [${numeroLimpio}] Cliente nuevo adjuntó imagen de anuncio/consulta ("${textoUnificado || "sin texto"}"). Procesando sin bloquear...`,
      );
      if (!textoUnificado) {
        textoUnificado = "Hola quiero información del anuncio";
      }
    }
  }

  // 2. Si envía Audio o Video Circular sin texto
  if (ultimoMensajeRaw && esAudio(ultimoMensajeRaw) && !textoUnificado) {
    intencion = "AUDIO_SIN_TEXTO";
    const cantAudios = (audiosSeguidos.get(numeroLimpio) || 0) + 1;
    audiosSeguidos.set(numeroLimpio, cantAudios);

    await enviarBienvenidaSiEsNuevo(
      sock,
      numeroLimpio,
      remoteJid,
      pasoActual,
      yaTuvoPruebaReal,
      "",
      "",
      textoCitado,
    );
    await esperarRetardoHumano(sock, remoteJid, 1, 2);

    if (cantAudios >= 2) {
      requirioHumano = true;
      pasoNuevo = 99;
      funcionSeleccionada = "silenciarBotParaCliente";
      await enviarMensajeSeguro(sock, remoteJid, {
        text: "👨‍💻 Como soy el asistente virtual no puedo reproducir mensajes de voz. En este momento derivo tu consulta con el operador para que escuche tus audios y te responda a la brevedad. 🙌🏻",
      });
      await silenciarBotParaCliente(
        numeroLimpio,
        "Envió múltiples audios",
        pasoActual || 1,
      );
      await notificarAlAdmin(
        sock,
        numeroLimpio,
        "CLIENTE ENVIÓ AUDIOS 🎤",
        "Mandó 2 audios seguidos.",
      );
    } else {
      await enviarMensajeSeguro(sock, remoteJid, {
        text: "🤖 Disculpá, como soy el asistente automático no puedo escuchar audios. ¿Podrías escribir tu consulta por texto o responder con *1* (Prueba gratis) o *2* (Planes y precios)? 👍",
      });
    }
    finalizarYRegistrarTelemetria();
    return;
  }

  // 3. Si envía solo un Sticker
  if (ultimoMensajeRaw && esSticker(ultimoMensajeRaw) && !textoUnificado) {
    if (pasoActual === 0) {
      intencion = "STICKER_INICIAL";
      pasoNuevo = 1;
      await esperarRetardoHumano(sock, remoteJid, 1, 3);
      await enviarMensajeConFotoApp(
        sock,
        remoteJid,
        obtenerAleatorio(VARIACIONES_INICIAL),
      );
      ultimoMenuEnviadoTs.set(numeroLimpio, Date.now());
      await actualizarPasoSeguro(numeroLimpio, 1);
      finalizarYRegistrarTelemetria();
    }
    return;
  }

  if (!textoUnificado) return;
  audiosSeguidos.delete(numeroLimpio);
  const textoLimpio = textoUnificado.toLowerCase().trim();

  // 4. Filtro de insultos
  if (detectarInsulto(textoLimpio) && !esNumeroVIP(numeroLimpio)) {
    intencion = "INSULTO";
    requirioHumano = true;
    pasoNuevo = 99;
    funcionSeleccionada = "silenciarBotParaCliente";
    await enviarMensajeSeguro(sock, remoteJid, {
      text: VARIACIONES_INSULTO[0],
    });
    await silenciarBotParaCliente(
      numeroLimpio,
      "Insulto detectado",
      pasoActual,
    );
    await notificarAlAdmin(
      sock,
      numeroLimpio,
      "INSULTO DETECTADO 🚫",
      `"${textoUnificado}"`,
    );
    finalizarYRegistrarTelemetria();
    return;
  }

  // 5. Clasificación Híbrida + Ortografía Fonética + Contexto Citado + IA
  console.log(`🧠 Analizando mensaje (Paso ${pasoActual}): "${textoLimpio}"`);
  intencion = await descubrirIntencionConIA(
    numeroLimpio,
    textoUnificado,
    pasoActual,
    yaTuvoPruebaReal,
    textoCitado,
  );
  console.log(`🎯 Intención detectada: ${intencion}`);

  // Si mientras clasificábamos (ej. esperando a Ollama) el cliente escribió otro mensaje más,
  // abortamos este ciclo para que procesarColaDeUsuario unifique todo y responda una sola vez
  if (hayMensajesNuevosEnEspera(numeroLimpio)) {
    console.log(
      `⏳ [${numeroLimpio}] Entró un nuevo mensaje mientras se analizaba. Re-agrupando antes de responder...`,
    );
    return;
  }

  // 6. Decisión de Cancelación en Vuelo ("No, pará", "Esperá un toque")
  if (intencion === "CANCELAR_OPERACION") {
    intentosFallidos.delete(numeroLimpio);
    funcionSeleccionada = "cancelarOperacionPendiente";
    abortarEnvioEnCurso.add(numeroLimpio);
    await esperarRetardoHumano(sock, remoteJid, 1, 2);
    abortarEnvioEnCurso.delete(numeroLimpio);
    await enviarMensajeSeguro(sock, remoteJid, {
      text: "👍 ¡Listo, detenemos acá! Quedamos a tu disposición; avisanos por este medio cuando gustes continuar.",
    });
    ultimoCierreCordialTs.set(numeroLimpio, Date.now());
    finalizarYRegistrarTelemetria();
    return;
  }

  // 7. Detección de Múltiples Intenciones (ej: "¿Cuánto sale y cómo funciona?")
  const listaIntenciones = detectarMultiplesIntenciones(
    numeroLimpio,
    textoUnificado,
    intencion,
    pasoActual,
    yaTuvoPruebaReal,
  );
  let prefijoMultiIntencion = "";
  if (listaIntenciones.length > 1 && listaIntenciones[0] !== intencion) {
    if (listaIntenciones[0] === "INFO_COMO_FUNCIONA") {
      prefijoMultiIntencion = `${MENSAJE_COMO_FUNCIONA}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    } else if (listaIntenciones[0] === "INFO_DURACION_PRUEBA") {
      prefijoMultiIntencion = `${construirMensajeDuracionPrueba(numeroLimpio)}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    } else if (listaIntenciones[0] === "INFO_COMPARTIR_TV") {
      prefijoMultiIntencion = `${MENSAJE_COMPARTIR_Y_TV}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
  }

  if (intencion === "INFO_DURACION_PRUEBA") {
    intentosFallidos.delete(numeroLimpio);
    funcionSeleccionada = "construirMensajeDuracionPrueba";

    const subCliente = await dbUtils.obtenerSuscripcionCliente?.(
      numeroLimpio,
      infoContacto.telefonoReal,
    );
    let textoRespDuracion = "";
    if (subCliente && subCliente.activa) {
      const fVenc = new Date(subCliente.ts_vencimiento * 1000);
      const pad = (n) => String(n).padStart(2, "0");
      const strVenc = `${pad(fVenc.getDate())}/${pad(fVenc.getMonth() + 1)}/${fVenc.getFullYear()} a las ${pad(fVenc.getHours())}:${pad(fVenc.getMinutes())} hs`;
      textoRespDuracion =
        `📅 *ESTADO DE TU SUSCRIPCIÓN MNET VPN*\n\n` +
        `👤 *Usuario:* \`${subCliente.usuario_vpn}\`\n` +
        `⏳ *Vencimiento:* *${strVenc}* (contás con *${subCliente.diasRestantes} días* disponibles).\n\n` +
        `Si deseás sumar días por adelantado o tenés alguna consulta, avisanos por acá. 🚀🙌🏻`;
    } else if (
      credActivaCliente?.esVentaConfirmada &&
      credActivaCliente?.tsVencimiento
    ) {
      const fVenc = new Date(credActivaCliente.tsVencimiento * 1000);
      const pad = (n) => String(n).padStart(2, "0");
      const strVenc = `${pad(fVenc.getDate())}/${pad(fVenc.getMonth() + 1)}/${fVenc.getFullYear()} a las ${pad(fVenc.getHours())}:${pad(fVenc.getMinutes())} hs`;
      const diasRest = Math.max(
        0,
        Math.ceil(
          (credActivaCliente.tsVencimiento * 1000 - Date.now()) / 86400000,
        ),
      );
      textoRespDuracion =
        `📅 *ESTADO DE TU SUSCRIPCIÓN MNET VPN*\n\n` +
        `👤 *Usuario:* \`${credActivaCliente.usuario}\`\n` +
        `⏳ *Vencimiento:* *${strVenc}* (contás con *${diasRest} días* disponibles).\n\n` +
        `Si deseás renovar o tenés alguna consulta, avisanos por acá. 🚀🙌🏻`;
    } else {
      textoRespDuracion =
        construirMensajeDuracionPrueba(numeroLimpio) +
        construirRecordatorioHilo(pasoActual, yaTuvoPruebaReal);
    }

    if (listaIntenciones.includes("COMPRAR")) {
      textoRespDuracion += `\n\n━━━━━━━━━━━━━━━━━━━━\n\n${MENSAJE_ACTIVACION}`;
      memoriaDisco.esperandoComprobante[numeroLimpio] = true;
      guardarMemoriaDisco();
    }

    pasoNuevo = await responderConsultaConBienvenidaUnificada(
      sock,
      numeroLimpio,
      remoteJid,
      pasoActual,
      yaTuvoPruebaReal,
      textoRespDuracion,
      textoLimpio,
      textoCitado,
    );
    finalizarYRegistrarTelemetria();
    return;
  }

  if (intencion === "INFO_COMPARTIR_TV") {
    intentosFallidos.delete(numeroLimpio);
    funcionSeleccionada = "enviarGuiaCompartirTV";
    let textoTv =
      MENSAJE_COMPARTIR_Y_TV +
      construirRecordatorioHilo(pasoActual, yaTuvoPruebaReal);
    if (listaIntenciones.includes("COMPRAR")) {
      textoTv += `\n\n━━━━━━━━━━━━━━━━━━━━\n\n${MENSAJE_ACTIVACION}`;
      memoriaDisco.esperandoComprobante[numeroLimpio] = true;
      guardarMemoriaDisco();
    }
    pasoNuevo = await responderConsultaConBienvenidaUnificada(
      sock,
      numeroLimpio,
      remoteJid,
      pasoActual,
      yaTuvoPruebaReal,
      textoTv,
      textoLimpio,
      textoCitado,
    );
    finalizarYRegistrarTelemetria();
    return;
  }

  if (intencion === "SOPORTE_INSTALACION_APK") {
    const yaRecibioNivel1 = Boolean(
      memoriaDisco.soporteNivel1Enviado[numeroLimpio],
    );
    await dbUtils.registrarIncidenteBD?.({
      numero: numeroLimpio,
      nombre: infoContacto.nombre || "Cliente",
      telefonoReal: infoContacto.telefonoReal || "",
      operador: operadorCliente,
      paso: pasoActual,
      tipoIncidente: "ERROR_INSTALACION_APK",
      detalle: textoUnificado,
      resolucion: yaRecibioNivel1
        ? "OPERADOR (Paso 99)"
        : "BOT (Guía Play Store)",
    });

    if (!yaRecibioNivel1) {
      funcionSeleccionada = "enviarSoportePlayProtectNivel1";
      memoriaDisco.soporteNivel1Enviado[numeroLimpio] = true;
      guardarMemoriaDisco();
      await esperarRetardoHumano(sock, remoteJid, 1, 2);
      await enviarMensajeSeguro(sock, remoteJid, { text: MENSAJE_SOPORTE_APK });
      finalizarYRegistrarTelemetria();
      return;
    }
    requirioHumano = true;
    pasoNuevo = 99;
    funcionSeleccionada = "silenciarBotParaCliente";
    await esperarRetardoHumano(sock, remoteJid, 1, 2);
    await enviarMensajeSeguro(sock, remoteJid, {
      text: MENSAJE_DERIVACION_HUMANO,
    });
    await silenciarBotParaCliente(
      numeroLimpio,
      `Persiste problema al descargar/instalar app: "${textoLimpio}"`,
      pasoActual || 3,
    );
    await notificarAlAdmin(
      sock,
      numeroLimpio,
      "PROBLEMA INSTALACIÓN APP 📲",
      `"${textoUnificado}"`,
    );
    finalizarYRegistrarTelemetria();
    return;
  }

  if (intencion === "TIENE_ABONO") {
    intentosFallidos.delete(numeroLimpio);
    if (pasoActual === 3 || yaTuvoPruebaReal) {
      funcionSeleccionada = "advertirGigasEnPaso3";
      await esperarRetardoHumano(sock, remoteJid, 1, 2);
      await enviarMensajeSeguro(sock, remoteJid, {
        text: MENSAJE_TIENE_GIGAS_EN_PASO3,
      });
    } else {
      pasoNuevo = 7;
      funcionSeleccionada = "advertirPlanConAbono";
      await responderConsultaConBienvenidaUnificada(
        sock,
        numeroLimpio,
        remoteJid,
        pasoActual,
        yaTuvoPruebaReal,
        MENSAJE_TIENE_ABONO,
        textoLimpio,
        textoCitado,
      );
      await actualizarPasoSeguro(numeroLimpio, 7);
    }
    finalizarYRegistrarTelemetria();
    return;
  }

  if (intencion === "INFO_COMO_FUNCIONA") {
    intentosFallidos.delete(numeroLimpio);
    funcionSeleccionada = "enviarInfoComoFunciona";
    let textoFunciona =
      MENSAJE_COMO_FUNCIONA +
      construirRecordatorioHilo(pasoActual, yaTuvoPruebaReal);
    if (listaIntenciones.includes("COMPRAR")) {
      textoFunciona += `\n\n━━━━━━━━━━━━━━━━━━━━\n\n${MENSAJE_ACTIVACION}`;
      memoriaDisco.esperandoComprobante[numeroLimpio] = true;
      guardarMemoriaDisco();
    }
    pasoNuevo = await responderConsultaConBienvenidaUnificada(
      sock,
      numeroLimpio,
      remoteJid,
      pasoActual,
      yaTuvoPruebaReal,
      textoFunciona,
      textoLimpio,
      textoCitado,
    );
    finalizarYRegistrarTelemetria();
    return;
  }

  if (intencion === "INFO_COMO_INSTALAR") {
    intentosFallidos.delete(numeroLimpio);
    funcionSeleccionada = "enviarGuiaInstalacionPaso3";
    await esperarRetardoHumano(sock, remoteJid, 1, 2);
    await enviarMensajeSeguro(sock, remoteJid, {
      text: MENSAJE_GUIA_INSTALACION_PASO3,
    });
    const credGuardada = buscarCredencialCruzada(numeroLimpio);
    if (credGuardada && credGuardada.usuario && credGuardada.password) {
      await delay(500);
      await enviarMensajeSeguro(sock, remoteJid, {
        text: credGuardada.usuario,
      });
      await delay(500);
      await enviarMensajeSeguro(sock, remoteJid, {
        text: credGuardada.password,
      });
    }
    ultimoCierreCordialTs.set(numeroLimpio, Date.now());
    finalizarYRegistrarTelemetria();
    return;
  }

  // Manejo global de EN_PROCESO_PRUEBA (tanto en Paso 3 como si avisa en Paso 1/7 que está bajando la app)
  if (intencion === "EN_PROCESO_PRUEBA") {
    intentosFallidos.delete(numeroLimpio);
    funcionSeleccionada = "enviarEnProcesoPrueba";
    await esperarRetardoHumano(sock, remoteJid, 1, 2);
    if (pasoActual === 3 || yaTuvoPruebaReal || esClientePago) {
      await enviarMensajeSeguro(sock, remoteJid, {
        text: esClientePago
          ? MENSAJE_CIERRE_CLIENTE_PAGO
          : MENSAJE_EN_PROCESO_PRUEBA,
      });
    } else {
      pasoNuevo = 7;
      await enviarMensajeSeguro(sock, remoteJid, {
        text:
          `¡Excelente! 🙌🏻 Mientras se descarga la aplicación desde Google Play Store, indicame por favor *qué chip usás en tu celular* para generarte tu usuario y contraseña de 24 hs:\n\n` +
          `*1️⃣* Personal 🔵\n` +
          `*2️⃣* Claro 🔴`,
      });
      await actualizarPasoSeguro(numeroLimpio, 7);
    }
    ultimoCierreCordialTs.set(numeroLimpio, Date.now());
    finalizarYRegistrarTelemetria();
    return;
  }

  if (intencion === "POSTERGAR_COMPRA") {
    intentosFallidos.delete(numeroLimpio);
    funcionSeleccionada = "enviarMensajePostergarCompra";
    await esperarRetardoHumano(sock, remoteJid, 1, 2);
    await enviarMensajeSeguro(sock, remoteJid, {
      text: MENSAJE_POSTERGAR_COMPRA,
    });
    ultimoCierreCordialTs.set(numeroLimpio, Date.now());
    finalizarYRegistrarTelemetria();
    return;
  }

  if (intencion === "NO_INTERESADO") {
    intentosFallidos.delete(numeroLimpio);
    funcionSeleccionada = "enviarDespedidaRespetuosa";
    await esperarRetardoHumano(sock, remoteJid, 1, 2);
    await enviarMensajeSeguro(sock, remoteJid, { text: MENSAJE_NO_INTERESADO });
    ultimoCierreCordialTs.set(numeroLimpio, Date.now());
    finalizarYRegistrarTelemetria();
    return;
  }

  if (intencion === "PAGO_REALIZADO") {
    requirioHumano = true;
    pasoNuevo = 99;
    funcionSeleccionada = "silenciarBotParaCliente";
    console.log(
      `💸 [${numeroLimpio}] Informó pago por texto. Avisando al Admin.`,
    );
    await enviarMensajeSeguro(sock, remoteJid, { text: MENSAJE_PAGO_RECIBIDO });
    await silenciarBotParaCliente(
      numeroLimpio,
      `Informó pago: "${textoLimpio}"`,
      pasoActual,
    );
    await notificarAlAdmin(
      sock,
      numeroLimpio,
      "AVISO DE TRANSFERENCIA / PAGO 💸",
      `"${textoUnificado}"`,
    );
    finalizarYRegistrarTelemetria();
    return;
  }

  // Soporte Inteligente de Nivel 1 en Paso 3
  if (intencion === "SOPORTE" && (pasoActual === 3 || yaTuvoPruebaReal)) {
    const yaRecibioNivel1 = Boolean(
      memoriaDisco.soporteNivel1Enviado[numeroLimpio],
    );
    const credGuardada = buscarCredencialCruzada(numeroLimpio);

    await dbUtils.registrarIncidenteBD?.({
      numero: numeroLimpio,
      nombre: infoContacto.nombre || "Cliente",
      telefonoReal: infoContacto.telefonoReal || "",
      operador: operadorCliente,
      paso: 3,
      tipoIncidente: "ERROR_CONEXION_PRUEBA",
      detalle: textoUnificado,
      resolucion: yaRecibioNivel1
        ? "OPERADOR (Paso 99)"
        : "BOT (Soporte Nivel 1)",
    });

    if (!yaRecibioNivel1) {
      funcionSeleccionada = "enviarSoporteCredencialesNivel1";
      memoriaDisco.soporteNivel1Enviado[numeroLimpio] = true;
      guardarMemoriaDisco();
      await esperarRetardoHumano(sock, remoteJid, 1, 3);

      if (credGuardada && credGuardada.usuario && credGuardada.password) {
        await enviarMensajeSeguro(sock, remoteJid, {
          text:
            `🛠️ *¡Vamos a revisarlo!* En la mayoría de los casos ocurre por algún espacio en blanco al ingresar los datos o por no alternar entre el servidor ULTRA 1 y el 2.\n\n` +
            `Te volvemos a enviar tus credenciales por separado acá abajo para que *mantengas presionado cada mensaje, lo copies y lo pegues* directamente en la aplicación:`,
        });
        await delay(500);
        await enviarMensajeSeguro(sock, remoteJid, {
          text: credGuardada.usuario,
        });
        await delay(500);
        await enviarMensajeSeguro(sock, remoteJid, {
          text: credGuardada.password,
        });
        await delay(500);
        await enviarMensajeSeguro(sock, remoteJid, {
          text:
            `Probá copiando y pegando ambos datos.\n\n` +
            `📸 *Si aún no logra conectar, envianos por acá una captura de pantalla de la aplicación* para indicarte enseguida cómo resolverlo. 👍`,
        });
      } else {
        await enviarMensajeSeguro(sock, remoteJid, {
          text: `🛠️ *¡Vamos a revisarlo!* ¿Podrías enviarnos una *captura de pantalla de la aplicación* por acá? Así verificamos enseguida los datos y el servidor seleccionado. 👍`,
        });
      }
      finalizarYRegistrarTelemetria();
      return;
    }

    requirioHumano = true;
    pasoNuevo = 99;
    funcionSeleccionada = "silenciarBotParaCliente";
    await esperarRetardoHumano(sock, remoteJid, 1, 2);
    await enviarMensajeSeguro(sock, remoteJid, {
      text: MENSAJE_DERIVACION_HUMANO,
    });
    await silenciarBotParaCliente(
      numeroLimpio,
      `Persiste problema tras Soporte Nivel 1: "${textoLimpio}"`,
      3,
    );
    await notificarAlAdmin(
      sock,
      numeroLimpio,
      "SOPORTE POST-PRUEBA 🛠️",
      `"${textoUnificado}"`,
    );
    finalizarYRegistrarTelemetria();
    return;
  }

  if (intencion === "DUDA_HUMANO" || intencion === "SOPORTE") {
    requirioHumano = true;
    pasoNuevo = 99;
    funcionSeleccionada = "silenciarBotParaCliente";
    await dbUtils.registrarIncidenteBD?.({
      numero: numeroLimpio,
      nombre: infoContacto.nombre || "Cliente",
      telefonoReal: infoContacto.telefonoReal || "",
      operador: operadorCliente,
      paso: pasoActual,
      tipoIncidente: "DERIVACION_SOLICITADA",
      detalle: textoUnificado,
      resolucion: "OPERADOR (Paso 99)",
    });

    await responderConsultaConBienvenidaUnificada(
      sock,
      numeroLimpio,
      remoteJid,
      pasoActual,
      yaTuvoPruebaReal,
      MENSAJE_DERIVACION_HUMANO,
      textoLimpio,
      textoCitado,
    );
    await silenciarBotParaCliente(
      numeroLimpio,
      `Derivado por intención: ${intencion}`,
      pasoActual || 1,
    );
    await notificarAlAdmin(
      sock,
      numeroLimpio,
      "SOPORTE / CONSULTA 🛠️",
      `"${textoUnificado}"`,
    );
    finalizarYRegistrarTelemetria();
    return;
  }

  // =======================================================================
  // FLUJO PARA CLIENTES EN PASO 3 (DIFERENCIA PRUEBA GRATIS VS CLIENTE PAGO)
  // =======================================================================
  if (pasoActual === 3 || yaTuvoPruebaReal || esClientePago) {
    if (intencion === "EXITO") {
      intentosFallidos.delete(numeroLimpio);
      funcionSeleccionada = "confirmarConexionExitosa";
      delete memoriaDisco.soporteNivel1Enviado[numeroLimpio];
      guardarMemoriaDisco();
      await esperarRetardoHumano(sock, remoteJid, 1, 3);
      await enviarMensajeSeguro(sock, remoteJid, {
        text: esClientePago
          ? MENSAJE_CONEXION_EXITOSA_CLIENTE_PAGO
          : MENSAJE_CONEXION_EXITOSA,
      });
      ultimoCierreCordialTs.set(numeroLimpio, Date.now());
    } else if (intencion === "SALUDO") {
      intentosFallidos.delete(numeroLimpio);
      funcionSeleccionada = "saludoContextualPaso3";
      await esperarRetardoHumano(sock, remoteJid, 1, 2);
      if (esClientePago) {
        await enviarMensajeSeguro(sock, remoteJid, {
          text:
            `¡Hola *${infoContacto.nombre}*! 👋 Qué gusto saludarte.\n\n` +
            `• 📅 Si querés saber *cuándo vence tu plan*, escribí *"¿cuándo vence mi plan?"*.\n` +
            `• 💳 Si deseás *renovar o sumar días*, respondé con *2* o escribí *"comprar"*.\n` +
            `• 🛠️ Si necesitás *asistencia técnica*, escribí *"ayuda"*. 🙌🏻`,
        });
      } else {
        await enviarMensajeSeguro(sock, remoteJid, {
          text:
            `¡Hola! 👋 Seguimos a tu disposición.\n\n` +
            `• 💳 Si querés *ver los planes y precios para activar el servicio*, respondé con *2* o escribí *"comprar"*.\n` +
            `• 📲 Si necesitás *repasar cómo conectarte*, escribí *"cómo me conecto"*.\n` +
            `• 🛠️ Si tuviste algún *inconveniente con la prueba*, escribí *"ayuda"*. 🙌🏻`,
        });
      }
    } else if (
      intencion === "AGRADECIMIENTO_FINAL" ||
      esConfirmacionOCierreCorto(textoUnificado)
    ) {
      intentosFallidos.delete(numeroLimpio);
      const haceCuantoCerro =
        Date.now() - (ultimoCierreCordialTs.get(numeroLimpio) || 0);
      // Si el bot ya cerró o entregó credenciales/precios en los últimos 10 minutos,
      // aplica NO_RESPONDER con texto (solo reacciona 👍 si hay mensaje raw)
      if (haceCuantoCerro < 10 * 60 * 1000) {
        funcionSeleccionada = "reaccionPulgarArriba";
        await reaccionarConPulgar(
          sock,
          remoteJid,
          ultimoMensajeRaw,
          numeroLimpio,
        );
      } else {
        funcionSeleccionada = "enviarCierreCordial";
        await esperarRetardoHumano(sock, remoteJid, 1, 2);
        await enviarMensajeSeguro(sock, remoteJid, {
          text: esClientePago
            ? MENSAJE_CIERRE_CLIENTE_PAGO
            : MENSAJE_CIERRE_CORDIAL,
        });
        ultimoCierreCordialTs.set(numeroLimpio, Date.now());
      }
    } else if (intencion === "COMPRAR") {
      intentosFallidos.delete(numeroLimpio);
      funcionSeleccionada = "enviarDatosActivacion";
      memoriaDisco.esperandoComprobante[numeroLimpio] = true;
      guardarMemoriaDisco();
      await esperarRetardoHumano(sock, remoteJid, 1, 3);
      await enviarMensajeSeguro(sock, remoteJid, {
        text: `${prefijoMultiIntencion}${MENSAJE_ACTIVACION}`,
      });
      ultimoCierreCordialTs.set(numeroLimpio, Date.now());
    } else if (
      intencion === "RECHAZO_PRUEBA" ||
      intencion === "PRUEBA_PERSONAL" ||
      intencion === "PRUEBA_CLARO" ||
      intencion === "FALTA_OPERADOR"
    ) {
      const fallos = (intentosFallidos.get(numeroLimpio) || 0) + 1;
      intentosFallidos.set(numeroLimpio, fallos);

      const credVigente = obtenerPruebaVigente24h(numeroLimpio);
      await esperarRetardoHumano(sock, remoteJid, 1, 3);

      if (credVigente) {
        if (fallos >= 3) {
          requirioHumano = true;
          pasoNuevo = 99;
          funcionSeleccionada = "silenciarBotParaCliente";
          await enviarMensajeSeguro(sock, remoteJid, {
            text: MENSAJE_DERIVACION_HUMANO,
          });
          await silenciarBotParaCliente(
            numeroLimpio,
            `Pidió prueba 3 veces seguidas teniendo una vigente: "${textoLimpio}"`,
            3,
          );
          await notificarAlAdmin(
            sock,
            numeroLimpio,
            "INSISTE CON PRUEBA EN PASO 3 💬",
            `"${textoUnificado}"`,
          );
        } else {
          funcionSeleccionada = "reenviarCredencialVigente";
          await reenviarCredencialVigente(
            sock,
            numeroLimpio,
            remoteJid,
            credVigente,
          );
        }
      } else {
        if (fallos >= 2) {
          requirioHumano = true;
          pasoNuevo = 99;
          funcionSeleccionada = "silenciarBotParaCliente";
          await enviarMensajeSeguro(sock, remoteJid, {
            text: MENSAJE_DERIVACION_HUMANO,
          });
          await silenciarBotParaCliente(
            numeroLimpio,
            `Insistió pidiendo otra prueba (>24h): "${textoLimpio}"`,
            3,
          );
          await notificarAlAdmin(
            sock,
            numeroLimpio,
            "PIDE OTRA PRUEBA VENCIDA 💬",
            `"${textoUnificado}"`,
          );
        } else {
          funcionSeleccionada = "informarYaTuvoPrueba";
          await enviarMensajeSeguro(sock, remoteJid, {
            text: MENSAJE_YA_TUVO_PRUEBA,
          });
        }
      }
    } else {
      const fallos = (intentosFallidos.get(numeroLimpio) || 0) + 1;
      intentosFallidos.set(numeroLimpio, fallos);
      await esperarRetardoHumano(sock, remoteJid, 1, 3);
      if (fallos >= 2) {
        requirioHumano = true;
        pasoNuevo = 99;
        funcionSeleccionada = "silenciarBotParaCliente";
        await enviarMensajeSeguro(sock, remoteJid, {
          text: MENSAJE_DERIVACION_HUMANO,
        });
        await silenciarBotParaCliente(
          numeroLimpio,
          `2 mensajes en post-prueba: "${textoLimpio}"`,
          3,
        );
        await notificarAlAdmin(
          sock,
          numeroLimpio,
          "CONSULTA POST-PRUEBA 💬",
          `"${textoUnificado}"`,
        );
      } else {
        funcionSeleccionada = "enviarAclaracionPaso3";
        await enviarMensajeSeguro(sock, remoteJid, {
          text: esClientePago
            ? MENSAJE_ACLARACION_CLIENTE_PAGO
            : MENSAJE_ACLARACION_PASO3,
        });
      }
    }
    finalizarYRegistrarTelemetria();
    return;
  }

  // =======================================================================
  // FLUJO PARA CLIENTES SIN PRUEBA USADA (Pasos 0, 1, 4, 7, 8)
  // =======================================================================
  if (intencion === "SALUDO") {
    intentosFallidos.delete(numeroLimpio);
    pasoNuevo = 1;
    const haceCuantoEnvioMenu =
      Date.now() - (ultimoMenuEnviadoTs.get(numeroLimpio) || 0);

    // Si en Paso 1 el cliente envía un segundo mensaje de saludo pocos segundos después ("Hola" + "Vi el anuncio"),
    // evitamos repetir todo el menú con foto por segunda vez consecutiva
    if (pasoActual === 1 && haceCuantoEnvioMenu < 90 * 1000) {
      funcionSeleccionada = "recordatorioBrevePaso1";
      await esperarRetardoHumano(sock, remoteJid, 1, 2);
      await enviarMensajeSeguro(sock, remoteJid, {
        text: "📌 Para comenzar ahora mismo, respondé con *1* (Prueba gratis de 24 hs 🎁), *2* (Ver planes y precios 💳) o indicame si usás *Personal* o *Claro*. 🙌🏻",
      });
    } else {
      funcionSeleccionada = "enviarMenuBienvenida";
      await esperarRetardoHumano(sock, remoteJid, 1, 3);
      await enviarMensajeConFotoApp(
        sock,
        remoteJid,
        obtenerAleatorio(VARIACIONES_INICIAL),
      );
      ultimoMenuEnviadoTs.set(numeroLimpio, Date.now());
      await actualizarPasoSeguro(numeroLimpio, 1);
    }
  } else if (intencion === "PRUEBA_PASO0") {
    intentosFallidos.delete(numeroLimpio);
    delete memoriaDisco.esperandoComprobante[numeroLimpio];
    pasoNuevo = 7;
    funcionSeleccionada = "enviarBienvenidaPruebaPaso0";
    await esperarRetardoHumano(sock, remoteJid, 1, 2);
    await enviarMensajeConFotoApp(
      sock,
      remoteJid,
      MENSAJE_BIENVENIDA_PRUEBA_PASO0,
    );
    await actualizarPasoSeguro(numeroLimpio, 7);
  } else if (intencion === "AGRADECIMIENTO_FINAL") {
    intentosFallidos.delete(numeroLimpio);
    const haceCuantoCerro =
      Date.now() - (ultimoCierreCordialTs.get(numeroLimpio) || 0);

    if (pasoActual === 4 && haceCuantoCerro < 10 * 60 * 1000) {
      funcionSeleccionada = "reaccionPulgarArriba";
      await reaccionarConPulgar(
        sock,
        remoteJid,
        ultimoMensajeRaw,
        numeroLimpio,
      );
    } else {
      funcionSeleccionada = "enviarCierreContextual";
      await esperarRetardoHumano(sock, remoteJid, 1, 2);
      if (pasoActual === 0 || pasoActual === 1) {
        pasoNuevo = 1;
        await enviarMensajeSeguro(sock, remoteJid, {
          text: MENSAJE_RETOMAR_PASO1,
        });
        await actualizarPasoSeguro(numeroLimpio, 1);
      } else if (pasoActual === 4) {
        await enviarMensajeSeguro(sock, remoteJid, {
          text: MENSAJE_CIERRE_PASO4,
        });
        ultimoCierreCordialTs.set(numeroLimpio, Date.now());
      } else {
        await enviarMensajeSeguro(sock, remoteJid, {
          text: MENSAJE_CIERRE_CORDIAL,
        });
        ultimoCierreCordialTs.set(numeroLimpio, Date.now());
      }
    }
  } else if (intencion === "DESPEDIDA_CHIP") {
    intentosFallidos.delete(numeroLimpio);
    funcionSeleccionada = "enviarDespedidaChip";
    await esperarRetardoHumano(sock, remoteJid, 1, 3);
    await enviarMensajeSeguro(sock, remoteJid, {
      text: MENSAJE_DESPEDIDA_CHIP,
    });
    ultimoCierreCordialTs.set(numeroLimpio, Date.now());
  } else if (intencion === "FALTA_OPERADOR") {
    intentosFallidos.delete(numeroLimpio);
    delete memoriaDisco.esperandoComprobante[numeroLimpio];
    pasoNuevo = 7;
    funcionSeleccionada = "solicitarOperador";
    if (pasoActual === 0 && !yaTuvoPruebaReal) {
      await esperarRetardoHumano(sock, remoteJid, 1, 2);
      await enviarMensajeConFotoApp(
        sock,
        remoteJid,
        MENSAJE_BIENVENIDA_PRUEBA_PASO0,
      );
      await actualizarPasoSeguro(numeroLimpio, 7);
    } else {
      await esperarRetardoHumano(sock, remoteJid, 1, 2);
      await enviarMensajeSeguro(sock, remoteJid, {
        text: MENSAJE_ELEGIR_OPERADOR,
      });
      await actualizarPasoSeguro(numeroLimpio, 7);
    }
  } else if (intencion === "COMPRAR") {
    intentosFallidos.delete(numeroLimpio);
    pasoNuevo = 4;
    funcionSeleccionada = "enviarDatosActivacion";
    memoriaDisco.esperandoComprobante[numeroLimpio] = true;
    guardarMemoriaDisco();
    await responderConsultaConBienvenidaUnificada(
      sock,
      numeroLimpio,
      remoteJid,
      pasoActual,
      yaTuvoPruebaReal,
      `${prefijoMultiIntencion}${MENSAJE_ACTIVACION}`,
      textoLimpio,
      textoCitado,
    );
    ultimoCierreCordialTs.set(numeroLimpio, Date.now());
    await actualizarPasoSeguro(numeroLimpio, 4);
  } else if (intencion === "NO_COMPATIBLE") {
    intentosFallidos.delete(numeroLimpio);
    pasoNuevo = 8;
    funcionSeleccionada = "recomendarCambioChip";
    await responderConsultaConBienvenidaUnificada(
      sock,
      numeroLimpio,
      remoteJid,
      pasoActual,
      yaTuvoPruebaReal,
      MENSAJE_NO_PERSONAL,
      textoLimpio,
      textoCitado,
    );
    ultimoCierreCordialTs.set(numeroLimpio, Date.now());
    await actualizarPasoSeguro(numeroLimpio, 8);
  } else if (intencion === "PRUEBA_PERSONAL") {
    intentosFallidos.delete(numeroLimpio);
    funcionSeleccionada = "enviarPackVPN";
    argumentosUtilizados = { operador: "personal" };
    if (!obtenerPruebaVigente24h(numeroLimpio)) {
      console.log(
        `✅ [${numeroLimpio}] Prueba gratis -> PERSONAL (100% Automática)`,
      );
      await enviarBienvenidaSiEsNuevo(
        sock,
        numeroLimpio,
        remoteJid,
        pasoActual,
        yaTuvoPruebaReal,
        "🎁 *¡Tu prueba gratuita de 24 horas para Personal está en marcha! A continuación te enviamos el enlace oficial de descarga en Google Play Store, el video tutorial y tus credenciales:* 👇",
        textoLimpio,
        textoCitado,
      );
    }
    const ok = await enviarPackVPN(sock, numeroLimpio, remoteJid, "personal");
    pasoNuevo = ok ? 3 : 99;
    resultadoFuncion = ok ? "CRED_GENERADA" : "FALLO_API_VELTRIX";
    if (!ok) {
      errorProducido = "API Veltrix no devolvió credenciales";
      requirioHumano = true;
    }
  } else if (intencion === "PRUEBA_CLARO") {
    intentosFallidos.delete(numeroLimpio);
    funcionSeleccionada = "enviarPackVPN";
    argumentosUtilizados = { operador: "claro" };
    if (!obtenerPruebaVigente24h(numeroLimpio)) {
      console.log(
        `✅ [${numeroLimpio}] Prueba gratis -> CLARO (100% Automática)`,
      );
      await enviarBienvenidaSiEsNuevo(
        sock,
        numeroLimpio,
        remoteJid,
        pasoActual,
        yaTuvoPruebaReal,
        "🎁 *¡Tu prueba gratuita de 24 horas para Claro está en marcha! A continuación te enviamos el enlace oficial de descarga en Google Play Store, el video tutorial y tus credenciales:* 👇",
        textoLimpio,
        textoCitado,
      );
    }
    const ok = await enviarPackVPN(sock, numeroLimpio, remoteJid, "claro");
    pasoNuevo = ok ? 3 : 99;
    resultadoFuncion = ok ? "CRED_GENERADA" : "FALLO_API_VELTRIX";
    if (!ok) {
      errorProducido = "API Veltrix no devolvió credenciales";
      requirioHumano = true;
    }
  } else {
    const fallos = (intentosFallidos.get(numeroLimpio) || 0) + 1;
    intentosFallidos.set(numeroLimpio, fallos);

    await esperarRetardoHumano(sock, remoteJid, 1, 3);

    if (fallos >= 2) {
      requirioHumano = true;
      pasoNuevo = 99;
      funcionSeleccionada = "silenciarBotParaCliente";
      await dbUtils.registrarIncidenteBD?.({
        numero: numeroLimpio,
        nombre: infoContacto.nombre || "Cliente",
        telefonoReal: infoContacto.telefonoReal || "",
        operador: operadorCliente,
        paso: pasoActual,
        tipoIncidente: "MENSAJE_NO_COMPRENDIDO",
        detalle: textoUnificado,
        resolucion: "OPERADOR (Paso 99)",
      });

      console.log(
        `⚠️ [${numeroLimpio}] 2 intentos sin entender. Derivando al operador humano.`,
      );
      await enviarMensajeSeguro(sock, remoteJid, {
        text: MENSAJE_DERIVACION_HUMANO,
      });
      await silenciarBotParaCliente(
        numeroLimpio,
        `No se entendió tras 2 intentos: "${textoLimpio}"`,
        pasoActual || 1,
      );
      await notificarAlAdmin(
        sock,
        numeroLimpio,
        "NO COMPRENDIDO POR EL BOT 🤖",
        `"${textoUnificado}"`,
      );
    } else if (pasoActual === 0) {
      pasoNuevo = 1;
      funcionSeleccionada = "enviarMenuBienvenidaPorDefecto";
      await enviarMensajeConFotoApp(
        sock,
        remoteJid,
        obtenerAleatorio(VARIACIONES_INICIAL),
      );
      ultimoMenuEnviadoTs.set(numeroLimpio, Date.now());
      await actualizarPasoSeguro(numeroLimpio, 1);
    } else if (pasoActual === 7) {
      funcionSeleccionada = "repetirMenuOperador";
      await enviarMensajeSeguro(sock, remoteJid, {
        text: MENSAJE_ELEGIR_OPERADOR,
      });
    } else {
      funcionSeleccionada = "enviarMenuInvalido";
      await enviarMensajeSeguro(sock, remoteJid, {
        text: MENSAJE_MENU_INVALIDO,
      });
    }
  }

  finalizarYRegistrarTelemetria();
}

module.exports = {
  setSockActual,
  getSockActual,
  desenvolverMensaje,
  esEventoIgnorable,
  obtenerTimestampSegundos,
  esMensajeReciente,
  obtenerTextoDeMensaje,
  obtenerTextoCitado,
  esComprobanteOArchivo,
  esAudio,
  esSticker,
  esPosibleRenovacionOPagoEnPaso99,
  hayMensajesNuevosEnEspera,
  esperarRetardoHumano,
  actualizarPasoSeguro,
  enviarMensajeSeguro,
  enviarMensajeConFotoApp,
  enviarBienvenidaSiEsNuevo,
  responderConsultaConBienvenidaUnificada,
  notificarAlAdmin,
  silenciarBotParaCliente,
  reenviarCredencialVigente,
  enviarVideoYApkVPN,
  enviarPackVPN,
  verificarYEnviarSeguimientosPrueba,
  retomarConversacionAlDesbloquear,
  procesarMensajeInteligente,
};
