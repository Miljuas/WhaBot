/**
 * ============================================================================
 * ARCHIVO DE COMUNICADOS OFICIALES Y CANAL DE UTILIDADES — MNET VPN
 * ============================================================================
 * Podés editar los textos de este archivo en cualquier momento.
 * Cuando uses los comandos VIP:
 *   • caida          -> Envía MENSAJE_CAIDA_SERVICIO a todos los clientes con plan vigente.
 *   • caida <texto>  -> Envía MENSAJE_CAIDA_SERVICIO + la nota adicional que escribas.
 *   • restablecido   -> Envía MENSAJE_SERVICIO_RESTABLECIDO a los clientes con plan vigente.
 *   • veraviso       -> Te muestra una vista previa en tu WhatsApp antes de enviarlo.
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const { URL_CANAL_WHATSAPP } = require("./config");

// ============================================================================
// 1. RECOMENDACIÓN PARA UNIRSE AL CANAL DE UTILIDADES (SE ENVÍA AL CONTRATAR)
// ============================================================================
const MENSAJE_INVITACION_CANAL =
  `📢 *RECOMENDACIÓN IMPORTANTE — CANAL OFICIAL DE UTILIDADES*\n\n` +
  `Te recomendamos unirte a nuestro *Canal Oficial de WhatsApp* tocando el siguiente enlace y activando la campanita 🔔:\n` +
  `👉 ${URL_CANAL_WHATSAPP}\n\n` +
  `*¿Por qué te conviene sumarte?*\n` +
  `• 🟢 Avisamos en tiempo real ante cualquier mantenimiento o actualización de servidores.\n` +
  `• 🚀 Compartimos configuraciones, trucos para mejorar la velocidad y utilidades útiles.\n` +
  `• 🔒 Tu número y tu perfil son 100% privados (nadie puede ver quién está en el canal).`;

// ============================================================================
// 2. MENSAJE DE CAÍDA / MANTENIMIENTO PARA CLIENTES CON SERVICIO VIGENTE
// (Podés editar este texto libremente cuando ocurra un incidente específico)
// ============================================================================
const MENSAJE_CAIDA_SERVICIO =
  `⚠️ *AVISO IMPORTANTE DE SERVICIO — MNET VPN* ⚠️\n\n` +
  `¡Hola! Te escribimos para informarte que en este momento estamos experimentando una *interrupción general / mantenimiento técnico* en los servidores de conexión. 🛠️\n\n` +
  `👨‍💻 *Ya estamos trabajando para restablecer el servicio a la mayor brevedad posible.*\n` +
  `• 📌 *No necesitás desinstalar la aplicación ni cambiar tu usuario:* en cuanto quede solucionado, tu cuenta volverá a conectar normalmente.\n` +
  `• ⏳ Quedate tranquilo/a que tu plan activo está registrado y protegido.\n\n` +
  `📢 Para seguir el estado de la reparación minuto a minuto y enterarte apenas vuelva a estar en línea, te recomendamos unirte a nuestro *Canal de Utilidades*:\n` +
  `👉 ${URL_CANAL_WHATSAPP}\n\n` +
  `¡Muchas gracias por tu paciencia y comprensión! 🙌🏻`;

// ============================================================================
// 3. MENSAJE DE SERVICIO RESTABLECIDO PARA CLIENTES CON SERVICIO VIGENTE
// ============================================================================
const MENSAJE_SERVICIO_RESTABLECIDO =
  `✅ *SERVICIO RESTABLECIDO — MNET VPN* ✅\n\n` +
  `¡Hola! Te informamos que el mantenimiento técnico ha finalizado y *los servidores ya se encuentran funcionando nuevamente con normalidad*. 🚀🌐\n\n` +
  `💡 *Para volver a conectarte ahora mismo:*\n` +
  `1️⃣ Activá y desactivá el *Modo Avión* de tu celular durante 5 segundos.\n` +
  `2️⃣ Abrí la aplicación *Vive Online VPN* y presioná en *Conectar* (si el servidor ULTRA 1 demora, probá seleccionando el ULTRA 2).\n\n` +
  `📢 Recordá que podés sumarte a nuestro *Canal de Utilidades* para recibir todas las novedades:\n` +
  `👉 ${URL_CANAL_WHATSAPP}\n\n` +
  `¡Muchas gracias por aguardar y que sigas disfrutando tu conexión! 🙌🏻`;

// ============================================================================
// FUNCIONES CONSTRUCTORAS (SOPORTAN RECARGA EN CALIENTE Y NOTAS ADICIONALES)
// ============================================================================
function recargarTextosDesdeDisco() {
  try {
    const rutaActual = path.join(__dirname, "comunicados.js");
    if (require.cache && require.cache[rutaActual]) {
      delete require.cache[rutaActual];
      const fresco = require(rutaActual);
      return {
        invitacion: fresco.MENSAJE_INVITACION_CANAL || MENSAJE_INVITACION_CANAL,
        caida: fresco.MENSAJE_CAIDA_SERVICIO || MENSAJE_CAIDA_SERVICIO,
        restablecido:
          fresco.MENSAJE_SERVICIO_RESTABLECIDO || MENSAJE_SERVICIO_RESTABLECIDO,
      };
    }
  } catch (e) {}
  return {
    invitacion: MENSAJE_INVITACION_CANAL,
    caida: MENSAJE_CAIDA_SERVICIO,
    restablecido: MENSAJE_SERVICIO_RESTABLECIDO,
  };
}

function construirInvitacionCanal() {
  const textos = recargarTextosDesdeDisco();
  return textos.invitacion;
}

function construirMensajeCaida(notaAdicional = "") {
  const textos = recargarTextosDesdeDisco();
  const extra = String(notaAdicional || "").trim();
  if (!extra) return textos.caida;
  return `${textos.caida}\n\n📝 *Detalle adicional:* ${extra}`;
}

function construirMensajeRestablecido(notaAdicional = "") {
  const textos = recargarTextosDesdeDisco();
  const extra = String(notaAdicional || "").trim();
  if (!extra) return textos.restablecido;
  return `${textos.restablecido}\n\n📝 *Nota:* ${extra}`;
}

module.exports = {
  MENSAJE_INVITACION_CANAL,
  MENSAJE_CAIDA_SERVICIO,
  MENSAJE_SERVICIO_RESTABLECIDO,
  construirInvitacionCanal,
  construirMensajeCaida,
  construirMensajeRestablecido,
};
