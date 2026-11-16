const { delay } = require("@whiskeysockets/baileys");
const dbUtils = require("./db");
const { esNumeroVIP } = require("./config");
const {
  VARIACIONES_INICIAL,
  obtenerAleatorio,
  nombreDescriptivoPaso,
} = require("./mensajes");
const {
  construirInvitacionCanal,
  construirMensajeCaida,
  construirMensajeRestablecido,
} = require("./comunicados");
const {
  memoriaDisco,
  guardarMemoriaDisco,
  intentosFallidos,
  audiosSeguidos,
  abortarEnvioEnCurso,
  ultimoCierreCordialTs,
  ultimoMenuEnviadoTs,
  colaMensajes,
  temporizadoresDebounce,
  chatsBloqueados,
  ultimaRespuestaGenerada,
  ultimaRespuestaGeneradaTs,
  marcarMensajeProcesado,
  registrarEnHistorialChat,
  activarModoCaida,
  desactivarModoCaida,
  limpiarUsuarioDeColaCaida,
  vincularIdentidades,
  obtenerIdsVinculados,
  obtenerPruebaVigente24h,
  registrarLog,
  normalizarNumeroArgentino,
  resolverIdUsuario,
  obtenerJidDeUsuario,
  interpretarPasoDondeQuedo,
} = require("./memoria");
const { descubrirIntencionConIA, esConfirmacionOCierreCorto } = require("./ia");
const {
  getSockActual,
  enviarMensajeSeguro,
  enviarMensajeConFotoApp,
  silenciarBotParaCliente,
  enviarVideoYApkVPN,
  enviarPackVPN,
  retomarConversacionAlDesbloquear,
  procesarMensajeInteligente,
} = require("./flujos");
const { generarExcelMensual, formatearFechaHora } = require("./excel_report");

const TEXTO_AYUDA_VIP = `🛠️ *PANEL DE COMANDOS VIP — MNET VPN* 🛠️

💰 *1. VENTAS, RENOVACIONES Y EXCEL*
• \`venta <cliente> <días> <user> <pass> [personal|claro]\`
  _Registra la venta o renovación, calcula el precio, suma días si ya tenía plan activo, actualiza el Excel, envía las credenciales y recomienda unirse al Canal de Utilidades._
  📌 _Ej:_ \`venta Chelo 30 chelo25 clave123\`
  📌 _Ej:_ \`venta 3442123456 7 juan77 pass999 claro\`

• \`excel\` _(o \`excel 2026-11\`)_
  _Genera y te envía por WhatsApp la planilla Excel del mes con las 4 hojas actualizadas._

• \`vencimientos\`
  _Muestra la lista de clientes pagos activos, quiénes están por vencer (48h) y quiénes ya vencieron._

━━━━━━━━━━━━━━━━━━━━
📢 *2. MODO CAÍDA Y DIFUSIÓN (comunicados.js)*
• \`veraviso\`
  _Muestra el estado del Modo Caída, cuántos chats están en espera y la vista previa de comunicados.js._

• \`caida\` _(o \`caida <nota adicional>\`)_
  _Envía el aviso de caída a todos los clientes con servicio vigente y PAUSA el bot (guardando en cola a todos los que escriban mientras esté caído)._

• \`restablecido\` _(o \`restablecido <nota adicional>\`)_
  _Reactiva el bot, envía el aviso de servicio restablecido a los clientes vigentes y RESPONDE automáticamente a todos los chats acumulados desde que se cayó._

━━━━━━━━━━━━━━━━━━━━
🎁 *3. PRUEBAS GRATIS Y VENTA PROACTIVA*
• \`mandarprueba <cliente> [personal|claro]\`
  _Genera una prueba fácil en Veltrix y le envía Imagen + Link de Play Store + Video + Usuario y Contraseña separados._
  📌 _Ej:_ \`mandarprueba 3442123456 personal\`
  📌 _Ej:_ \`mandarprueba Chelo claro\`

• \`vender <numero>\`
  _Inicia una conversación de venta enviándole la imagen de la app y el menú principal sin repetir bienvenida cuando responda._
  📌 _Ej:_ \`vender 3442123456\`

━━━━━━━━━━━━━━━━━━━━
👨‍💻 *4. CONTROL DE PASO 99 (ATENCIÓN HUMANA)*
• \`pendientes\`
  _Muestra los clientes pausados en Paso 99, hace cuánto esperan y qué dejaron escrito en el buzón._

• \`desbloquear <cliente>\`
  _Saca al cliente del Paso 99 y el bot retoma la charla automáticamente en el paso donde había quedado._
  📌 _Ej:_ \`desbloquear Chelo\`

• \`bloquear <cliente>\`
  _Pausa el bot manualmente para ese cliente (lo pasa a Paso 99)._

━━━━━━━━━━━━━━━━━━━━
🔄 *5. REINICIOS Y ESTADÍSTICAS*
• \`reiniciar <cliente>\`
  _Borra el historial de ese cliente, lo vuelve a Paso 0 y le habilita pedir una nueva prueba gratis._

• \`reset\`
  _Reinicia tu propio chat VIP a Paso 0 para que puedas probar el bot como si fueras un cliente nuevo._

• \`stats\`
  _Muestra el resumen rápido de usuarios, pruebas, clientes pagos y estado del Modo Caída._`;

// ============================================================================
// PARSER INTELIGENTE DEL COMANDO VENTA / ACTIVAR / RENOVAR
// Sintaxis: venta <cliente> <dias> <usuario> <password> [personal|claro]
// ============================================================================
function parsearArgumentosVenta(restoTexto) {
  let tokens = String(restoTexto || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 4) return null;

  let operadorExplicito = null;
  const ultimo = tokens[tokens.length - 1].toLowerCase();
  if (ultimo === "claro" || ultimo === "personal") {
    operadorExplicito = ultimo;
    tokens.pop();
  }

  if (tokens.length < 4) return null;

  const passwordVpn = tokens.pop();
  const usuarioVpn = tokens.pop();
  const diasRaw = tokens.pop();
  const diasPlan = Number(diasRaw.replace(/\D/g, ""));
  const targetCliente = tokens.join(" ").trim();

  if (
    !targetCliente ||
    !diasPlan ||
    diasPlan <= 0 ||
    !usuarioVpn ||
    !passwordVpn
  ) {
    return null;
  }

  return {
    targetCliente,
    diasPlan,
    usuarioVpn,
    passwordVpn,
    operadorExplicito,
  };
}

// ============================================================================
// RESOLUTOR INTEGRAL DE IDENTIDADES VIP (CRUZA TELÉFONO <-> @LID <-> USER VPN)
// ============================================================================
async function resolverIdentidadesClienteVIP(s, rawTarget) {
  const idBase = resolverIdUsuario(rawTarget);
  if (!idBase) return null;

  const conjuntoIds = new Set(obtenerIdsVinculados(idBase));
  conjuntoIds.add(idBase);

  const soloDigitos = String(rawTarget || "").replace(/\D/g, "");
  const telNormalizado =
    soloDigitos.length >= 8 ? normalizarNumeroArgentino(soloDigitos) : null;
  if (telNormalizado && telNormalizado.startsWith("54")) {
    conjuntoIds.add(telNormalizado);
  }

  let idPrincipal = idBase;
  let jidPrincipal = obtenerJidDeUsuario(idBase);
  let idLidDescubierto = null;

  const candidatoTel =
    (idBase.startsWith("54") ? idBase : null) ||
    (telNormalizado && telNormalizado.startsWith("54") ? telNormalizado : null);

  if (candidatoTel && typeof s?.onWhatsApp === "function") {
    try {
      const resWa = await s.onWhatsApp(`${candidatoTel}@s.whatsapp.net`);
      const verificacion = Array.isArray(resWa) ? resWa[0] : null;
      if (verificacion) {
        if (verificacion.jid) {
          const idJid = verificacion.jid.replace(/@.+$/, "").replace(/\D/g, "");
          if (idJid) conjuntoIds.add(idJid);
        }
        if (verificacion.lid) {
          idLidDescubierto = verificacion.lid
            .replace(/@.+$/, "")
            .replace(/\D/g, "");
          if (idLidDescubierto) {
            conjuntoIds.add(idLidDescubierto);
            vincularIdentidades(
              candidatoTel,
              idLidDescubierto,
              `${idLidDescubierto}@lid`,
            );
          }
        }
      }
    } catch (e) {}
  }

  for (const id of Array.from(conjuntoIds)) {
    for (const vinc of obtenerIdsVinculados(id)) {
      conjuntoIds.add(vinc);
    }
  }

  const listaTodos = Array.from(conjuntoIds).filter(Boolean);
  for (const candidato of listaTodos) {
    if (
      memoriaDisco.infoPaso99[candidato] ||
      memoriaDisco.credencialesEnviadas[candidato] ||
      (memoriaDisco.historialChat[candidato] &&
        memoriaDisco.historialChat[candidato].length > 0)
    ) {
      idPrincipal = candidato;
      jidPrincipal = obtenerJidDeUsuario(candidato);
      break;
    }
  }

  return {
    idPrincipal,
    jidPrincipal,
    idLidDescubierto,
    todosLosIds: listaTodos,
  };
}

