const fs = require("fs");
const path = require("path");
const dbUtils = require("./db");
const { memoriaDisco } = require("./memoria");

const DIR_REPORTES = path.join(__dirname, "reportes_excel");

function formatearFechaHora(tsSegundos) {
  if (!tsSegundos) return "-";
  const d = new Date(tsSegundos * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// Sincroniza las pruebas que ya existían en memoria_bot.json hacia la tabla 'pruebas' de SQLite
async function sincronizarPruebasDeMemoriaABD() {
  const credenciales = memoriaDisco.credencialesEnviadas || {};
  const contactos = memoriaDisco.mapaContactos || {};
  const seguimientos = memoriaDisco.seguimientoPruebaEnviado || {};
  const soporte = memoriaDisco.soporteNivel1Enviado || {};

  for (const [idUsuario, cred] of Object.entries(credenciales)) {
    if (!cred || !cred.usuario) continue;
    const infoContacto = contactos[idUsuario] || {};
    const segEnviado = Boolean(
      seguimientos[idUsuario] || seguimientos[`user_${cred.usuario}`],
    );

    await dbUtils.registrarPruebaBD({
      numero: idUsuario,
      nombre: infoContacto.nombre || "Cliente",
      telefonoReal:
        infoContacto.telefonoReal ||
        (idUsuario.startsWith("54") ? idUsuario : ""),
      operador:
        cred.operador ||
        memoriaDisco.operadorDetectado?.[idUsuario] ||
        "personal",
      usuario: cred.usuario,
      password: cred.password || "",
      duracionHoras: cred.duracionHoras || 24,
      tsCreacion: cred.tsCreacion || Math.floor(Date.now() / 1000),
      seguimientoEnviado: segEnviado,
    });

    if (soporte[idUsuario]) {
      await dbUtils.marcarErrorEnPruebaBD(
        idUsuario,
        "Solicitó Soporte Nivel 1 en prueba",
      );
    }
  }
}

function aplicarEstiloEncabezado(fila, colorHex = "FF1E3A8A") {
  fila.height = 26;
  fila.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: colorHex },
    };
    cell.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
}

function aplicarColorFila(
  fila,
  colorFondoHex,
  colorTextoHex = "FF0F172A",
  negrita = false,
) {
  fila.height = 21;
  fila.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: colorFondoHex },
    };
    cell.font = {
      name: "Calibri",
      size: 10,
      bold: negrita,
      color: { argb: colorTextoHex },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
  });
}

