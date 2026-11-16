// ============================================================================
// PLANTILLAS DE MENSAJES Y TEXTOS DEL BOT MNET VPN
// ============================================================================
const { URL_PLAY_STORE, URL_CANAL_WHATSAPP } = require("./config");

const VARIACIONES_INICIAL = [
  `¡Hola! 👋 Te damos la bienvenida a *MNet VPN* ⚡
🤖 _Soy el asistente virtual y te guiaré para activar tu conexión en segundos._

Brindamos servicio de *Internet 100% Ilimitado* para dispositivos *Android* con chip *Personal* o *Claro Prepago* (sin necesidad de tener saldo ni gigas en tu línea) 🚀. Nos conectamos a través de nuestra aplicación oficial *Vive Online VPN*, disponible en *Google Play Store* 🛡️.

¿Con qué opción te gustaría comenzar?

*1️⃣* Solicitar una prueba GRATIS de 24 hs 🎁
*2️⃣* Ver los planes y precios disponibles 💳
*3️⃣* Uso Movistar, Tuenti o tengo iPhone ❌

━━━━━━━━━━━━━━━━━━━━
📌 _Por favor, respondé con el número 1, 2 o 3_ 🙌🏻`,

  `¡Hola! 👋 Gracias por comunicarte con *MNet VPN* ⚡
🤖 _Te saluda el asistente automático de atención inmediata._

Con nuestra aplicación oficial *Vive Online VPN* (verificada en Google Play Store 🛡️) contás con *Internet Ilimitado todo el día* para usar WhatsApp, YouTube, Instagram, TikTok y navegar en tu celular *Android* con *Personal* o *Claro Prepago*, ¡incluso con $0 de saldo! 🌐

Indicame qué opción buscás hoy:

*1️⃣* Probar el servicio GRATIS por 24 hs 🎁
*2️⃣* Ver los planes y precios 💳
*3️⃣* Tengo otra compañía o iPhone ❌

━━━━━━━━━━━━━━━━━━━━
📌 _Respondé con el número 1, 2 o 3_ 🙌🏻`,
];

const MENSAJE_BIENVENIDA_DIRECTA = `¡Hola! 👋 Te damos la bienvenida a *MNet VPN* ⚡
🤖 _Soy el asistente virtual de atención automática._
Brindamos servicio de *Internet 100% Ilimitado* para dispositivos *Android* con *Personal* y *Claro Prepago* a través de nuestra app oficial en *Google Play Store* 🛡️.`;

// Mensaje cuando un cliente nuevo (Paso 0) pregunta directo por la prueba desde un anuncio
const MENSAJE_BIENVENIDA_PRUEBA_PASO0 = `¡Hola! 👋 Te damos la bienvenida a *MNet VPN* ⚡
🤖 _Soy el asistente virtual y estoy acá para habilitar tu prueba al instante._

🎁 *¿Qué incluye nuestra prueba gratuita?*
• ✅ *24 horas corridas de Internet 100% Ilimitado* (sin tope de gigas).
• ✅ *Funciona sin saldo ni crédito* en tu línea.
• ✅ Acceso completo a YouTube, WhatsApp, Instagram, TikTok y más en tu *Android*.
• ✅ Conexión mediante nuestra app oficial *Vive Online VPN*, descargable de forma segura desde *Google Play Store* 🛡️, junto con un video tutorial paso a paso.

Para generar tu cuenta de prueba ahora mismo, indicame por favor: *¿qué compañía usás en tu celular?* 📶

*1️⃣* Personal 🔵
*2️⃣* Claro 🔴 _(cobertura reducida en algunas zonas)_
*3️⃣* Uso Movistar, Tuenti o iPhone ❌

━━━━━━━━━━━━━━━━━━━━
📌 _Respondé con *1* o *2* para enviarte tu acceso en el acto (o escribí *"precios"* para ver los planes)._ 🚀`;

