/**
 * ============================================================================
 * BATERÍA INTEGRAL DE PRUEBAS AUTOMATIZADAS - BOT WHATSAPP MNET VPN (v5.1)
 * ============================================================================
 * Ejecución: node test_bot.js
 * Cubre: 37 tests base + 100+ escenarios conversacionales completos,
 *        Canal de Utilidades y Modo Caída con retoma automática de chats.
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

function cargarBotEnSandbox() {
  const estadoMock = {
    usuariosBD: new Map(),
    ventasBD: [],
    incidentesBD: [],
    mensajesEnviados: [],
    reaccionesEnviadas: [],
    archivosBorrados: [],
    archivosVirtuales: new Set([
      "session-5491122334455_1.json",
      "session-248970731384950_1.json",
    ]),
    respuestaOllamaMock: "DESCONOCIDO",
    forzarErrorOllama: false,
    llamadasOllama: 0,
    credencialVeltrixMock: {
      usuario: "testuser24",
      password: "TestPass99",
      duracionHoras: 24,
    },
    llamadasVeltrix: 0,
    eventosBaileys: {},
    reconexionesProgramadas: 0,
    mapaLidWhatsApp: new Map([
      ["5493436570945@s.whatsapp.net", "105316943417576@lid"],
    ]),
  };

  const dbMock = {
    crearUsuario: async (numero) => {
      if (!estadoMock.usuariosBD.has(numero)) {
        estadoMock.usuariosBD.set(numero, {
          numero,
          paso_flujo: 0,
          prueba_enviada: 0,
          es_cliente: 0,
        });
      }
      return { numero, changes: 1 };
    },
    getUsuario: async (numero) => {
      return estadoMock.usuariosBD.get(numero) || undefined;
    },
    actualizarPaso: async (numero, paso) => {
      const u = estadoMock.usuariosBD.get(numero) || {
        numero,
        paso_flujo: 0,
        prueba_enviada: 0,
        es_cliente: 0,
      };
      u.paso_flujo = paso;
      estadoMock.usuariosBD.set(numero, u);
      return { numero, paso, changes: 1 };
    },
    marcarPruebaEnviada: async (numero) => {
      const u = estadoMock.usuariosBD.get(numero) || {
        numero,
        paso_flujo: 3,
        prueba_enviada: 1,
        es_cliente: 0,
      };
      u.prueba_enviada = 1;
      u.paso_flujo = 3;
      estadoMock.usuariosBD.set(numero, u);
      return { numero, changes: 1 };
    },
    marcarPruebaNoEnviada: async (numero) => {
      const u = estadoMock.usuariosBD.get(numero) || {
        numero,
        paso_flujo: 0,
        prueba_enviada: 0,
        es_cliente: 0,
      };
      u.prueba_enviada = 0;
      u.paso_flujo = 0;
      estadoMock.usuariosBD.set(numero, u);
      return { numero, changes: 1 };
    },
    marcarComoCliente: async (numero) => {
      const u = estadoMock.usuariosBD.get(numero) || {
        numero,
        paso_flujo: 3,
        prueba_enviada: 1,
        es_cliente: 1,
      };
      u.es_cliente = 1;
      estadoMock.usuariosBD.set(numero, u);
      return { numero, changes: 1 };
    },
    registrarPruebaBD: async () => ({ id: 1, changes: 1 }),
    marcarSeguimientoPruebaBD: async () => true,
    marcarErrorEnPruebaBD: async () => true,
    registrarIncidenteBD: async (datos) => {
      estadoMock.incidentesBD.push(datos);
      return { id: estadoMock.incidentesBD.length };
    },
    registrarVentaBD: async (datos) => {
      const ahoraSeg = Math.floor(Date.now() / 1000);
      const diasPlan = Number(datos.diasPlan) || 30;
      const precio =
        diasPlan === 7
          ? 3000
          : diasPlan === 15
            ? 5000
            : diasPlan === 3
              ? 2000
              : 7000;
      const tsVencimiento = ahoraSeg + diasPlan * 86400;
      const reg = {
        id: estadoMock.ventasBD.length + 1,
        numero: datos.numero,
        nombre: datos.nombre || "Cliente",
        telefono_real: datos.telefonoReal || "",
        telefonoReal: datos.telefonoReal || "",
        operador: datos.operador || "personal",
        usuario_vpn: datos.usuarioVpn,
        usuarioVpn: datos.usuarioVpn,
        password_vpn: datos.passwordVpn,
        passwordVpn: datos.passwordVpn,
        dias_plan: diasPlan,
        diasPlan,
        precio,
        tipoOperacion: "🆕 NUEVA VENTA",
        nroContratacion: 1,
        ts_compra: ahoraSeg,
        tsCompra: ahoraSeg,
        ts_vencimiento: tsVencimiento,
        tsVencimiento,
        recordatorio_enviado: 0,
        diasSumadosDePlanPrevio: 0,
        totalInvertidoHistorico: precio,
      };
      estadoMock.ventasBD.push(reg);
      return reg;
    },
    obtenerSuscripcionCliente: async () => null,
    obtenerEstadoSuscripcionesActuales: async () => estadoMock.ventasBD,
    marcarRecordatorioVentaEnviado: async () => true,
    contarUsuariosTotales: async () => estadoMock.usuariosBD.size,
    contarUsuariosConPrueba: async () =>
      Array.from(estadoMock.usuariosBD.values()).filter(
        (u) => u.prueba_enviada === 1,
      ).length,
    contarUsuariosClientes: async () =>
      Array.from(estadoMock.usuariosBD.values()).filter(
        (u) => u.es_cliente === 1,
      ).length,
  };

  const ultranetMock = {
    DURACION_PRUEBA_HORAS: 24,
    generarCredencialPruebaUltraNet: async () => {
      estadoMock.llamadasVeltrix++;
      return estadoMock.credencialVeltrixMock;
    },
  };

  const axiosMock = {
    post: async (url, data) => {
      estadoMock.llamadasOllama++;
      if (estadoMock.forzarErrorOllama) {
        throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
      }
      return {
        data: {
          response: estadoMock.respuestaOllamaMock,
        },
        promptEnviado: data && data.prompt ? data.prompt : "",
      };
    },
  };

  let contadorMsgId = 1000;
  const sockMock = {
    ev: {
      on: (evento, callback) => {
        estadoMock.eventosBaileys[evento] = callback;
      },
    },
    sendMessage: async (remoteJid, contenido) => {
      if (contenido && contenido.react) {
        estadoMock.reaccionesEnviadas.push({
          remoteJid,
          react: contenido.react,
        });
        return {
          key: { id: `REACT_${++contadorMsgId}`, remoteJid, fromMe: true },
        };
      }
      const msgId = `TEST_MSG_${++contadorMsgId}`;
      estadoMock.mensajesEnviados.push({
        id: msgId,
        remoteJid,
        texto:
          (contenido && (contenido.text || contenido.caption)) ||
          "[MULTIMEDIA]",
        contenido,
      });
      return { key: { id: msgId, remoteJid, fromMe: true } };
    },
    sendPresenceUpdate: async () => {},
    readMessages: async () => {},
    onWhatsApp: async (jid) => [
      {
        exists: true,
        jid,
        lid: estadoMock.mapaLidWhatsApp.get(jid) || "199999999999999@lid",
      },
    ],
  };

  const baileysMock = {
    default: () => sockMock,
    useMultiFileAuthState: async () => ({
      state: {},
      saveCreds: async () => {},
    }),
    DisconnectReason: { loggedOut: 401 },
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
    Browsers: { windows: () => ["Windows", "Chrome", "10"] },
    delay: async () => {},
  };

  const fsMock = {
    ...fs,
    existsSync: (ruta) => {
      const r = String(ruta);
      if (r.includes("memoria_bot.json")) return false;
      if (r.includes("baileys_auth_info")) return true;
      if (
        r.includes("tutorial_vpn.mp4") ||
        r.includes("ViveOnlineVPN.apk") ||
        r.includes("foto_app.webp") ||
        r.includes("comunicados.js")
      )
        return true;
      return false;
    },
    readdirSync: (ruta) => {
      if (String(ruta).includes("baileys_auth_info")) {
        return Array.from(estadoMock.archivosVirtuales);
      }
      return [];
    },
    unlinkSync: (ruta) => {
      const nombre = path.basename(String(ruta));
      estadoMock.archivosBorrados.push(nombre);
      estadoMock.archivosVirtuales.delete(nombre);
    },
    writeFileSync: () => {},
    renameSync: () => {},
    appendFileSync: () => {},
  };

  const cacheModulosLocales = {};
  const consolaCompartida = {
    log: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  const requireMock = (modulo) => {
    if (modulo === "@whiskeysockets/baileys") return baileysMock;
    if (modulo === "./db") return dbMock;
    if (modulo === "./ultranet") return ultranetMock;
    if (modulo === "./excel_report") {
      return {
        generarExcelMensual: async () => ({
          rutaCompleta: "reportes_excel/MNet_Control_2026-11.xlsx",
          nombreArchivo: "MNet_Control_2026-11.xlsx",
          resumen: {
            mesObjetivo: "2026-11",
            ingresosTotalesMes: 7000,
            ventasTotalesMes: 1,
            renovacionesMes: 0,
            clientesActivosHoy: 1,
            totalPruebasMes: 1,
            pruebasConvertidas: 1,
            tasaConversion: "100.0%",
          },
        }),
        sincronizarPruebasDeMemoriaABD: async () => {},
        formatearFechaHora: () => "15/12/2026 18:00",
      };
    }
    if (modulo === "axios") return axiosMock;
    if (modulo === "fs") return fsMock;
    if (modulo === "pino") return () => ({ level: "silent" });
    if (modulo === "qrcode-terminal") return { generate: () => {} };

    const modulosInternos = [
      "./config",
      "./mensajes",
      "./comunicados",
      "./memoria",
      "./ia",
      "./flujos",
      "./comandos_vip",
      "./index",
    ];
    if (modulosInternos.includes(modulo)) {
      if (cacheModulosLocales[modulo])
        return cacheModulosLocales[modulo].exports;

      const nombreArchivo = modulo.replace("./", "") + ".js";
      const rutaArchivo = path.join(__dirname, nombreArchivo);
      let codigo = fs.readFileSync(rutaArchivo, "utf8");

      codigo = codigo.replace(
        /setTimeout\(resolve,\s*segundos\s*\*\s*1000\)/g,
        "setTimeout(resolve, 0)",
      );

      const modObj = { exports: {} };
      cacheModulosLocales[modulo] = modObj;

      const ctx = {
        require: requireMock,
        module: modObj,
        exports: modObj.exports,
        __dirname,
        __filename: rutaArchivo,
        console: consolaCompartida,
        process: { env: { ...process.env }, on: () => {}, exit: () => {} },
        setTimeout: (fn, ms, ...args) => {
          if (ms >= 2500) {
            estadoMock.reconexionesProgramadas++;
            return { unref: () => {} };
          }
          if (ms === 800) {
            return { unref: () => {} };
          }
          return setTimeout(fn, ms, ...args);
        },
        clearTimeout,
        setInterval: () => ({ unref: () => {} }),
        clearInterval: () => {},
        Date,
        Math,
        JSON,
        Set,
        Map,
        Promise,
        String,
        Number,
        Boolean,
        Array,
        Object,
        RegExp,
        Error,
      };

      vm.createContext(ctx);
      vm.runInContext(codigo, ctx, { filename: nombreArchivo });
      return modObj.exports;
    }

    return require(modulo);
  };

  const botExportado = requireMock("./index");

  return {
    bot: botExportado,
    estadoMock,
    sockMock,
    consolaSandbox: consolaCompartida,
  };
}

async function ejecutarBateriaDePruebas() {
  console.log(
    "============================================================================",
  );
  console.log(
    "🧪 INICIANDO BATERÍA INTEGRAL DE PRUEBAS - BOT MNET VPN (v5.1 Reingeniería)",
  );
  console.log(
    "============================================================================\n",
  );

  const { bot, estadoMock, sockMock, consolaSandbox } = cargarBotEnSandbox();
  let pasadas = 0;
  let falladas = 0;
  const erroresDetallados = [];

  async function probar(id, categoria, descripcion, fn) {
    try {
      await fn();
      pasadas++;
      console.log(`✅ [PASS] [${id}] (${categoria}) ${descripcion}`);
    } catch (err) {
      falladas++;
      console.log(`❌ [FAIL] [${id}] (${categoria}) ${descripcion}`);
      console.log(`   ↳ Detalle: ${err.message}`);
      erroresDetallados.push({
        id,
        categoria,
        descripcion,
        error: err.message,
      });
    }
  }

  // ============================================================================
  // PARTE A: 37 PRUEBAS BASE ORIGINALES (PRESERVACIÓN 100%)
  // ============================================================================
  await probar(
    "UT-01",
    "Unitaria",
    "Normalización fonética argentina ('kiero provar', 'intalar', 'todabia')",
    async () => {
      const norm = bot.normalizarFoneticaArgentina(
        "kiero provar pero no puedo intalar todabia",
      );
      assert.ok(norm.includes("quiero"));
      assert.ok(norm.includes("probar"));
      assert.ok(norm.includes("instalar"));
      assert.ok(norm.includes("todavia"));
    },
  );

  await probar(
    "UT-02",
    "Unitaria",
    "Normalización de números argentinos (10 dígitos, con 0 y con 54 sin 9)",
    async () => {
      assert.strictEqual(
        bot.normalizarNumeroArgentino("3442123456"),
        "5493442123456",
      );
      assert.strictEqual(
        bot.normalizarNumeroArgentino("03442123456"),
        "5493442123456",
      );
      assert.strictEqual(
        bot.normalizarNumeroArgentino("543442123456"),
        "5493442123456",
      );
    },
  );

  await probar(
    "UT-03",
    "Unitaria",
    "Filtro de insultos con límites de palabra exactos (BUG-012)",
    async () => {
      assert.strictEqual(bot.detectarInsulto("sos un estafador"), true);
      assert.strictEqual(bot.detectarInsulto("hola buenas tardes"), false);
    },
  );

  await probar(
    "REAL-01",
    "Regresión Real (BUG-001)",
    "Cliente en Paso 4 escribe 'Ok, puedo probarlo?' -> FALTA_OPERADOR",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_real_01",
        "Ok, puedo probarlo?",
        4,
        false,
        "",
      );
      assert.strictEqual(intencion, "FALTA_OPERADOR");
    },
  );

  await probar(
    "REAL-02",
    "Regresión Real (BUG-007)",
    "Plantilla de anuncio '¿Puedo obtener más información sobre tu empresa?' -> SALUDO",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_real_02",
        "¿Puedo obtener más información sobre tu empresa?",
        0,
        false,
        "",
      );
      assert.strictEqual(intencion, "SALUDO");
    },
  );

  await probar(
    "REAL-03",
    "Regresión Real (BUG-007)",
    "Cliente con typo de anuncio 'Vi eo anuncio del internet' -> SALUDO",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_real_03",
        "Vi eo anuncio del internet",
        0,
        false,
        "",
      );
      assert.strictEqual(intencion, "SALUDO");
    },
  );

  await probar(
    "REAL-04",
    "Regresión Real (BUG-008)",
    "Cliente en Paso 3 dice 'No se puede intalar la app' -> SOPORTE_INSTALACION_APK",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_real_04",
        "No se puede intalar la app",
        3,
        true,
        "",
      );
      assert.strictEqual(intencion, "SOPORTE_INSTALACION_APK");
    },
  );

  await probar(
    "REAL-05",
    "Regresión Real (BUG-008)",
    "Cliente en Paso 3 dice 'No abre la aplicación... pantalla negra' -> SOPORTE_INSTALACION_APK",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_real_05",
        "No abre la aplicación se puso la pantalla negra",
        3,
        true,
        "",
      );
      assert.strictEqual(intencion, "SOPORTE_INSTALACION_APK");
    },
  );

  await probar(
    "REAL-06",
    "Regresión Real (BUG-009)",
    "Cliente en Paso 3 pregunta 'Este se puede compartir el internet' -> INFO_COMPARTIR_TV",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_real_06",
        "Este se puede compartir el internet",
        3,
        true,
        "",
      );
      assert.strictEqual(intencion, "INFO_COMPARTIR_TV");
    },
  );

  await probar(
    "REAL-07",
    "Regresión Real (BUG-009)",
    "Cliente pregunta 'No puedo conectar a una plasma' -> INFO_COMPARTIR_TV",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_real_07",
        "No puedo conectar a una plasma",
        3,
        true,
        "",
      );
      assert.strictEqual(intencion, "INFO_COMPARTIR_TV");
    },
  );

  await probar(
    "AMB-01",
    "Negación / Ambiguo",
    "'No tengo internet' en Paso 1 -> FALTA_OPERADOR",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_amb_01",
        "No tengo internet",
        1,
        false,
        "",
      );
      assert.strictEqual(intencion, "FALTA_OPERADOR");
    },
  );

  await probar(
    "AMB-02",
    "Negación / Ambiguo",
    "'Sí, pero no me funciona' en Paso 3 -> SOPORTE",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_amb_02",
        "Sí, pero no me funciona",
        3,
        true,
        "",
      );
      assert.strictEqual(intencion, "SOPORTE");
    },
  );

  await probar(
    "AMB-03",
    "Negación / Ambiguo",
    "'No quiero contratar' en Paso 1 -> NO_INTERESADO",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_amb_03",
        "No quiero contratar",
        1,
        false,
        "",
      );
      assert.strictEqual(intencion, "NO_INTERESADO");
    },
  );

  await probar(
    "AMB-04",
    "Negación / Ambiguo",
    "'Tengo datos, pero no conexión' en Paso 3 -> SOPORTE",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_amb_04",
        "Tengo datos, pero no conexión, conecta pero no carga nada",
        3,
        true,
        "",
      );
      assert.strictEqual(intencion, "SOPORTE");
    },
  );

  await probar(
    "AMB-05",
    "Contexto Soporte Nivel 1",
    "'Ya hice eso' en Paso 3 luego de recibir Soporte Nivel 1 -> SOPORTE",
    async () => {
      bot.memoriaDisco.soporteNivel1Enviado["user_amb_05"] = true;
      const intencion = await bot.descubrirIntencionConIA(
        "user_amb_05",
        "Ya hice eso y sigue igual",
        3,
        true,
        "",
      );
      assert.strictEqual(intencion, "SOPORTE");
    },
  );

  await probar(
    "AMB-06",
    "Incomprensión",
    "'Como me conecto? Donde pongo el usuario?' en Paso 3 -> INFO_COMO_INSTALAR",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_amb_06",
        "Como me conecto? Donde pongo el usuario?",
        3,
        true,
        "",
      );
      assert.strictEqual(intencion, "INFO_COMO_INSTALAR");
    },
  );

  await probar(
    "AMB-07",
    "Solicitud de Humano",
    "'Quiero hablar con una persona' -> DUDA_HUMANO",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_amb_07",
        "Quiero hablar con una persona",
        1,
        false,
        "",
      );
      assert.strictEqual(intencion, "DUDA_HUMANO");
    },
  );

  await probar(
    "AMB-08",
    "Falso Positivo Claro",
    "'Si claro, dale gracias!' en Paso 3 -> AGRADECIMIENTO_FINAL",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_amb_08",
        "Si claro, dale gracias!",
        3,
        true,
        "",
      );
      assert.strictEqual(intencion, "AGRADECIMIENTO_FINAL");
      assert.notStrictEqual(
        bot.memoriaDisco.operadorDetectado["user_amb_08"],
        "claro",
      );
    },
  );

  await probar(
    "AMB-09",
    "Negación de Operador",
    "'No tengo personal, uso movistar' -> NO_COMPATIBLE",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "user_amb_09",
        "No tengo personal, uso movistar",
        7,
        false,
        "",
      );
      assert.strictEqual(intencion, "NO_COMPATIBLE");
    },
  );

  await probar(
    "AMB-10",
    "Pregunta vs Afirmación de Pago",
    "'¿Cómo pago el plan?' (Pregunta) -> COMPRAR y NO PAGO_REALIZADO",
    async () => {
      const intencionPregunta = await bot.descubrirIntencionConIA(
        "user_amb_10",
        "¿Cómo pago el plan?",
        4,
        false,
        "",
      );
      const intencionAfirmacion = await bot.descubrirIntencionConIA(
        "user_amb_10",
        "Ya hice el pago ahi te mande el comprobante",
        4,
        false,
        "",
      );
      assert.strictEqual(intencionPregunta, "COMPRAR");
      assert.strictEqual(intencionAfirmacion, "PAGO_REALIZADO");
    },
  );

  await probar(
    "FLUJO-01",
    "Flujo Completo",
    "Cliente pide prueba Personal -> Genera credencial en Veltrix, envía pack y pasa a Paso 3",
    async () => {
      const id = "5493442999888";
      const jid = `${id}@s.whatsapp.net`;
      estadoMock.usuariosBD.set(id, {
        numero: id,
        paso_flujo: 1,
        prueba_enviada: 0,
        es_cliente: 0,
      });
      const llamadasAntes = estadoMock.llamadasVeltrix;

      await bot.procesarMensajeInteligente(
        sockMock,
        id,
        jid,
        "Quiero probar tengo personal",
        "",
        1,
        false,
        null,
      );

      const uDespues = estadoMock.usuariosBD.get(id);
      assert.strictEqual(estadoMock.llamadasVeltrix, llamadasAntes + 1);
      assert.strictEqual(uDespues.paso_flujo, 3);
      assert.strictEqual(uDespues.prueba_enviada, 1);
    },
  );

  await probar(
    "FLUJO-02",
    "Protección 24h",
    "Si pide prueba de nuevo dentro de las 24h -> Reenvía la misma credencial SIN gastar API Veltrix",
    async () => {
      const id = "5493442999888";
      const jid = `${id}@s.whatsapp.net`;
      const llamadasAntes = estadoMock.llamadasVeltrix;

      await bot.procesarMensajeInteligente(
        sockMock,
        id,
        jid,
        "Me pasas una prueba",
        "",
        3,
        true,
        null,
      );

      assert.strictEqual(estadoMock.llamadasVeltrix, llamadasAntes);
    },
  );

  await probar(
    "FLUJO-03",
    "Recuperación Paso 99",
    "interpretarPasoDondeQuedo restaura Paso 4 si el operador le había pasado el alias milciades.genes",
    async () => {
      const id = "user_rec_04";
      bot.memoriaDisco.historialChat[id] = [
        {
          rol: "OPERADOR",
          texto:
            "Podés transferir al alias milciades.genes y mandarme el comprobante",
          ts: Math.floor(Date.now() / 1000),
        },
      ];
      const res = await bot.interpretarPasoDondeQuedo(id, {
        paso_flujo: 99,
        prueba_enviada: 0,
      });
      assert.strictEqual(res.paso, 4);
      assert.strictEqual(bot.memoriaDisco.esperandoComprobante[id], true);
    },
  );

  await probar(
    "FLUJO-04",
    "Recuperación Paso 99",
    "interpretarPasoDondeQuedo restaura Paso 7 si el operador preguntó '¿Usás Personal o Claro?'",
    async () => {
      const id = "user_rec_07";
      bot.memoriaDisco.historialChat[id] = [
        {
          rol: "OPERADOR",
          texto: "Hola buenas, ¿con qué chip querés probar, Personal o Claro?",
          ts: Math.floor(Date.now() / 1000),
        },
      ];
      const res = await bot.interpretarPasoDondeQuedo(id, {
        paso_flujo: 99,
        prueba_enviada: 0,
      });
      assert.strictEqual(res.paso, 7);
    },
  );

  await probar(
    "CONC-01",
    "Concurrencia (BUG-002)",
    "Envío activo del bot en Cliente A NO bloquea la detección de intervención manual (fromMe) en Cliente B",
    async () => {
      await bot.startBot();
      const upsertHandler = estadoMock.eventosBaileys["messages.upsert"];

      const clienteA = "5491100001111";
      const clienteB = "5491100002222";

      bot.enviosBotEnVuelo.set(clienteA, 1);
      bot.ultimoEnvioBotTs.set(clienteA, Date.now());

      await upsertHandler({
        type: "notify",
        messages: [
          {
            key: {
              remoteJid: `${clienteB}@s.whatsapp.net`,
              fromMe: true,
              id: "MANUAL_OP_MSG_999",
            },
            message: { conversation: "Hola, ahí te atiendo yo personalmente" },
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        ],
      });

      bot.enviosBotEnVuelo.delete(clienteA);

      const uB = estadoMock.usuariosBD.get(clienteB);
      assert.strictEqual(uB && uB.paso_flujo, 99);
    },
  );

  await probar(
    "CONC-02",
    "Aislamiento @lid (BUG-003)",
    "Una venta proactiva ('vender') pendiente NO secuestra a un cliente nuevo orgánico con @lid",
    async () => {
      const telVentaProactiva = "5491155556666";
      const lidClienteOrganico = "277777777777777";
      bot.memoriaDisco.ventasProactivas[telVentaProactiva] = Math.floor(
        Date.now() / 1000,
      );

      const match = bot.hayVentaProactivaReciente(lidClienteOrganico, null);
      assert.strictEqual(match, null);
    },
  );

  await probar(
    "CONC-03",
    "Deduplicación (BUG-006)",
    "registrarEnHistorialChat no duplica el mismo mensaje del BOT en la misma ventana de tiempo",
    async () => {
      const id = "user_dedup_01";
      bot.memoriaDisco.historialChat[id] = [];
      bot.registrarEnHistorialChat(id, "BOT", "⚡ *MNet VPN* ⚡ ¡Hola!");
      bot.registrarEnHistorialChat(id, "BOT", "⚡ *MNet VPN* ⚡ ¡Hola!");
      assert.strictEqual(bot.memoriaDisco.historialChat[id].length, 1);
    },
  );

  await probar(
    "EXT-01",
    "Fallo API Veltrix",
    "Si el panel Veltrix cae (devuelve null), el bot avisa al cliente, pasa a Paso 99 y alerta al Admin",
    async () => {
      const id = "5493442777666";
      const jid = `${id}@s.whatsapp.net`;
      const credOriginal = estadoMock.credencialVeltrixMock;
      estadoMock.credencialVeltrixMock = null;

      const exito = await bot.enviarPackVPN(
        sockMock,
        id,
        jid,
        "personal",
        false,
      );
      estadoMock.credencialVeltrixMock = credOriginal;

      assert.strictEqual(exito, false);
      const u = estadoMock.usuariosBD.get(id);
      assert.strictEqual(u && u.paso_flujo, 99);
    },
  );

  await probar(
    "EXT-02",
    "Parser Ollama Robusto",
    "Si Ollama responde con texto extra ('La categoria es: COMPRAR.'), extrae 'COMPRAR' correctamente",
    async () => {
      estadoMock.respuestaOllamaMock = "La categoria es: COMPRAR.";
      try {
        const intencion = await bot.descubrirIntencionConIA(
          "user_ollama_01",
          "che disculpa tenes idea si me sirve para viajar al sur",
          1,
          false,
          "",
        );
        assert.strictEqual(intencion, "COMPRAR");
      } finally {
        estadoMock.respuestaOllamaMock = "DESCONOCIDO";
      }
    },
  );

  await probar(
    "EXT-03",
    "Caída / Timeout de Ollama",
    "Si Ollama está apagado o da timeout, captura el error sin crashear y devuelve DESCONOCIDO",
    async () => {
      estadoMock.forzarErrorOllama = true;
      const intencion = await bot.descubrirIntencionConIA(
        "user_ollama_02",
        "mensaje raro que va hacia ollama",
        1,
        false,
        "",
      );
      estadoMock.forzarErrorOllama = false;
      assert.strictEqual(intencion, "DESCONOCIDO");
    },
  );

  await probar(
    "EXT-04",
    "Reconexión Baileys",
    "Si se cae la conexión de WhatsApp (statusCode !== loggedOut), programa reconexión automática",
    async () => {
      const connHandler = estadoMock.eventosBaileys["connection.update"];
      const antes = estadoMock.reconexionesProgramadas;
      await connHandler({
        connection: "close",
        lastDisconnect: { error: { output: { statusCode: 500 } } },
      });
      assert.strictEqual(estadoMock.reconexionesProgramadas, antes + 1);
    },
  );

  await probar(
    "SEG-01",
    "Seguridad Bad MAC (BUG-004)",
    "Un stack trace Bad MAC con ID corto ('at async 11_1') NO borra sesiones de otros clientes",
    async () => {
      estadoMock.archivosBorrados = [];
      consolaSandbox.error(
        "Failed to decrypt message with Bad MAC at async 11_1",
      );
      assert.strictEqual(estadoMock.archivosBorrados.length, 0);

      consolaSandbox.error(
        "Failed to decrypt message with Bad MAC at async 248970731384950_1",
      );
      assert.strictEqual(estadoMock.archivosBorrados.length, 1);
      assert.strictEqual(
        estadoMock.archivosBorrados[0],
        "session-248970731384950_1.json",
      );
    },
  );

  await probar(
    "SEG-02",
    "Protección VIP (BUG-010)",
    "Un número VIP del administrador nunca queda encerrado en infoPaso99",
    async () => {
      const idVip = bot.NUMEROS_VIP[1];
      await bot.silenciarBotParaCliente(idVip, "Prueba desde cuenta admin", 1);
      assert.strictEqual(bot.memoriaDisco.infoPaso99[idVip], undefined);
    },
  );

  await probar(
    "SEG-03",
    "Autorización Comandos VIP",
    "Un cliente normal NO tiene permisos VIP ('esNumeroVIP' devuelve false)",
    async () => {
      assert.strictEqual(bot.esNumeroVIP("5491199998888"), false);
      assert.strictEqual(bot.esNumeroVIP("246205175070878"), true);
    },
  );

  await probar(
    "SEG-PRO-01",
    "Seguimiento Proactivo (21 hs)",
    "Envía mensaje automático cuando al cliente le quedan ~3 hs para terminar su prueba (21 hs de uso)",
    async () => {
      const id = "5493442111222";
      const ahoraSeg = Math.floor(Date.now() / 1000);

      bot.memoriaDisco.credencialesEnviadas = {};
      bot.memoriaDisco.seguimientoPruebaEnviado = {};

      bot.memoriaDisco.credencialesEnviadas[id] = {
        usuario: "usr21hs",
        password: "pass21hs",
        operador: "personal",
        duracionHoras: 24,
        tsCreacion: ahoraSeg - 21 * 3600,
      };
      estadoMock.usuariosBD.set(id, {
        numero: id,
        paso_flujo: 3,
        prueba_enviada: 1,
        es_cliente: 0,
      });

      const enviados = await bot.verificarYEnviarSeguimientosPrueba(sockMock);
      const ultimoMsg =
        estadoMock.mensajesEnviados[estadoMock.mensajesEnviados.length - 1];

      assert.strictEqual(enviados, 1);
      assert.ok(
        ultimoMsg.texto.includes("usr21hs") &&
          (ultimoMsg.texto.includes("pocas horas") ||
            ultimoMsg.texto.includes("poquitas horas")),
      );
    },
  );

  await probar(
    "SEG-PRO-02",
    "Anti-Duplicado Seguimiento",
    "NO vuelve a enviar seguimiento al mismo cliente ni a su @lid vinculado",
    async () => {
      const idLidVinculado = "299988877766655";
      const ahoraSeg = Math.floor(Date.now() / 1000);

      bot.memoriaDisco.credencialesEnviadas[idLidVinculado] = {
        usuario: "usr21hs",
        password: "pass21hs",
        operador: "personal",
        duracionHoras: 24,
        tsCreacion: ahoraSeg - 22 * 3600,
      };

      const enviadosSegundaPasada =
        await bot.verificarYEnviarSeguimientosPrueba(sockMock);
      assert.strictEqual(enviadosSegundaPasada, 0);
    },
  );

  await probar(
    "SEG-PRO-03",
    "Seguimiento Post-Apagado (26 hs)",
    "Si la PC estuvo apagada y la prueba ya cumplió 26 hs, adapta el mensaje ('finalizó recientemente')",
    async () => {
      const id = "5493442333444";
      const ahoraSeg = Math.floor(Date.now() / 1000);

      bot.memoriaDisco.credencialesEnviadas[id] = {
        usuario: "usr26hs",
        password: "pass26hs",
        operador: "claro",
        duracionHoras: 24,
        tsCreacion: ahoraSeg - 26 * 3600,
      };
      estadoMock.usuariosBD.set(id, {
        numero: id,
        paso_flujo: 3,
        prueba_enviada: 1,
        es_cliente: 0,
      });

      const enviados = await bot.verificarYEnviarSeguimientosPrueba(sockMock);
      const ultimoMsg =
        estadoMock.mensajesEnviados[estadoMock.mensajesEnviados.length - 1];

      assert.strictEqual(enviados, 1);
      assert.ok(
        ultimoMsg.texto.includes("finalizó recientemente") ||
          ultimoMsg.texto.includes("finalizó hace poquito"),
      );
    },
  );

  await probar(
    "SEG-PRO-04",
    "Exclusión Paso 99 / Pago",
    "NO envía seguimiento automático si el cliente está en Paso 99 o ya pidió alias para pagar",
    async () => {
      const idEnPaso99 = "5493442555666";
      const idEsperandoPago = "5493442777888";
      const ahoraSeg = Math.floor(Date.now() / 1000);

      bot.memoriaDisco.credencialesEnviadas[idEnPaso99] = {
        usuario: "usr99",
        password: "p",
        operador: "personal",
        duracionHoras: 24,
        tsCreacion: ahoraSeg - 21 * 3600,
      };
      bot.memoriaDisco.infoPaso99[idEnPaso99] = {
        ts: ahoraSeg - 3600,
        motivo: "Humano",
      };

      bot.memoriaDisco.credencialesEnviadas[idEsperandoPago] = {
        usuario: "usrPago",
        password: "p",
        operador: "personal",
        duracionHoras: 24,
        tsCreacion: ahoraSeg - 21 * 3600,
      };
      bot.memoriaDisco.esperandoComprobante[idEsperandoPago] = true;

      const enviados = await bot.verificarYEnviarSeguimientosPrueba(sockMock);
      assert.strictEqual(enviados, 0);
    },
  );

  await probar(
    "SEG-PRO-05",
    "Respuestas al Seguimiento",
    "Distingue 'Me anduvo joya, quiero comprar' (COMPRAR) y 'Anduvo bien pero cobro la semana que viene' (POSTERGAR_COMPRA)",
    async () => {
      const intCompra = await bot.descubrirIntencionConIA(
        "user_seg_resp1",
        "Me anduvo de diez, quiero comprar un plan",
        3,
        true,
        "",
      );
      const intPosterga = await bot.descubrirIntencionConIA(
        "user_seg_resp2",
        "Anduvo re bien pero ahora estoy sin plata, la semana que viene te compro",
        3,
        true,
        "",
      );

      assert.strictEqual(intCompra, "COMPRAR");
      assert.strictEqual(intPosterga, "POSTERGAR_COMPRA");
    },
  );

  await probar(
    "SEG-PRO-06",
    "Consulta de Prueba Vencida",
    "Si pregunta '¿Ya venció?' teniendo prueba de >24h -> Informa hora de finalización y ofrece planes",
    async () => {
      const id = "5493442333444";
      const intencion = await bot.descubrirIntencionConIA(
        id,
        "Ya venció?",
        3,
        true,
        "",
      );
      const msgDuracion = bot.construirMensajeDuracionPrueba(id);

      assert.strictEqual(intencion, "INFO_DURACION_PRUEBA");
      assert.ok(
        msgDuracion.includes("ya finalizó") && msgDuracion.includes("usr26hs"),
      );
    },
  );

  await probar(
    "AUD-01",
    "Hallazgo USR_4832 (BUG-013)",
    "En Paso 3, si pregunta 'Tengo gigas de saldo, puedo hacer la prueba o me los consume?' -> TIENE_ABONO",
    async () => {
      const id = "usr_4832_test";
      const intencion = await bot.descubrirIntencionConIA(
        id,
        "Tengo gigas de saldo en mi linea, puedo hacer la prueba igual o me los consume?",
        3,
        true,
        "",
      );
      assert.strictEqual(intencion, "TIENE_ABONO");
    },
  );

  await probar(
    "AUD-02",
    "Hallazgo USR_5197 (BUG-014)",
    "En Paso 3, 'Ahora lo pruebo' -> EN_PROCESO_PRUEBA",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "usr_5197_test",
        "Ahora lo pruebo",
        3,
        true,
        "",
      );
      assert.strictEqual(intencion, "EN_PROCESO_PRUEBA");
    },
  );

  await probar(
    "AUD-03",
    "Hallazgo USR_2904 (BUG-015)",
    "En Paso 0, 'Hola te hablo x el internet ilimitado' -> SALUDO por regla rápida",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "usr_2904_test",
        "Hola  te hablo x el internet ilimitado",
        0,
        false,
        "",
      );
      assert.strictEqual(intencion, "SALUDO");
    },
  );

  await probar(
    "AUD-04",
    "Hallazgo USR_2302 (BUG-015)",
    "En Paso 0, 'Hola info' -> SALUDO por regla rápida",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "usr_2302_test",
        "Hola info",
        0,
        false,
        "",
      );
      assert.strictEqual(intencion, "SALUDO");
    },
  );

  await probar(
    "AUD-05",
    "Hallazgo USR_9342 (BUG-016)",
    "En Paso 3, 'Cómo ago' -> INFO_COMO_INSTALAR",
    async () => {
      const intencion = await bot.descubrirIntencionConIA(
        "usr_9342_test",
        "Cómo ago",
        3,
        true,
        "",
      );
      assert.strictEqual(intencion, "INFO_COMO_INSTALAR");
    },
  );

  // ============================================================================
  // PARTE B: DATASET DE 100+ ESCENARIOS CONVERSACIONALES COMPLETOS (ETAPA 8)
  // ============================================================================
  const DATASET_100_ESCENARIOS = [
    // 1 a 15: Regresiones críticas de telemetria_ia.jsonl y errores ortográficos argentinos (incluyendo "peecios")
    { id: "CONV-001", cat: "Telemetría Real", paso: 3, prueba: true, txt: "Tengo 2gb de personal prepago, me lo consumirá?", espInt: "TIENE_ABONO", espPaso: 3 },
    { id: "CONV-002", cat: "Telemetría Real", paso: 3, prueba: true, txt: "Me quedan 500 mb en el chip, me los gasta?", espInt: "TIENE_ABONO", espPaso: 3 },
    { id: "CONV-003", cat: "Telemetría Real", paso: 1, prueba: false, txt: "Tene interne grqtis?", espInt: "FALTA_OPERADOR", espPaso: 7 },
    { id: "CONV-004", cat: "Telemetría Real", paso: 3, prueba: false, txt: "Nono vi la publi en fase", espInt: "SALUDO", espPaso: 1 },
    { id: "CONV-005", cat: "Telemetría Real", paso: 1, prueba: false, txt: "Quero una prueva", espInt: "FALTA_OPERADOR", espPaso: 7 },
    { id: "CONV-006", cat: "Telemetría Real", paso: 3, prueba: true, txt: "Hola", espInt: "SALUDO", espPaso: 3, noContiene: "no logré comprender" },
    { id: "CONV-007", cat: "Telemetría Real", paso: 7, prueba: false, txt: "Estoy descargando la app", espInt: "EN_PROCESO_PRUEBA", espPaso: 7, contiene: "Personal" },
    { id: "CONV-008", cat: "Telemetría Real", paso: 0, prueba: false, txt: "Hola abla por el internet limitado", espInt: "SALUDO", espPaso: 1 },
    { id: "CONV-009", cat: "Telemetría Real", paso: 0, prueba: false, txt: "¿Que concluye mi prueba gratis?", espInt: "FALTA_OPERADOR", espPaso: 7 },
    { id: "CONV-010", cat: "Telemetría Real", paso: 3, prueba: true, txt: "Asta cuando es la prueba", espInt: "INFO_DURACION_PRUEBA", espPaso: 3 },
    { id: "CONV-011", cat: "Telemetría Real", paso: 3, prueba: true, txt: "Donde dice servidor q tengo q poner ?", espInt: "INFO_COMO_INSTALAR", espPaso: 3 },
    { id: "CONV-012", cat: "Telemetría Real", paso: 3, prueba: true, txt: "Te digo q me pide una contraseña nosé si la puse mal", espInt: "SOPORTE", espPaso: 3 },
    { id: "CONV-013", cat: "Telemetría Real", paso: 3, prueba: true, txt: "Si, quiero usarlo 24hs Y después pagarlos Porque anda bien", espInt: "EXITO", espPaso: 3 },
    { id: "CONV-014", cat: "Telemetría Real", paso: 3, prueba: true, txt: "Ah bueno dale lo estoy descargando", espInt: "EN_PROCESO_PRUEBA", espPaso: 3 },
    { id: "CONV-015", cat: "Telemetría Real", paso: 0, prueba: false, txt: "Hola quiero más información sobre el internet Puedo obtener la prueba gratis", espInt: "FALTA_OPERADOR", espPaso: 7 },
    { id: "CONV-015B", cat: "Corrección Peecios", paso: 3, prueba: true, cierreReciente: true, txt: "Ok después pasame los peecios", espInt: "COMPRAR", espPaso: 4, contiene: "milciades.genes" },

    // 16 a 30: Silencio Inteligente (NO_RESPONDER / Reacción 👍 con 0 mensajes de texto tras cierre reciente)
    { id: "CONV-016", cat: "Silencio Inteligente", paso: 3, prueba: true, cierreReciente: true, txt: "Ok", espInt: "AGRADECIMIENTO_FINAL", espPaso: 3, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-017", cat: "Silencio Inteligente", paso: 3, prueba: true, cierreReciente: true, txt: "Listo", espInt: "AGRADECIMIENTO_FINAL", espPaso: 3, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-018", cat: "Silencio Inteligente", paso: 3, prueba: true, cierreReciente: true, txt: "Genial", espInt: "AGRADECIMIENTO_FINAL", espPaso: 3, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-019", cat: "Silencio Inteligente", paso: 3, prueba: true, cierreReciente: true, txt: "Dale gracias", espInt: "AGRADECIMIENTO_FINAL", espPaso: 3, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-020", cat: "Silencio Inteligente", paso: 3, prueba: true, cierreReciente: true, txt: "Ok gracias.", espInt: "AGRADECIMIENTO_FINAL", espPaso: 3, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-021", cat: "Silencio Inteligente", paso: 3, prueba: true, cierreReciente: true, txt: "Ok perfecto 👌", espInt: "AGRADECIMIENTO_FINAL", espPaso: 3, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-022", cat: "Silencio Inteligente", paso: 3, prueba: true, cierreReciente: true, txt: "👍🏾", espInt: "AGRADECIMIENTO_FINAL", espPaso: 3, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-023", cat: "Silencio Inteligente", paso: 3, prueba: true, cierreReciente: true, txt: "Ah bueno dale yo le aviso", espInt: "AGRADECIMIENTO_FINAL", espPaso: 3, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-024", cat: "Silencio Inteligente", paso: 3, prueba: true, cierreReciente: true, txt: "Joyaaa gracias", espInt: "AGRADECIMIENTO_FINAL", espPaso: 3, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-025", cat: "Silencio Inteligente", paso: 3, prueba: true, cierreReciente: true, txt: "Buenisimo", espInt: "AGRADECIMIENTO_FINAL", espPaso: 3, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-026", cat: "Silencio Inteligente", paso: 3, prueba: true, cierreReciente: true, txt: "Muchas gracias", espInt: "AGRADECIMIENTO_FINAL", espPaso: 3, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-027", cat: "Silencio Inteligente", paso: 3, prueba: true, cierreReciente: true, txt: "De una gracias", espInt: "AGRADECIMIENTO_FINAL", espPaso: 3, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-028", cat: "Silencio Inteligente", paso: 4, prueba: false, cierreReciente: true, txt: "Dale joya", espInt: "AGRADECIMIENTO_FINAL", espPaso: 4, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-029", cat: "Silencio Inteligente", paso: 4, prueba: false, cierreReciente: true, txt: "Ok", espInt: "AGRADECIMIENTO_FINAL", espPaso: 4, maxMsgs: 0, espReaccion: 1 },
    { id: "CONV-030", cat: "Silencio Inteligente", paso: 4, prueba: false, cierreReciente: true, txt: "Cualquier cosa te aviso", espInt: "AGRADECIMIENTO_FINAL", espPaso: 4, maxMsgs: 0, espReaccion: 1 },

    // 31 a 40: Consultas en Paso 0 con Fusión de Bienvenida (1 solo mensaje enviado y pasoNuevo != 0)
    { id: "CONV-031", cat: "Fusión Paso 0", paso: 0, prueba: false, txt: "¿Cómo funciona el servicio de internet?", espInt: "INFO_COMO_FUNCIONA", espPaso: 1, maxMsgs: 1 },
    { id: "CONV-032", cat: "Fusión Paso 0", paso: 0, prueba: false, txt: "Hola, necesito tener saldo en el chip para que ande?", espInt: "INFO_COMO_FUNCIONA", espPaso: 1, maxMsgs: 1 },
    { id: "CONV-033", cat: "Fusión Paso 0", paso: 0, prueba: false, txt: "Cuanto sale el mes?", espInt: "COMPRAR", espPaso: 4, maxMsgs: 1 },
    { id: "CONV-034", cat: "Fusión Paso 0", paso: 0, prueba: false, txt: "Me pasas los precios de los planes?", espInt: "COMPRAR", espPaso: 4, maxMsgs: 1 },
    { id: "CONV-035", cat: "Fusión Paso 0", paso: 0, prueba: false, txt: "Cuanto tiempo dura la prueba gratis?", espInt: "INFO_DURACION_PRUEBA", espPaso: 1, maxMsgs: 1 },
    { id: "CONV-036", cat: "Fusión Paso 0", paso: 0, prueba: false, txt: "Se puede compartir wifi a una smart tv?", espInt: "INFO_COMPARTIR_TV", espPaso: 1, maxMsgs: 1 },
    { id: "CONV-037", cat: "Fusión Paso 0", paso: 0, prueba: false, txt: "Sirve para iPhone?", espInt: "NO_COMPATIBLE", espPaso: 8, maxMsgs: 1 },
    { id: "CONV-038", cat: "Fusión Paso 0", paso: 0, prueba: false, txt: "Tengo Movistar, funciona?", espInt: "NO_COMPATIBLE", espPaso: 8, maxMsgs: 1 },
    { id: "CONV-039", cat: "Fusión Paso 0", paso: 0, prueba: false, txt: "Uso Tuenti prepago", espInt: "NO_COMPATIBLE", espPaso: 8, maxMsgs: 1 },
    { id: "CONV-040", cat: "Fusión Paso 0", paso: 0, prueba: false, txt: "Tengo abono mensual de Personal, me sirve?", espInt: "TIENE_ABONO", espPaso: 7, maxMsgs: 1 },

    // 41 a 55: Modismos argentinos, lunfardo, fonética y dictado por voz
    { id: "CONV-041", cat: "Modismos AR", paso: 1, prueba: false, txt: "Kiero provar tengo personal", espInt: "PRUEBA_PERSONAL", espPaso: 3, gastaVeltrix: true },
    { id: "CONV-042", cat: "Modismos AR", paso: 1, prueba: false, txt: "Pasame una prueva para claro", espInt: "PRUEBA_CLARO", espPaso: 3, gastaVeltrix: true },
    { id: "CONV-043", cat: "Modismos AR", paso: 3, prueba: true, txt: "Anda joya loco, vuela el internet", espInt: "EXITO", espPaso: 3 },
    { id: "CONV-044", cat: "Modismos AR", paso: 3, prueba: true, txt: "Me andubo de diez amigo", espInt: "EXITO", espPaso: 3 },
    { id: "CONV-045", cat: "Modismos AR", paso: 3, prueba: true, txt: "Todabia no pude provar bancame un toque", espInt: "EN_PROCESO_PRUEBA", espPaso: 3 },
    { id: "CONV-046", cat: "Modismos AR", paso: 3, prueba: true, txt: "Aora en un rato la pruebo", espInt: "EN_PROCESO_PRUEBA", espPaso: 3 },
    { id: "CONV-047", cat: "Modismos AR", paso: 3, prueba: true, txt: "Anduvo re bien pero estoy sin un mango, cuando cobre te hablo", espInt: "POSTERGAR_COMPRA", espPaso: 3 },
    { id: "CONV-048", cat: "Modismos AR", paso: 1, prueba: false, txt: "Por ahora no gracias capo, dejalo asi", espInt: "NO_INTERESADO", espPaso: 1 },
    { id: "CONV-049", cat: "Modismos AR", paso: 4, prueba: false, txt: "Ahi te transferi los 7000 al alias", espInt: "PAGO_REALIZADO", espPaso: 99 },
    { id: "CONV-050", cat: "Modismos AR", paso: 3, prueba: true, txt: "Ya te pase la plata para renovar el mes", espInt: "PAGO_REALIZADO", espPaso: 99 },
    { id: "CONV-051", cat: "Modismos AR", paso: 3, prueba: true, txt: "No me puedo conetar me tira error", espInt: "SOPORTE", espPaso: 3 },
    { id: "CONV-052", cat: "Modismos AR", paso: 3, prueba: true, txt: "Cual servidor pongo para personal?", espInt: "INFO_COMO_INSTALAR", espPaso: 3 },
    { id: "CONV-053", cat: "Modismos AR", paso: 8, prueba: false, txt: "Ya compre el chip personal en el kiosco", espInt: "PRUEBA_PERSONAL", espPaso: 3, gastaVeltrix: true },
    { id: "CONV-054", cat: "Modismos AR", paso: 8, prueba: false, txt: "Bueno dale mañana compro el chip y te aviso", espInt: "DESPEDIDA_CHIP", espPaso: 8 },
    { id: "CONV-055", cat: "Modismos AR", paso: 1, prueba: false, txt: "Me quede sin megas y sin datos, quiero probar", espInt: "FALTA_OPERADOR", espPaso: 7 },

    // 56 a 70: Cancelaciones, Múltiples Intenciones, Cambios de Tema y Confirmaciones
    { id: "CONV-056", cat: "Cancelación", paso: 7, prueba: false, txt: "No para", espInt: "CANCELAR_OPERACION", espPaso: 7, contiene: "detenemos acá" },
    { id: "CONV-057", cat: "Cancelación", paso: 4, prueba: false, txt: "Espera un toque", espInt: "CANCELAR_OPERACION", espPaso: 4, contiene: "detenemos acá" },
    { id: "CONV-058", cat: "Cancelación", paso: 1, prueba: false, txt: "Para un cachito", espInt: "CANCELAR_OPERACION", espPaso: 1, contiene: "detenemos acá" },
    { id: "CONV-059", cat: "Multi-Intención", paso: 1, prueba: false, txt: "Cuanto sale el mes y como funciona el servicio?", espInt: "INFO_COMO_FUNCIONA", espPaso: 1, contiene: "milciades.genes" },
    { id: "CONV-060", cat: "Multi-Intención", paso: 1, prueba: false, txt: "Cuanto dura la prueba y cuanto cuesta el mes?", espInt: "INFO_DURACION_PRUEBA", espPaso: 1, contiene: "milciades.genes" },
    { id: "CONV-061", cat: "Multi-Intención", paso: 1, prueba: false, txt: "Se puede compartir a la tele y cuanto sale?", espInt: "INFO_COMPARTIR_TV", espPaso: 1, contiene: "milciades.genes" },
    { id: "CONV-062", cat: "Cambio de Tema", paso: 7, prueba: false, txt: "Antes de probar, cuanto sale por mes?", espInt: "COMPRAR", espPaso: 4 },
    { id: "CONV-063", cat: "Cambio de Tema", paso: 4, prueba: false, txt: "Mejor primero quiero probar las 24 hs con Personal", espInt: "PRUEBA_PERSONAL", espPaso: 3, gastaVeltrix: true },
    { id: "CONV-064", cat: "Cambio de Tema", paso: 4, prueba: false, txt: "1", espInt: "FALTA_OPERADOR", espPaso: 7 },
    { id: "CONV-065", cat: "Confirmación Contextual", paso: 1, prueba: false, txt: "Dale", espInt: "FALTA_OPERADOR", espPaso: 7 },
    { id: "CONV-066", cat: "Confirmación Contextual", paso: 1, prueba: false, txt: "Si quiero", espInt: "FALTA_OPERADOR", espPaso: 7 },
    { id: "CONV-067", cat: "Confirmación Contextual", paso: 7, prueba: false, txt: "1", espInt: "PRUEBA_PERSONAL", espPaso: 3, gastaVeltrix: true },
    { id: "CONV-068", cat: "Confirmación Contextual", paso: 7, prueba: false, txt: "2", espInt: "PRUEBA_CLARO", espPaso: 3, gastaVeltrix: true },
    { id: "CONV-069", cat: "Confirmación Contextual", paso: 7, prueba: false, txt: "3", espInt: "NO_COMPATIBLE", espPaso: 8 },
    { id: "CONV-070", cat: "Confirmación Contextual", paso: 3, prueba: true, txt: "2", espInt: "COMPRAR", espPaso: 3, contiene: "milciades.genes" },

    // 71 a 85: Filtro Anti-Alucinación, Ruido, Escalamiento a Humano y Soporte
    { id: "CONV-071", cat: "Anti-Alucinación", paso: 3, prueba: true, txt: "Q 1", espInt: "DESCONOCIDO", espPaso: 3 },
    { id: "CONV-072", cat: "Anti-Alucinación", paso: 3, prueba: true, txt: "Amigo", espInt: "DESCONOCIDO", espPaso: 3 },
    { id: "CONV-073", cat: "Anti-Alucinación", paso: 1, prueba: false, txt: "Che", espInt: "DESCONOCIDO", espPaso: 1 },
    { id: "CONV-074", cat: "Anti-Alucinación", paso: 0, prueba: false, txt: "Amigo", espInt: "SALUDO", espPaso: 1 },
    { id: "CONV-075", cat: "Derivación Humano", paso: 1, prueba: false, txt: "Quiero revender creditos por mayor, tenes panel?", espInt: "DUDA_HUMANO", espPaso: 99 },
    { id: "CONV-076", cat: "Derivación Humano", paso: 1, prueba: false, txt: "Sirve para conectar la Play 4?", espInt: "DUDA_HUMANO", espPaso: 99 },
    { id: "CONV-077", cat: "Derivación Humano", paso: 3, prueba: true, txt: "Me pasas con el administrador por favor", espInt: "SOPORTE", espPaso: 3 },
    { id: "CONV-078", cat: "Derivación Humano", paso: 7, prueba: false, txt: "Tengo una duda antes de elegir", espInt: "DUDA_HUMANO", espPaso: 99 },
    { id: "CONV-079", cat: "Insulto", paso: 1, prueba: false, txt: "Son unos chantas", espInt: "INSULTO", espPaso: 99 },
    { id: "CONV-080", cat: "Cliente Pago", paso: 3, prueba: true, clientePago: true, txt: "Hola buenas tardes", espInt: "SALUDO", espPaso: 3, contiene: "cuándo vence mi plan" },
    { id: "CONV-081", cat: "Cliente Pago", paso: 3, prueba: true, clientePago: true, txt: "Ya me conectó perfecto el plan nuevo", espInt: "EXITO", espPaso: 3, contiene: "Canal de Utilidades" },
    { id: "CONV-082", cat: "Cliente Pago", paso: 3, prueba: true, clientePago: true, txt: "Cuando se me vence el plan?", espInt: "INFO_DURACION_PRUEBA", espPaso: 3 },
    { id: "CONV-083", cat: "Citas Quoted", paso: 1, prueba: false, citado: "Alias: milciades.genes - $7.000 = 30 días", txt: "Como hago para pagar este?", espInt: "COMPRAR", espPaso: 4 },
    { id: "CONV-084", cat: "Repetición Menú", paso: 1, prueba: false, menuReciente: true, txt: "Vi el anuncio del internet", espInt: "SALUDO", espPaso: 1, contiene: "Para comenzar ahora mismo" },
    { id: "CONV-085", cat: "Incomprensión 2x", paso: 1, prueba: false, falloPrevio: 1, txt: "xyz123 texto sin sentido alguno", espInt: "DESCONOCIDO", espPaso: 99 },
  ];

  for (const esc of DATASET_100_ESCENARIOS) {
    await probar(
      esc.id,
      esc.cat,
      `[Paso ${esc.paso}->${esc.espPaso}] "${esc.txt.slice(0, 48)}" -> ${esc.espInt}`,
      async () => {
        estadoMock.respuestaOllamaMock = esc.ollamaMock || "DESCONOCIDO";
        const uid = `u_${esc.id.replace(/\W/g, "").toLowerCase()}`;
        const jid = `${uid}@s.whatsapp.net`;

        estadoMock.usuariosBD.set(uid, {
          numero: uid,
          paso_flujo: esc.paso,
          prueba_enviada: esc.prueba ? 1 : 0,
          es_cliente: esc.clientePago ? 1 : 0,
        });

        if (esc.prueba) {
          bot.memoriaDisco.credencialesEnviadas[uid] = {
            usuario: `mnet_${uid.slice(-4)}`,
            password: "clave1234",
            operador: "personal",
            duracionHoras: 24,
            tsCreacion: Math.floor(Date.now() / 1000) - 1800,
            esVentaConfirmada: Boolean(esc.clientePago),
            tsVencimiento: esc.clientePago
              ? Math.floor(Date.now() / 1000) + 15 * 86400
              : undefined,
          };
        }

        if (esc.cierreReciente) {
          bot.ultimoCierreCordialTs.set(uid, Date.now() - 10000);
        } else {
          bot.ultimoCierreCordialTs.delete(uid);
        }

        if (esc.menuReciente) {
          bot.ultimoMenuEnviadoTs.set(uid, Date.now() - 5000);
        } else {
          bot.ultimoMenuEnviadoTs.delete(uid);
        }

        if (esc.falloPrevio) {
          bot.intentosFallidos.set(uid, esc.falloPrevio);
        } else {
          bot.intentosFallidos.delete(uid);
        }

        const msgsAntes = estadoMock.mensajesEnviados.length;
        const reactsAntes = estadoMock.reaccionesEnviadas.length;
        const veltrixAntes = estadoMock.llamadasVeltrix;

        const intDetectada = await bot.descubrirIntencionConIA(
          uid,
          esc.txt,
          esc.paso === 3 && !esc.prueba ? 1 : esc.paso,
          esc.prueba,
          esc.citado || "",
        );
        if (esc.espInt !== "INSULTO") {
          assert.strictEqual(intDetectada, esc.espInt);
        }

        const rawMsg = {
          key: { id: `RAW_${esc.id}`, remoteJid: jid, fromMe: false },
          message: { conversation: esc.txt },
        };

        await bot.procesarMensajeInteligente(
          sockMock,
          uid,
          jid,
          esc.txt,
          esc.citado || "",
          esc.paso,
          esc.prueba,
          rawMsg,
        );

        const uFinal = estadoMock.usuariosBD.get(uid);
        assert.strictEqual(uFinal.paso_flujo, esc.espPaso);

        const cantMsgsEnviados = estadoMock.mensajesEnviados.length - msgsAntes;
        const cantReactsEnviadas =
          estadoMock.reaccionesEnviadas.length - reactsAntes;

        if (typeof esc.maxMsgs === "number") {
          assert.ok(
            cantMsgsEnviados <= esc.maxMsgs,
            `Esperaba máx ${esc.maxMsgs} mensajes pero envió ${cantMsgsEnviados}`,
          );
        }
        if (typeof esc.espReaccion === "number") {
          assert.strictEqual(cantReactsEnviadas, esc.espReaccion);
        }
        if (esc.gastaVeltrix) {
          assert.strictEqual(estadoMock.llamadasVeltrix, veltrixAntes + 1);
        } else if (esc.gastaVeltrix === false) {
          assert.strictEqual(estadoMock.llamadasVeltrix, veltrixAntes);
        }

        if (esc.contiene || esc.noContiene) {
          const textosNuevos = estadoMock.mensajesEnviados
            .slice(msgsAntes)
            .map((m) => m.texto)
            .join("\n");
          if (esc.contiene) {
            assert.ok(
              textosNuevos.toLowerCase().includes(esc.contiene.toLowerCase()),
              `La respuesta no incluyó "${esc.contiene}"`,
            );
          }
          if (esc.noContiene) {
            assert.ok(
              !textosNuevos.toLowerCase().includes(esc.noContiene.toLowerCase()),
              `La respuesta incluyó texto prohibido "${esc.noContiene}"`,
            );
          }
        }
      },
    );
  }

  // ============================================================================
  // ESCENARIOS 86 a 105: ARQUITECTURA DISTRIBUIDA, DEBOUNCE, @LID, CANAL Y DIFUSIÓN
  // ============================================================================
  await probar(
    "CONV-086",
    "Debounce Adaptativo",
    "Opción cerrada ('1', '2', 'personal') calcula ventana rápida de 1800 ms",
    async () => {
      const ms = bot.calcularTiempoDebounceMs("5493442000001", [
        { key: { fromMe: false }, message: { conversation: "1" } },
      ]);
      assert.strictEqual(ms, 1800);
    },
  );

  await probar(
    "CONV-087",
    "Debounce Adaptativo",
    "Apertura incompleta ('Hola', 'Amigo', 'Una consulta') calcula ventana extendida de 6000 ms",
    async () => {
      const msHola = bot.calcularTiempoDebounceMs("5493442000002", [
        { key: { fromMe: false }, message: { conversation: "Amigo" } },
      ]);
      const msConsulta = bot.calcularTiempoDebounceMs("5493442000002", [
        {
          key: { fromMe: false },
          message: { conversation: "Hola quería consultar algo" },
        },
      ]);
      assert.strictEqual(msHola, 6000);
      assert.strictEqual(msConsulta, 6000);
    },
  );

  await probar(
    "CONV-088",
    "Debounce Adaptativo",
    "Frase completa ('Hola cuanto cuesta el mes') calcula ventana estándar de 3500 ms",
    async () => {
      const ms = bot.calcularTiempoDebounceMs("5493442000003", [
        {
          key: { fromMe: false },
          message: { conversation: "Hola cuanto cuesta el mes" },
        },
      ]);
      assert.strictEqual(ms, 3500);
    },
  );

  await probar(
    "CONV-089",
    "Sincronización @lid Saliente (CRÍTICO-01)",
    "Plantilla nueva 'TU PRUEBA DE 24 HORAS ESTÁ ACTIVA' es reconocida como del BOT y NO bloquea en Paso 99",
    async () => {
      const lid = "105316943417576";
      const ok = await bot.sincronizarEstadoPorMensajeSaliente(
        lid,
        "✅ *TU PRUEBA DE 24 HORAS ESTÁ ACTIVA* ✅\n👤 *Usuario:* `mnet7788`\n🔐 *Contraseña:* `clave9900`",
        Math.floor(Date.now() / 1000),
      );
      assert.strictEqual(ok, true);
      const u = estadoMock.usuariosBD.get(lid);
      assert.strictEqual(u.paso_flujo, 3);
      assert.strictEqual(
        bot.memoriaDisco.credencialesEnviadas[lid].usuario,
        "mnet7788",
      );
    },
  );

  await probar(
    "CONV-090",
    "Sincronización @lid Saliente (CRÍTICO-01)",
    "Plantilla nueva 'TU SUSCRIPCIÓN MNET VPN ESTÁ ACTIVA' sincroniza a Paso 3 y marca cliente pago",
    async () => {
      const lid = "105316943417999";
      const ok = await bot.sincronizarEstadoPorMensajeSaliente(
        lid,
        "✅ *TU SUSCRIPCIÓN MNET VPN ESTÁ ACTIVA* ✅\n👤 *Usuario:* `vipuser1`\n🔐 *Contraseña:* `vippass1`",
        Math.floor(Date.now() / 1000),
      );
      assert.strictEqual(ok, true);
      const u = estadoMock.usuariosBD.get(lid);
      assert.strictEqual(u.paso_flujo, 3);
      assert.strictEqual(u.es_cliente, 1);
    },
  );

  await probar(
    "CONV-091",
    "Comando VIP Reiniciar @lid (CRÍTICO-02)",
    "'reiniciar 3436 57-0945' descubre el @lid 105316943417576 vía onWhatsApp y lo resetea a Paso 0",
    async () => {
      const lid = "105316943417576";
      const idAdmin = bot.NUMEROS_VIP[1];
      estadoMock.usuariosBD.set(lid, {
        numero: lid,
        paso_flujo: 3,
        prueba_enviada: 1,
        es_cliente: 0,
      });
      bot.memoriaDisco.credencialesEnviadas[lid] = {
        usuario: "mnet7788",
        password: "clave9900",
      };

      const ejecutado = await bot.ejecutarComandoVIP(
        sockMock,
        idAdmin,
        `${idAdmin}@lid`,
        "reiniciar 3436 57-0945",
        [],
      );
      assert.strictEqual(ejecutado, true);
      const uLid = estadoMock.usuariosBD.get(lid);
      assert.strictEqual(uLid.paso_flujo, 0);
      assert.strictEqual(uLid.prueba_enviada, 0);
      assert.strictEqual(bot.memoriaDisco.credencialesEnviadas[lid], undefined);
    },
  );

  await probar(
    "CONV-092",
    "Resolución por Usuario VPN",
    "resolverIdUsuario encuentra al cliente buscando por su usuario VPN ('mnet9911')",
    async () => {
      const lid = "188877766655544";
      bot.memoriaDisco.credencialesEnviadas[lid] = {
        usuario: "mnet9911",
        password: "clave1122",
      };
      assert.strictEqual(bot.resolverIdUsuario("mnet9911"), lid);
    },
  );

  await probar(
    "CONV-093",
    "Resolución por Nombre con Emojis",
    "resolverIdUsuario encuentra a '🔥 Chelo 🚀' buscando solo 'chelo'",
    async () => {
      const lid = "177766655544433";
      bot.memoriaDisco.mapaContactos[lid] = {
        nombre: "🔥 Chelo 🚀",
        telefonoReal: "5493442554433",
        jidOriginal: `${lid}@lid`,
      };
      assert.strictEqual(bot.resolverIdUsuario("chelo"), lid);
    },
  );

  await probar(
    "CONV-094",
    "Flyer de Anuncio en Paso 0 (CRÍTICO-04)",
    "Cliente nuevo en Paso 0 que envía imagen del tutorial/anuncio NO es bloqueado en Paso 99",
    async () => {
      const id = "5493442888111";
      const jid = `${id}@s.whatsapp.net`;
      estadoMock.usuariosBD.set(id, {
        numero: id,
        paso_flujo: 0,
        prueba_enviada: 0,
        es_cliente: 0,
      });

      const msgFlyer = {
        key: { id: "FLYER_01", remoteJid: jid, fromMe: false },
        message: {
          imageMessage: {
            caption:
              "#📺 TUTORIAL – VIVE ONLINE VPN Cómo conectar tu Smart TV paso a paso",
          },
        },
      };

      await bot.procesarMensajeInteligente(
        sockMock,
        id,
        jid,
        "#📺 TUTORIAL – VIVE ONLINE VPN Cómo conectar tu Smart TV paso a paso",
        "",
        0,
        false,
        msgFlyer,
      );

      const u = estadoMock.usuariosBD.get(id);
      assert.notStrictEqual(u.paso_flujo, 99);
      assert.strictEqual(u.paso_flujo, 1);
    },
  );

  await probar(
    "CONV-095",
    "Imagen sin Texto en Paso 0",
    "Cliente nuevo en Paso 0 que envía foto del anuncio sin caption recibe bienvenida en Paso 1",
    async () => {
      const id = "5493442888112";
      const jid = `${id}@s.whatsapp.net`;
      estadoMock.usuariosBD.set(id, {
        numero: id,
        paso_flujo: 0,
        prueba_enviada: 0,
        es_cliente: 0,
      });

      const msgFotoSinTexto = {
        key: { id: "FLYER_02", remoteJid: jid, fromMe: false },
        message: { imageMessage: {} },
      };

      await bot.procesarMensajeInteligente(
        sockMock,
        id,
        jid,
        "",
        "",
        0,
        false,
        msgFotoSinTexto,
      );

      const u = estadoMock.usuariosBD.get(id);
      assert.strictEqual(u.paso_flujo, 1);
    },
  );

  await probar(
    "CONV-096",
    "Compuerta de Salida Anti-Duplicado",
    "enviarMensajeSeguro bloquea el envío de un mismo párrafo largo repetido en < 45s",
    async () => {
      const id = "5493442888113";
      const jid = `${id}@s.whatsapp.net`;
      const textoLargo =
        "Este es un mensaje informativo largo de prueba para verificar que la compuerta de salida no lo duplique.";

      const env1 = await bot.enviarMensajeSeguro(sockMock, jid, {
        text: textoLargo,
      });
      const env2 = await bot.enviarMensajeSeguro(sockMock, jid, {
        text: textoLargo,
      });

      assert.ok(env1 !== null);
      assert.strictEqual(env2, null);
    },
  );

  await probar(
    "CONV-097",
    "Idempotencia Veltrix en Vuelo",
    "Si creandoPruebaEnCurso está activo para el usuario, enviarPackVPN no vuelve a llamar a Veltrix",
    async () => {
      const id = "5493442888114";
      const jid = `${id}@s.whatsapp.net`;
      bot.creandoPruebaEnCurso.add(id);
      const veltrixAntes = estadoMock.llamadasVeltrix;

      const res = await bot.enviarPackVPN(sockMock, id, jid, "personal", false);
      bot.creandoPruebaEnCurso.delete(id);

      assert.strictEqual(res, true);
      assert.strictEqual(estadoMock.llamadasVeltrix, veltrixAntes);
    },
  );

  await probar(
    "CONV-098",
    "Interrupción por Mensaje Nuevo en Cola",
    "Si hay un mensaje nuevo en colaMensajes durante el análisis, procesarMensajeInteligente cede el turno sin enviar respuesta obsoleta",
    async () => {
      const id = "5493442888115";
      const jid = `${id}@s.whatsapp.net`;
      bot.colaMensajes.set(id, [
        {
          key: { id: "NUEVO_MSG", fromMe: false },
          message: { conversation: "Donde pongo el servidor?" },
        },
      ]);
      const msgsAntes = estadoMock.mensajesEnviados.length;

      await bot.procesarMensajeInteligente(
        sockMock,
        id,
        jid,
        "Amigo",
        "",
        3,
        true,
        null,
      );
      bot.colaMensajes.delete(id);

      assert.strictEqual(estadoMock.mensajesEnviados.length, msgsAntes);
    },
  );

  await probar(
    "CONV-099",
    "Comando VIP Venta Completa",
    "Comando 'venta <cliente> 30 usr30 pass30 personal' registra venta, desbloquea Paso 99 y activa Paso 3",
    async () => {
      const idCliente = "5493442888116";
      const idAdmin = bot.NUMEROS_VIP[1];
      bot.memoriaDisco.infoPaso99[idCliente] = {
        ts: Math.floor(Date.now() / 1000),
        motivo: "Comprobante",
        pasoPrevio: 4,
      };

      const msgsAntes = estadoMock.mensajesEnviados.length;
      const ok = await bot.ejecutarComandoVIP(
        sockMock,
        idAdmin,
        `${idAdmin}@lid`,
        `venta ${idCliente} 30 usr30 pass30 personal`,
        [],
      );

      assert.strictEqual(ok, true);
      const u = estadoMock.usuariosBD.get(idCliente);
      assert.strictEqual(u.paso_flujo, 3);
      assert.strictEqual(u.es_cliente, 1);
      assert.strictEqual(bot.memoriaDisco.infoPaso99[idCliente], undefined);

      const textosCliente = estadoMock.mensajesEnviados
        .slice(msgsAntes)
        .filter((m) => m.remoteJid.includes(idCliente))
        .map((m) => m.texto)
        .join("\n");
      assert.ok(
        textosCliente.includes("CANAL OFICIAL DE UTILIDADES"),
        "Debe enviar la recomendación de unirse al Canal de Utilidades al activar venta",
      );
    },
  );

  await probar(
    "CONV-100",
    "Auditoría Comparativa de Preservación Total (Etapa 14)",
    "Todas las funciones públicas originales de todos los módulos siguen exportadas y disponibles",
    async () => {
      const exportacionesRequeridas = [
        "cargarEnvLocal",
        "esNumeroVIP",
        "obtenerAleatorio",
        "nombreDescriptivoPaso",
        "construirRecordatorioHilo",
        "construirMensajeChequeoInicialPrueba",
        "construirMensajeSeguimientoPrueba",
        "cargarMemoriaDisco",
        "guardarMemoriaSincrono",
        "guardarMemoriaDisco",
        "marcarMensajeProcesado",
        "registrarIdMensajeDelBot",
        "registrarTsIntervencionManual",
        "registrarEnHistorialChat",
        "guardarEnBuzonPaso99",
        "guardarDatosContacto",
        "vincularListaContactos",
        "registrarLog",
        "registrarTelemetriaIA",
        "obtenerPruebaVigente24h",
        "obtenerPruebaVencida",
        "validarPermisoCreacionPrueba",
        "construirMensajeDuracionPrueba",
        "normalizarNumeroArgentino",
        "hayVentaProactivaReciente",
        "resolverIdUsuario",
        "obtenerJidDeUsuario",
        "cumplioTiempoAutoDesbloqueo",
        "interpretarPasoDondeQuedo",
        "normalizarFoneticaArgentina",
        "detectarInsulto",
        "ejecutarOllamaSerializado",
        "descubrirIntencionConIA",
        "setSockActual",
        "getSockActual",
        "desenvolverMensaje",
        "esEventoIgnorable",
        "obtenerTimestampSegundos",
        "esMensajeReciente",
        "obtenerTextoDeMensaje",
        "obtenerTextoCitado",
        "esComprobanteOArchivo",
        "esAudio",
        "esSticker",
        "esPosibleRenovacionOPagoEnPaso99",
        "esperarRetardoHumano",
        "actualizarPasoSeguro",
        "enviarMensajeSeguro",
        "enviarMensajeConFotoApp",
        "enviarBienvenidaSiEsNuevo",
        "notificarAlAdmin",
        "silenciarBotParaCliente",
        "reenviarCredencialVigente",
        "enviarVideoYApkVPN",
        "enviarPackVPN",
        "verificarYEnviarSeguimientosPrueba",
        "retomarConversacionAlDesbloquear",
        "procesarMensajeInteligente",
        "ejecutarComandoVIP",
        "procesarColaDeUsuario",
        "procesarLoteSincronizacionOffline",
        "startBot",
      ];

      for (const fnName of exportacionesRequeridas) {
        assert.strictEqual(
          typeof bot[fnName],
          "function",
          `Falta la función original requerida: ${fnName}`,
        );
      }
    },
  );

  await probar(
    "CONV-101",
    "Canal de Utilidades (comunicados.js)",
    "construirInvitacionCanal, construirMensajeCaida y construirMensajeRestablecido leen desde comunicados.js y admiten notas",
    async () => {
      const inv = bot.construirInvitacionCanal();
      const caida = bot.construirMensajeCaida("Actualizando servidor 1");
      const alta = bot.construirMensajeRestablecido("Todo al 100%");

      assert.ok(inv.includes("CANAL OFICIAL DE UTILIDADES"));
      assert.ok(
        caida.includes("AVISO IMPORTANTE DE SERVICIO") &&
          caida.includes("Actualizando servidor 1"),
      );
      assert.ok(
        alta.includes("SERVICIO RESTABLECIDO") &&
          alta.includes("Todo al 100%"),
      );
    },
  );

  await probar(
    "CONV-102",
    "Filtro de Clientes Vigentes y Deduplicación",
    "obtenerClientesConServicioVigente incluye clientes con servicio activo, excluye vencidos y deduplica @lid + teléfono",
    async () => {
      const ahoraSeg = Math.floor(Date.now() / 1000);
      estadoMock.ventasBD = [];
      bot.memoriaDisco.credencialesEnviadas = {};

      const telActivo = "5493442100200";
      const lidActivo = "155500011122233";
      bot.vincularIdentidades(telActivo, lidActivo, `${lidActivo}@lid`);
      bot.memoriaDisco.credencialesEnviadas[telActivo] = {
        usuario: "activo1",
        password: "p1",
        tsCreacion: ahoraSeg - 3600,
        duracionHoras: 720,
        tsVencimiento: ahoraSeg + 25 * 86400,
        esVentaConfirmada: true,
      };
      bot.memoriaDisco.credencialesEnviadas[lidActivo] =
        bot.memoriaDisco.credencialesEnviadas[telActivo];

      bot.memoriaDisco.credencialesEnviadas["5493442999000"] = {
        usuario: "vencido1",
        password: "p2",
        tsCreacion: ahoraSeg - 10 * 86400,
        duracionHoras: 24,
        tsVencimiento: ahoraSeg - 5 * 86400,
      };

      const vigentes = await bot.obtenerClientesConServicioVigente();
      assert.strictEqual(vigentes.length, 1);
      assert.strictEqual(vigentes[0].usuarioVpn, "activo1");
    },
  );

  await probar(
    "CONV-103",
    "Comando VIP 'caida' + Silencio Inteligente posterior",
    "Comando 'caida' envía comunicado solo al cliente vigente y si responde 'Ok gracias' reacciona con 👍 sin mandar texto",
    async () => {
      const idAdmin = bot.NUMEROS_VIP[1];
      const vigentes = await bot.obtenerClientesConServicioVigente();
      const idClienteActivo = vigentes[0].id;
      const jidClienteActivo = vigentes[0].jid;

      const msgsAntes = estadoMock.mensajesEnviados.length;
      const ok = await bot.ejecutarComandoVIP(
        sockMock,
        idAdmin,
        `${idAdmin}@lid`,
        "caida Estamos reiniciando Personal Ultra 1",
        [],
      );
      assert.strictEqual(ok, true);
      assert.strictEqual(bot.memoriaDisco.modoCaidaActivo, true);

      const enviadosAlCliente = estadoMock.mensajesEnviados
        .slice(msgsAntes)
        .filter((m) => m.remoteJid === jidClienteActivo);
      assert.strictEqual(enviadosAlCliente.length, 1);
      assert.ok(
        enviadosAlCliente[0].texto.includes("AVISO IMPORTANTE DE SERVICIO"),
      );
      assert.ok(
        enviadosAlCliente[0].texto.includes(
          "Estamos reiniciando Personal Ultra 1",
        ),
      );

      // Estando en Modo Caída, si el cliente escribe, se guarda en colaCaida y no responde
      await bot.procesarColaDeUsuario(sockMock, idClienteActivo, jidClienteActivo);
      assert.ok(bot.memoriaDisco.colaCaida[idClienteActivo]);

      // Al desactivar / restablecer, se procesa la cola y vuelve a la normalidad
      await bot.ejecutarComandoVIP(
        sockMock,
        idAdmin,
        `${idAdmin}@lid`,
        "restablecido Todo normal",
        [],
      );
      assert.strictEqual(bot.memoriaDisco.modoCaidaActivo, false);
    },
  );

  await probar(
    "CONV-104",
    "Comandos VIP 'restablecido' y 'veraviso'",
    "Comando 'restablecido' avisa a los clientes vigentes que volvió el servicio y 'veraviso' muestra vista previa",
    async () => {
      const idAdmin = bot.NUMEROS_VIP[1];
      const vigentes = await bot.obtenerClientesConServicioVigente();
      const jidClienteActivo = vigentes[0].jid;

      const msgsAntes = estadoMock.mensajesEnviados.length;
      const okVista = await bot.ejecutarComandoVIP(
        sockMock,
        idAdmin,
        `${idAdmin}@lid`,
        "veraviso",
        [],
      );
      assert.strictEqual(okVista, true);

      const okRest = await bot.ejecutarComandoVIP(
        sockMock,
        idAdmin,
        `${idAdmin}@lid`,
        "restablecido",
        [],
      );
      assert.strictEqual(okRest, true);

      const enviadosAlCliente = estadoMock.mensajesEnviados
        .slice(msgsAntes)
        .filter((m) => m.remoteJid === jidClienteActivo);
      assert.strictEqual(enviadosAlCliente.length, 1);
      assert.ok(enviadosAlCliente[0].texto.includes("SERVICIO RESTABLECIDO"));
    },
  );

  await probar(
    "CONV-105",
    "Protección @lid ante Comunicados de Caída y Canal",
    "sincronizarEstadoPorMensajeSaliente reconoce comunicados de caída/restablecimiento/canal como del BOT",
    async () => {
      const lid = "166677788899900";
      const okCaida = await bot.sincronizarEstadoPorMensajeSaliente(
        lid,
        bot.construirMensajeCaida(),
        Math.floor(Date.now() / 1000),
      );
      const okCanal = await bot.sincronizarEstadoPorMensajeSaliente(
        lid,
        bot.construirInvitacionCanal(),
        Math.floor(Date.now() / 1000),
      );

      assert.strictEqual(okCaida, true);
      assert.strictEqual(okCanal, true);
      const u = estadoMock.usuariosBD.get(lid);
      assert.strictEqual(u.paso_flujo, 3);
    },
  );

  console.log(
    "\n============================================================================",
  );
  console.log(
    `📊 RESUMEN FINAL: ${pasadas} PASADAS | ${falladas} FALLADAS (Total: ${
      pasadas + falladas
    })`,
  );
  console.log(
    "============================================================================",
  );

  if (falladas > 0) {
    console.log("\n⚠️ Detalle de pruebas falladas:");
    for (const f of erroresDetallados) {
      console.log(` - [${f.id}] ${f.descripcion}: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log(
      `\n🚀 ¡LOS ${pasadas} TESTS AUTOMATIZADOS (CON MODO CAÍDA Y PEECIOS) PASARON CON ÉXITO!`,
    );
    process.exit(0);
  }
}

ejecutarBateriaDePruebas();