async function generarExcelMensual(mesAnioOpcional = null) {
  let ExcelJS;
  try {
    ExcelJS = require("exceljs");
  } catch (e) {
    throw new Error(
      "Falta instalar la librería 'exceljs'. Ejecutá en tu terminal: npm install exceljs",
    );
  }

  if (!fs.existsSync(DIR_REPORTES)) {
    fs.mkdirSync(DIR_REPORTES, { recursive: true });
  }

  await sincronizarPruebasDeMemoriaABD();

  const datos = await dbUtils.obtenerDatosMesParaExcel(mesAnioOpcional);
  const { mesObjetivo, ventasMes, todasLasVentas, pruebasMes, incidentesMes } =
    datos;
  const ahoraSeg = Math.floor(Date.now() / 1000);

  // Calcular acumulado histórico por cliente (LTV)
  const acumuladoPorCliente = {};
  for (const v of todasLasVentas) {
    const k = v.telefono_real || v.numero;
    if (!acumuladoPorCliente[k]) {
      acumuladoPorCliente[k] = { totalGastado: 0, cantidadCompras: 0 };
    }
    acumuladoPorCliente[k].totalGastado += Number(v.precio) || 0;
    acumuladoPorCliente[k].cantidadCompras += 1;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bot MNet VPN";
  workbook.created = new Date();

  // ==========================================================================
  // HOJA 1: 📊 RESUMEN DEL MES
  // ==========================================================================
  const wsResumen = workbook.addWorksheet("📊 Resumen del Mes", {
    views: [{ showGridLines: true }],
  });

  const ventasSoloDeEsteMes = ventasMes.filter(
    (v) => v.mes_anio === mesObjetivo,
  );
  const ingresosTotalesMes = ventasSoloDeEsteMes.reduce(
    (acc, v) => acc + (Number(v.precio) || 0),
    0,
  );
  const ventasNuevasMes = ventasSoloDeEsteMes.filter(
    (v) => v.nro_contratacion === 1,
  );
  const renovacionesMes = ventasSoloDeEsteMes.filter(
    (v) => v.nro_contratacion > 1,
  );
  const ingresosNuevas = ventasNuevasMes.reduce(
    (acc, v) => acc + (Number(v.precio) || 0),
    0,
  );
  const ingresosRenovaciones = renovacionesMes.reduce(
    (acc, v) => acc + (Number(v.precio) || 0),
    0,
  );

  const clientesActivosHoy = ventasMes.filter(
    (v) => v.ts_vencimiento > ahoraSeg,
  ).length;
  const clientesPorVencer48h = ventasMes.filter(
    (v) =>
      v.ts_vencimiento > ahoraSeg && v.ts_vencimiento - ahoraSeg <= 48 * 3600,
  ).length;

  const totalPruebasMes = pruebasMes.length;
  const pruebasConvertidas = pruebasMes.filter(
    (p) => p.compro_plan === 1,
  ).length;
  const tasaConversion =
    totalPruebasMes > 0
      ? ((pruebasConvertidas / totalPruebasMes) * 100).toFixed(1) + "%"
      : "0%";

  wsResumen.columns = [
    {
      header: "INDICADOR / MÉTRICA DEL MES (" + mesObjetivo + ")",
      key: "metrica",
      width: 46,
    },
    { header: "VALOR ACTUAL", key: "valor", width: 25 },
    { header: "DETALLE / OBSERVACIÓN", key: "detalle", width: 45 },
  ];
  aplicarEstiloEncabezado(wsResumen.getRow(1), "FF0F172A");

  const filasResumen = [
    [
      "💰 Ingresos Totales del Mes (" + mesObjetivo + ")",
      ingresosTotalesMes,
      `${ventasSoloDeEsteMes.length} planes vendidos en el mes`,
      "FFD1FAE5",
      true,
      true,
    ],
    [
      "🆕 Ingresos por Clientes Nuevos (1ra compra)",
      ingresosNuevas,
      `${ventasNuevasMes.length} clientes nuevos este mes`,
      "FFF8FAFC",
      false,
      true,
    ],
    [
      "🔄 Ingresos por Renovaciones (Recontrataciones)",
      ingresosRenovaciones,
      `${renovacionesMes.length} renovaciones este mes`,
      "FFF8FAFC",
      false,
      true,
    ],
    [
      "🟢 Suscripciones Activas al Día de Hoy",
      clientesActivosHoy,
      "Clientes con servicio vigente ahora mismo",
      "FFDCFCE7",
      true,
      false,
    ],
    [
      "🟡 Suscripciones por Vencer (Próximas 48 hs)",
      clientesPorVencer48h,
      "Clientes a los que se les enviará aviso de renovación",
      "FFFEF9C3",
      true,
      false,
    ],
    [
      "🎁 Pruebas Gratuitas Entregadas en el Mes",
      totalPruebasMes,
      "Cuentas de 24 hs generadas en Veltrix",
      "FFE0F2FE",
      false,
      false,
    ],
    [
      "💳 Pruebas Convertidas en Venta",
      pruebasConvertidas,
      `Tasa de conversión del mes: ${tasaConversion}`,
      "FFD1FAE5",
      true,
      false,
    ],
    [
      "⚠️ Incidentes / Consultas de Soporte en el Mes",
      incidentesMes.length,
      "Registrados en la pestaña 'Errores e Incidentes'",
      "FFFEE2E2",
      false,
      false,
    ],
  ];

  for (const [metrica, valor, detalle, color, bold, esMoneda] of filasResumen) {
    const r = wsResumen.addRow({ metrica, valor, detalle });
    aplicarColorFila(r, color, "FF0F172A", bold);
    r.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    r.getCell(3).alignment = { vertical: "middle", horizontal: "left" };
    if (esMoneda) {
      r.getCell(2).numFmt = '"$"#,##0';
    }
  }

  // ==========================================================================
  // HOJA 2: 💰 VENTAS Y SUSCRIPCIONES
  // ==========================================================================
  const wsVentas = workbook.addWorksheet("💰 Ventas y Suscripciones", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  wsVentas.columns = [
    { header: "ID", key: "id", width: 7 },
    { header: "Mes", key: "mes", width: 10 },
    { header: "Estado Actual", key: "estado", width: 18 },
    { header: "Tipo de Operación", key: "tipo", width: 20 },
    { header: "Nombre Cliente", key: "nombre", width: 24 },
    { header: "Teléfono / ID", key: "telefono", width: 18 },
    { header: "Operador", key: "operador", width: 12 },
    { header: "Usuario VPN", key: "usuario", width: 16 },
    { header: "Contraseña", key: "password", width: 16 },
    { header: "Plan", key: "plan", width: 12 },
    { header: "Precio ($)", key: "precio", width: 14 },
    { header: "Fecha de Compra", key: "fechaCompra", width: 19 },
    { header: "Fecha Vencimiento", key: "fechaVenc", width: 19 },
    { header: "Días Usados", key: "diasUsados", width: 13 },
    { header: "Días Restantes", key: "diasRestantes", width: 15 },
    { header: "N° Compras", key: "nroCompras", width: 13 },
    { header: "Total Histórico ($)", key: "ltv", width: 18 },
  ];

  aplicarEstiloEncabezado(wsVentas.getRow(1), "FF065F46");
  wsVentas.autoFilter = "A1:Q1";

  for (const v of ventasMes) {
    const segTranscurridos = Math.max(0, ahoraSeg - (v.ts_compra || ahoraSeg));
    const segRestantes = (v.ts_vencimiento || ahoraSeg) - ahoraSeg;
    const diasUsados = Math.floor(segTranscurridos / 86400);
    const diasRestantes = Math.ceil(segRestantes / 86400);

    let estadoTexto = "🟢 ACTIVO";
    let colorFondo = "FFDCFCE7"; // Verde suave
    if (segRestantes <= 0) {
      estadoTexto = "🔴 VENCIDO";
      colorFondo = "FFFEE2E2"; // Rojo suave
    } else if (segRestantes <= 48 * 3600) {
      estadoTexto = "🟡 POR VENCER";
      colorFondo = "FFFEF9C3"; // Amarillo suave
    }

    const claveCliente = v.telefono_real || v.numero;
    const statsCliente = acumuladoPorCliente[claveCliente] || {
      totalGastado: v.precio,
      cantidadCompras: v.nro_contratacion || 1,
    };

    const telMostrar = v.telefono_real || v.numero;
    const row = wsVentas.addRow({
      id: v.id,
      mes: v.mes_anio,
      estado: estadoTexto,
      tipo: v.tipo_operacion || "🆕 NUEVA VENTA",
      nombre: v.nombre,
      telefono: telMostrar,
      operador: String(v.operador || "personal").toUpperCase(),
      usuario: v.usuario_vpn,
      password: v.password_vpn,
      plan: `${v.dias_plan} días`,
      precio: Number(v.precio) || 0,
      fechaCompra: formatearFechaHora(v.ts_compra),
      fechaVenc: formatearFechaHora(v.ts_vencimiento),
      diasUsados: `${diasUsados} d`,
      diasRestantes:
        diasRestantes > 0
          ? `Quedan ${diasRestantes} d`
          : `Venció hace ${Math.abs(diasRestantes)} d`,
      nroCompras: statsCliente.cantidadCompras,
      ltv: statsCliente.totalGastado,
    });

    aplicarColorFila(row, colorFondo, "FF0F172A", false);
    row.getCell("precio").numFmt = '"$"#,##0';
    row.getCell("ltv").numFmt = '"$"#,##0';
    row.getCell("estado").font = { name: "Calibri", size: 10, bold: true };
  }

  // ==========================================================================
  // HOJA 3: 🎁 PRUEBAS ENTREGADAS
  // ==========================================================================
  const wsPruebas = workbook.addWorksheet("🎁 Pruebas Entregadas", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  wsPruebas.columns = [
    { header: "ID", key: "id", width: 7 },
    { header: "Fecha de Entrega", key: "fechaEntrega", width: 19 },
    { header: "Nombre en WA", key: "nombre", width: 24 },
    { header: "Teléfono / ID", key: "telefono", width: 19 },
    { header: "Operador", key: "operador", width: 12 },
    { header: "Usuario Prueba", key: "usuario", width: 16 },
    { header: "Contraseña", key: "password", width: 16 },
    { header: "Vencimiento (24h)", key: "fechaVenc", width: 19 },
    { header: "Estado de la Prueba", key: "estado", width: 22 },
    { header: "Seguimiento 20h", key: "seguimiento", width: 17 },
    { header: "¿Tuvo Error?", key: "error", width: 26 },
    { header: "¿Compró Plan?", key: "compro", width: 18 },
  ];

  aplicarEstiloEncabezado(wsPruebas.getRow(1), "FF1E40AF");
  wsPruebas.autoFilter = "A1:L1";

  for (const p of pruebasMes) {
    const sigueActiva = (p.ts_vencimiento || 0) > ahoraSeg;
    let estadoPrueba = sigueActiva
      ? "🟢 EN CURSO (<24h)"
      : "⚪ FINALIZADA (24h)";
    let colorFila = sigueActiva ? "FFE0F2FE" : "FFF8FAFC";

    if (p.compro_plan === 1) {
      estadoPrueba = "💳 ¡CONVERTIDA EN VENTA!";
      colorFila = "FFDCFCE7";
    } else if (p.tuvo_error === 1) {
      colorFila = "FFFEF9C3";
    }

    const row = wsPruebas.addRow({
      id: p.id,
      fechaEntrega: formatearFechaHora(p.ts_creacion),
      nombre: p.nombre,
      telefono: p.telefono_real || p.numero,
      operador: String(p.operador || "personal").toUpperCase(),
      usuario: p.usuario_vpn,
      password: p.password_vpn,
      fechaVenc: formatearFechaHora(p.ts_vencimiento),
      estado: estadoPrueba,
      seguimiento: p.seguimiento_enviado === 1 ? "✅ Enviado" : "⏳ Pendiente",
      error:
        p.tuvo_error === 1
          ? `⚠️ ${p.detalle_error || "Reportó fallo"}`
          : "Sin problemas",
      compro: p.compro_plan === 1 ? "💳 ¡SÍ COMPRÓ!" : "Aún no",
    });

    aplicarColorFila(row, colorFila, "FF0F172A", p.compro_plan === 1);
  }

  // ==========================================================================
  // HOJA 4: ⚠️ ERRORES E INCIDENTES
  // ==========================================================================
  const wsIncidentes = workbook.addWorksheet("⚠️ Errores e Incidentes", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  wsIncidentes.columns = [
    { header: "ID", key: "id", width: 7 },
    { header: "Fecha y Hora", key: "fecha", width: 19 },
    { header: "Cliente", key: "nombre", width: 22 },
    { header: "Teléfono / ID", key: "telefono", width: 18 },
    { header: "Operador", key: "operador", width: 12 },
    { header: "Paso", key: "paso", width: 10 },
    { header: "Tipo de Incidente", key: "tipo", width: 26 },
    { header: "Mensaje / Detalle del Cliente", key: "detalle", width: 45 },
    { header: "Resolución", key: "resolucion", width: 22 },
  ];

  aplicarEstiloEncabezado(wsIncidentes.getRow(1), "FF991B1B");
  wsIncidentes.autoFilter = "A1:I1";

  for (const inc of incidentesMes) {
    const row = wsIncidentes.addRow({
      id: inc.id,
      fecha: formatearFechaHora(inc.ts_incidente),
      nombre: inc.nombre,
      telefono: inc.telefono_real || inc.numero,
      operador: String(inc.operador || "personal").toUpperCase(),
      paso: `Paso ${inc.paso}`,
      tipo: inc.tipo_incidente,
      detalle: inc.detalle,
      resolucion: inc.resolucion,
    });
    const colorInc = inc.resolucion.includes("BOT") ? "FFFEF9C3" : "FFFEE2E2";
    aplicarColorFila(row, colorInc, "FF0F172A", false);
    row.getCell("detalle").alignment = {
      vertical: "middle",
      horizontal: "left",
    };
  }

  const nombreArchivo = `MNet_Control_${mesObjetivo}.xlsx`;
  const rutaCompleta = path.join(DIR_REPORTES, nombreArchivo);
  await workbook.xlsx.writeFile(rutaCompleta);

  return {
    rutaCompleta,
    nombreArchivo,
    resumen: {
      mesObjetivo,
      ingresosTotalesMes,
      ventasTotalesMes: ventasSoloDeEsteMes.length,
      renovacionesMes: renovacionesMes.length,
      clientesActivosHoy,
      totalPruebasMes,
      pruebasConvertidas,
      tasaConversion,
    },
  };
}

module.exports = {
  generarExcelMensual,
  sincronizarPruebasDeMemoriaABD,
  formatearFechaHora,
};