const MENSAJE_RETOMAR_PASO1 = `🙌🏻 *¡Esperamos haber resuelto tu consulta!*

Para continuar con tu celular Android, indicanos qué opción preferís:

*1️⃣* Solicitar una prueba GRATIS de 24 hs 🎁
*2️⃣* Ver los planes y precios / Comprar 💳
*3️⃣* Tengo Movistar, Tuenti o iPhone ❌

━━━━━━━━━━━━━━━━━━━━
📌 _Respondé con 1, 2 o 3 (o indicanos si usás Personal o Claro)_`;

const MENSAJE_RETOMAR_PASO4 = `🙌🏻 *¡Quedamos atentos por acá!*

• Si ya realizaste la transferencia al alias \`milciades.genes\`, envianos el *comprobante* junto con tu *Nombre*.
• Si preferís *probar gratis el servicio por 24 hs* antes de abonar, respondé con el número *1*. 👍`;

const MENSAJE_RETOMAR_PASO3 = `🙌🏻 *¡Seguimos a tu disposición!*

Avisanos por acá cuando hayas podido probar la conexión con tus credenciales, o respondé con *2* en cualquier momento para conocer los planes disponibles. 🚀👍`;

const MENSAJE_MENU_INVALIDO = `🤖 Disculpá, como soy el asistente automático no logré interpretar tu mensaje.

Por favor, respondé con el número de la opción que buscás (o escribí *"operador"* si necesitás atención personalizada):

*1️⃣* Solicitar una prueba gratis de 24 hs 🎁
*2️⃣* Ver los planes y precios / Comprar 💳
*3️⃣* Tengo Movistar, Tuenti o iPhone ❌`;

const MENSAJE_ACTIVACION = `⚡ *MNet VPN - PLANES Y ACTIVACIÓN* ⚡

Podés abonar de forma segura mediante *Transferencia, Mercado Pago, Rapipago o Pago Fácil*:

💰 *$2.000* = 3 días de acceso ilimitado 🌐
💰 *$3.000* = 7 días de acceso ilimitado 🌐
💰 *$5.000* = 15 días de acceso ilimitado 🌐
💰 *$7.000* = 30 días de acceso ilimitado 🌐

● *Alias:* \`milciades.genes\`
● *CVU:* \`0000003100065619254321\`
● *Titular:* GENES, MILCIADES ANTONIO 👤

Una vez realizado el pago 💳, envianos por este medio el *comprobante junto con tu Nombre* para agendar tu cuenta y entregarte tus credenciales de inmediato. 🙌🏻
_(Si preferís realizar la prueba gratuita de 24 hs antes de abonar, respondé con el *1*)_.`;

const MENSAJE_COMO_FUNCIONA = `💡 *¿Cómo funciona MNet VPN?*

Ofrecemos *Internet 100% Ilimitado* para celulares *Android* con chip *Personal* o *Claro Prepago*.
• ✅ *Sin necesidad de saldo ni crédito* (de hecho, recomendamos probarlo sin saldo ni gigas para comprobar su funcionamiento).
• ✅ *Sin límite de consumo:* podés mirar videos en YouTube, usar redes sociales y navegar las 24 horas.
• ✅ *Totalmente seguro:* descargás nuestra aplicación oficial (*Vive Online VPN*) directamente desde *Google Play Store* 🛡️ e ingresás con el usuario y contraseña que te asignamos.

🎁 Para *probarlo GRATIS por 24 hs*, respondé con *1* (o indicame si tenés Personal o Claro).
💳 Para *ver los planes y precios*, respondé con *2*.`;

const MENSAJE_GUIA_INSTALACION_PASO3 = `📲 *Conectarte es muy sencillo. Seguí estos 4 pasos:*

1️⃣ Descargá nuestra aplicación oficial desde *Google Play Store* tocando este enlace 🛡️:
👉 ${URL_PLAY_STORE}
2️⃣ Abrí la app y, en la lista de servidores, seleccioná:
   • *Personal ULTRA 1 o 2* (si usás chip Personal; si el 1 demora, probá con el 2).
   • *Claro Ultra* (si usás chip Claro).
3️⃣ Copiá y pegá el *Usuario* y la *Contraseña* que te enviamos por separado (sin dejar espacios en blanco).
4️⃣ Presioná el botón *Conectar*. _(Podés conectar y desconectar todas las veces que necesites mientras tu cuenta esté activa)_.

📸 *Si te aparece algún error en pantalla, envianos una captura por acá y te asistiremos de inmediato.* 👍`;

