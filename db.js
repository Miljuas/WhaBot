const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Ruta de la base de datos
const dbPath = path.join(__dirname, "usuarios.db");

// Precios oficiales por cantidad de días
const PRECIOS_POR_DIAS = {
  3: 2000,
  7: 3000,
  15: 5000,
  30: 7000,
};

function calcularPrecioPlan(dias) {
  const d = Number(dias) || 30;
  if (PRECIOS_POR_DIAS[d]) return PRECIOS_POR_DIAS[d];
  return Math.round((d / 30) * 7000);
}

function obtenerMesAnioActual(tsSegundos = null) {
  const fecha = tsSegundos ? new Date(tsSegundos * 1000) : new Date();
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${anio}-${mes}`;
}

// Crear conexión a BD
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error al conectar a BD:", err);
  } else {
    console.log("✅ Base de datos conectada");
    inicializarBD();
  }
});

// ============================================================================
// INICIALIZAR BASE DE DATOS (TABLAS: USUARIOS, PRUEBAS, VENTAS, INCIDENTES)
// ============================================================================
function inicializarBD() {
  db.serialize(() => {
    // 1. Tabla original de usuarios
    db.run(
      `
      CREATE TABLE IF NOT EXISTS usuarios (
        numero TEXT PRIMARY KEY,
        paso_flujo INTEGER DEFAULT 0,
        prueba_enviada INTEGER DEFAULT 0,
        es_cliente INTEGER DEFAULT 0,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_ultima_actualiza DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
      (err) => {
        if (err) console.error("Error al crear tabla usuarios:", err);
      },
    );

    // 2. Tabla de pruebas entregadas
    db.run(
      `
      CREATE TABLE IF NOT EXISTS pruebas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mes_anio TEXT,
        numero TEXT,
        nombre TEXT,
        telefono_real TEXT,
        operador TEXT,
        usuario_vpn TEXT UNIQUE,
        password_vpn TEXT,
        duracion_horas INTEGER DEFAULT 24,
        ts_creacion INTEGER,
        ts_vencimiento INTEGER,
        seguimiento_enviado INTEGER DEFAULT 0,
        tuvo_error INTEGER DEFAULT 0,
        detalle_error TEXT DEFAULT '',
        compro_plan INTEGER DEFAULT 0,
        estado TEXT DEFAULT 'ACTIVA'
      )
    `,
      (err) => {
        if (err) console.error("Error al crear tabla pruebas:", err);
      },
    );

    // 3. Tabla de ventas y renovaciones
    db.run(
      `
      CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mes_anio TEXT,
        numero TEXT,
        nombre TEXT,
        telefono_real TEXT,
        operador TEXT,
        usuario_vpn TEXT,
        password_vpn TEXT,
        dias_plan INTEGER,
        precio INTEGER,
        tipo_operacion TEXT,
        nro_contratacion INTEGER DEFAULT 1,
        ts_compra INTEGER,
        ts_vencimiento INTEGER,
        recordatorio_enviado INTEGER DEFAULT 0,
        notas TEXT DEFAULT ''
      )
    `,
      (err) => {
        if (err) console.error("Error al crear tabla ventas:", err);
      },
    );

    // 4. Tabla de errores e incidentes mensuales
    db.run(
      `
      CREATE TABLE IF NOT EXISTS incidentes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mes_anio TEXT,
        numero TEXT,
        nombre TEXT,
        telefono_real TEXT,
        operador TEXT,
        paso INTEGER,
        tipo_incidente TEXT,
        detalle TEXT,
        resolucion TEXT,
        ts_incidente INTEGER
      )
    `,
      (err) => {
        if (err) console.error("Error al crear tabla incidentes:", err);
      },
    );
  });
}

// ============================================================================
// FUNCIONES ORIGINALES DE GESTIÓN DE USUARIOS
// ============================================================================
async function crearUsuario(numero) {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT OR IGNORE INTO usuarios (numero, paso_flujo, prueba_enviada, es_cliente) VALUES (?, ?, ?, ?)",
      [numero, 0, 0, 0],
      function (err) {
        if (err) {
          console.error(`Error al crear usuario ${numero}:`, err);
          reject(err);
        } else {
          resolve({ numero, changes: this.changes });
        }
      },
    );
  });
}

