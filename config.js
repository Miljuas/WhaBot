const fs = require("fs");
const path = require("path");

// Lector nativo de .env (sin requerir paquetes externos)
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

// ============================================================================
// RUTAS DE ARCHIVOS, IMAGEN DE LA APP, PLAY STORE Y CANAL DE UTILIDADES
// ============================================================================
const PATH_VIDEO_VPN = path.join(__dirname, "media", "tutorial_vpn.mp4");
const PATH_APK_VPN = path.join(__dirname, "media", "ViveOnlineVPN.apk");
const PATH_FOTO_APP = path.join(__dirname, "media", "foto_app.webp");
const URL_PLAY_STORE =
  process.env.URL_PLAY_STORE ||
  "https://play.google.com/store/apps/details?id=com.dtunnel.lite.ultranettestes";

// Enlace oficial a tu Canal de Utilidades / Novedades de WhatsApp
const URL_CANAL_WHATSAPP =
  process.env.URL_CANAL_WHATSAPP ||
  "https://whatsapp.com/channel/0029VbDgoO4HgZWekYmMQm2O";

// Ruta del archivo editable para el comunicado de caída / mantenimiento
const PATH_AVISO_CAIDA = path.join(__dirname, "comunicados.js");

const PATH_LOG = path.join(__dirname, "conversaciones.log");
const PATH_TELEMETRIA = path.join(__dirname, "telemetria_ia.jsonl");
const PATH_MEMORIA = path.join(__dirname, "memoria_bot.json");
const PATH_MEMORIA_TMP = path.join(__dirname, "memoria_bot.json.tmp");
const PATH_AUTH_DIR = path.join(__dirname, "baileys_auth_info");

// ============================================================================
// CONFIGURACIÓN DE ADMINISTRADOR Y TIEMPOS AUTOMÁTICOS
// ============================================================================
const NUMERO_ADMIN_ALERTAS =
  process.env.NUMERO_ADMIN_ALERTAS || "5493704022803";

// Números VIP habilitados para usar comandos ("venta", "excel", "vencimientos", "mandarprueba", "vender", "pendientes", "reset", "stats", "bloquear", "desbloquear", "reiniciar", "caida", "restablecido", "veraviso", "help"):
const NUMEROS_VIP = ["0", "246205175070878", "1", NUMERO_ADMIN_ALERTAS];

// Horas máximas hacia atrás para responder mensajes recibidos con la notebook apagada:
const HORAS_MAX_SIN_CONEXION = 12;

// Horas de inactividad tras las cuales un cliente en Paso 99 vuelve a ser atendido por el bot si escribe de nuevo:
const HORAS_AUTO_DESBLOQUEO_PASO99 = 24;

// 1. Chequeo rápido post-entrega (para clientes que recibieron la prueba y NO volvieron a escribir):
const MINUTOS_CHEQUEO_INICIAL_PRUEBA = 30;
const MINUTOS_MAX_VENTANA_CHEQUEO_INICIAL = 180;

// 2. Seguimiento antes de que termine la prueba (20 hs = faltando 4 hs para vencer):
const HORAS_AVISO_FIN_PRUEBA = 20;
const HORAS_MAX_VENTANA_SEGUIMIENTO = 36;

// Frecuencia con la que el reloj interno revisa los seguimientos (cada 5 minutos):
const INTERVALO_REVISION_SEGUIMIENTO_MS = 5 * 60 * 1000;

function esNumeroVIP(numeroLimpio) {
  return NUMEROS_VIP.includes(String(numeroLimpio || ""));
}

module.exports = {
  cargarEnvLocal,
  PATH_VIDEO_VPN,
  PATH_APK_VPN,
  PATH_FOTO_APP,
  URL_PLAY_STORE,
  URL_CANAL_WHATSAPP,
  PATH_AVISO_CAIDA,
  PATH_LOG,
  PATH_TELEMETRIA,
  PATH_MEMORIA,
  PATH_MEMORIA_TMP,
  PATH_AUTH_DIR,
  NUMERO_ADMIN_ALERTAS,
  NUMEROS_VIP,
  HORAS_MAX_SIN_CONEXION,
  HORAS_AUTO_DESBLOQUEO_PASO99,
  MINUTOS_CHEQUEO_INICIAL_PRUEBA,
  MINUTOS_MAX_VENTANA_CHEQUEO_INICIAL,
  HORAS_AVISO_FIN_PRUEBA,
  HORAS_MAX_VENTANA_SEGUIMIENTO,
  INTERVALO_REVISION_SEGUIMIENTO_MS,
  esNumeroVIP,
};