const MENSAJE_SOPORTE_APK = `📲 *¿Tenés inconvenientes para descargar o abrir la aplicación?*

Nuestra aplicación oficial se descarga directamente desde *Google Play Store*, por lo que es 100% segura y no requiere configuraciones especiales:
👉 ${URL_PLAY_STORE}

💡 *Recomendaciones rápidas:*
1️⃣ Verificá contar con una conexión Wi-Fi o datos móviles durante un minuto únicamente para bajar la app de la tienda (pesa muy pocos megas).
2️⃣ Una vez instalada desde Play Store, ya podrás conectarte sin saldo ni gigas.

📸 *Si te aparece algún aviso en pantalla, envianos una captura por acá o escribí "ayuda" para que un operador te asista personalmente.* 👍`;

const MENSAJE_COMPARTIR_Y_TV = `📡 *¿Cómo compartir Internet a otros equipos o usar en Smart TV?*

📱 *Para compartir Wi-Fi desde tu celular:*
Una vez que la aplicación esté conectada en tu teléfono, activá la función *Zona Wi-Fi portátil / Compartir Internet (Hotspot)* desde los ajustes de tu celular.

📺 *Para instalar directamente en un Smart TV (Android TV) o TV Box:*
1️⃣ En la tienda de aplicaciones de tu TV, descargá la app *Downloader*.
2️⃣ Abrí *Downloader* e ingresá el código oficial:
👉 *6187556*
3️⃣ Instalá *Vive Online VPN* en tu TV.
4️⃣ Compartí señal desde tu celular con *Zona Wi-Fi*, conectá la TV a esa red e ingresá tu usuario, contraseña y servidor en la app del televisor.

_(Si necesitás asistencia paso a paso con esta configuración, escribí *"operador"*)_. 🙌🏻`;

const MENSAJE_NO_PERSONAL = `📱 Nuestro servicio de internet ilimitado funciona *exclusivamente en dispositivos Android con chip Personal o Claro Prepago*. Por cuestiones técnicas de red, no es compatible con Movistar, Tuenti ni iPhone.

💡 *Alternativa recomendada:*
Podés adquirir un chip *Personal* o *Claro Prepago* en cualquier kiosco de forma muy económica:
• 📌 Lo colocás en tu celular Android.
• 📌 *Tu WhatsApp no cambia* (conservás tu número y tus chats actuales).
• 📌 No necesitás realizarle ninguna recarga de saldo para usar nuestro servicio.

Si conseguís un chip compatible, escribinos por acá y te habilitaremos las 24 horas de prueba sin cargo. 🙌🏻
_(Si deseás consultar otra duda con una persona, escribí *"operador"*)_.`;

const MENSAJE_TIENE_ABONO = `⚠️ *Información importante sobre líneas con Abono o Gigas activos:*

Nuestro servicio está diseñado para funcionar *sin saldo ni gigas disponibles*. Si actualmente tenés datos móviles activos en tu plan o pack, el teléfono podría consumir esos gigas primero al conectarse.

💡 *¿Qué te sugerimos?*
• Podés solicitar la prueba ahora para dejar la aplicación instalada desde Play Store y verificar que conecte, o bien *esperar a consumir tus gigas actuales* y pedirnos la prueba cuando estés sin datos.
• También podés utilizar un chip *Personal o Claro Prepago* sin saldo (manteniendo tu mismo WhatsApp).

Si deseás probarlo ahora de todos modos, respondé con *1* (Personal) o *2* (Claro), o escribí *"operador"* si tenés alguna consulta. 👍`;

const MENSAJE_TIENE_GIGAS_EN_PASO3 = `⚠️ *Aviso sobre Gigas o Saldo activo en tu línea:*

Si contás con gigas o crédito disponible, es probable que la línea consuma primero los datos de tu compañía.

💡 *Contás con dos opciones:*
1️⃣ Probar la conexión ahora mismo para confirmar que la aplicación funcione correctamente en tu equipo.
2️⃣ Esperar a que finalicen tus gigas actuales y avisarnos escribiendo *"ya no tengo gigas"* para que te generemos una prueba nueva de 24 horas y puedas comprobar el servicio con $0 de saldo. 🙌🏻`;