async function getUsuario(numero) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM usuarios WHERE numero = ?", [numero], (err, row) => {
      if (err) {
        console.error(`Error al obtener usuario ${numero}:`, err);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

async function actualizarPaso(numero, paso) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE usuarios SET paso_flujo = ?, fecha_ultima_actualiza = CURRENT_TIMESTAMP WHERE numero = ?",
      [paso, numero],
      function (err) {
        if (err) {
          console.error(`Error al actualizar paso de ${numero}:`, err);
          reject(err);
        } else {
          resolve({ numero, paso, changes: this.changes });
        }
      },
    );
  });
}

async function marcarPruebaEnviada(numero) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE usuarios SET prueba_enviada = 1, paso_flujo = 3, fecha_ultima_actualiza = CURRENT_TIMESTAMP WHERE numero = ?",
      [numero],
      function (err) {
        if (err) {
          console.error(`Error al marcar prueba enviada de ${numero}:`, err);
          reject(err);
        } else {
          resolve({ numero, changes: this.changes });
        }
      },
    );
  });
}

async function marcarPruebaNoEnviada(numero) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE usuarios SET prueba_enviada = 0, paso_flujo = 0, fecha_ultima_actualiza = CURRENT_TIMESTAMP WHERE numero = ?",
      [numero],
      function (err) {
        if (err) {
          console.error(`Error al marcar prueba no enviada de ${numero}:`, err);
          reject(err);
        } else {
          resolve({ numero, changes: this.changes });
        }
      },
    );
  });
}

async function marcarComoCliente(numero) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE usuarios SET es_cliente = 1, fecha_ultima_actualiza = CURRENT_TIMESTAMP WHERE numero = ?",
      [numero],
      function (err) {
        if (err) {
          console.error(`Error al marcar cliente ${numero}:`, err);
          reject(err);
        } else {
          resolve({ numero, changes: this.changes });
        }
      },
    );
  });
}

// ============================================================================
// NUEVAS FUNCIONES: GESTIÓN DE PRUEBAS, VENTAS, RENOVACIONES E INCIDENTES
// ============================================================================

async function registrarPruebaBD(datos) {
  const tsCreacion = datos.tsCreacion || Math.floor(Date.now() / 1000);
  const duracionHoras = datos.duracionHoras || 24;
  const tsVencimiento = tsCreacion + duracionHoras * 3600;
  const mesAnio = obtenerMesAnioActual(tsCreacion);

  return new Promise((resolve) => {
    db.run(
      `INSERT OR IGNORE INTO pruebas (
        mes_anio, numero, nombre, telefono_real, operador,
        usuario_vpn, password_vpn, duracion_horas, ts_creacion,
        ts_vencimiento, seguimiento_enviado, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mesAnio,
        String(datos.numero || ""),
        String(datos.nombre || "Cliente"),
        datos.telefonoReal ? String(datos.telefonoReal) : "",
        String(datos.operador || "personal"),
        String(datos.usuario || ""),
        String(datos.password || ""),
        duracionHoras,
        tsCreacion,
        tsVencimiento,
        datos.seguimientoEnviado ? 1 : 0,
        "ACTIVA",
      ],
      function (err) {
        if (err) {
          console.error("Error en registrarPruebaBD:", err.message);
          resolve(null);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      },
    );
  });
}

async function marcarSeguimientoPruebaBD(numero, usuarioVpn) {
  return new Promise((resolve) => {
    db.run(
      `UPDATE pruebas SET seguimiento_enviado = 1 WHERE numero = ? OR usuario_vpn = ?`,
      [String(numero || ""), String(usuarioVpn || "")],
      function () {
        resolve(true);
      },
    );
  });
}

async function marcarErrorEnPruebaBD(numero, detalleError) {
  return new Promise((resolve) => {
    db.run(
      `UPDATE pruebas SET tuvo_error = 1, detalle_error = ? WHERE numero = ?`,
      [String(detalleError || "").slice(0, 200), String(numero || "")],
      function () {
        resolve(true);
      },
    );
  });
}

async function registrarIncidenteBD(datos) {
  const ts = datos.ts || Math.floor(Date.now() / 1000);
  const mesAnio = obtenerMesAnioActual(ts);

  if (datos.numero && datos.tipoIncidente !== "POSIBLE_COMPROBANTE") {
    await marcarErrorEnPruebaBD(
      datos.numero,
      `${datos.tipoIncidente}: ${datos.detalle || ""}`,
    );
  }

  return new Promise((resolve) => {
    db.run(
      `INSERT INTO incidentes (
        mes_anio, numero, nombre, telefono_real, operador,
        paso, tipo_incidente, detalle, resolucion, ts_incidente
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mesAnio,
        String(datos.numero || ""),
        String(datos.nombre || "Cliente"),
        datos.telefonoReal ? String(datos.telefonoReal) : "",
        String(datos.operador || "personal"),
        Number(datos.paso || 0),
        String(datos.tipoIncidente || "SOPORTE"),
        String(datos.detalle || "").slice(0, 300),
        String(datos.resolucion || "BOT"),
        ts,
      ],
      function (err) {
        if (err) {
          console.error("Error en registrarIncidenteBD:", err.message);
          resolve(null);
        } else {
          resolve({ id: this.lastID });
        }
      },
    );
  });
}