function limpiarEstadoEnMemoriaPorId(id) {
  if (!id) return;
  const credAntigua = memoriaDisco.credencialesEnviadas[id];
  if (credAntigua?.usuario) {
    delete memoriaDisco.chequeoInicialEnviado[`user_${credAntigua.usuario}`];
    delete memoriaDisco.seguimientoPruebaEnviado[`user_${credAntigua.usuario}`];
  }
  if (temporizadoresDebounce.has(id)) {
    clearTimeout(temporizadoresDebounce.get(id));
    temporizadoresDebounce.delete(id);
  }
  colaMensajes.delete(id);
  abortarEnvioEnCurso.delete(id);
  chatsBloqueados.delete(id);
  intentosFallidos.delete(id);
  audiosSeguidos.delete(id);
  ultimoCierreCordialTs.delete(id);
  ultimoMenuEnviadoTs.delete(id);
  ultimaRespuestaGenerada.delete(id);
  ultimaRespuestaGeneradaTs.delete(id);
  delete memoriaDisco.esperandoComprobante[id];
  delete memoriaDisco.ultimoTsIntervencionManual[id];
  delete memoriaDisco.infoPaso99[id];
  delete memoriaDisco.buzonPaso99[id];
  delete memoriaDisco.ultimoPasoValido[id];
  delete memoriaDisco.historialChat[id];
  delete memoriaDisco.operadorDetectado[id];
  delete memoriaDisco.credencialesEnviadas[id];
  delete memoriaDisco.soporteNivel1Enviado[id];
  delete memoriaDisco.ventasProactivas[id];
  delete memoriaDisco.chequeoInicialEnviado[id];
  delete memoriaDisco.seguimientoPruebaEnviado[id];
  if (memoriaDisco.colaCaida) {
    delete memoriaDisco.colaCaida[id];
  }
}

// ============================================================================
// BUSCADOR DEDUPLICADO DE CLIENTES CON SERVICIO VIGENTE (PARA DIFUSIÓN)
// ============================================================================
async function obtenerClientesConServicioVigente() {
  const ahoraSeg = Math.floor(Date.now() / 1000);
  const destinatarios = [];
  const idsYaIncluidos = new Set();
  const usuariosVpnYaIncluidos = new Set();

  const registrarDestinatario = (idRaw, nombreFallback, usuarioVpn, tipo) => {
    const idLimpio = String(idRaw || "").replace(/\D/g, "");
    if (!idLimpio || esNumeroVIP(idLimpio)) return;

    const vinculados = obtenerIdsVinculados(idLimpio);
    if (
      idsYaIncluidos.has(idLimpio) ||
      vinculados.some((v) => idsYaIncluidos.has(v))
    ) {
      return;
    }
    if (
      usuarioVpn &&
      usuariosVpnYaIncluidos.has(String(usuarioVpn).toLowerCase())
    ) {
      return;
    }

    let idElegido = idLimpio;
    for (const v of vinculados) {
      if (memoriaDisco.mapaContactos[v]?.jidOriginal) {
        idElegido = v;
        break;
      }
    }

    idsYaIncluidos.add(idLimpio);
    idsYaIncluidos.add(idElegido);
    vinculados.forEach((v) => idsYaIncluidos.add(v));
    if (usuarioVpn) {
      usuariosVpnYaIncluidos.add(String(usuarioVpn).toLowerCase());
    }

    const nombre =
      memoriaDisco.mapaContactos[idElegido]?.nombre ||
      memoriaDisco.mapaContactos[idLimpio]?.nombre ||
      nombreFallback ||
      `Cliente +${idElegido}`;

    destinatarios.push({
      id: idElegido,
      jid: obtenerJidDeUsuario(idElegido),
      nombre,
      usuarioVpn: usuarioVpn || "-",
      tipo,
    });
  };

  // 1. Clientes con suscripción paga vigente en SQLite (tabla ventas)
  if (typeof dbUtils.obtenerEstadoSuscripcionesActuales === "function") {
    try {
      const subs = await dbUtils.obtenerEstadoSuscripcionesActuales();
      for (const s of subs || []) {
        if (s && (s.ts_vencimiento || 0) > ahoraSeg) {
          registrarDestinatario(
            s.numero || s.telefono_real,
            s.nombre,
            s.usuario_vpn,
            "PLAN_PAGO",
          );
        }
      }
    } catch (e) {}
  }

  // 2. Clientes con servicio vigente en memoriaDisco.credencialesEnviadas
  for (const [idMem, cred] of Object.entries(
    memoriaDisco.credencialesEnviadas || {},
  )) {
    if (!cred || !cred.usuario) continue;
    const tsFin =
      cred.tsVencimiento ||
      (cred.tsCreacion
        ? cred.tsCreacion + (cred.duracionHoras || 24) * 3600
        : 0);
    if (tsFin > ahoraSeg) {
      registrarDestinatario(
        idMem,
        memoriaDisco.mapaContactos[idMem]?.nombre,
        cred.usuario,
        cred.esVentaConfirmada ? "PLAN_PAGO" : "PRUEBA_VIGENTE",
      );
    }
  }

  return destinatarios;
}