const MENSAJE_DESPEDIDA_CHIP = `¡Perfecto! 🙌🏻 En cuanto coloques y actives el chip *Personal* o *Claro*, escribinos diciendo *"ya tengo el chip"* y te generaremos la prueba gratuita en el momento. ¡Quedamos a tu disposición! 👍`;

const MENSAJE_ELEGIR_OPERADOR = `🎁 *¡Excelente! Vamos a generar tu prueba gratuita de 24 horas.*

Para asignarte el servidor correspondiente, indicame: *¿con qué chip vas a probar el servicio?* 📶

*1️⃣* Personal 🔵
*2️⃣* Claro 🔴 _(cobertura reducida en algunas zonas)_

━━━━━━━━━━━━━━━━━━━━
📌 _Respondé con *1* (Personal) o *2* (Claro)_`;

const VARIACIONES_INSULTO = [
  `Lamentamos tu molestia, pero mantenemos un trato respetuoso en este canal. Si no estás interesado en el servicio, damos por finalizada la conversación. Saludos.`,
];

const MENSAJE_YA_TUVO_PRUEBA = `ℹ️ *Nuestro sistema registra que ya utilizaste tu prueba gratuita de 24 horas.*

• Si deseás activar un plan ilimitado (desde $2.000 por 3 días o $7.000 el mes completo 💳), respondé con el número *2* o escribí *"comprar"*.
• Si tuviste algún inconveniente técnico durante tu prueba y no pudiste usarla, escribí *"ayuda"* para que un operador revise tu caso. 🙌🏻`;

const MENSAJE_EN_PROCESO_PRUEBA = `¡Perfecto, no hay ningún apuro! 🙌🏻 Tomate tu tiempo para descargar la aplicación desde Google Play Store y probar tus credenciales.

Cualquier consulta que te surja al conectarte, escribinos por este medio. ¡Quedamos a tu disposición! 👍`;

const MENSAJE_ACLARACION_PASO3 = `🤖 Disculpá, soy el asistente virtual y no logré comprender tu consulta.

• ⏳ *Duración de la prueba:* 24 horas corridas desde su envío.
• 📲 *Cómo conectar:* escribí *"como me conecto"* para ver los 4 pasos.
• 💳 *Precios y planes:* respondé con *2* o escribí *"comprar"*.
• 🛠️ *Soporte personalizado:* escribí *"ayuda"* o *"no me conecta"* para derivarte con un operador. 👍`;

const MENSAJE_CONEXION_EXITOSA = `🎉 *¡Excelente! Nos alegra saber que ya estás conectado y navegando.* 🚀

Te sugerimos probar el servicio en tu uso diario (YouTube, redes sociales, etc.) y sin saldo en la línea para comprobar su estabilidad.

Cuando desees activar un plan (3 días por $2.000, 7 días por $3.000, 15 días por $5.000 o 30 días por $7.000), escribinos *"quiero comprar"* y te enviaremos los datos de pago. 🙌🏻`;

const MENSAJE_POSTERGAR_COMPRA = `¡Sin ningún problema! 🙌🏻 Nos alegra que el servicio te haya funcionado bien.

Tu contacto ya queda registrado; el día que desees activar un plan (3, 7, 15 o 30 días), escribinos *"quiero comprar"* y lo habilitaremos en el acto. ¡Saludos! 👍`;

const MENSAJE_CIERRE_CORDIAL = `¡Con gusto! 🙌🏻 Cualquier consulta o asistencia que necesites mientras probás el servicio, escribinos por acá. ¡Estamos a tu disposición! 🚀`;

const MENSAJE_CIERRE_PASO4 = `¡Perfecto! 🙌🏻 Quedamos a tu disposición. Cuando realices la transferencia, envianos el comprobante y tu Nombre por acá; o si preferís *probar el servicio gratis por 24 hs* antes de abonar, respondé con el *1*. ¡Saludos! 👍`;