// Obtiene todas las ventas previas de un mismo cliente (por número o por teléfono real)
async function obtenerHistorialVentasCliente(numero, telefonoReal = null) {
  return new Promise((resolve) => {
    const numStr = String(numero || "");
    const telStr = telefonoReal ? String(telefonoReal) : numStr;
    db.all(
      `SELECT * FROM ventas WHERE numero = ? OR (telefono_real != '' AND telefono_real = ?) ORDER BY ts_compra ASC`,
      [numStr, telStr],
      (err, rows) => {
        if (err || !rows) resolve([]);
        else resolve(rows);
      },
    );
  });
}

// Registra una venta nueva o una renovación sumando días si tenía plan vigente
async function registrarVentaBD(datos) {
  const ahoraSeg = Math.floor(Date.now() / 1000);
  const mesAnio = obtenerMesAnioActual(ahoraSeg);
  const diasPlan = Number(datos.diasPlan) || 30;
  const precio = datos.precio
    ? Number(datos.precio)
    : calcularPrecioPlan(diasPlan);
  const numero = String(datos.numero || "");
  const telefonoReal = datos.telefonoReal ? String(datos.telefonoReal) : "";

  const ventasPrevias = await obtenerHistorialVentasCliente(
    numero,
    telefonoReal,
  );
  const nroContratacion = ventasPrevias.length + 1;
  const tipoOperacion =
    nroContratacion === 1
      ? "🆕 NUEVA VENTA"
      : `🔄 RENOVACIÓN #${nroContratacion}`;

  // Verificar si tenía una suscripción aún vigente para sumarle los días sin que pierda tiempo
  let baseInicioSeg = ahoraSeg;
  let diasSumadosDePlanPrevio = 0;
  if (ventasPrevias.length > 0) {
    const ultimaVenta = ventasPrevias[ventasPrevias.length - 1];
    if (ultimaVenta.ts_vencimiento && ultimaVenta.ts_vencimiento > ahoraSeg) {
      baseInicioSeg = ultimaVenta.ts_vencimiento;
      diasSumadosDePlanPrevio = Math.ceil(
        (ultimaVenta.ts_vencimiento - ahoraSeg) / 86400,
      );
    }
  }

  const tsVencimiento = baseInicioSeg + diasPlan * 86400;
  const totalInvertidoPrevio = ventasPrevias.reduce(
    (acc, v) => acc + (Number(v.precio) || 0),
    0,
  );
  const totalInvertidoHistorico = totalInvertidoPrevio + precio;

  // Marcar al usuario como cliente en la tabla usuarios y su prueba como convertida
  await crearUsuario(numero);
  await marcarComoCliente(numero);
  await new Promise((r) =>
    db.run(
      `UPDATE pruebas SET compro_plan = 1, estado = 'COMPRÓ PLAN' WHERE numero = ? OR (telefono_real != '' AND telefono_real = ?)`,
      [numero, telefonoReal || numero],
      () => r(),
    ),
  );

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO ventas (
        mes_anio, numero, nombre, telefono_real, operador,
        usuario_vpn, password_vpn, dias_plan, precio,
        tipo_operacion, nro_contratacion, ts_compra, ts_vencimiento,
        recordatorio_enviado, notas
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        mesAnio,
        numero,
        String(datos.nombre || "Cliente"),
        telefonoReal,
        String(datos.operador || "personal"),
        String(datos.usuarioVpn || ""),
        String(datos.passwordVpn || ""),
        diasPlan,
        precio,
        tipoOperacion,
        nroContratacion,
        ahoraSeg,
        tsVencimiento,
        String(datos.notas || ""),
      ],
      function (err) {
        if (err) {
          console.error("Error al registrar venta en BD:", err.message);
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            mesAnio,
            numero,
            nombre: datos.nombre || "Cliente",
            telefonoReal,
            operador: datos.operador || "personal",
            usuarioVpn: datos.usuarioVpn,
            passwordVpn: datos.passwordVpn,
            diasPlan,
            precio,
            tipoOperacion,
            nroContratacion,
            tsCompra: ahoraSeg,
            tsVencimiento,
            diasSumadosDePlanPrevio,
            totalInvertidoHistorico,
          });
        }
      },
    );
  });
}

