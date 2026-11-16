const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const dbUtils = require("./db");

// Importación de los Módulos del Bot
const config = require("./config");
const mensajes = require("./mensajes");
const comunicados = require("./comunicados");
const memoria = require("./memoria");
const ia = require("./ia");
const flujos = require("./flujos");
const comandosVip = require("./comandos_vip");
const { ejecutarComandoVIP } = comandosVip;

const {
  PATH_AUTH_DIR,
  HORAS_MAX_SIN_CONEXION,
  INTERVALO_REVISION_SEGUIMIENTO_MS,
  esNumeroVIP,
} = config;

const {
  memoriaDisco,
  guardarMemoriaSincrono,
  guardarMemoriaDisco,
  setMensajesProcesados,
  setIdsMensajesDelBot,
  abortarEnvioEnCurso,
  enviosBotEnVuelo,
  ultimoEnvioBotTs,
  ultimaAlertaVigiasTs,
  ultimoCierreCordialTs,
  colaMensajes,
  temporizadoresDebounce,
  procesandoUsuario,
  creandoPruebaEnCurso,
  chatsBloqueados,
  marcarMensajeProcesado,
  registrarIdMensajeDelBot,
  registrarTsIntervencionManual,
  registrarEnHistorialChat,
  guardarEnBuzonPaso99,
  guardarEnColaCaida,
  limpiarUsuarioDeColaCaida,
  guardarDatosContacto,
  vincularListaContactos,
  registrarLog,
  obtenerPruebaVigente24h,
  hayVentaProactivaReciente,
  cumplioTiempoAutoDesbloqueo,
  interpretarPasoDondeQuedo,
} = memoria;

const { esMensajeAperturaIncompleta } = ia;

const {
  setSockActual,
  getSockActual,
  esEventoIgnorable,
  obtenerTimestampSegundos,
  esMensajeReciente,
  obtenerTextoDeMensaje,
  obtenerTextoCitado,
  esComprobanteOArchivo,
  esAudio,
  esPosibleRenovacionOPagoEnPaso99,
  hayMensajesNuevosEnEspera,
  notificarAlAdmin,
  silenciarBotParaCliente,
  verificarYEnviarSeguimientosPrueba,
  procesarMensajeInteligente,
} = flujos;

let timerRevisionSeguimiento = null;

// ============================================================================
// SILENCIADOR DE LOGS CRIPTOGRÁFICOS DE LIBSIGNAL Y AUTO-REPARADOR "BAD MAC"
// ============================================================================
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

function esBasuraDeLibsignal(args) {
  for (const a of args) {
    if (!a) continue;
    if (typeof a === "object") {
      if (
        a.currentRatchet ||
        a.registrationId ||
        a.indexInfo ||
        a._chains ||
        a.ephemeralKeyPair ||
        a.remoteIdentityKey
      ) {
        return true;
      }
    }
    const str = typeof a === "string" ? a : a?.stack || a?.message || "";
    if (
      str.includes("Closing session") ||
      str.includes("Opening session") ||
      str.includes("currentRatchet") ||
      str.includes("ephemeralKeyPair") ||
      str.includes("SessionEntry") ||
      str.includes("Overriding open session") ||
      str.includes("Session already") ||
      str.includes("Decrypted message with closed session") ||
      str.includes("Bad MAC") ||
      str.includes("Failed to decrypt")
    ) {
      return true;
    }
  }
  return false;
}

console.log = function (...args) {
  if (esBasuraDeLibsignal(args)) return;
  originalConsoleLog.apply(console, args);
};

console.info = function (...args) {
  if (esBasuraDeLibsignal(args)) return;
  originalConsoleInfo.apply(console, args);
};

console.warn = function (...args) {
  if (esBasuraDeLibsignal(args)) return;
  originalConsoleWarn.apply(console, args);
};

console.error = function (...args) {
  const textoError = args
    .map((a) =>
      typeof a === "string" ? a : a?.stack || a?.message || JSON.stringify(a),
    )
    .join(" ");

  if (
    textoError.includes("Bad MAC") ||
    textoError.includes("Failed to decrypt message")
  ) {
    const matchId = textoError.match(/at async (\d{8,})_/);
    if (matchId && matchId[1]) {
      const idCorrupto = matchId[1];
      try {
        if (fs.existsSync(PATH_AUTH_DIR)) {
          const archivos = fs.readdirSync(PATH_AUTH_DIR);
          for (const arch of archivos) {
            if (
              arch.startsWith(`session-${idCorrupto}_`) ||
              arch.startsWith(`session-${idCorrupto}.`)
            ) {
              fs.unlinkSync(path.join(PATH_AUTH_DIR, arch));
              originalConsoleLog(
                `🔧 [AUTO-REPARACIÓN] Llave de sesión (Bad MAC) regenerada para ${idCorrupto}.`,
              );
            }
          }
        }
      } catch (e) {}
    }
    return;
  }

  if (esBasuraDeLibsignal(args)) return;
  originalConsoleError.apply(console, args);
};