// Mensajes exclusivos para clientes con plan pago confirmado (Post-Compra)
const MENSAJE_CIERRE_CLIENTE_PAGO = `¡Muchas gracias a vos por confiar en *MNet VPN*! 🙌🏻 Cualquier consulta que tengas durante tu suscripción, podés escribirnos por este medio.

💡 *Recordá que en cualquier momento podés consultarme:*
• 📅 *"¿Cuándo vence mi plan?"* (para conocer tu fecha exacta de vencimiento).
• 📡 *"¿Cómo compartir Wi-Fi o conectar en Smart TV?"*
• 📲 *"¿Cómo me conecto?"* (para repasar los pasos de conexión).
• 🛠️ *"Ayuda"* (para recibir asistencia técnica personalizada).

📢 *Recomendación:* Si aún no te sumaste, unite a nuestro *Canal de Utilidades y Novedades* para enterarte de actualizaciones y avisos de servicio:
👉 ${URL_CANAL_WHATSAPP}

¡Que disfrutes tu conexión! 🚀`;

const MENSAJE_CONEXION_EXITOSA_CLIENTE_PAGO = `🎉 *¡Excelente! Tu plan ilimitado ya está funcionando correctamente.* 🚀

Recordá que podés consultarnos en cualquier momento *"¿cuándo vence mi plan?"* o escribir *"ayuda"* si necesitás asistencia técnica.

📢 *Te recomendamos unirte a nuestro Canal de Utilidades* para recibir avisos importantes del servicio y novedades:
👉 ${URL_CANAL_WHATSAPP}

¡Que lo disfrutes! 🙌🏻`;

const MENSAJE_ACLARACION_CLIENTE_PAGO = `🤖 Hola, soy el asistente virtual de *MNet VPN*. No logré interpretar tu mensaje, pero como cliente activo podés consultarme:

• 📅 Escribí *"¿cuándo vence mi plan?"* para ver tus días disponibles.
• 📲 Escribí *"¿cómo me conecto?"* para ver los pasos y tus credenciales.
• 📡 Escribí *"compartir internet"* para usar Zona Wi-Fi o Smart TV.
• 🛠️ Escribí *"operador"* o *"ayuda"* para hablar con soporte técnico. 🙌🏻`;

const MENSAJE_NO_INTERESADO = `¡Comprendido, no hay ningún problema! Muchas gracias por comunicarte con *MNet VPN*. Si en otro momento deseás probar el servicio o consultar nuestros planes, estaremos a tu disposición. ¡Saludos! 🙌🏻`;

const MENSAJE_DERIVACION_HUMANO = `👨‍💻 *ATENCIÓN PERSONALIZADA*
En este momento derivo tu conversación con nuestro operador para que te asista personalmente.

Si aún no lo hiciste, por favor detallá tu consulta acá abajo (o adjuntá una captura de pantalla de la aplicación) y te responderemos a la brevedad. ¡Gracias por tu paciencia! 🙌🏻`;

const MENSAJE_PAGO_RECIBIDO = `💸 *¡Comprobante / Aviso de pago recibido!*
Ya enviamos una notificación prioritaria al administrador para verificar tu pago y generar tu cuenta.

Por favor, dejá escrito tu *Nombre* acá abajo (y la imagen del comprobante si aún no la adjuntaste). En breves minutos te entregaremos tu acceso activo. ¡Muchas gracias! 🙌🏻`;

const MENSAJE_CAPTURA_RECIBIDA = `📎 *¡Imagen recibida!*
Ya notificamos al operador para que revise tu captura de pantalla y te brinde respuesta en unos minutos. ¡Muchas gracias por aguardar! 🙌🏻`;