// Devuelve la suscripción paga más reciente del cliente (si tiene)
async function obtenerSuscripcionCliente(numero, telefonoReal = null) {
  const historial = await obtenerHistorialVentasCliente(numero, telefonoReal);
  if (historial.length === 0) return null;
  const ultima = historial[historial.length - 1];
  const ahoraSeg = Math.floor(Date.now() / 1000);
  const segundosRestantes = ultima.ts_vencimiento - ahoraSeg;
  const diasRestantes = Math.ceil(segundosRestantes / 86400);

  return {
    ...ultima,
    activa: segundosRestantes > 0,
    diasRestantes,
    nroContrataciones: historial.length,
    totalInvertido: historial.reduce(
      (acc, v) => acc + (Number(v.precio) || 0),
      0,
    ),
  };
}

// Obtiene la última venta de cada cliente para evaluar vencimientos y recordatorios
async function obtenerEstadoSuscripcionesActuales() {
  return new Promise((resolve) => {
    db.all(
      `SELECT v.* FROM ventas v
       INNER JOIN (
         SELECT numero, MAX(ts_vencimiento) as max_venc
         FROM ventas
         GROUP BY numero
       ) ult ON v.numero = ult.numero AND v.ts_vencimiento = ult.max_venc
       ORDER BY v.ts_vencimiento ASC`,
      (err, rows) => {
        if (err || !rows) resolve([]);
        else resolve(rows);
      },
    );
  });
}

async function marcarRecordatorioVentaEnviado(idVenta) {
  return new Promise((resolve) => {
    db.run(
      `UPDATE ventas SET recordatorio_enviado = 1 WHERE id = ?`,
      [idVenta],
      () => resolve(true),
    );
  });
}