// ============================================================================
// SINCRONIZADOR AUTOMÁTICO DE CREDENCIALES Y PLANTILLAS SALIENTES
// (EVITA FALSOS BLOQUEOS EN PASO 99 POR DESFASE @LID vs TELÉFONO)
// ============================================================================
async function sincronizarEstadoPorMensajeSaliente(
  numeroLimpio,
  txtSaliente,
  tsMsg,
) {
  if (!txtSaliente || esNumeroVIP(numeroLimpio)) return false;

  const esEntregaPrueba =
    txtSaliente.includes("PRUEBA VIVE ONLINE GENERADA") ||
    txtSaliente.includes("TU PRUEBA DE 24 HORAS ESTÁ ACTIVA") ||
    txtSaliente.includes("TU PRUEBA GRATUITA DE 24 HS SIGUE ACTIVA") ||
    txtSaliente.includes("Tu prueba gratuita de 24 horas para");

  const esEntregaVenta =
    txtSaliente.includes("PLAN MNET VPN ACTIVADO CON ÉXITO") ||
    txtSaliente.includes("TU SUSCRIPCIÓN MNET VPN ESTÁ ACTIVA") ||
    txtSaliente.includes("AVISO DE VENCIMIENTO MNET VPN") ||
    txtSaliente.includes("ESTADO DE TU SUSCRIPCIÓN MNET VPN");

  const esChequeoPrueba =
    txtSaliente.includes("pudiste instalar la aplicación") ||
    txtSaliente.includes("pudiste descargar nuestra aplicación") ||
    txtSaliente.includes("poquitas horas") ||
    txtSaliente.includes("pocas horas") ||
    txtSaliente.includes("finalizó hace poquito") ||
    txtSaliente.includes("finalizó recientemente") ||
    txtSaliente.includes("Estado de tu prueba gratuita:");

  const esComunicadoCanalOCaida =
    txtSaliente.includes(
      "RECOMENDACIÓN IMPORTANTE — CANAL OFICIAL DE UTILIDADES",
    ) ||
    txtSaliente.includes("AVISO IMPORTANTE DE SERVICIO — MNET VPN") ||
    txtSaliente.includes("SERVICIO RESTABLECIDO — MNET VPN");

  const esMensajeComplementarioPack =
    txtSaliente.includes("Paso 1: Descargá nuestra aplicación oficial") ||
    txtSaliente.includes("Paso 2: Mirá este breve video tutorial") ||
    txtSaliente.includes("Copiá y pegá esos dos datos en la aplicación") ||
    txtSaliente.includes("Probá ingresando esos dos datos sin espacios") ||
    txtSaliente.includes("Probá copiando y pegando ambos datos") ||
    /^(mnet|clave)\d{4}$/i.test(txtSaliente.trim());

  if (
    esEntregaPrueba ||
    esEntregaVenta ||
    esChequeoPrueba ||
    esComunicadoCanalOCaida ||
    esMensajeComplementarioPack
  ) {
    let uSal = await dbUtils.getUsuario(numeroLimpio);
    if (!uSal) await dbUtils.crearUsuario(numeroLimpio);
    await dbUtils.actualizarPaso(numeroLimpio, 3);
    await dbUtils.marcarPruebaEnviada(numeroLimpio);
    if (esEntregaVenta) {
      await dbUtils.marcarComoCliente(numeroLimpio);
    }

    memoriaDisco.ultimoPasoValido[numeroLimpio] = 3;
    ultimoCierreCordialTs.set(numeroLimpio, Date.now());

    // Extraer usuario y contraseña (soportando asteriscos de negrita *Usuario:* `mnetXXXX`)
    const matchUser = txtSaliente.match(
      /Usuario\*?:\*?\s*`?([a-zA-Z0-9_.-]+)`?/i,
    );
    const matchPass = txtSaliente.match(
      /Contrase[ñn]a\*?:\*?\s*`?([^\s`*]+)`?/i,
    );
    if (matchUser && matchUser[1]) {
      const op = /claro/i.test(txtSaliente) ? "claro" : "personal";
      memoriaDisco.credencialesEnviadas[numeroLimpio] = {
        ...(memoriaDisco.credencialesEnviadas[numeroLimpio] || {}),
        usuario: matchUser[1],
        password: (matchPass && matchPass[1]) || matchUser[1],
        operador: op,
        duracionHoras: esEntregaVenta ? 168 : 24,
        tsCreacion: tsMsg || Math.floor(Date.now() / 1000),
        esVentaConfirmada: esEntregaVenta,
      };
    }

    registrarEnHistorialChat(numeroLimpio, "BOT", txtSaliente);
    guardarMemoriaDisco();
    return true;
  }

  const esPlantillaMenuOBot =
    txtSaliente.includes("MNet VPN") ||
    txtSaliente.includes("Vive Online VPN") ||
    txtSaliente.includes("Soy el asistente virtual") ||
    txtSaliente.includes("soy el asistente automático") ||
    txtSaliente.includes("¿con qué chip vas a probar el servicio?") ||
    txtSaliente.includes("¿qué compañía usás en tu celular?") ||
    txtSaliente.includes("milciades.genes") ||
    txtSaliente.includes("Conectarte es muy sencillo. Seguí estos 4 pasos:") ||
    txtSaliente.includes("¿Cómo compartir Internet a otros equipos");

  if (esPlantillaMenuOBot) {
    let uSal = await dbUtils.getUsuario(numeroLimpio);
    if (!uSal) await dbUtils.crearUsuario(numeroLimpio);
    if (!uSal || uSal.paso_flujo === 0) {
      let nuevoPaso = 1;
      if (
        txtSaliente.includes("¿qué chip tenés en tu celu?") ||
        txtSaliente.includes("¿qué compañía usás en tu celular?") ||
        txtSaliente.includes("¿con qué chip vas a probar el servicio?")
      ) {
        nuevoPaso = 7;
      } else if (txtSaliente.includes("milciades.genes")) {
        nuevoPaso = 4;
      }
      await dbUtils.actualizarPaso(numeroLimpio, nuevoPaso);
      memoriaDisco.ultimoPasoValido[numeroLimpio] = nuevoPaso;
    }
    registrarEnHistorialChat(numeroLimpio, "BOT", txtSaliente);
    guardarMemoriaDisco();
    return true;
  }

  return false;
}

// ============================================================================
// PROCESADOR DE COLA POR USUARIO CON DEBOUNCE ADAPTATIVO
// ============================================================================
function calcularTiempoDebounceMs(numeroLimpio, listaMensajes) {
  if (esNumeroVIP(numeroLimpio)) return 1200;

  const textos = [];
  for (const m of listaMensajes) {
    if (!m.key?.fromMe) {
      const t = obtenerTextoDeMensaje(m).trim();
      if (t) textos.push(t);
    }
  }
  const acumulado = textos.join(" ").trim();
  if (!acumulado) return 2500;

  // 1. Respuesta cerrada de menú ("1", "2", "3", "personal", "claro") -> Respuesta rápida (1.8s)
  if (/^(1|2|3|4|1️⃣|2️⃣|3️⃣|personal|claro)$/i.test(acumulado)) {
    return 1800;
  }

  // 2. Apertura incompleta ("Hola", "Amigo", "Che", "Una consulta") -> Espera extendida (6.0s)
  // para agrupar el siguiente mensaje donde el cliente argentino explica qué necesita
  if (esMensajeAperturaIncompleta(acumulado)) {
    return 6000;
  }

  // 3. Mensaje normal -> Ventana estándar (3.5s)
  return 3500;
}

function encolarConDebounce(sock, numeroLimpio, remoteJid, msg) {
  if (!colaMensajes.has(numeroLimpio)) colaMensajes.set(numeroLimpio, []);
  const lista = colaMensajes.get(numeroLimpio);
  if (!lista.some((m) => m.key?.id === msg.key?.id)) {
    lista.push(msg);
  }

  if (temporizadoresDebounce.has(numeroLimpio)) {
    clearTimeout(temporizadoresDebounce.get(numeroLimpio));
  }

  const esperaMs = calcularTiempoDebounceMs(numeroLimpio, lista);

  const timer = setTimeout(() => {
    temporizadoresDebounce.delete(numeroLimpio);
    procesarColaDeUsuario(getSockActual() || sock, numeroLimpio, remoteJid);
  }, esperaMs);

  temporizadoresDebounce.set(numeroLimpio, timer);
}

async function procesarColaDeUsuario(sock, numeroLimpio, remoteJid) {
  if (procesandoUsuario.get(numeroLimpio)) return;

  procesandoUsuario.set(numeroLimpio, true);

  try {
    let textoAcumuladoRondaPrevia = "";

    while (
      colaMensajes.has(numeroLimpio) &&
      colaMensajes.get(numeroLimpio).length > 0
    ) {
      if (temporizadoresDebounce.has(numeroLimpio)) break;

      const mensajesEnCola = colaMensajes.get(numeroLimpio);
      colaMensajes.set(numeroLimpio, []);

      let usuario = await dbUtils.getUsuario(numeroLimpio);
      if (!usuario) {
        await dbUtils.crearUsuario(numeroLimpio);
        usuario = await dbUtils.getUsuario(numeroLimpio);
      }

      const telReal =
        memoriaDisco.mapaContactos[numeroLimpio]?.telefonoReal || null;
      const credVinculada = obtenerPruebaVigente24h(numeroLimpio);

      // Si el cliente ya tiene una prueba o venta activa (en este ID o en su teléfono vinculado), sincronizamos a Paso 3
      if (
        credVinculada &&
        !esNumeroVIP(numeroLimpio) &&
        usuario.paso_flujo !== 99
      ) {
        if (usuario.paso_flujo !== 3 || !usuario.prueba_enviada) {
          await dbUtils.actualizarPaso(numeroLimpio, 3);
          await dbUtils.marcarPruebaEnviada(numeroLimpio);
          usuario.paso_flujo = 3;
          usuario.prueba_enviada = 1;
          memoriaDisco.ultimoPasoValido[numeroLimpio] = 3;
          guardarMemoriaDisco();
        }
      } else if (usuario.paso_flujo === 0 && !esNumeroVIP(numeroLimpio)) {
        if (telReal && telReal !== numeroLimpio) {
          const uPorTel = await dbUtils.getUsuario(telReal);
          if (uPorTel && uPorTel.paso_flujo > 0) {
            await dbUtils.actualizarPaso(numeroLimpio, uPorTel.paso_flujo);
            usuario.paso_flujo = uPorTel.paso_flujo;
            if (uPorTel.prueba_enviada) {
              await dbUtils.marcarPruebaEnviada(numeroLimpio);
              usuario.prueba_enviada = 1;
            }
          }
        }

        const keyVentaProactiva = hayVentaProactivaReciente(
          numeroLimpio,
          telReal,
        );
        if (usuario.paso_flujo === 0 && keyVentaProactiva) {
          await dbUtils.actualizarPaso(numeroLimpio, 1);
          usuario.paso_flujo = 1;
          memoriaDisco.ultimoPasoValido[numeroLimpio] = 1;
          delete memoriaDisco.ventasProactivas[keyVentaProactiva];
          delete memoriaDisco.ventasProactivas[numeroLimpio];
          guardarMemoriaDisco();
          console.log(
            `🔗 [VINCULACIÓN VENDER] Respuesta de ${numeroLimpio} vinculada a la venta proactiva (Paso 1)`,
          );
        }
      }

      if (
        usuario.paso_flujo &&
        usuario.paso_flujo !== 99 &&
        usuario.paso_flujo > 0
      ) {
        memoriaDisco.ultimoPasoValido[numeroLimpio] = usuario.paso_flujo;
      }

      if (
        !esNumeroVIP(numeroLimpio) &&
        usuario.paso_flujo === 99 &&
        cumplioTiempoAutoDesbloqueo(numeroLimpio)
      ) {
        const estadoInterpretado = await interpretarPasoDondeQuedo(
          numeroLimpio,
          usuario,
        );
        await dbUtils.actualizarPaso(numeroLimpio, estadoInterpretado.paso);
        usuario.paso_flujo = estadoInterpretado.paso;
        chatsBloqueados.delete(numeroLimpio);
        abortarEnvioEnCurso.delete(numeroLimpio);
        delete memoriaDisco.infoPaso99[numeroLimpio];
        delete memoriaDisco.buzonPaso99[numeroLimpio];
        delete memoriaDisco.ultimoTsIntervencionManual[numeroLimpio];
        guardarMemoriaDisco();
        console.log(
          `🔓 [${numeroLimpio}] Auto-desbloqueado de Paso 99 tras +24hs. Retomando en Paso ${estadoInterpretado.paso}`,
        );
      }

      const yaTuvoPruebaReal = Boolean(
        usuario.prueba_enviada === 1 ||
        usuario.prueba_enviada === true ||
        credVinculada,
      );

      const tsUltimaIntervencion =
        memoriaDisco.ultimoTsIntervencionManual[numeroLimpio] || 0;
      const mensajesValidos = mensajesEnCola.filter((m) => {
        if (esNumeroVIP(numeroLimpio) || usuario.paso_flujo === 99) return true;
        return obtenerTimestampSegundos(m) > tsUltimaIntervencion;
      });

      if (mensajesValidos.length === 0) continue;

      const textosRecibidos = [];
      if (textoAcumuladoRondaPrevia) {
        textosRecibidos.push(textoAcumuladoRondaPrevia);
        textoAcumuladoRondaPrevia = "";
      }

      const idsParaConfirmar = [];
      let ultimoMensajeRaw = mensajesValidos[mensajesValidos.length - 1];
      let textoCitadoReciente = "";

      for (const m of mensajesValidos) {
        if (m.key?.fromMe) continue;
        if (m.key?.id) idsParaConfirmar.push(m.key.id);
        const txt = obtenerTextoDeMensaje(m).trim();
        if (txt) textosRecibidos.push(txt);
        const citado = obtenerTextoCitado(m);
        if (citado) textoCitadoReciente = citado;
        if (esComprobanteOArchivo(m) || esAudio(m)) {
          ultimoMensajeRaw = m;
        }
      }

      const textoUnificado = textosRecibidos.join(" ").trim();
      if (textoUnificado && !esNumeroVIP(numeroLimpio)) {
        registrarEnHistorialChat(numeroLimpio, "CLIENTE", textoUnificado);
      }
      registrarLog(
        numeroLimpio,
        "RECIBIDO",
        textoUnificado || "[ARCHIVO/MULTIMEDIA]",
      );

      // 1. Verificar si es un comando VIP del administrador
      const fueComandoVIP = await ejecutarComandoVIP(
        getSockActual() || sock,
        numeroLimpio,
        remoteJid,
        textoUnificado,
        idsParaConfirmar,
      );
      if (fueComandoVIP) break;

      // 2. Si el Modo Caída está activo, el bot enmudece y guarda el mensaje en la cola de caída (sin responder)
      if (memoriaDisco.modoCaidaActivo && !esNumeroVIP(numeroLimpio)) {
        for (const m of mensajesValidos) {
          if (!m.key?.fromMe) {
            const txtM = obtenerTextoDeMensaje(m).trim();
            guardarEnColaCaida(
              numeroLimpio,
              remoteJid,
              txtM,
              textoCitadoReciente,
              m.key?.id,
              obtenerTimestampSegundos(m),
            );
          }
        }
        idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
        break;
      }

      // 3. Si el cliente está en Paso 99 (Atención Humana)
      if (usuario.paso_flujo === 99 && !esNumeroVIP(numeroLimpio)) {
        for (const m of mensajesValidos) {
          if (!m.key?.fromMe) {
            const txtM = obtenerTextoDeMensaje(m).trim();
            if (txtM) {
              guardarEnBuzonPaso99(
                numeroLimpio,
                txtM,
                m.key?.id,
                obtenerTimestampSegundos(m),
              );
            }
          }
        }
        idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
        chatsBloqueados.add(numeroLimpio);

        const esNuevoPagoORenovacion = mensajesValidos.some((m) =>
          esPosibleRenovacionOPagoEnPaso99(m),
        );
        const cooldownCumplido =
          Date.now() - (ultimaAlertaVigiasTs.get(numeroLimpio) || 0) >
          10 * 60 * 1000;

        if (esNuevoPagoORenovacion && cooldownCumplido) {
          ultimaAlertaVigiasTs.set(numeroLimpio, Date.now());
          console.log(
            `💸 [VIGÍA PASO 99] ${numeroLimpio} envió un nuevo comprobante o pedido de renovación.`,
          );
          await notificarAlAdmin(
            getSockActual() || sock,
            numeroLimpio,
            "NUEVO PAGO / RENOVACIÓN (EN PASO 99) 🔄💸",
            textoUnificado
              ? `Mensaje en chat silenciado: "${textoUnificado}"`
              : "Envió un nuevo comprobante/archivo en un chat que estaba en Paso 99.",
          );
        }
        break;
      }

      abortarEnvioEnCurso.delete(numeroLimpio);

      try {
        await (getSockActual() || sock).readMessages([ultimoMensajeRaw.key]);
      } catch (e) {}

      await procesarMensajeInteligente(
        getSockActual() || sock,
        numeroLimpio,
        remoteJid,
        textoUnificado,
        textoCitadoReciente,
        usuario.paso_flujo,
        yaTuvoPruebaReal,
        ultimoMensajeRaw,
      );

      // Si mientras procesábamos entró otro mensaje a la cola y procesarMensajeInteligente
      // cedió el turno para re-agrupar, conservamos el texto de esta ronda para unirlo a la siguiente
      if (hayMensajesNuevosEnEspera(numeroLimpio) && textoUnificado) {
        textoAcumuladoRondaPrevia = textoUnificado;
      }

      idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    }
  } catch (error) {
    console.error(`❌ Error procesando a ${numeroLimpio}:`, error.message);
  } finally {
    procesandoUsuario.set(numeroLimpio, false);
  }
}

// ============================================================================
// RECUPERADOR DE MENSAJES ENVIADOS DURANTE DESVINCULACIÓN / RECONEXIÓN DE QR
// ============================================================================
async function procesarLoteSincronizacionOffline(
  sock,
  listaMensajes,
  origen = "SYNC",
) {
  if (!Array.isArray(listaMensajes) || listaMensajes.length === 0) return;

  // Agrupamos por chat y ordenamos cronológicamente para saber si el cliente quedó sin respuesta
  const porChat = new Map();
  for (const msg of listaMensajes) {
    const remoteJid = msg?.key?.remoteJid;
    if (
      !remoteJid ||
      remoteJid === "status@broadcast" ||
      remoteJid.endsWith("@g.us")
    )
      continue;
    if (esEventoIgnorable(msg)) continue;
    if (!esMensajeReciente(msg, HORAS_MAX_SIN_CONEXION)) continue;

    if (!porChat.has(remoteJid)) porChat.set(remoteJid, []);
    porChat.get(remoteJid).push(msg);
  }

  for (const [remoteJid, msgsDelChat] of porChat.entries()) {
    msgsDelChat.sort(
      (a, b) => obtenerTimestampSegundos(a) - obtenerTimestampSegundos(b),
    );
    const numeroLimpio = remoteJid.replace(/@.+$/, "").replace(/\D/g, "");
    if (!numeroLimpio) continue;

    // 1. Primero procesamos los mensajes fromMe del lote para actualizar el estado real del chat
    let ultimoTsFromMeEnLote = 0;
    for (const m of msgsDelChat) {
      if (m.key?.fromMe) {
        const tsM = obtenerTimestampSegundos(m);
        if (tsM > ultimoTsFromMeEnLote) ultimoTsFromMeEnLote = tsM;
        const txtSal = obtenerTextoDeMensaje(m).trim();
        const fueDelBot = await sincronizarEstadoPorMensajeSaliente(
          numeroLimpio,
          txtSal,
          tsM,
        );
        if (!fueDelBot && txtSal && !esNumeroVIP(numeroLimpio)) {
          registrarIdMensajeDelBot(m.key?.id);
          // Si le respondiste manualmente durante la caída, lo removemos de colaCaida
          limpiarUsuarioDeColaCaida(numeroLimpio);
        }
      } else {
        guardarDatosContacto(numeroLimpio, remoteJid, m);
      }
    }

    // Buscar también si en el historial guardado en disco ya hubo respuesta posterior del BOT u OPERADOR
    const historialGuardado = memoriaDisco.historialChat[numeroLimpio] || [];
    const ultimoSalienteMemoria = [...historialGuardado]
      .reverse()
      .find((h) => h.rol === "BOT" || h.rol === "OPERADOR");
    const tsUltimaRespuestaEnviada = Math.max(
      ultimoTsFromMeEnLote,
      ultimoSalienteMemoria?.ts || 0,
      memoriaDisco.ultimoTsIntervencionManual[numeroLimpio] || 0,
    );

    // 2. Filtramos los mensajes del cliente que sean POSTERIORES a la última respuesta enviada
    for (const m of msgsDelChat) {
      if (m.key?.fromMe) continue;
      const msgId = m.key?.id;
      if (msgId && setMensajesProcesados.has(msgId)) continue;

      const tsMsg = obtenerTimestampSegundos(m);

      // Si el mensaje del cliente es más viejo que una respuesta que ya se le dio después, lo marcamos procesado
      if (!esNumeroVIP(numeroLimpio) && tsMsg <= tsUltimaRespuestaEnviada) {
        marcarMensajeProcesado(msgId);
        continue;
      }

      const txtBruto = obtenerTextoDeMensaje(m).toLowerCase();
      if (
        /\bpersonal\b/.test(txtBruto) &&
        !/\bno tengo personal\b/.test(txtBruto)
      ) {
        memoriaDisco.operadorDetectado[numeroLimpio] = "personal";
      } else if (
        /\bclaro\b/.test(txtBruto) &&
        !/\b(claro que|si claro|no tengo claro)\b/.test(txtBruto)
      ) {
        memoriaDisco.operadorDetectado[numeroLimpio] = "claro";
      }

      console.log(
        `📥 [${origen}] Recuperando mensaje sin responder de ${numeroLimpio}: "${obtenerTextoDeMensaje(m).slice(0, 60)}"`,
      );
      encolarConDebounce(sock, numeroLimpio, remoteJid, m);
    }
  }
}

// ============================================================================
// ARRANQUE PRINCIPAL DE BAILEYS
// ============================================================================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.windows("Chrome"),
    syncFullHistory: true, // Habilitado para recibir los mensajes enviados mientras estuvo desvinculado
    markOnlineOnConnect: false,
    retryRequestDelayMs: 500,
    maxMsgRetryCount: 5,
  });

  setSockActual(sock);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("\n📱 --- ESCANEÁ ESTE CÓDIGO QR CON WHATSAPP ---");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      if (timerRevisionSeguimiento) {
        clearInterval(timerRevisionSeguimiento);
        timerRevisionSeguimiento = null;
      }
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log("🔄 Reconectando...");
        setTimeout(startBot, 3000);
      }
    } else if (connection === "open") {
      console.log(
        "\n✅ Bot MNet v5.1 (Arquitectura Modular + Canal de Utilidades y Difusión) listo\n",
      );

      if (timerRevisionSeguimiento) clearInterval(timerRevisionSeguimiento);
      timerRevisionSeguimiento = setInterval(() => {
        verificarYEnviarSeguimientosPrueba(getSockActual() || sock);
      }, INTERVALO_REVISION_SEGUIMIENTO_MS);
      if (timerRevisionSeguimiento.unref) timerRevisionSeguimiento.unref();

      const tInicial = setTimeout(() => {
        verificarYEnviarSeguimientosPrueba(getSockActual() || sock);
      }, 25000);
      if (tInicial.unref) tInicial.unref();
    }
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("contacts.upsert", vincularListaContactos);
  sock.ev.on("contacts.update", vincularListaContactos);

  // Captura los mensajes pendientes que llegaron mientras el bot estuvo desvinculado y se volvió a vincular por QR
  sock.ev.on("messaging-history.set", async ({ messages, contacts }) => {
    if (Array.isArray(contacts) && contacts.length > 0) {
      vincularListaContactos(contacts);
    }
    if (Array.isArray(messages) && messages.length > 0) {
      await procesarLoteSincronizacionOffline(
        getSockActual() || sock,
        messages,
        "HISTORIAL-QR",
      );
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;

    // Si es un lote de mensajes acumulados desconectado ("append"), usamos el recuperador inteligente
    if (type === "append") {
      await procesarLoteSincronizacionOffline(
        getSockActual() || sock,
        messages,
        "OFFLINE",
      );
      return;
    }

    for (const msg of messages) {
      const remoteJid = msg.key?.remoteJid;
      if (
        !remoteJid ||
        remoteJid === "status@broadcast" ||
        remoteJid.endsWith("@g.us")
      ) {
        continue;
      }

      if (esEventoIgnorable(msg)) continue;
      if (!esMensajeReciente(msg, HORAS_MAX_SIN_CONEXION)) continue;

      const msgId = msg.key?.id;
      const numeroLimpio = remoteJid.replace(/@.+$/, "").replace(/\D/g, "");
      const tsMsg = obtenerTimestampSegundos(msg);

      if (msg.key.fromMe) {
        const txtSaliente = obtenerTextoDeMensaje(msg).trim();
        const yaRegistradoPorBot = Boolean(
          msgId && setIdsMensajesDelBot.has(msgId),
        );
        const botEstaEnviandoEnEsteChat =
          (enviosBotEnVuelo.get(numeroLimpio) || 0) > 0 ||
          creandoPruebaEnCurso.has(numeroLimpio) ||
          Date.now() - (ultimoEnvioBotTs.get(numeroLimpio) || 0) < 8000;

        // Si el mensaje saliente contiene una plantilla oficial del bot (ej. mandarprueba o comunicado de caída), sincroniza el paso sin bloquear en Paso 99
        const fuePlantillaDelBot = await sincronizarEstadoPorMensajeSaliente(
          numeroLimpio,
          txtSaliente,
          tsMsg,
        );

        if (
          yaRegistradoPorBot ||
          botEstaEnviandoEnEsteChat ||
          fuePlantillaDelBot
        ) {
          if (msgId) registrarIdMensajeDelBot(msgId);
          continue;
        }

        if (!esNumeroVIP(numeroLimpio)) {
          if (txtSaliente) {
            registrarEnHistorialChat(numeroLimpio, "OPERADOR", txtSaliente);
          }
          registrarTsIntervencionManual(numeroLimpio, tsMsg);
          // Si le respondiste manualmente durante la caída, lo removemos de colaCaida
          limpiarUsuarioDeColaCaida(numeroLimpio);

          let usuario = await dbUtils.getUsuario(numeroLimpio);
          if (!usuario) await dbUtils.crearUsuario(numeroLimpio);
          await silenciarBotParaCliente(
            numeroLimpio,
            "Intervención manual del operador (en vivo)",
            usuario?.paso_flujo !== 99 ? usuario?.paso_flujo : null,
          );
          memoriaDisco.buzonPaso99[numeroLimpio] = [];
          guardarMemoriaDisco();
        }
        continue;
      }

      if (msgId && setMensajesProcesados.has(msgId)) continue;

      guardarDatosContacto(numeroLimpio, remoteJid, msg);

      const txtBruto = obtenerTextoDeMensaje(msg).toLowerCase();
      if (
        /\bpersonal\b/.test(txtBruto) &&
        !/\bno tengo personal\b/.test(txtBruto)
      ) {
        memoriaDisco.operadorDetectado[numeroLimpio] = "personal";
      } else if (
        /\bclaro\b/.test(txtBruto) &&
        !/\b(claro que|si claro|no tengo claro)\b/.test(txtBruto)
      ) {
        memoriaDisco.operadorDetectado[numeroLimpio] = "claro";
      }

      if (!esNumeroVIP(numeroLimpio) && chatsBloqueados.has(numeroLimpio)) {
        const txtEnPausa = obtenerTextoDeMensaje(msg).trim();
        if (txtEnPausa) {
          registrarEnHistorialChat(numeroLimpio, "CLIENTE", txtEnPausa);
          guardarEnBuzonPaso99(numeroLimpio, txtEnPausa, msgId, tsMsg);
        }
        if (
          !cumplioTiempoAutoDesbloqueo(numeroLimpio) &&
          !esPosibleRenovacionOPagoEnPaso99(msg)
        ) {
          marcarMensajeProcesado(msgId);
          continue;
        }
      }

      const tsUltimaIntervencion =
        memoriaDisco.ultimoTsIntervencionManual[numeroLimpio] || 0;
      if (
        !esNumeroVIP(numeroLimpio) &&
        tsMsg <= tsUltimaIntervencion &&
        !esPosibleRenovacionOPagoEnPaso99(msg)
      ) {
        marcarMensajeProcesado(msgId);
        continue;
      }

      encolarConDebounce(sock, numeroLimpio, remoteJid, msg);
    }
  });
}

process.on("SIGINT", () => {
  guardarMemoriaSincrono();
  process.exit(0);
});
process.on("SIGTERM", () => {
  guardarMemoriaSincrono();
  process.exit(0);
});

if (require.main === module) {
  startBot();
}

module.exports = {
  ...config,
  ...mensajes,
  ...comunicados,
  ...memoria,
  ...ia,
  ...flujos,
  ...comandosVip,
  ejecutarComandoVIP,
  sincronizarEstadoPorMensajeSaliente,
  calcularTiempoDebounceMs,
  encolarConDebounce,
  procesarColaDeUsuario,
  procesarLoteSincronizacionOffline,
  startBot,
};
