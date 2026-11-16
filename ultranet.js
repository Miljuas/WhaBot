// ultranet.js
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Lector nativo de .env (sin necesidad de instalar paquetes extra)
function cargarEnvLocal() {
  try {
    const envPath = path.join(__dirname, ".env");
    if (!fs.existsSync(envPath)) return;
    const lineas = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const linea of lineas) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith("#")) continue;
      const idx = limpia.indexOf("=");
      if (idx === -1) continue;
      const clave = limpia.slice(0, idx).trim();
      const valor = limpia
        .slice(idx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (clave && !process.env[clave]) {
        process.env[clave] = valor;
      }
    }
  } catch (e) {}
}

cargarEnvLocal();

// ==== TUS DATOS DEL PANEL VELTRIX ====
const ULTRANET_API_BASE = (
  process.env.ULTRANET_API_BASE || "https://veltrix.walnet.ar/api"
).replace(/\/+$/, "");
const ULTRANET_API_TOKEN =
  process.env.ULTRANET_API_TOKEN ||
  "veltrix_pub_8de29dfd9674593c344cf7a0e3b82234117f0936d2a28b5a";
const ULTRANET_SLUG = process.env.ULTRANET_SLUG || "5e08064e458f3f39";

const DURACION_PRUEBA_HORAS = 24;

// Prefijos para generar Usuario y Contraseña fáciles con 4 números al azar:
// Ejemplo resultante -> Usuario: mnet4829 | Contraseña: clave7391
const PREFIJO_USUARIO_PRUEBA = process.env.ULTRANET_USER_PREFIX || "mnet";
const PREFIJO_PASSWORD_PRUEBA = process.env.ULTRANET_PASS_PREFIX || "mnet";

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Genera un usuario fácil en minúsculas + 4 dígitos al azar (ej: "mnet4829")
function generarUsuarioFacil() {
  const prefijo =
    String(PREFIJO_USUARIO_PRUEBA || "mnet")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase() || "mnet";
  const numAleatorio = Math.floor(1000 + Math.random() * 9000);
  return `${prefijo}${numAleatorio}`.slice(0, 20);
}

// Genera una contraseña fácil en minúsculas + 4 dígitos al azar (ej: "clave7391", mín. 6 caracteres)
function generarPasswordFacil() {
  let prefijo =
    String(PREFIJO_PASSWORD_PRUEBA || "clave")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase() || "clave";
  if (prefijo.length < 2) {
    prefijo = prefijo.padEnd(2, "x");
  }
  const numAleatorio = Math.floor(1000 + Math.random() * 9000);
  return `${prefijo}${numAleatorio}`.slice(0, 20);
}

// 1. GET /api/public/test/{slug}/config — Consulta si las pruebas están activas, duración y cooldown
async function obtenerConfigPruebaUltraNet() {
  const BASE = `${ULTRANET_API_BASE}/public`;
  const SLUG = String(ULTRANET_SLUG || "").trim();
  const TOKEN = String(ULTRANET_API_TOKEN || "").trim();

  try {
    const response = await axios({
      method: "get",
      url: `${BASE}/test/${encodeURIComponent(SLUG)}/config`,
      headers: {
        "X-Public-Api-Token": TOKEN,
        Accept: "application/json",
      },
      timeout: 10000,
    });
    return response?.data?.data || response?.data || null;
  } catch (error) {
    console.error("[UltraNet] ⚠️ Error consultando config:", error.message);
    return null;
  }
}

// 2. POST /api/public/test/{slug}/create-direct — Crea la prueba con usuario y contraseña fáciles
async function generarCredencialPruebaUltraNet() {
  const BASE = `${ULTRANET_API_BASE}/public`;
  const SLUG = String(ULTRANET_SLUG || "").trim();
  const TOKEN = String(ULTRANET_API_TOKEN || "").trim();

  if (!TOKEN || TOKEN.includes("PEGA_ACA")) {
    console.error(
      "[UltraNet] ❌ Falta configurar tu ULTRANET_API_TOKEN real en .env o ultranet.js",
    );
    return null;
  }

  const headers = {
    "X-Public-Api-Token": TOKEN,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 Hermes Bot/2.0",
  };

  const url = `${BASE}/test/${encodeURIComponent(SLUG)}/create-direct`;

  // Hasta 3 intentos:
  // Intento 1 y 2: envía usuario ("mnetXXXX") + contraseña ("claveYYYY").
  // Intento 3 (fallback si hubiera colisión 409): deja usuario aleatorio de Veltrix pero mantiene contraseña ("claveYYYY").
  for (let intento = 1; intento <= 3; intento++) {
    const usuarioPropuesto = intento <= 2 ? generarUsuarioFacil() : "";
    const passwordPropuesto = generarPasswordFacil();

    const bodyData = {
      include_v2ray: true,
      validity_hours: DURACION_PRUEBA_HORAS,
      password: passwordPropuesto,
    };

    if (usuarioPropuesto) {
      bodyData.username = usuarioPropuesto;
    }

    try {
      const response = await axios({
        method: "post",
        url,
        headers,
        timeout: 15000,
        data: bodyData,
      });

      const payload = response?.data?.data || response?.data || {};

      if (payload.username && payload.password) {
        console.log(
          `[UltraNet] ✅ Cuenta fácil creada (Intento ${intento}): User=${payload.username} | Pass=${payload.password}`,
        );
        return {
          usuario: String(payload.username),
          password: String(payload.password),
          duracionHoras: payload.validity_hours || DURACION_PRUEBA_HORAS,
          expires_at: payload.expires_at || null,
          source: "api",
        };
      }

      console.warn(
        `[UltraNet] ⚠️ Respuesta sin credenciales (Intento ${intento}): ${JSON.stringify(payload)}`,
      );
    } catch (error) {
      const status = error?.response?.status || "ERR";
      const rawMessage = error?.response?.data || error?.message || "error";
      const message =
        typeof rawMessage === "string"
          ? rawMessage
          : JSON.stringify(rawMessage);

      // Si es HTTP 409 (Usuário já está em uso), reintenta enseguida con otro número sin esperar 2s
      if (status === 409) {
        console.warn(
          `[UltraNet] 🔄 Usuario ${usuarioPropuesto} ya estaba en uso (409). Probando otro...`,
        );
        continue;
      }

      console.error(
        `[UltraNet] ❌ Error en intento ${intento} (${status}): ${message}`,
      );

      // Si es error 401/403 (token inválido), no tiene sentido reintentar
      if (status === 401 || status === 403) break;
    }

    if (intento < 3) {
      console.log(
        "[UltraNet] 🔄 Reintentando conexión con el panel en 2 segundos...",
      );
      await esperar(2000);
    }
  }

  return null;
}

module.exports = {
  generarCredencialPruebaUltraNet,
  obtenerConfigPruebaUltraNet,
  generarUsuarioFacil,
  generarPasswordFacil,
  DURACION_PRUEBA_HORAS,
};