function obtenerAleatorio(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function nombreDescriptivoPaso(paso) {
  const nombres = {
    0: "Paso 0 (Cliente Nuevo sin saludo)",
    1: "Paso 1 (Menú Principal)",
    3: "Paso 3 (Ya recibió Prueba Gratis / Post-Prueba)",
    4: "Paso 4 (Vio Precios y Alias / Esperando Pago o Prueba)",
    7: "Paso 7 (Eligiendo Operador: 1 Personal o 2 Claro)",
    8: "Paso 8 (Línea no compatible / Recomendación de Chip)",
    99: "Paso 99 (Atención Humana)",
  };
  return nombres[paso] || `Paso ${paso}`;
}

function construirRecordatorioHilo(pasoActual, yaTuvoPruebaReal) {
  if (pasoActual === 7 && !yaTuvoPruebaReal) {
    return `\n\n━━━━━━━━━━━━━━━━━━━━\n📌 _Para enviarte tu prueba gratuita ahora mismo, respondé con *1* (Personal) o *2* (Claro)._`;
  }
  if (pasoActual === 4 && !yaTuvoPruebaReal) {
    return `\n\n━━━━━━━━━━━━━━━━━━━━\n📌 _Si preferís probarlo gratis por 24 hs antes de abonar respondé con *1*, o envianos el comprobante si ya realizaste el pago._`;
  }
  return "";
}

// Mensaje a los 30 minutos (SOLO si el cliente no volvió a escribir después de recibir la prueba)
function construirMensajeChequeoInicialPrueba(cred) {
  const op =
    cred?.operador === "claro" ? "Claro Ultra" : "Personal ULTRA 1 o 2";
  return (
    `¡Hola! 👋 Nos comunicamos brevemente para saber si pudiste descargar nuestra aplicación desde Google Play Store y conectarte con tu prueba gratuita (usuario \`${cred.usuario}\`).\n\n` +
    `• ✅ Si *ya estás conectado*, ¡excelente, que disfrutes tus 24 horas!\n` +
    `• ⏳ Si *aún no pudiste probarlo*, no hay problema, podés hacerlo cuando gustes.\n` +
    `• 🛠️ Si *tenés alguna duda o no te conecta* (recordá elegir el servidor *${op}*), envianos una captura de pantalla de la app por acá y te ayudaremos enseguida. 🙌🏻`
  );
}

// Mensaje a las 20 horas (antes de que termine la prueba de 24 hs)
function construirMensajeSeguimientoPrueba(cred, horasTranscurridas) {
  const maxHoras = cred?.duracionHoras || 24;
  const horasRestantes = Math.max(1, Math.ceil(maxHoras - horasTranscurridas));

  if (horasTranscurridas < maxHoras) {
    return (
      `¡Hola! 👋 Te avisamos que quedan pocas horas (aprox. *${horasRestantes} hs*) para que finalice tu prueba gratuita de *MNet VPN* (usuario \`${cred.usuario}\`).\n\n` +
      `¿Cómo ha sido tu experiencia con la conexión hasta el momento? 🚀\n\n` +
      `• 💳 Si deseás *activar un plan* para continuar navegando sin cortes (3 días x $2.000, 7 días x $3.000, 15 días x $5.000 o 30 días x $7.000), respondé con *2* o escribí *"quiero comprar"*.\n` +
      `• 🛠️ Si tuviste algún inconveniente o aún no llegaste a probarla, avisanos por acá para asistirte. 🙌🏻`
    );
  }

  return (
    `¡Hola! 👋 Te escribimos porque tu prueba gratuita de 24 hs de *MNet VPN* (usuario \`${cred.usuario}\`) finalizó recientemente.\n\n` +
    `¿Cómo te funcionó el servicio? 🚀\n\n` +
    `• 💳 Si te gustó la conexión y deseás *activar un plan ilimitado* (3 días x $2.000, 7 días x $3.000, 15 días x $5.000 o 30 días x $7.000), respondé con *2* o escribí *"quiero comprar"*.\n` +
    `• 🛠️ Si tuviste algún inconveniente para conectarte o te quedó alguna consulta, avisanos por acá y lo revisamos juntos. 🙌🏻`
  );
}

module.exports = {
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
  nombreDescriptivoPaso,
  construirRecordatorioHilo,
  construirMensajeChequeoInicialPrueba,
  construirMensajeSeguimientoPrueba,
};