// ============================================================================
// PROCESADOR DE CHATS ACUMULADOS EN COLA CAÍDA AL ENVIAR "RESTABLECIDO"
// ============================================================================
async function procesarColaCaidaPendiente(
  sock,
  idsRecienNotificadosRestablecido = new Set(),
) {
  const s = getSockActual() || sock;
  const entradas = Object.entries(memoriaDisco.colaCaida || {}).filter(
    ([id]) => !esNumeroVIP(id),
  );
  if (entradas.length === 0) return { retomados: 0, cubiertosPorAviso: 0 };

  // Ordenar cronológicamente según el primer mensaje recibido durante la caída
  entradas.sort(
    (a, b) => (a[1]?.tsPrimerMensaje || 0) - (b[1]?.tsPrimerMensaje || 0),
  );

  // Limpiar el diccionario en memoria antes de iterar para evitar re-entradas
  memoriaDisco.colaCaida = {};
  guardarMemoriaDisco();

  let retomados = 0;
  let cubiertosPorAviso = 0;
  const idsYaAtendidosEnRonda = new Set();

  for (const [idUsuario, datosCola] of entradas) {
    if (!datosCola) continue;
    const vinculados = obtenerIdsVinculados(idUsuario);
    if (
      idsYaAtendidosEnRonda.has(idUsuario) ||
      vinculados.some((v) => idsYaAtendidosEnRonda.has(v))
    ) {
      continue;
    }

    idsYaAtendidosEnRonda.add(idUsuario);
    vinculados.forEach((v) => idsYaAtendidosEnRonda.add(v));

    // Confirmar los IDs de mensajes guardados durante la caída
    if (Array.isArray(datosCola.idsMensajes)) {
      datosCola.idsMensajes.forEach((msgId) => marcarMensajeProcesado(msgId));
    }

    const tsUltManual = memoriaDisco.ultimoTsIntervencionManual[idUsuario] || 0;
    if (tsUltManual >= (datosCola.tsUltimoMensaje || 0)) {
      continue;
    }

    const textoUnificado = Array.isArray(datosCola.textos)
      ? datosCola.textos.join(" ").trim()
      : "";
    if (!textoUnificado) continue;

    let usuarioBD = await dbUtils.getUsuario(idUsuario);
    if (!usuarioBD) {
      await dbUtils.crearUsuario(idUsuario);
      usuarioBD = await dbUtils.getUsuario(idUsuario);
    }

    // Si estaba en Paso 99 por atención humana previa, lo dejamos en su buzón
    if (usuarioBD.paso_flujo === 99) continue;

    const credVigente = obtenerPruebaVigente24h(idUsuario);
    const yaTuvoPruebaReal = Boolean(
      usuarioBD.prueba_enviada === 1 ||
      usuarioBD.prueba_enviada === true ||
      credVigente,
    );
    const pasoActual = usuarioBD.paso_flujo || 0;
    const jidDestino = datosCola.remoteJid || obtenerJidDeUsuario(idUsuario);

    const yaRecibioAvisoRestablecido =
      idsRecienNotificadosRestablecido.has(idUsuario) ||
      vinculados.some((v) => idsRecienNotificadosRestablecido.has(v));

    // Si el cliente tiene servicio vigente y YA acaba de recibir el mensaje de "SERVICIO RESTABLECIDO",
    // verificamos si lo único que escribió durante la caída fue "Ok gracias" o "No me conecta" (SOPORTE),
    // en cuyo caso ya quedó respondido con el aviso de restablecimiento y evitamos mandarle otro mensaje encima
    if (yaRecibioAvisoRestablecido) {
      const intencionEnCaida = await descubrirIntencionConIA(
        idUsuario,
        textoUnificado,
        pasoActual,
        yaTuvoPruebaReal,
        datosCola.textoCitado || "",
      );

      if (
        intencionEnCaida === "SOPORTE" ||
        intencionEnCaida === "SOPORTE_INSTALACION_APK" ||
        intencionEnCaida === "AGRADECIMIENTO_FINAL" ||
        esConfirmacionOCierreCorto(textoUnificado)
      ) {
        cubiertosPorAviso++;
        console.log(
          `✅ [RETOMA CAÍDA] ${idUsuario} ("${textoUnificado}") ya quedó cubierto por el aviso de Servicio Restablecido.`,
        );
        continue;
      }
    }

    try {
      console.log(
        `🔄 [RETOMA POST-CAÍDA] Respondiendo mensaje pendiente de ${idUsuario}: "${textoUnificado}"`,
      );
      await procesarMensajeInteligente(
        s,
        idUsuario,
        jidDestino,
        textoUnificado,
        datosCola.textoCitado || "",
        pasoActual,
        yaTuvoPruebaReal,
        null,
      );
      retomados++;
      await delay(1200);
    } catch (errRetoma) {
      console.error(
        `⚠️ Error retomando chat post-caída de ${idUsuario}:`,
        errRetoma.message,
      );
    }
  }

  return { retomados, cubiertosPorAviso };
}

