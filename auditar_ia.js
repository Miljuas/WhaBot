/**
 * ============================================================================
 * AUDITOR CONTEXTUAL INTELIGENTE v5.0 (ARQUITECTURA MODULAR) - MNET VPN
 * ============================================================================
 * Ejecución: node auditar_ia.js
 *
 * Características:
 * 1. Compatible con la arquitectura modular v5.0 (config, mensajes, memoria, ia, flujos, comandos_vip).
 * 2. Cruza información de memoria_bot.json, telemetria_ia.jsonl y usuarios.db (pruebas, ventas, incidentes).
 * 3. Evalúa la efectividad del Chequeo de 30 min, Seguimiento de 20 hs y Silencio Inteligente (👍).
 * 4. Simula cada mensaje histórico contra el motor actual de ia.js para separar
 *    fallos ya resueltos de brechas reales pendientes.
 * 5. Consulta a Ollama (llama3.2) indicando en qué módulo exacto (ia.js, mensajes.js o flujos.js)
 *    conviene aplicar cada ajuste.
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();

const PATH_MEMORIA = path.join(__dirname, "memoria_bot.json");
const PATH_TELEMETRIA = path.join(__dirname, "telemetria_ia.jsonl");
const PATH_DB = path.join(__dirname, "usuarios.db");
const PATH_REPORTE_JSON = path.join(
  __dirname,
  "reporte_auditoria_contextual.json",
);
const PATH_CASOS_SUGERIDOS = path.join(__dirname, "casos_sugeridos.json");

// ============================================================================
// 1. CARGADOR DE MÓDULOS EN SANDBOX AISLADO (SOLO LECTURA)
// ============================================================================
function cargarBotModularEnSandbox() {
  const axiosOfflineMock = {
    post: async () => ({ data: { response: "DESCONOCIDO" } }),
  };

  const dbMock = {
    crearUsuario: async () => ({}),
    getUsuario: async () => null,
    actualizarPaso: async () => ({}),
    marcarPruebaEnviada: async () => ({}),
    marcarPruebaNoEnviada: async () => ({}),
    marcarComoCliente: async () => ({}),
    registrarPruebaBD: async () => ({}),
    marcarSeguimientoPruebaBD: async () => ({}),
    marcarErrorEnPruebaBD: async () => ({}),
    registrarIncidenteBD: async () => ({}),
    registrarVentaBD: async () => ({}),
    obtenerSuscripcionCliente: async () => null,
    obtenerEstadoSuscripcionesActuales: async () => [],
    marcarRecordatorioVentaEnviado: async () => ({}),
    obtenerDatosMesParaExcel: async () => ({}),
    contarUsuariosTotales: async () => 0,
    contarUsuariosConPrueba: async () => 0,
    contarUsuariosClientes: async () => 0,
  };

  const fsMock = {
    ...fs,
    existsSync: () => false,
    writeFileSync: () => {},
    renameSync: () => {},
    appendFileSync: () => {},
  };

  const baileysMock = {
    default: () => ({}),
    useMultiFileAuthState: async () => ({
      state: {},
      saveCreds: async () => {},
    }),
    DisconnectReason: { loggedOut: 401 },
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
    Browsers: { windows: () => ["Windows", "Chrome", "10"] },
    delay: async () => {},
  };

  const cacheModulos = {};
  const consolaSilenciosa = {
    log: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  const requireSandbox = (modulo) => {
    if (modulo === "axios") return axiosOfflineMock;
    if (modulo === "./db") return dbMock;
    if (modulo === "./ultranet")
      return { generarCredencialPruebaUltraNet: async () => null };
    if (modulo === "./excel_report") {
      return {
        generarExcelMensual: async () => ({}),
        sincronizarPruebasDeMemoriaABD: async () => ({}),
        formatearFechaHora: () => "",
      };
    }
    if (modulo === "fs") return fsMock;
    if (modulo === "pino") return () => ({ level: "silent" });
    if (modulo === "qrcode-terminal") return { generate: () => {} };
    if (modulo === "@whiskeysockets/baileys") return baileysMock;

    const modulosInternos = [
      "./config",
      "./mensajes",
      "./memoria",
      "./ia",
      "./flujos",
      "./comandos_vip",
      "./index",
    ];

    if (modulosInternos.includes(modulo)) {
      if (cacheModulos[modulo]) return cacheModulos[modulo].exports;

      const nombreArchivo = modulo.replace("./", "") + ".js";
      const rutaArchivo = path.join(__dirname, nombreArchivo);
      if (!fs.existsSync(rutaArchivo)) {
        throw new Error(
          `Falta el archivo modular '${nombreArchivo}' en la carpeta.`,
        );
      }

      const codigo = fs.readFileSync(rutaArchivo, "utf8");
      const modObj = { exports: {} };
      cacheModulos[modulo] = modObj;

      const ctx = {
        require: requireSandbox,
        module: modObj,
        exports: modObj.exports,
        __dirname,
        __filename: rutaArchivo,
        console: consolaSilenciosa,
        process: { env: { ...process.env }, on: () => {}, exit: () => {} },
        setTimeout: () => ({ unref: () => {} }),
        clearTimeout: () => {},
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

  return requireSandbox("./index");
}

// ============================================================================
// 2. LECTURA SEGURA DE MÉTRICAS EN SQLITE (usuarios.db)
// ============================================================================
async function leerResumenSQLite() {
  if (!fs.existsSync(PATH_DB)) {
    return {
      totalUsuarios: 0,
      totalPruebasBD: 0,
      totalVentasBD: 0,
      totalIncidentesBD: 0,
    };
  }

  const db = new sqlite3.Database(PATH_DB, sqlite3.OPEN_READONLY);
  const consultarCount = (tabla) =>
    new Promise((resolve) => {
      db.get(`SELECT COUNT(*) as total FROM ${tabla}`, (err, row) => {
        if (err || !row) resolve(0);
        else resolve(row.total || 0);
      });
    });

  const totalUsuarios = await consultarCount("usuarios");
  const totalPruebasBD = await consultarCount("pruebas");
  const totalVentasBD = await consultarCount("ventas");
  const totalIncidentesBD = await consultarCount("incidentes");

  db.close();
  return { totalUsuarios, totalPruebasBD, totalVentasBD, totalIncidentesBD };
}

// ============================================================================
// 3. UTILIDADES DE RECONSTRUCCIÓN DE CONTEXTO E INFERENCIA DE PASO
// ============================================================================
function anonimizarTexto(texto) {
  return String(texto || "")
    .replace(/\b549\d{10}\b/g, "[TEL_CLIENTE]")
    .replace(/\s+/g, " ")
    .trim();
}

function inferirPasoAntesDelMensaje(
  historial,
  indiceMensajeCliente,
  credencialUsuario,
) {
  let pasoInferido = 0;
  let yaTuvoPrueba = Boolean(credencialUsuario);

  for (let i = 0; i < indiceMensajeCliente; i++) {
    const m = historial[i];
    if (!m || m.rol === "CLIENTE") continue;
    const t = String(m.texto || "").toLowerCase();

    if (
      t.includes("prueba vive online generada") ||
      t.includes("tu prueba de 24 horas está activa") ||
      t.includes("tu prueba gratuita de 24 hs sigue activa") ||
      t.includes("tu suscripción mnet vpn está activa") ||
      t.includes("plan mnet vpn activado") ||
      t.includes("seguimos en contacto") ||
      t.includes("seguimos a tu disposición") ||
      t.includes("pudiste instalar la aplicación") ||
      t.includes("pudiste descargar nuestra aplicación") ||
      t.includes("poquitas horas") ||
      t.includes("pocas horas") ||
      t.includes("finalizó hace poquito") ||
      t.includes("finalizó recientemente") ||
      t.includes("copiá y pegá esos dos datos")
    ) {
      pasoInferido = 3;
      yaTuvoPrueba = true;
    } else if (
      t.includes("elegí el operador") ||
      t.includes("con qué chip querés probar") ||
      t.includes("con qué chip vas a probar") ||
      t.includes("qué compañía usás en tu celular")
    ) {
      pasoInferido = 7;
    } else if (
      t.includes("milciades.genes") ||
      t.includes("activación de servicio") ||
      t.includes("planes y activación")
    ) {
      pasoInferido = yaTuvoPrueba ? 3 : 4;
    } else if (
      t.includes("exclusivamente con un chip personal") ||
      t.includes("exclusivamente en dispositivos android") ||
      t.includes("kiosco")
    ) {
      pasoInferido = 8;
    } else if (
      (t.includes("mnet vpn") || t.includes("vive online vpn")) &&
      pasoInferido === 0
    ) {
      pasoInferido = 1;
    }
  }

  return { pasoInferido, yaTuvoPrueba };
}

function formatearHiloConversacion(mensajes) {
  return mensajes
    .map((m) => {
      const icono =
        m.rol === "CLIENTE"
          ? "👤 CLIENTE"
          : m.rol === "OPERADOR"
            ? "👨‍💻 OPERADOR"
            : "🤖 BOT";
      return `   ${icono}: "${anonimizarTexto(m.texto)}"`;
    })
    .join("\n");
}

// ============================================================================
// 4. PROMPT DE AUDITORÍA PARA OLLAMA CON ARQUITECTURA MODULAR
// ============================================================================
const CONTEXTO_SISTEMA_MNET = `CONTEXTO DEL SISTEMA AUDITADO (Bot de WhatsApp "MNet VPN" - Arquitectura Modular v5.0):
- Módulos del proyecto:
  * config.js: Tiempos (Chequeo inicial a los 30 min si no escribe; Seguimiento pre-vencimiento a las 20 hs).
  * mensajes.js: Plantillas de texto, enlace oficial a Google Play Store y precios (3d=$2000, 7d=$3000, 15d=$5000, 30d=$7000, alias milciades.genes).
  * ia.js: Normalizador fonético argentino, detectores de apertura incompleta / confirmación corta / cancelación / múltiples intenciones y clasificador (descubrirIntencionConIA).
  * flujos.js: Máquina de estados (Paso 0, 1, 3, 4, 7, 8, 99), Motor de Decisiones con Silencio Inteligente (👍), envío de Foto+PlayStore+Video+Credenciales fáciles (mnetXXXX / claveYYYY) y compuerta de salida controlada.
  * comandos_vip.js: Comandos admin ('venta', 'excel', 'vencimientos', 'mandarprueba', 'vender', 'desbloquear', 'bloquear', 'reiniciar', 'pendientes') con resolución cruzada @lid <-> teléfono.
  * db.js y excel_report.js: Tablas SQLite (usuarios, pruebas, ventas, incidentes) y reporte mensual en Excel.
- Intenciones activas hoy en ia.js:
  SALUDO, FALTA_OPERADOR, PRUEBA_PERSONAL, PRUEBA_CLARO, COMPRAR, PAGO_REALIZADO,
  POSTERGAR_COMPRA, NO_INTERESADO, CANCELAR_OPERACION, INFO_DURACION_PRUEBA,
  INFO_COMPARTIR_TV, SOPORTE_INSTALACION_APK, TIENE_ABONO (incluye gigas activos con números ej. 2gb),
  INFO_COMO_FUNCIONA, INFO_COMO_INSTALAR, NO_COMPATIBLE, DESPEDIDA_CHIP,
  EXITO, AGRADECIMIENTO_FINAL, EN_PROCESO_PRUEBA, SOPORTE, RECHAZO_PRUEBA.`;

async function analizarCasoConOllamaContextual(caso) {
  const prompt = `${CONTEXTO_SISTEMA_MNET}

=====================================================================
CASO REAL A AUDITAR (${caso.tipoCaso}):
- Estado del cliente: Paso ${caso.paso} (Tenía prueba enviada: ${caso.yaTuvoPrueba ? "SÍ" : "NO"})
- Consulta del cliente: "${caso.consultaCliente}"
- Resolución que dio el Operador: "${caso.resolucionOperador || "Sin intervención"}"
- Qué devuelve hoy ia.js ante esa frase: ${caso.intencionActual}

HILO COMPLETO DE LA CONVERSACIÓN:
${caso.hiloFormateado}
=====================================================================

Actúa como ingeniero de software senior de MNet VPN. Analiza el diálogo y responde en español en 3 puntos breves:
1. CONTEXTO REAL: ¿Qué necesitaba el cliente y por qué escribió eso?
2. EVALUACIÓN DE ia.js: La intención detectada hoy es "${caso.intencionActual}". ¿Ya cubre bien el caso o falta algo de lo que dijo el OPERADOR?
3. MÓDULO A EDITAR (ia.js / mensajes.js / flujos.js): Si hace falta mejorar algo, indica exactamente en cuál archivo modular agregar la expresión regular o el texto.`;

  const resp = await axios.post(
    "http://127.0.0.1:11434/api/generate",
    {
      model: "llama3.2",
      prompt,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 350,
      },
    },
    { timeout: 25000 },
  );

  return String(resp.data.response || "").trim();
}

// ============================================================================
// 5. EJECUCIÓN PRINCIPAL DE LA AUDITORÍA
// ============================================================================
async function ejecutarAuditoriaContextual() {
  console.log(
    "============================================================================",
  );
  console.log(
    "🧠 AUDITORÍA CONTEXTUAL v5.0 (ARQUITECTURA MODULAR + BD + SEGUIMIENTOS)",
  );
  console.log(
    "============================================================================\n",
  );

  const botActual = cargarBotModularEnSandbox();
  const metricasSQL = await leerResumenSQLite();

  let memoria = {};
  if (fs.existsSync(PATH_MEMORIA)) {
    memoria = JSON.parse(fs.readFileSync(PATH_MEMORIA, "utf8"));
  } else {
    console.log("⚠️ No se encontró memoria_bot.json en la carpeta.");
    return;
  }

  const registrosTelemetria = [];
  if (fs.existsSync(PATH_TELEMETRIA)) {
    const lineas = fs
      .readFileSync(PATH_TELEMETRIA, "utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    for (const l of lineas) {
      try {
        registrosTelemetria.push(JSON.parse(l));
      } catch (e) {}
    }
  }

  const historiales = memoria.historialChat || {};
  const infoPaso99 = memoria.infoPaso99 || {};
  const credenciales = memoria.credencialesEnviadas || {};
  const operadores = memoria.operadorDetectado || {};
  const buzones = memoria.buzonPaso99 || {};
  const chequeos30m = Object.keys(memoria.chequeoInicialEnviado || {}).filter(
    (k) => !k.startsWith("user_"),
  ).length;
  const seguimientos20h = Object.keys(
    memoria.seguimientoPruebaEnviado || {},
  ).filter((k) => !k.startsWith("user_")).length;

  console.log("📊 1. ESTADO GENERAL DE LA BASE DE DATOS Y SEGUIMIENTOS:");
  console.log(
    `   • Usuarios en SQLite (usuarios.db): ${metricasSQL.totalUsuarios}`,
  );
  console.log(
    `   • Pruebas registradas (Memoria / Tabla pruebas): ${
      Object.keys(credenciales).length
    } / ${metricasSQL.totalPruebasBD}`,
  );
  console.log(
    `   • Ventas / Suscripciones registradas en BD: ${metricasSQL.totalVentasBD}`,
  );
  console.log(
    `   • Incidentes técnicos registrados en BD: ${metricasSQL.totalIncidentesBD}`,
  );
  console.log(`   • Chequeos iniciales (30 min) gestionados: ${chequeos30m}`);
  console.log(
    `   • Seguimientos fin de prueba (20 hs) enviados: ${seguimientos20h}`,
  );
  if (registrosTelemetria.length > 0) {
    const autonomos = registrosTelemetria.filter(
      (r) => r.resueltoAutonomamente,
    ).length;
    const porRegla = registrosTelemetria.filter(
      (r) => r.metodoDeteccion === "REGLA",
    ).length;
    const silencios = registrosTelemetria.filter(
      (r) => r.funcionSeleccionada === "reaccionPulgarArriba",
    ).length;
    const pct = ((autonomos / registrosTelemetria.length) * 100).toFixed(1);
    console.log(
      `   • Telemetría en vivo: ${registrosTelemetria.length} eventos (${pct}% autónomos | ${porRegla} por regla 0ms | ${silencios} silencios 👍)`,
    );
  }
  console.log("");

  const casosResueltos = [];
  const casosAprendizajeOperador = [];
  const brechasRealesBot = [];

  for (const [idUsuario, mensajes] of Object.entries(historiales)) {
    if (botActual.esNumeroVIP(idUsuario)) continue;
    if (!Array.isArray(mensajes) || mensajes.length === 0) continue;

    const cred = credenciales[idUsuario] || null;
    const op = operadores[idUsuario] || cred?.operador || null;
    const datosPaso99 = infoPaso99[idUsuario] || null;
    const buzon = buzones[idUsuario] || [];

    if (op) {
      botActual.memoriaDisco.operadorDetectado[idUsuario] = op;
    }

    // A. Evaluar cada mensaje del CLIENTE contra ia.js actual
    for (let i = 0; i < mensajes.length; i++) {
      const msg = mensajes[i];
      if (!msg || msg.rol !== "CLIENTE") continue;

      const msgSiguiente = mensajes[i + 1] || null;
      const { pasoInferido, yaTuvoPrueba } = inferirPasoAntesDelMensaje(
        mensajes,
        i,
        cred,
      );

      const intencionHoy = await botActual.descubrirIntencionConIA(
        idUsuario,
        msg.texto,
        pasoInferido,
        yaTuvoPrueba,
        "",
      );

      const botFalloEnElPasado =
        msgSiguiente &&
        msgSiguiente.rol === "BOT" &&
        (msgSiguiente.texto.includes("no llegué a entender") ||
          msgSiguiente.texto.includes("no logré comprender") ||
          msgSiguiente.texto.includes("no logré interpretar") ||
          msgSiguiente.texto.includes("ATENCIÓN PERSONALIZADA") ||
          (msg.texto.toLowerCase().includes("probarlo") &&
            msgSiguiente.texto.includes("cuando estés probando")));

      const ventanaContexto = mensajes.slice(
        Math.max(0, i - 2),
        Math.min(mensajes.length, i + 4),
      );

      if (botFalloEnElPasado && intencionHoy !== "DESCONOCIDO") {
        casosResueltos.push({
          usuarioAnonimo: `USR_${idUsuario.slice(-4)}`,
          pasoExactoEnEseMomento: pasoInferido,
          yaTuvoPruebaEnEseMomento: yaTuvoPrueba,
          mensajeCliente: anonimizarTexto(msg.texto),
          respuestaAnteriorDelBot:
            anonimizarTexto(msgSiguiente.texto.slice(0, 95)) + "...",
          intencionActual: intencionHoy,
          hiloFormateado: formatearHiloConversacion(ventanaContexto),
        });
      } else if (
        intencionHoy === "DESCONOCIDO" &&
        msg.texto.trim().length > 2
      ) {
        brechasRealesBot.push({
          tipoCaso: "BRECHA_EN_MODO_BOT",
          usuarioAnonimo: `USR_${idUsuario.slice(-4)}`,
          paso: pasoInferido,
          yaTuvoPrueba,
          consultaCliente: anonimizarTexto(msg.texto),
          resolucionOperador: "Sin intervención de operador",
          intencionActual: intencionHoy,
          hiloFormateado: formatearHiloConversacion(ventanaContexto),
        });
      }
    }

    // B. Extraer aprendizajes de las conversaciones donde intervino el OPERADOR humano
    const mensajesOperador = mensajes.filter((m) => m.rol === "OPERADOR");
    if (mensajesOperador.length > 0 || datosPaso99) {
      const mensajesCliente = mensajes.filter((m) => m.rol === "CLIENTE");
      const ultimoMsgCliente =
        mensajesCliente.length > 0
          ? mensajesCliente[mensajesCliente.length - 1].texto
          : buzon[0]?.texto || "";

      const pasoReal = datosPaso99?.pasoPrevio || (cred ? 3 : 1);
      const intencionHoy = ultimoMsgCliente
        ? await botActual.descubrirIntencionConIA(
            idUsuario,
            ultimoMsgCliente,
            pasoReal,
            Boolean(cred),
            "",
          )
        : "SIN_TEXTO_CLIENTE";

      casosAprendizajeOperador.push({
        tipoCaso: "APRENDIZAJE_DE_OPERADOR",
        usuarioAnonimo: `USR_${idUsuario.slice(-4)}`,
        paso: pasoReal,
        yaTuvoPrueba: Boolean(cred),
        motivoPaso99: datosPaso99?.motivo || "Atención manual del operador",
        consultaCliente: anonimizarTexto(ultimoMsgCliente),
        resolucionOperador: mensajesOperador
          .map((m) => anonimizarTexto(m.texto))
          .join(" // "),
        intencionActual: intencionHoy,
        hiloFormateado: formatearHiloConversacion(mensajes),
      });
    }
  }

  // Impresión del diagnóstico en consola
  console.log(
    `✅ 2. FALLOS HISTÓRICOS YA RESUELTOS EN ia.js (${casosResueltos.length}):`,
  );
  if (casosResueltos.length === 0) {
    console.log("   • Ninguno registrado.\n");
  } else {
    for (const c of casosResueltos) {
      console.log(
        `   • [${c.usuarioAnonimo} | Paso ${c.pasoExactoEnEseMomento}] "${c.mensajeCliente}" ➔ Ahora detecta: 🎯 ${c.intencionActual}`,
      );
    }
    console.log("");
  }

  console.log(
    `👨‍💻 3. CONVERSACIONES CON INTERVENCIÓN DE OPERADOR (${casosAprendizajeOperador.length}):`,
  );
  for (const c of casosAprendizajeOperador) {
    console.log(
      `   • [${c.usuarioAnonimo} | Paso ${c.paso}] Cliente: "${c.consultaCliente}" | ia.js hoy: 🎯 ${c.intencionActual}`,
    );
  }
  console.log("");

  console.log(
    `⚠️ 4. BRECHAS EN MODO BOT (Mensajes con 'DESCONOCIDO': ${brechasRealesBot.length}):`,
  );
  if (brechasRealesBot.length === 0) {
    console.log(
      "   🚀 ¡0 BRECHAS DETECTADAS! Todos los mensajes de clientes del historial son comprendidos hoy por ia.js en 0 ms.\n",
    );
  } else {
    for (const b of brechasRealesBot) {
      console.log(
        `   • [${b.usuarioAnonimo} | Paso ${b.paso}] "${b.consultaCliente}"`,
      );
    }
    console.log("");
  }

  // Guardar reporte JSON y casos sugeridos
  const reporte = {
    fechaAuditoria: new Date().toISOString(),
    resumen: {
      totalConversacionesAuditadas: Object.keys(historiales).length,
      fallosHistoricosYaResueltos: casosResueltos.length,
      intervencionesDeOperadorAnalizadas: casosAprendizajeOperador.length,
      brechasRealesEnModoBot: brechasRealesBot.length,
      metricasSQL,
    },
    casosResueltos,
    casosAprendizajeOperador,
    brechasRealesBot,
  };

  fs.writeFileSync(PATH_REPORTE_JSON, JSON.stringify(reporte, null, 2), "utf8");
  fs.writeFileSync(
    PATH_CASOS_SUGERIDOS,
    JSON.stringify(brechasRealesBot, null, 2),
    "utf8",
  );
  console.log(`💾 Reporte actualizado en: reporte_auditoria_contextual.json\n`);

  // Consultar a Ollama solo si hay brechas o casos de operador por revisar
  const casosParaIA = [
    ...brechasRealesBot,
    ...casosAprendizajeOperador.filter(
      (c) => c.intencionActual === "DESCONOCIDO",
    ),
  ].slice(0, 4);

  if (casosParaIA.length > 0) {
    console.log(
      "============================================================================",
    );
    console.log(
      `🤖 5. RECOMENDACIONES DE OLLAMA POR MÓDULO (${casosParaIA.length} casos):`,
    );
    console.log(
      "============================================================================\n",
    );

    for (let i = 0; i < casosParaIA.length; i++) {
      const caso = casosParaIA[i];
      console.log(
        `🔎 Analizando ${caso.usuarioAnonimo} (Paso ${caso.paso})...`,
      );
      try {
        const respuestaIA = await analizarCasoConOllamaContextual(caso);
        console.log(respuestaIA);
        console.log(
          "----------------------------------------------------------------------------\n",
        );
      } catch (err) {
        console.log(
          `   ℹ️ Ollama no está activo en este momento (127.0.0.1:11434). El diagnóstico modular en JSON ya quedó guardado.\n`,
        );
        break;
      }
    }
  }
}

ejecutarAuditoriaContextual();