// Consulta integral para armar el Excel de un mes específico (ej: "2026-11")
async function obtenerDatosMesParaExcel(mesAnio = null) {
  const mesObjetivo = mesAnio || obtenerMesAnioActual();
  const ahoraSeg = Math.floor(Date.now() / 1000);

  // 1. Ventas del mes + clientes de meses anteriores cuya suscripción sigue activa hoy
  const ventasMes = await new Promise((resolve) => {
    db.all(
      `SELECT * FROM ventas WHERE mes_anio = ? OR ts_vencimiento >= ? ORDER BY ts_compra DESC`,
      [mesObjetivo, ahoraSeg],
      (err, rows) => resolve(rows || []),
    );
  });

  // 2. Todas las ventas históricas para calcular LTV (total gastado por cliente)
  const todasLasVentas = await new Promise((resolve) => {
    db.all(`SELECT * FROM ventas ORDER BY ts_compra ASC`, (err, rows) =>
      resolve(rows || []),
    );
  });

  // 3. Pruebas del mes
  const pruebasMes = await new Promise((resolve) => {
    db.all(
      `SELECT * FROM pruebas WHERE mes_anio = ? ORDER BY ts_creacion DESC`,
      [mesObjetivo],
      (err, rows) => resolve(rows || []),
    );
  });

  // 4. Incidentes del mes
  const incidentesMes = await new Promise((resolve) => {
    db.all(
      `SELECT * FROM incidentes WHERE mes_anio = ? ORDER BY ts_incidente DESC`,
      [mesObjetivo],
      (err, rows) => resolve(rows || []),
    );
  });

  return {
    mesObjetivo,
    ventasMes,
    todasLasVentas,
    pruebasMes,
    incidentesMes,
  };
}

// ============================================================================
// FUNCIONES DE ESTADÍSTICAS GENERALES
// ============================================================================
async function contarUsuariosConPrueba() {
  return new Promise((resolve) => {
    db.get(
      "SELECT COUNT(*) as total FROM usuarios WHERE prueba_enviada = 1",
      (err, row) => {
        resolve(row?.total || 0);
      },
    );
  });
}

async function contarUsuariosEnFlujo() {
  return new Promise((resolve) => {
    db.get(
      "SELECT COUNT(*) as total FROM usuarios WHERE prueba_enviada = 0 AND es_cliente = 0",
      (err, row) => {
        resolve(row?.total || 0);
      },
    );
  });
}

async function contarUsuariosClientes() {
  return new Promise((resolve) => {
    db.get(
      "SELECT COUNT(*) as total FROM usuarios WHERE es_cliente = 1",
      (err, row) => {
        resolve(row?.total || 0);
      },
    );
  });
}

async function contarUsuariosTotales() {
  return new Promise((resolve) => {
    db.get("SELECT COUNT(*) as total FROM usuarios", (err, row) => {
      resolve(row?.total || 0);
    });
  });
}

async function obtenerEstadisticas() {
  const total = await contarUsuariosTotales();
  const conPrueba = await contarUsuariosConPrueba();
  const enFlujo = await contarUsuariosEnFlujo();
  const clientes = await contarUsuariosClientes();
  return { total, conPrueba, enFlujo, clientes };
}

async function obtenerTodosLosUsuarios() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM usuarios ORDER BY fecha_creacion DESC",
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      },
    );
  });
}

async function obtenerUsuariosEnPaso(paso) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM usuarios WHERE paso_flujo = ?",
      [paso],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      },
    );
  });
}

async function eliminarUsuario(numero) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM usuarios WHERE numero = ?", [numero], function (err) {
      if (err) reject(err);
      else resolve({ numero, changes: this.changes });
    });
  });
}

async function limpiarBD() {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM usuarios", function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
}

function cerrarBD() {
  db.close();
}

module.exports = {
  PRECIOS_POR_DIAS,
  calcularPrecioPlan,
  obtenerMesAnioActual,
  crearUsuario,
  getUsuario,
  actualizarPaso,
  marcarPruebaEnviada,
  marcarPruebaNoEnviada,
  marcarComoCliente,
  registrarPruebaBD,
  marcarSeguimientoPruebaBD,
  marcarErrorEnPruebaBD,
  registrarIncidenteBD,
  registrarVentaBD,
  obtenerSuscripcionCliente,
  obtenerEstadoSuscripcionesActuales,
  marcarRecordatorioVentaEnviado,
  obtenerDatosMesParaExcel,
  contarUsuariosConPrueba,
  contarUsuariosEnFlujo,
  contarUsuariosClientes,
  contarUsuariosTotales,
  obtenerEstadisticas,
  obtenerTodosLosUsuarios,
  obtenerUsuariosEnPaso,
  eliminarUsuario,
  limpiarBD,
  cerrarBD,
  db,
};