// ============================================================================
// PROCESADOR DE COMANDOS EXCLUSIVOS PARA ADMINISTRADOR (VIP)
// ============================================================================
async function ejecutarComandoVIP(
  sock,
  numeroLimpio,
  remoteJid,
  textoUnificado,
  idsParaConfirmar = [],
) {
  if (!esNumeroVIP(numeroLimpio) || !textoUnificado) return false;

  const comando = textoUnificado.toLowerCase().trim();
  const s = getSockActual() || sock;

  // ==========================================================================
  // 0. COMANDO "help" / "comando" / "comandos" / "menu"
  // ==========================================================================
  if (
    comando === "help" ||
    comando === "comando" ||
    comando === "comandos" ||
    comando === "menu" ||
    comando === "ayudavip"
  ) {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    await enviarMensajeSeguro(
      sock,
      remoteJid,
      { text: TEXTO_AYUDA_VIP },
      {},
      true,
    );
    return true;
  }

  // ==========================================================================
  // 1. COMANDO "venta <cliente> <dias> <usuario> <contraseña> [personal|claro]"
  // ==========================================================================
  if (
    comando.startsWith("venta ") ||
    comando.startsWith("activar ") ||
    comando.startsWith("renovar ")
  ) {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    const resto = textoUnificado
      .replace(/^(venta|activar|renovar)\s+/i, "")
      .trim();
    const parsed = parsearArgumentosVenta(resto);

    if (!parsed) {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text:
            `⚠️ *Formato de venta incompleto.*\n\n` +
            `📌 *Uso:* \`venta <cliente> <días> <usuario> <contraseña> [personal|claro]\`\n\n` +
            `*Ejemplos:*\n` +
            `• \`venta Chelo 30 chelo22 MiClave99\`\n` +
            `• \`venta 3442123456 7 juanvpn Pass123 claro\`\n` +
            `• \`activar Bruno 15 bruno15 123456\``,
        },
        {},
        true,
      );
      return true;
    }

    const {
      targetCliente,
      diasPlan,
      usuarioVpn,
      passwordVpn,
      operadorExplicito,
    } = parsed;
    const idResuelto = resolverIdUsuario(targetCliente);

    if (!idResuelto) {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        { text: `⚠️ No se pudo identificar al cliente *"${targetCliente}"*.` },
        {},
        true,
      );
      return true;
    }

    try {
      let jidDestino = obtenerJidDeUsuario(idResuelto);
      let idDestino = idResuelto;
      let idLidVinculado = null;

      if (
        !memoriaDisco.mapaContactos[idResuelto] &&
        idResuelto.startsWith("54")
      ) {
        const [verificacion] = await s.onWhatsApp(
          `${idResuelto}@s.whatsapp.net`,
        );
        if (verificacion && !verificacion.exists) {
          await enviarMensajeSeguro(
            sock,
            remoteJid,
            { text: `❌ El número *+${idResuelto}* no tiene WhatsApp activo.` },
            {},
            true,
          );
          return true;
        }
        if (verificacion?.jid) {
          jidDestino = verificacion.jid;
          idDestino = jidDestino.replace(/@.+$/, "").replace(/\D/g, "");
        }
        if (verificacion?.lid) {
          idLidVinculado = verificacion.lid
            .replace(/@.+$/, "")
            .replace(/\D/g, "");
          vincularIdentidades(
            idDestino,
            idLidVinculado,
            `${idLidVinculado}@lid`,
          );
        }
      }

      const todosIds = obtenerIdsVinculados(idDestino);
      if (idLidVinculado && !todosIds.includes(idLidVinculado)) {
        todosIds.push(idLidVinculado);
      }

      const opFinal =
        operadorExplicito ||
        memoriaDisco.operadorDetectado[idDestino] ||
        memoriaDisco.credencialesEnviadas[idDestino]?.operador ||
        "personal";

      for (const idV of todosIds) {
        memoriaDisco.operadorDetectado[idV] = opFinal;
      }

      let uDest = await dbUtils.getUsuario(idDestino);
      if (!uDest) {
        await dbUtils.crearUsuario(idDestino);
        uDest = await dbUtils.getUsuario(idDestino);
      }

      const yaTeniaApk = Boolean(
        uDest?.prueba_enviada === 1 ||
        memoriaDisco.credencialesEnviadas[idDestino],
      );

      const nombreDest =
        memoriaDisco.mapaContactos[idDestino]?.nombre ||
        `Cliente +${idDestino}`;
      const telReal =
        memoriaDisco.mapaContactos[idDestino]?.telefonoReal ||
        (idDestino.startsWith("54") ? idDestino : "");

      memoriaDisco.mapaContactos[idDestino] = {
        ...memoriaDisco.mapaContactos[idDestino],
        nombre: nombreDest,
        telefonoReal: telReal || null,
        jidOriginal: jidDestino,
      };

      // 1. Registrar la venta o renovación en SQLite (suma días si tenía plan activo)
      const ventaRegistrada = await dbUtils.registrarVentaBD({
        numero: idDestino,
        nombre: nombreDest,
        telefonoReal: telReal,
        operador: opFinal,
        usuarioVpn,
        passwordVpn,
        diasPlan,
      });

      const ahoraSeg = Math.floor(Date.now() / 1000);
      const duracionTotalHoras = Math.max(
        24,
        Math.ceil((ventaRegistrada.tsVencimiento - ahoraSeg) / 3600),
      );
      const credVentaObj = {
        usuario: String(usuarioVpn),
        password: String(passwordVpn),
        operador: opFinal,
        duracionHoras: duracionTotalHoras,
        tsCreacion: ahoraSeg,
        esVentaConfirmada: true,
        diasPlan,
        tsVencimiento: ventaRegistrada.tsVencimiento,
      };

      // 2. Desbloquear de Paso 99, limpiar esperandoComprobante y marcar como Cliente Pago Activo en todos sus IDs
      for (const idV of todosIds) {
        abortarEnvioEnCurso.delete(idV);
        chatsBloqueados.delete(idV);
        intentosFallidos.delete(idV);
        audiosSeguidos.delete(idV);
        delete memoriaDisco.esperandoComprobante[idV];
        delete memoriaDisco.infoPaso99[idV];
        delete memoriaDisco.buzonPaso99[idV];
        delete memoriaDisco.ultimoTsIntervencionManual[idV];
        delete memoriaDisco.soporteNivel1Enviado[idV];
        limpiarUsuarioDeColaCaida(idV);

        memoriaDisco.credencialesEnviadas[idV] = credVentaObj;
        memoriaDisco.chequeoInicialEnviado[idV] = ahoraSeg;
        memoriaDisco.seguimientoPruebaEnviado[idV] = ahoraSeg;
        memoriaDisco.ultimoPasoValido[idV] = 3;
        ultimoCierreCordialTs.set(idV, Date.now());

        await dbUtils.crearUsuario(idV);
        await dbUtils.actualizarPaso(idV, 3);
        await dbUtils.marcarPruebaEnviada(idV);
        await dbUtils.marcarComoCliente(idV);
      }

      memoriaDisco.chequeoInicialEnviado[`user_${usuarioVpn}`] = ahoraSeg;
      memoriaDisco.seguimientoPruebaEnviado[`user_${usuarioVpn}`] = ahoraSeg;
      guardarMemoriaDisco();

      // 3. Si el cliente compró directo sin haber recibido antes el enlace a Play Store y el video, se los enviamos primero
      if (!yaTeniaApk) {
        await enviarMensajeSeguro(
          sock,
          jidDestino,
          {
            text: `🛡️ *¡Muchas gracias por tu compra y bienvenido a MNet VPN!*\n\nA continuación te enviamos el enlace de descarga de nuestra aplicación oficial en *Google Play Store* y el video tutorial para conectarte: 👇`,
          },
          {},
          true,
        );
        await enviarVideoYApkVPN(sock, idDestino, jidDestino, true);
      }

      // 4. Enviar tarjeta de activación + usuario y contraseña separados + recomendación del Canal de Utilidades
      const textoServidor =
        opFinal === "claro"
          ? "🔒 *Servidor recomendado:* Seleccioná `Claro Ultra` en la lista de servidores."
          : "🔒 *Servidor recomendado:* Seleccioná `Personal ULTRA 1 o 2` en la lista de servidores.";

      const strFechaVenc = formatearFechaHora(ventaRegistrada.tsVencimiento);
      const notaDiasSumados =
        ventaRegistrada.diasSumadosDePlanPrevio > 0
          ? `\n_(Se sumaron los ${diasPlan} días a los ${ventaRegistrada.diasSumadosDePlanPrevio} días que tenías disponibles)_`
          : "";

      const msgActivacionCliente =
        `✅ *TU SUSCRIPCIÓN MNET VPN ESTÁ ACTIVA* ✅\n\n` +
        `👤 *Usuario:* \`${usuarioVpn}\`\n` +
        `🔐 *Contraseña:* \`${passwordVpn}\`\n` +
        `📅 *Plan contratado:* ${diasPlan} días ilimitados\n` +
        `⏰ *Vencimiento:* ${strFechaVenc} hs${notaDiasSumados}\n\n` +
        `💡 _Respetá las mayúsculas y minúsculas exactas al ingresar tus datos (sin dejar espacios en blanco)._\n\n` +
        textoServidor +
        `\n\n👇 *A continuación te enviamos tu usuario y contraseña por separado para que puedas copiarlos y pegarlos directamente en la aplicación:*`;

      await enviarMensajeSeguro(
        sock,
        jidDestino,
        { text: msgActivacionCliente },
        {},
        true,
      );
      await delay(600);
      await enviarMensajeSeguro(
        sock,
        jidDestino,
        { text: String(usuarioVpn) },
        {},
        true,
      );
      await delay(600);
      await enviarMensajeSeguro(
        sock,
        jidDestino,
        { text: String(passwordVpn) },
        {},
        true,
      );
      await delay(600);
      await enviarMensajeSeguro(
        sock,
        jidDestino,
        {
          text: `¡Muchas gracias por confiar en *MNet VPN*! 🙌🏻 Copiá y pegá esos dos datos en la aplicación para conectarte. Cualquier consulta durante tu suscripción, escribinos por este medio. 🚀👍`,
        },
        {},
        true,
      );
      await delay(600);
      await enviarMensajeSeguro(
        sock,
        jidDestino,
        {
          text: construirInvitacionCanal(),
        },
        {},
        true,
      );

      // 5. Actualizar el Excel del mes automáticamente
      let infoExcel = "";
      try {
        const rep = await generarExcelMensual();
        infoExcel = `\n📊 *Excel actualizado:* \`${rep.nombreArchivo}\` (Mandá \`excel\` para descargarlo).`;
      } catch (errEx) {
        infoExcel = `\n⚠️ _(Para generar el archivo .xlsx corré: npm install exceljs)_`;
      }

      registrarLog(
        idDestino,
        "VENTA_CONFIRMADA",
        `${ventaRegistrada.tipoOperacion} | Plan=${diasPlan}d ($${ventaRegistrada.precio}) | User=${usuarioVpn} | Vence=${strFechaVenc}`,
      );

      // 6. Confirmación completa al Admin VIP
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text:
            `✅ *¡VENTA ENTREGADA Y REGISTRADA!* ✅\n\n` +
            `🏷️ *Operación:* ${ventaRegistrada.tipoOperacion}\n` +
            `👤 *Cliente:* ${nombreDest} (\`${telReal || idDestino}\`)\n` +
            `📶 *Operador:* ${opFinal.toUpperCase()}\n` +
            `🔑 *Credenciales:* \`${usuarioVpn}\` / \`${passwordVpn}\`\n` +
            `📅 *Plan:* ${diasPlan} días ($${ventaRegistrada.precio.toLocaleString("es-AR")})\n` +
            `⏰ *Vence el:* ${strFechaVenc} hs\n` +
            `📢 *Canal de Utilidades:* Invitación enviada al cliente\n` +
            `💰 *Total histórico del cliente:* $${ventaRegistrada.totalInvertidoHistorico.toLocaleString("es-AR")}` +
            infoExcel,
        },
        {},
        true,
      );
    } catch (errVenta) {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        { text: `❌ Error al procesar la venta: ${errVenta.message}` },
        {},
        true,
      );
    }
    return true;
  }

  // ==========================================================================
  // 1B. COMANDOS DE DIFUSIÓN Y PAUSA POR CAÍDA ("veraviso", "caida", "restablecido")
  // ==========================================================================
  if (comando === "veraviso" || comando === "vercaida") {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    const vigentes = await obtenerClientesConServicioVigente();
    const enColaCaida = Object.keys(memoriaDisco.colaCaida || {}).length;
    const estadoModoCaida = memoriaDisco.modoCaidaActivo
      ? `🔴 ACTIVO (Bot pausado — ${enColaCaida} chat(s) en espera)`
      : `🟢 INACTIVO (Bot respondiendo normalmente)`;

    const resumenClientes =
      vigentes.length > 0
        ? vigentes
            .slice(0, 15)
            .map(
              (c, i) =>
                `${i + 1}. *${c.nombre}* (\`${c.usuarioVpn}\` - ${c.tipo})`,
            )
            .join("\n")
        : "_Ningún cliente con servicio vigente en este momento._";

    await enviarMensajeSeguro(
      sock,
      remoteJid,
      {
        text:
          `👁️ *VISTA PREVIA DE COMUNICADOS (comunicados.js)*\n\n` +
          `⚙️ *Estado Modo Caída:* ${estadoModoCaida}\n` +
          `👥 *Clientes con servicio vigente hoy (${vigentes.length}):*\n${resumenClientes}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🔴 *1. Texto comando \`caida\`:*\n\n${construirMensajeCaida()}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🟢 *2. Texto comando \`restablecido\`:*\n\n${construirMensajeRestablecido()}\n\n` +
          `💡 _Escribí \`caida\` para pausar el bot y avisar a los vigentes, o \`restablecido\` para reanudar y contestar los chats pendientes._`,
      },
      {},
      true,
    );
    return true;
  }

  if (
    comando === "caida" ||
    comando.startsWith("caida ") ||
    comando === "avisocaida" ||
    comando.startsWith("avisocaida ")
  ) {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    const notaExtra = textoUnificado
      .replace(/^(caida|avisocaida)\s*/i, "")
      .trim();
    const textoComunicado = construirMensajeCaida(notaExtra);

    // 1. Activar inmediatamente el Modo Caída (el bot deja de contestar y empieza a guardar en colaCaida)
    activarModoCaida();
    for (const [idUsr, timer] of temporizadoresDebounce.entries()) {
      if (!esNumeroVIP(idUsr)) {
        clearTimeout(timer);
        temporizadoresDebounce.delete(idUsr);
      }
    }

    const vigentes = await obtenerClientesConServicioVigente();

    if (vigentes.length === 0) {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text:
            `⏸️ *MODO CAÍDA ACTIVADO (Bot en pausa).* 🔴\n\n` +
            `ℹ️ No había clientes con servicio vigente para notificar, pero *el bot ya dejó de contestar* y guardará en cola todos los mensajes que entren a partir de ahora hasta que envíes \`restablecido\`.`,
        },
        {},
        true,
      );
      return true;
    }

    await enviarMensajeSeguro(
      sock,
      remoteJid,
      {
        text:
          `⏸️ *MODO CAÍDA ACTIVADO (Bot pausado).* 🔴\n` +
          `⏳ *Enviando comunicado de caída a ${vigentes.length} cliente(s) con servicio vigente...*`,
      },
      {},
      true,
    );

    let enviadosOk = 0;
    let fallidos = 0;

    for (const cliente of vigentes) {
      try {
        for (const idVinc of obtenerIdsVinculados(cliente.id)) {
          ultimoCierreCordialTs.set(idVinc, Date.now());
        }
        ultimoCierreCordialTs.set(cliente.id, Date.now());

        const env = await enviarMensajeSeguro(
          sock,
          cliente.jid,
          { text: textoComunicado },
          {},
          true,
        );
        if (env) {
          enviadosOk++;
          registrarLog(
            cliente.id,
            "DIFUSION_CAIDA",
            `Enviado aviso de caída a ${cliente.nombre} (${cliente.usuarioVpn})`,
          );
        } else {
          fallidos++;
        }
        await delay(1200);
      } catch (errDif) {
        fallidos++;
      }
    }

    await enviarMensajeSeguro(
      sock,
      remoteJid,
      {
        text:
          `✅ *¡DIFUSIÓN DE CAÍDA FINALIZADA Y BOT EN PAUSA!* 🔴\n\n` +
          `📨 *Clientes vigentes notificados:* ${enviadosOk} de ${vigentes.length}\n` +
          (fallidos > 0 ? `⚠️ *No enviados:* ${fallidos}\n` : "") +
          `🛑 *Estado del Bot:* En silencio total. Todos los mensajes de clientes que entren desde ahora se guardan en la cola de caída.\n\n` +
          `💡 _Cuando vuelva el servicio, enviá \`restablecido\` para avisarles y que el bot retome y conteste todos los chats acumulados._`,
      },
      {},
      true,
    );
    return true;
  }

  if (
    comando === "restablecido" ||
    comando.startsWith("restablecido ") ||
    comando === "avisoalta" ||
    comando.startsWith("avisoalta ")
  ) {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    const notaExtra = textoUnificado
      .replace(/^(restablecido|avisoalta)\s*/i, "")
      .trim();
    const textoComunicado = construirMensajeRestablecido(notaExtra);

    // 1. Desactivar el Modo Caída para que el bot vuelva a atender normalmente
    desactivarModoCaida();

    const vigentes = await obtenerClientesConServicioVigente();
    const totalEnColaCaida = Object.keys(memoriaDisco.colaCaida || {}).length;

    await enviarMensajeSeguro(
      sock,
      remoteJid,
      {
        text:
          `🟢 *MODO CAÍDA DESACTIVADO — RETOMANDO SERVICIO*\n\n` +
          `📨 *Notificando a clientes vigentes:* ${vigentes.length}\n` +
          `🔄 *Chats acumulados durante la caída por responder:* ${totalEnColaCaida}...`,
      },
      {},
      true,
    );

    let enviadosOk = 0;
    let fallidos = 0;
    const idsNotificadosRestablecido = new Set();

    // 2. Enviar aviso de Servicio Restablecido a todos los clientes con servicio vigente
    for (const cliente of vigentes) {
      try {
        for (const idVinc of obtenerIdsVinculados(cliente.id)) {
          ultimoCierreCordialTs.set(idVinc, Date.now());
          idsNotificadosRestablecido.add(idVinc);
        }
        ultimoCierreCordialTs.set(cliente.id, Date.now());
        idsNotificadosRestablecido.add(cliente.id);

        const env = await enviarMensajeSeguro(
          sock,
          cliente.jid,
          { text: textoComunicado },
          {},
          true,
        );
        if (env) {
          enviadosOk++;
          registrarLog(
            cliente.id,
            "DIFUSION_RESTABLECIDO",
            `Enviado aviso de servicio restablecido a ${cliente.nombre} (${cliente.usuarioVpn})`,
          );
        } else {
          fallidos++;
        }
        await delay(1200);
      } catch (errDif) {
        fallidos++;
      }
    }

    // 3. Retomar y contestar todos los chats que escribieron mientras estaba caído
    const { retomados, cubiertosPorAviso } = await procesarColaCaidaPendiente(
      s,
      idsNotificadosRestablecido,
    );

    await enviarMensajeSeguro(
      sock,
      remoteJid,
      {
        text:
          `✅ *¡SERVICIO RESTABLECIDO Y CHATS RETOMADOS!* 🟢🚀\n\n` +
          `📢 *Avisos enviados a clientes vigentes:* ${enviadosOk} de ${vigentes.length}` +
          (fallidos > 0 ? ` (${fallidos} fallidos)` : "") +
          `\n💬 *Chats pendientes respondidos por el bot:* ${retomados}` +
          (cubiertosPorAviso > 0
            ? `\n👍 *Consultas de conexión ya cubiertas por el aviso:* ${cubiertosPorAviso}`
            : "") +
          `\n\n🤖 _El bot ya se encuentra atendiendo normalmente en tiempo real._`,
      },
      {},
      true,
    );
    return true;
  }

  // ==========================================================================
  // 2. COMANDO "excel" o "reporte" (Envía el Excel mensual por WhatsApp)
  // ==========================================================================
  if (
    comando === "excel" ||
    comando.startsWith("excel ") ||
    comando === "reporte" ||
    comando === "planilla"
  ) {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    const partes = textoUnificado.trim().split(/\s+/);
    const mesSolicitado =
      partes[1] && /^\d{4}-\d{2}$/.test(partes[1]) ? partes[1] : null;

    try {
      const { rutaCompleta, nombreArchivo, resumen } =
        await generarExcelMensual(mesSolicitado);
      const caption =
        `📊 *REPORTE MENSUAL MNET VPN (${resumen.mesObjetivo})*\n\n` +
        `💰 *Ingresos del mes:* $${resumen.ingresosTotalesMes.toLocaleString("es-AR")}\n` +
        `🛒 *Planes vendidos en el mes:* ${resumen.ventasTotalesMes} (${resumen.renovacionesMes} renovaciones)\n` +
        `🟢 *Suscripciones activas hoy:* ${resumen.clientesActivosHoy}\n` +
        `🎁 *Pruebas del mes:* ${resumen.totalPruebasMes} (${resumen.pruebasConvertidas} compraron -> ${resumen.tasaConversion})`;

      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          document: { url: rutaCompleta },
          mimetype:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          fileName: nombreArchivo,
          caption,
        },
        {},
        true,
      );
    } catch (errExcel) {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        { text: `❌ No se pudo generar el Excel: ${errExcel.message}` },
        {},
        true,
      );
    }
    return true;
  }

  // ==========================================================================
  // 3. COMANDO "vencimientos" (Muestra quiénes están por vencer o vencidos)
  // ==========================================================================
  if (comando === "vencimientos") {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    const suscripciones = await dbUtils.obtenerEstadoSuscripcionesActuales();

    if (suscripciones.length === 0) {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text: `ℹ️ Todavía no hay ventas cargadas en la base de datos. Usá \`venta <cliente> <días> <usuario> <clave>\` para registrar la primera.`,
        },
        {},
        true,
      );
      return true;
    }

    const ahoraSeg = Math.floor(Date.now() / 1000);
    const lineas = suscripciones.slice(0, 20).map((sub, i) => {
      const segRest = (sub.ts_vencimiento || 0) - ahoraSeg;
      const diasRest = Math.ceil(segRest / 86400);
      let icono = "🟢";
      let estadoStr = `Quedan ${diasRest}d`;
      if (segRest <= 0) {
        icono = "🔴";
        estadoStr = `Venció hace ${Math.abs(diasRest)}d`;
      } else if (segRest <= 48 * 3600) {
        icono = "🟡";
        estadoStr = `Vence en ${Math.max(1, Math.ceil(segRest / 3600))} hs`;
      }
      const link = sub.telefono_real
        ? `https://wa.me/${sub.telefono_real}`
        : `ID: ${sub.numero}`;
      return `${i + 1}. ${icono} *${sub.nombre}* (\`${sub.usuario_vpn}\`) — *${estadoStr}*\n   📅 Vence: ${formatearFechaHora(sub.ts_vencimiento)} | ${link}`;
    });

    await enviarMensajeSeguro(
      sock,
      remoteJid,
      {
        text: `⏰ *Control de Vencimientos de Clientes (${suscripciones.length}):*\n\n${lineas.join("\n\n")}`,
      },
      {},
      true,
    );
    return true;
  }

  // ==========================================================================
  // 4. COMANDO "mandarprueba <numero|id|nombre> [personal|claro]"
  // ==========================================================================
  if (
    comando.startsWith("mandarprueba ") ||
    comando.startsWith("enviarprueba ") ||
    comando.startsWith("darprueba ")
  ) {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    let resto = textoUnificado
      .replace(/^(mandarprueba|enviarprueba|darprueba)\s+/i, "")
      .trim();

    let operadorElegido = null;
    if (/\bclaro$/i.test(resto)) {
      operadorElegido = "claro";
      resto = resto.replace(/\s*\bclaro$/i, "").trim();
    } else if (/\bpersonal$/i.test(resto)) {
      operadorElegido = "personal";
      resto = resto.replace(/\s*\bpersonal$/i, "").trim();
    }

    const idResuelto = resolverIdUsuario(resto);
    if (!idResuelto) {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text:
            `⚠️ *Formato inválido.*\nEjemplos de uso:\n` +
            `• \`mandarprueba 3442123456\`\n` +
            `• \`mandarprueba 3442123456 claro\`\n` +
            `• \`mandarprueba Chelo\``,
        },
        {},
        true,
      );
      return true;
    }

    try {
      let jidDestino = obtenerJidDeUsuario(idResuelto);
      let idDestino = idResuelto;
      let idLidVinculado = null;

      if (
        !memoriaDisco.mapaContactos[idResuelto] &&
        idResuelto.startsWith("54")
      ) {
        const [verificacion] = await s.onWhatsApp(
          `${idResuelto}@s.whatsapp.net`,
        );
        if (verificacion && !verificacion.exists) {
          await enviarMensajeSeguro(
            sock,
            remoteJid,
            {
              text: `❌ El número *+${idResuelto}* no tiene una cuenta activa de WhatsApp.`,
            },
            {},
            true,
          );
          return true;
        }
        if (verificacion?.jid) {
          jidDestino = verificacion.jid;
          idDestino = jidDestino.replace(/@.+$/, "").replace(/\D/g, "");
        }
        if (verificacion?.lid) {
          idLidVinculado = verificacion.lid
            .replace(/@.+$/, "")
            .replace(/\D/g, "");
          vincularIdentidades(
            idDestino,
            idLidVinculado,
            `${idLidVinculado}@lid`,
          );
        }
      }

      const opFinal =
        operadorElegido ||
        memoriaDisco.operadorDetectado[idDestino] ||
        "personal";
      memoriaDisco.operadorDetectado[idDestino] = opFinal;
      if (idLidVinculado)
        memoriaDisco.operadorDetectado[idLidVinculado] = opFinal;

      let uDest = await dbUtils.getUsuario(idDestino);
      if (!uDest) await dbUtils.crearUsuario(idDestino);

      abortarEnvioEnCurso.delete(idDestino);
      chatsBloqueados.delete(idDestino);
      intentosFallidos.delete(idDestino);
      audiosSeguidos.delete(idDestino);
      delete memoriaDisco.infoPaso99[idDestino];
      delete memoriaDisco.buzonPaso99[idDestino];
      delete memoriaDisco.ultimoTsIntervencionManual[idDestino];
      limpiarUsuarioDeColaCaida(idDestino);

      const nombreDest =
        memoriaDisco.mapaContactos[idDestino]?.nombre ||
        `Cliente +${idDestino}`;
      memoriaDisco.mapaContactos[idDestino] = {
        ...memoriaDisco.mapaContactos[idDestino],
        nombre: nombreDest,
        telefonoReal:
          memoriaDisco.mapaContactos[idDestino]?.telefonoReal ||
          (idDestino.startsWith("54") ? idDestino : null),
        jidOriginal: jidDestino,
      };
      guardarMemoriaDisco();

      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text:
            `⏳ *Enviando pack de prueba (${opFinal.toUpperCase()})* a *${nombreDest}* (\`${idDestino}\`)...\n` +
            `_(Se enviará Imagen + Link de Play Store + Video + Usuario y Contraseña separados y quedará activo en Paso 3)_`,
        },
        {},
        true,
      );

      await enviarMensajeSeguro(
        sock,
        jidDestino,
        {
          text: `🎁 *¡Hola! Tu prueba gratuita de 24 horas para ${
            opFinal === "claro" ? "Claro" : "Personal"
          } ya está lista.*\n\nA continuación te enviamos el enlace oficial de descarga en *Google Play Store* 🛡️, un breve video tutorial y tus credenciales de acceso: 👇`,
        },
        {},
        true,
      );

      const exito = await enviarPackVPN(
        sock,
        idDestino,
        jidDestino,
        opFinal,
        true,
      );
      if (exito) {
        if (idLidVinculado && idLidVinculado !== idDestino) {
          let uLid = await dbUtils.getUsuario(idLidVinculado);
          if (!uLid) await dbUtils.crearUsuario(idLidVinculado);
          await dbUtils.actualizarPaso(idLidVinculado, 3);
          await dbUtils.marcarPruebaEnviada(idLidVinculado);
          memoriaDisco.credencialesEnviadas[idLidVinculado] =
            memoriaDisco.credencialesEnviadas[idDestino];
          memoriaDisco.ultimoPasoValido[idLidVinculado] = 3;
          guardarMemoriaDisco();
        }

        console.log(
          `🚀 [MANDARPRUEBA VIP] Pack (${opFinal.toUpperCase()}) enviado con éxito a "${nombreDest}" (${idDestino})`,
        );
        await enviarMensajeSeguro(
          sock,
          remoteJid,
          {
            text:
              `✅ *¡Prueba (${opFinal.toUpperCase()}) enviada con éxito a ${nombreDest}!*\n` +
              `🤖 El cliente ya quedó desbloqueado y activo en el *Paso 3* (Post-Prueba).`,
          },
          {},
          true,
        );
      }
    } catch (errPrueba) {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text: `❌ Error al enviar prueba a ${idResuelto}: ${errPrueba.message}`,
        },
        {},
        true,
      );
    }
    return true;
  }

  // ==========================================================================
  // 5. COMANDO "vender <numero>"
  // ==========================================================================
  if (comando.startsWith("vender ") || comando.startsWith("iniciar ")) {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    const rawNum = textoUnificado.replace(/^(vender|iniciar)\s+/i, "").trim();
    const numNormalizado = normalizarNumeroArgentino(rawNum);

    if (!numNormalizado || numNormalizado.length < 10) {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text: `⚠️ *Formato inválido.*\nEscribí por ejemplo:\n\`vender 5493442123456\` o \`vender 3442123456\``,
        },
        {},
        true,
      );
      return true;
    }

    try {
      const [verificacion] = await s.onWhatsApp(
        `${numNormalizado}@s.whatsapp.net`,
      );
      const jidDestino = verificacion?.exists
        ? verificacion.jid
        : `${numNormalizado}@s.whatsapp.net`;
      const idDestino = jidDestino.replace(/@.+$/, "").replace(/\D/g, "");
      const idLid = verificacion?.lid
        ? verificacion.lid.replace(/@.+$/, "").replace(/\D/g, "")
        : null;

      if (verificacion && !verificacion.exists) {
        await enviarMensajeSeguro(
          sock,
          remoteJid,
          {
            text: `❌ El número *+${numNormalizado}* no tiene una cuenta activa de WhatsApp.`,
          },
          {},
          true,
        );
        return true;
      }

      let uDest = await dbUtils.getUsuario(idDestino);
      if (!uDest) await dbUtils.crearUsuario(idDestino);
      await dbUtils.actualizarPaso(idDestino, 1);
      memoriaDisco.ultimoPasoValido[idDestino] = 1;
      memoriaDisco.ventasProactivas[idDestino] = Math.floor(Date.now() / 1000);
      memoriaDisco.ventasProactivas[numNormalizado] = Math.floor(
        Date.now() / 1000,
      );

      abortarEnvioEnCurso.delete(idDestino);
      chatsBloqueados.delete(idDestino);
      intentosFallidos.delete(idDestino);
      audiosSeguidos.delete(idDestino);
      delete memoriaDisco.infoPaso99[idDestino];
      delete memoriaDisco.buzonPaso99[idDestino];
      delete memoriaDisco.ultimoTsIntervencionManual[idDestino];
      limpiarUsuarioDeColaCaida(idDestino);

      memoriaDisco.mapaContactos[idDestino] = {
        nombre:
          memoriaDisco.mapaContactos[idDestino]?.nombre ||
          `Cliente +${idDestino}`,
        telefonoReal: idDestino,
        jidOriginal: jidDestino,
        ...(idLid ? { lidVinculado: idLid } : {}),
      };

      if (idLid && idLid !== idDestino) {
        vincularIdentidades(idDestino, idLid, `${idLid}@lid`);
        let uLid = await dbUtils.getUsuario(idLid);
        if (!uLid) await dbUtils.crearUsuario(idLid);
        await dbUtils.actualizarPaso(idLid, 1);
        memoriaDisco.ultimoPasoValido[idLid] = 1;
        memoriaDisco.ventasProactivas[idLid] = Math.floor(Date.now() / 1000);
        abortarEnvioEnCurso.delete(idLid);
        chatsBloqueados.delete(idLid);
        intentosFallidos.delete(idLid);
        delete memoriaDisco.infoPaso99[idLid];
        delete memoriaDisco.buzonPaso99[idLid];
        delete memoriaDisco.ultimoTsIntervencionManual[idLid];
      }

      guardarMemoriaDisco();

      const msgMenuInicial = obtenerAleatorio(VARIACIONES_INICIAL);
      const enviado = await enviarMensajeConFotoApp(
        sock,
        jidDestino,
        msgMenuInicial,
        true,
      );
      ultimoMenuEnviadoTs.set(idDestino, Date.now());

      const idRemotoReal = enviado?.key?.remoteJid
        ? enviado.key.remoteJid.replace(/@.+$/, "").replace(/\D/g, "")
        : null;
      if (idRemotoReal && idRemotoReal !== idDestino) {
        vincularIdentidades(idDestino, idRemotoReal, enviado.key.remoteJid);
        let uRem = await dbUtils.getUsuario(idRemotoReal);
        if (!uRem) await dbUtils.crearUsuario(idRemotoReal);
        await dbUtils.actualizarPaso(idRemotoReal, 1);
        memoriaDisco.ultimoPasoValido[idRemotoReal] = 1;
        ultimoMenuEnviadoTs.set(idRemotoReal, Date.now());
        registrarEnHistorialChat(idRemotoReal, "BOT", msgMenuInicial);
        guardarMemoriaDisco();
      }

      registrarLog(
        idDestino,
        "VENTA_PROACTIVA_INICIADA",
        `Iniciada por comando VIP`,
      );
      console.log(`🚀 [VENTA PROACTIVA] Menú enviado a +${idDestino} (Paso 1)`);

      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text:
            `🚀 *¡Venta iniciada con éxito!*\n\n` +
            `📱 *Cliente:* +${idDestino}\n` +
            `💬 *Ir al chat:* https://wa.me/${idDestino}\n` +
            `🤖 *Estado:* Se le envió el menú de bienvenida (con la imagen de la app) y el bot quedó activo en *Paso 1* esperando su respuesta.`,
        },
        {},
        true,
      );
    } catch (errVender) {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text: `❌ Error al iniciar venta con +${numNormalizado}: ${errVender.message}`,
        },
        {},
        true,
      );
    }
    return true;
  }

  // ==========================================================================
  // 6. COMANDO "pendientes"
  // ==========================================================================
  if (comando === "pendientes") {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    const entradas = Object.entries(memoriaDisco.infoPaso99 || {}).filter(
      ([id]) => !esNumeroVIP(id),
    );
    if (entradas.length === 0) {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        { text: `✅ *No hay clientes pendientes en Paso 99.*` },
        {},
        true,
      );
    } else {
      const ultimos = entradas
        .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0))
        .slice(0, 12);
      const lineas = ultimos.map(([id, datos], idx) => {
        const c = memoriaDisco.mapaContactos[id] || {
          nombre: "Cliente",
          telefonoReal: null,
        };
        const numLink = c.telefonoReal || (id.length <= 13 ? id : null);
        const haceMin = Math.max(
          1,
          Math.round((Date.now() / 1000 - (datos.ts || 0)) / 60),
        );
        const tiempoTxt =
          haceMin >= 60 ? `${Math.round(haceMin / 60)}h` : `${haceMin}m`;
        const msgsBuzon = (memoriaDisco.buzonPaso99[id] || [])
          .map((x) => x.texto)
          .join(" | ");
        const lineaBuzon = msgsBuzon
          ? `\n   💬 *Sin responder:* "${msgsBuzon}"`
          : "";
        return `${idx + 1}. *${c.nombre}* (hace ${tiempoTxt} - estaba en Paso ${
          datos.pasoPrevio || 1
        })\n   📝 ${datos.motivo}${lineaBuzon}\n   📲 ${
          numLink ? `https://wa.me/${numLink}` : `ID: \`${id}\``
        }`;
      });
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text: `📋 *Clientes en Paso 99 (${entradas.length}):*\n\n${lineas.join(
            "\n\n",
          )}\n\n💡 _Comandos: \`venta NOMBRE DÍAS USER PASS\` | \`desbloquear NOMBRE\` | \`mandarprueba NOMBRE\`_`,
        },
        {},
        true,
      );
    }
    return true;
  }

  // ==========================================================================
  // 7. COMANDO "reset"
  // ==========================================================================
  if (comando === "reset") {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    limpiarEstadoEnMemoriaPorId(numeroLimpio);
    await dbUtils.marcarPruebaNoEnviada(numeroLimpio);
    await dbUtils.actualizarPaso(numeroLimpio, 0);
    guardarMemoriaDisco();
    console.log(
      `🔄 [COMANDO VIP] Memoria reseteada a Paso 0 para ${numeroLimpio}`,
    );
    await enviarMensajeSeguro(
      sock,
      remoteJid,
      {
        text: `✅ *Memoria reseteada.* Volvés a estar en el Paso 0 como cliente nuevo.`,
      },
      {},
      true,
    );
    return true;
  }

  // ==========================================================================
  // 8. COMANDO "stats"
  // ==========================================================================
  if (comando === "stats") {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    const total = await dbUtils.contarUsuariosTotales();
    const conPrueba = await dbUtils.contarUsuariosConPrueba();
    const clientesPagos = await dbUtils.contarUsuariosClientes();
    const enPaso99 = Object.keys(memoriaDisco.infoPaso99 || {}).filter(
      (id) => !esNumeroVIP(id),
    ).length;
    const seguimientos = Object.keys(
      memoriaDisco.seguimientoPruebaEnviado || {},
    ).filter((k) => !k.startsWith("user_")).length;
    const enColaCaida = Object.keys(memoriaDisco.colaCaida || {}).length;
    const lineaCaida = memoriaDisco.modoCaidaActivo
      ? `🔴 Modo Caída: ACTIVO (${enColaCaida} chat(s) en cola esperando \`restablecido\`)\n`
      : `🟢 Modo Caída: Inactivo (Bot atendiendo normal)\n`;

    await enviarMensajeSeguro(
      sock,
      remoteJid,
      {
        text:
          `📊 *Estadísticas MNet:*\n` +
          `📱 Total usuarios: ${total}\n` +
          `✅ Pruebas enviadas: ${conPrueba}\n` +
          `💳 Clientes activos/pagos: ${clientesPagos}\n` +
          `🔔 Seguimientos post-prueba enviados: ${seguimientos}\n` +
          `👨‍💻 En atención humana (Paso 99): ${enPaso99}\n` +
          lineaCaida +
          `\n💡 _Mandá \`help\` para ver todos los comandos o \`excel\` para descargar el reporte._`,
      },
      {},
      true,
    );
    return true;
  }

  // ==========================================================================
  // 9. COMANDO "bloquear <numero|id|nombre>"
  // ==========================================================================
  if (comando.startsWith("bloquear ")) {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    const rawTarget = textoUnificado.replace(/^bloquear\s+/i, "").trim();
    const resuelto = await resolverIdentidadesClienteVIP(s, rawTarget);
    if (resuelto && resuelto.idPrincipal) {
      for (const idV of resuelto.todosLosIds) {
        let u = await dbUtils.getUsuario(idV);
        if (!u) await dbUtils.crearUsuario(idV);
        await silenciarBotParaCliente(
          idV,
          "Bloqueado manualmente por comando VIP",
          u?.paso_flujo !== 99 ? u?.paso_flujo : null,
        );
      }
      const nombreObj =
        memoriaDisco.mapaContactos[resuelto.idPrincipal]?.nombre ||
        resuelto.idPrincipal;
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text: `🔒 Usuario *${nombreObj}* (\`${resuelto.todosLosIds.join(" / ")}\`) pasado al Paso 99 (Bot silenciado).`,
        },
        {},
        true,
      );
    }
    return true;
  }

  // ==========================================================================
  // 10. COMANDO "desbloquear <numero|id|nombre>"
  // ==========================================================================
  if (comando.startsWith("desbloquear ")) {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    const rawTarget = textoUnificado.replace(/^desbloquear\s+/i, "").trim();
    const resuelto = await resolverIdentidadesClienteVIP(s, rawTarget);

    if (!resuelto || !resuelto.idPrincipal) {
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text: `⚠️ No encontré ningún usuario con *"${rawTarget}"*. Probá con su número, nombre o su ID.`,
        },
        {},
        true,
      );
      return true;
    }

    const idObjetivo = resuelto.idPrincipal;
    let uObj = await dbUtils.getUsuario(idObjetivo);
    if (!uObj) {
      await dbUtils.crearUsuario(idObjetivo);
      uObj = await dbUtils.getUsuario(idObjetivo);
    }

    const textosBuzon = [];
    for (const idV of resuelto.todosLosIds) {
      const tsUltManual = memoriaDisco.ultimoTsIntervencionManual[idV] || 0;
      const guardados = Array.isArray(memoriaDisco.buzonPaso99[idV])
        ? memoriaDisco.buzonPaso99[idV].filter(
            (m) => (m.ts || 0) >= tsUltManual,
          )
        : [];
      for (const m of guardados) {
        if (m.texto && !textosBuzon.includes(m.texto)) {
          textosBuzon.push(m.texto);
        }
      }
    }
    const textoAcumulado = textosBuzon.join(" ").trim();

    const estadoInterpretado = await interpretarPasoDondeQuedo(
      idObjetivo,
      uObj,
    );
    const pasoRestaurado = estadoInterpretado.paso;
    const yaUsoPruebaObj = estadoInterpretado.yaTuvoPrueba;

    for (const idV of resuelto.todosLosIds) {
      await dbUtils.crearUsuario(idV);
      abortarEnvioEnCurso.delete(idV);
      await dbUtils.actualizarPaso(idV, pasoRestaurado);
      memoriaDisco.ultimoPasoValido[idV] = pasoRestaurado;
      chatsBloqueados.delete(idV);
      intentosFallidos.delete(idV);
      audiosSeguidos.delete(idV);
      delete memoriaDisco.ultimoTsIntervencionManual[idV];
      delete memoriaDisco.infoPaso99[idV];
      delete memoriaDisco.buzonPaso99[idV];
      limpiarUsuarioDeColaCaida(idV);
    }
    guardarMemoriaDisco();

    const nombreObj =
      memoriaDisco.mapaContactos[idObjetivo]?.nombre || "Cliente";
    const jidObjetivo = resuelto.jidPrincipal;

    let intencionBuzon = "DESCONOCIDO";
    if (textoAcumulado) {
      intencionBuzon = await descubrirIntencionConIA(
        idObjetivo,
        textoAcumulado,
        pasoRestaurado,
        yaUsoPruebaObj,
        "",
      );
    }

    const intencionesAccionables = [
      "PRUEBA_PERSONAL",
      "PRUEBA_CLARO",
      "FALTA_OPERADOR",
      "COMPRAR",
      "NO_COMPATIBLE",
      "TIENE_ABONO",
      "INFO_DURACION_PRUEBA",
      "INFO_COMPARTIR_TV",
      "SOPORTE_INSTALACION_APK",
      "INFO_COMO_FUNCIONA",
      "INFO_COMO_INSTALAR",
      "EXITO",
    ];

    if (textoAcumulado && intencionesAccionables.includes(intencionBuzon)) {
      console.log(
        `🔓 [DESBLOQUEO VIP] "${nombreObj}" (${idObjetivo}) -> Respondiendo a su mensaje en buzón: "${textoAcumulado}" (${intencionBuzon})`,
      );
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text:
            `✅ *${nombreObj}* (\`${resuelto.todosLosIds.join(" / ")}\`) desbloqueado.\n` +
            `🧭 *Contexto:* ${nombreDescriptivoPaso(pasoRestaurado)}\n` +
            `🔄 *Respondiendo a lo que había enviado:* "${textoAcumulado}"...`,
        },
        {},
        true,
      );

      await procesarMensajeInteligente(
        s,
        idObjetivo,
        jidObjetivo,
        textoAcumulado,
        "",
        pasoRestaurado,
        yaUsoPruebaObj,
        null,
      );
    } else {
      console.log(
        `🔓 [DESBLOQUEO VIP] "${nombreObj}" (${idObjetivo}) -> Retomando activamente en ${nombreDescriptivoPaso(pasoRestaurado)}`,
      );
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text:
            `✅ *${nombreObj}* (\`${resuelto.todosLosIds.join(" / ")}\`) desbloqueado.\n` +
            `🧭 *Ubicado en:* ${nombreDescriptivoPaso(pasoRestaurado)}\n` +
            `💬 *Acción:* El bot ya le envió un mensaje en el chat para retomar la conversación y seguir atendiéndolo.`,
        },
        {},
        true,
      );

      await retomarConversacionAlDesbloquear(
        s,
        idObjetivo,
        jidObjetivo,
        pasoRestaurado,
      );
    }
    return true;
  }

  // ==========================================================================
  // 11. COMANDO "reiniciar <numero|id|nombre>"
  // ==========================================================================
  if (comando.startsWith("reiniciar ")) {
    idsParaConfirmar.forEach((id) => marcarMensajeProcesado(id));
    const rawTarget = textoUnificado.replace(/^reiniciar\s+/i, "").trim();
    const resuelto = await resolverIdentidadesClienteVIP(s, rawTarget);
    if (resuelto && resuelto.todosLosIds.length > 0) {
      for (const idV of resuelto.todosLosIds) {
        limpiarEstadoEnMemoriaPorId(idV);
        await dbUtils.crearUsuario(idV);
        await dbUtils.marcarPruebaNoEnviada(idV);
        await dbUtils.actualizarPaso(idV, 0);
      }
      guardarMemoriaDisco();
      const etiquetaIds = resuelto.todosLosIds.join(" / ");
      console.log(
        `🔄 [REINICIO VIP] Usuario (${etiquetaIds}) reseteado a Paso 0.`,
      );
      await enviarMensajeSeguro(
        sock,
        remoteJid,
        {
          text: `🔄 Usuario \`${etiquetaIds}\` reiniciado completamente a *Paso 0* (con derecho a nueva prueba gratis).`,
        },
        {},
        true,
      );
    }
    return true;
  }

  return false;
}

module.exports = {
  ejecutarComandoVIP,
  parsearArgumentosVenta,
  resolverIdentidadesClienteVIP,
  obtenerClientesConServicioVigente,
  procesarColaCaidaPendiente,
  TEXTO_AYUDA_VIP,
};
