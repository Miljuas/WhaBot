const axios = require("axios");
const {
  memoriaDisco,
  guardarMemoriaDisco,
  metadatosClasificacionIA,
} = require("./memoria");

// ============================================================================
// NORMALIZADOR FONÉTICO ARGENTINO Y FILTRO DE INSULTOS
// ============================================================================
function normalizarFoneticaArgentina(textoSinTildes) {
  return String(textoSinTildes || "")
    .replace(/\b(asta)\b/g, "hasta")
    .replace(/\b(ahy|ai)\b/g, "ahi")
    .replace(/\b(bien\s+hay)\b/g, "bien ahi")
    .replace(/\b(24\s+hora)\b/g, "24 horas")
    .replace(/\b(aon|haun|ahun)\b/g, "aun")
    .replace(/\b(ise|hise|ize|hize)\b/g, "hice")
    .replace(/\b(ago|hago)\b/g, "hago")
    .replace(/\b(biendo)\b/g, "viendo")
    .replace(/\b(prove|provee)\b/g, "probe")
    .replace(/\b(pruevo|prueva|pruva|prueb)\b/g, "prueba")
    .replace(/\b(provar|provarlo|provarla)\b/g, "probar")
    .replace(/\b(intalar|instalarla|intalarla|istalar)\b/g, "instalar")
    .replace(/\b(kiero|qiero|quiro|quero)\b/g, "quiero")
    .replace(
      /\b(presios?|prsios?|precios?|peecios?|pecios?|preecios?|pesios?|prcios?|prexios?)\b/g,
      "precio",
    )
    .replace(/\b(plnes|plane)\b/g, "planes")
    .replace(/\b(grasias|gracia|grax|graciaas)\b/g, "gracias")
    .replace(/\b(vien|bn)\b/g, "bien")
    .replace(/\b(funsiono|funsiona)\b/g, "funciono")
    .replace(/\b(andubo)\b/g, "anduvo")
    .replace(/\b(coneto|coneta)\b/g, "conecto")
    .replace(/\b(todabia|toavia|todaviaa)\b/g, "todavia")
    .replace(/\b(aora|haora)\b/g, "ahora")
    .replace(/\b(interne|interner|intrnet)\b/g, "internet")
    .replace(/\b(grqtis|grati|gratiss|grtis)\b/g, "gratis")
    .replace(/\b(tene)\b/g, "tenes")
    .replace(/\b(publi|publicasion)\b/g, "publicacion")
    .replace(/\b(fase|feis|face)\b/g, "facebook")
    .replace(
      /\b(abla|habla)\s+(por|x)\s+(el\s+)?internet\b/g,
      "hablo por el internet",
    )
    .replace(
      /\b(ahi|hay|ay)\s+(pruebo|la pruebo|lo pruebo|me fijo|veo|conecto|intento|va|estoy)\b/g,
      "ahi $2",
    )
    .replace(
      /\b(no me puedo)\s+(conectar|conetar|conecar)\b/g,
      "no me conecta",
    );
}

function detectarInsulto(texto) {
  return /\b(pelotudos?|boludos?|forros?|estafador(es)?|ladron(es)?|ladrón(es)?|mierdas?|garcas?|chantas?)\b/i.test(
    String(texto || ""),
  );
}

// ============================================================================
// DETECTORES AUXILIARES PARA DEBOUNCE ADAPTATIVO, SILENCIO Y CANCELACIÓN
// ============================================================================

// Detecta cuando un cliente envía solo un vocativo o frase de apertura truncada
// (Ej: "Hola", "Buenas", "Amigo", "Che", "Hola quería consultar algo")
function esMensajeAperturaIncompleta(textoOriginal) {
  const limpio = normalizarFoneticaArgentina(
    String(textoOriginal || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.,!?¡¿"']/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  if (!limpio) return false;

  // Si ya contiene una intención de negocio clara o número de opción, NO es incompleto
  if (
    /^(1|2|3|4|1️⃣|2️⃣|3️⃣)$/.test(limpio) ||
    /\b(prueba|probar|gratis|precio|cuanto|planes|comprar|personal|claro|movistar|tuenti|iphone|no me conecta|no anda|no funciona|error|ya pague|transferi|internet|anuncio|publicacion)\b/.test(
      limpio,
    )
  ) {
    return false;
  }

  return /^(hola+|buenas+|buen dia|buenos dias|buenas tardes|buenas noches|amigo+|che+|maestro|capo|loco|disculpa|perdon)?\s*(hola+|buenas+|amigo+|che+|disculpa|perdon|una consulta|te hago una consulta|te consulto|te consulto algo|queria consultar|queria consultar algo|una pregunta|te hago una pregunta|queria preguntar|queria preguntar algo|queria saber|queria saber algo)?$/.test(
    limpio,
  );
}

// Detecta si el mensaje contiene verbos de pedido o sustantivos comerciales que obligan a procesar la solicitud
function contienePedidoOSolicitudComercial(tNormalizado) {
  return /\b(pasame|pasa|mandame|manda|enviame|envia|decime|dame|mostrame|quiero|necesito|precio|planes|plan|alias|cbu|cvu|cuenta|pagar|comprar|contratar|activar|renovar)\b/.test(
    String(tNormalizado || ""),
  );
}

// Detecta si el mensaje es únicamente una confirmación de recepción o agradecimiento corto
// sin preguntas ni reclamos (para aplicar NO_RESPONDER o reacción 👍 cuando ya se cerró el turno)
function esConfirmacionOCierreCorto(textoOriginal) {
  const raw = String(textoOriginal || "").trim();
  if (!raw) return false;
  if (/[?¿]/.test(raw)) return false;

  const tieneEmojiPositivo = /[👍👌🙌🙏❤️💪🎉🚀✅🔥😎👏]/.test(raw);
  const sinTildes = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?¡¿"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const t = normalizarFoneticaArgentina(sinTildes);
  const soloAlfanum = t.replace(/[^a-z0-9]/g, "");

  if (!soloAlfanum && tieneEmojiPositivo) return true;

  if (contienePedidoOSolicitudComercial(t)) {
    return false;
  }

  if (
    /\b(no|nunca|tampoco|sin|pero|mal|error|falla|problema|duda|consulta|ayuda|como|cuando|donde|cuanto|cual|puedo|probar|prueba|personal|claro)\b/.test(
      t,
    ) &&
    !/\b(cuando termine te aviso|cuando se venza te hablo)\b/.test(t)
  ) {
    return false;
  }

  const palabras = t.split(/\s+/).filter(Boolean);
  const esDespedidaCortesia =
    /\b(despues te aviso|manana te aviso|mas tarde te hablo|cuando termine te aviso|cuando se venza te hablo|cualquier cosa te aviso|cualquier cosa te escribo|yo te aviso|yo le aviso|ah bueno dale yo le aviso)\b/.test(
      t,
    );

  if (palabras.length > 7 && !esDespedidaCortesia) return false;

  return (
    esDespedidaCortesia ||
    /^(ok+|okey|oka|dale+|listo+|genial|joya+|buenisimo|bueno+|bien|bien ahi|gracias+|muchas gracias|mil gracias|de una|perfecto|excelente|barbaro|ah bueno|ah dale|ah ok|sisi|si|dale gracias|ok gracias|bueno gracias|listo gracias|ok perfecto|dale genial|dale joya)(\s+(ok+|okey|dale+|listo+|genial|joya+|gracias+|muchas gracias|perfecto|amigo|capo|maestro))*$/.test(
      t,
    )
  );
}

// Detecta si el cliente pide detener o cancelar una acción en curso ("no, pará", "esperá un toque")
function esCancelacionOperacion(textoOriginal) {
  const sinTildes = String(textoOriginal || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?¡¿"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const t = normalizarFoneticaArgentina(sinTildes);
  if (!t) return false;

  if (
    /\b(funciona|anda|conecta|instala|plata|publicacion|anuncio|facebook|personal|claro|movistar|tuenti|gigas|saldo|abono)\b/.test(
      t,
    )
  ) {
    return false;
  }

  return /^(no\s+para|para\s+un\s+toque|para\s+un\s+cachito|no\s+espera|espera\s+un\s+toque|aguanta\s+un\s+toque|banca\s+un\s+toque|cancelar|cancela|no\s+hagas\s+nada|dejalo\s+ahi\s+nomas)$/.test(
    t,
  );
}

let promesaOllama = Promise.resolve();
function ejecutarOllamaSerializado(tareaAsync) {
  const ejecucion = promesaOllama.then(() => tareaAsync());
  promesaOllama = ejecucion.catch(() => {});
  return ejecucion;
}

// ============================================================================
// CEREBRO HÍBRIDO BLINDADO v5.1
// ============================================================================
async function descubrirIntencionConIA(
  numeroLimpio,
  textoCliente,
  pasoActual,
  yaTuvoPruebaReal,
  textoCitado = "",
) {
  metadatosClasificacionIA.set(numeroLimpio, "REGLA");
  const textoOriginal = String(textoCliente || "").trim();
  const tieneEmojiPositivo = /[👍👌🙌🙏❤️💪🎉🚀✅🔥😎👏]/.test(textoOriginal);

  const tSinTildes = textoOriginal
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?¡¿"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const t = normalizarFoneticaArgentina(tSinTildes);
  const soloLetrasYNumeros = t.replace(/[^a-z0-9]/g, "");
  const palabras = t.split(/\s+/).filter(Boolean);

  const esPregunta =
    /[?¿]/.test(textoOriginal) ||
    /\b(puedo|se puede|podria|como|cuando|donde|por donde|a donde|que pasa si|cuanto|cuantos|cual|cuales|hasta que|que incluye|que concluye|me decis|sabes si|una pregunta|te pregunto|queria preguntar|queria saber|tenes internet|necesito tener)\b/.test(
      t,
    );

  const pideAyudaODudaAbierta =
    /\b(tengo una duda|una duda|una consulta|te hago una consulta|te consulto|queria consultar|necesito ayuda|me ayudas|me das una mano|dame una mano|necesito hablar|otra consulta|otra pregunta)\b/.test(
      t,
    );

  if (!soloLetrasYNumeros && tieneEmojiPositivo) {
    return pasoActual === 0 ? "SALUDO" : "AGRADECIMIENTO_FINAL";
  }

  if (
    !t ||
    /^(eh|eeh|que|q|k|quien sos|quien habla|como|wtf|hola\s*que\s*tal)$/.test(t)
  ) {
    return pasoActual === 0 ? "SALUDO" : "DESCONOCIDO";
  }

  // Cancelación explícita de operación ("no, pará", "esperá un toque")
  if (esCancelacionOperacion(textoOriginal)) {
    return "CANCELAR_OPERACION";
  }

  // Vocativos sueltos ("amigo", "che", "maestro", "disculpa"): en Paso 0 es SALUDO,
  // en otros pasos evita caer en Ollama y alucinar AGRADECIMIENTO_FINAL
  if (/^(amigo+|che+|maestro|capo|hermano|bro|disculpa|perdon)$/.test(t)) {
    return pasoActual === 0 ? "SALUDO" : "DESCONOCIDO";
  }

  const citadoLimpio = String(textoCitado || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const citaMensajeDePrecios =
    citadoLimpio.includes("milciades.genes") ||
    citadoLimpio.includes("activacion de servicio") ||
    citadoLimpio.includes("planes y activacion") ||
    citadoLimpio.includes("2.000") ||
    citadoLimpio.includes("7.000");

  // 1. Pregunta duración o vencimiento (Excluye cuando el cliente pide probar las 24 hs o dice que quiere usarlo 24hs)
  const pideHacerPrueba24h =
    /\b(quiero|puedo|voy a|prefiero|primero|mejor|dame|pasame|mandame)\s+(probar|usarlo|usar|hacer la prueba|la prueba)\b/.test(
      t,
    );
  const preguntaDuracionPrueba =
    !pideHacerPrueba24h &&
    /\b(cuanto dura|cuanto tiempo dura|cuantas horas|cuantos dias me quedan|cuanto me queda|hasta que hora|hasta que dia|hasta cuando|hasta manana|a las 12|a las 24|cuando vence|cuando se vence|cuando vence mi plan|cuando se me vence el plan|a que hora vence|a que hora se corta|cuando termina|a que hora termina|es hasta manana|dura un dia|dura 24|son 24 horas|ya vencio|se me vencio la prueba)\b/.test(
      t,
    );
  if (preguntaDuracionPrueba) {
    return "INFO_DURACION_PRUEBA";
  }

  // 2. Pregunta sobre compartir internet / Wi-Fi / Smart TV / TV Box / PC
  const preguntaCompartirOTv =
    /\b(compartir|comparto|hotspot|zona wifi|anclaje|smart tv|smartv|tv box|tvbox|tele|televisor|plasma|computadora|notebook|pc|downloader|6187556)\b/.test(
      t,
    );
  if (preguntaCompartirOTv) {
    return "INFO_COMPARTIR_TV";
  }

  // 3. Problema específico al instalar o abrir la APK / App
  const tieneProblemaInstalacionApk =
    /\b(no me deja instalar|no se puede instalar|no puedo instalar|no instala|no me instala|app no instalada|aplicacion no instalada|play protect|bloqueo la app|no abre la app|no abre la aplicacion|pantalla negra|como la instalo|como instalo la app)\b/.test(
      t,
    );
  if (tieneProblemaInstalacionApk) {
    return "SOPORTE_INSTALACION_APK";
  }

  // 4. Consulta sobre tener Abono / Factura o tener Gigas / Megas / Saldo activo (Soporta números ej. "Tengo 2gb")
  const esReclamoSinConexion =
    /\b(pero no conexion|pero no conecta|pero no anda|pero no carga|pero no funciona|conecta pero no)\b/.test(
      t,
    );

  const mencionaAbonoOGigasActivos =
    !esReclamoSinConexion &&
    ((/\b(abono|factura|pospago|postpago|plan mensual)\b/.test(t) &&
      !/\b(no tengo abono|sin abono|sin factura|prepago)\b/.test(t)) ||
      (/\b(tengo\s+(\d+\s*|unos\s+|algunos\s+|pocos\s+)?(gigas|giga|gb|megas|mb|saldo|credito|un pack|datos)|me quedan\s+(\d+\s*)?(gigas|giga|gb|megas|mb|saldo|datos)|consume mis gigas|consume los gigas|consume el saldo|gasta mis gigas|gasta mi saldo|(me lo|me los|lo|los)\s+(consume|consumira|gasta|gastara))\b/.test(
        t,
      ) &&
        !/\b(no tengo gigas|no tengo megas|no tengo saldo|no tengo credito|no tengo datos|sin gigas|sin saldo|sin credito|sin datos|necesito tener saldo|hace falta tener saldo)\b/.test(
          t,
        )));

  if (mencionaAbonoOGigasActivos) {
    return "TIENE_ABONO";
  }

  // 5. Aviso de que está descargando / instalando la app en este momento (Evita que dispare otra prueba)
  const estaDescargandoOInstalandoApp =
    /\b(estoy descargando|descargando la app|descargando la aplicacion|estoy instalando|instalando la app|recien la bajo|recien la descargo|la estoy bajando|la estoy descargando)\b/.test(
      t,
    );
  if (estaDescargandoOInstalandoApp) {
    return "EN_PROCESO_PRUEBA";
  }

  // 6. Pregunta cómo funciona el servicio (Incluye "necesito tener saldo")
  const preguntaComoFunciona =
    /\b(como funciona|como es el servicio|necesito saldo|necesito tener saldo|necesito credito|necesito tener credito|hace falta saldo|hace falta tener saldo|hace falta tener credito|con saldo o sin saldo|sin saldo funciona|consume megas|gasta megas|consume mis datos|es ilimitado de verdad|tiene limite de gigas|cuantos gigas)\b/.test(
      t,
    );

  // 7. Pregunta dónde poner usuario/contraseña, qué servidor elegir o "cómo hago" en Paso 3
  const preguntaComoInstalarOUsar =
    /\b(donde pongo el usuario|donde va el usuario|donde pongo la contrasena|como se usa la app|como uso la app|que servidor elijo|cual servidor elijo|que servidor pongo|cual servidor pongo|donde dice servidor|como pongo el usuario|como me conecto|como ago|como hago|como se hace|no entiendo como)\b/.test(
      t,
    );

  const niegaOperador =
    /\b(no tengo|no uso|no consegui|no hay|sin|nunca tuve|no venden|no tenian)\s+(chip\s+|linea\s+)?(personal|claro)\b/.test(
      t,
    );

  const tienePersonal = !niegaOperador && /\b(personal)\b/.test(t);
  const esClaroAfirmativo =
    /\b(claro que|claro si|ah claro|sisi claro|si claro|claro dale|claro gracias|claro como|claro ya|claro pasame|claro entiendo|claro joya)\b/.test(
      t,
    );
  const tieneClaro =
    !niegaOperador &&
    !esClaroAfirmativo &&
    (t === "claro" ||
      /\b(tengo claro|uso claro|soy claro|de claro|chip claro|linea claro|para claro|operador claro|empresa claro|compania claro|con claro|prueba claro|claro prepago)\b/.test(
        t,
      ) ||
      ((pasoActual === 7 || pasoActual === 8 || pasoActual === 4) &&
        /\bclaro\b/.test(t)));

  if (tienePersonal) {
    memoriaDisco.operadorDetectado[numeroLimpio] = "personal";
    guardarMemoriaDisco();
  } else if (tieneClaro) {
    memoriaDisco.operadorDetectado[numeroLimpio] = "claro";
    guardarMemoriaDisco();
  }

  const operadorRecordado =
    memoriaDisco.operadorDetectado[numeroLimpio] || null;

  const yaPago =
    !esPregunta &&
    /\b(ya pague|ya transferi|te transferi|ya te pase la plata|ahi te pase|ahi transferi|ahi te transferi|ya abone|ahi abone|ya hice la transferencia|ya hice el pago|te mande la plata|te mande el comprobante|ahi mande el comprobante|ya deposite|te pase para renovar)\b/.test(
      t,
    );

  // Corrección conversacional ("nono vi la publi en face", "no, te hablo por el anuncio")
  const mencionaAnuncioOInfoInicial =
    /\b(contarme algo mas|mas informacion|quiero informacion|informacion del anuncio|info del anuncio|informacion sobre|obtener mas informacion|info sobre|vi tu anuncio|vi el anuncio|vi eo anuncio|vi la publicacion|vi la publi|publicacion en facebook|me das info|me pasas info|quiero info|estoy interesado en el internet|estoy interesada en internet|estoy interesado en internet|te hablo x el internet|te hablo por el internet|por el internet ilimitado|x el internet ilimitado|hablo por el internet)\b/.test(
      t,
    );

  const noInteresado =
    !mencionaAnuncioOInfoInicial &&
    /\b(no quiero contratar|no me interesa|no quiero nada|por ahora no|no gracias|dejalo asi|no lo quiero|no voy a contratar|no voy a comprar)\b/.test(
      t,
    );

  const postergaCompra =
    /\b(no tengo plata|estoy sin plata|sin un mango|cuando cobre|cuando tenga plata|despues te compro|mas adelante te compro|la semana que viene|el mes que viene|en estos dias te hablo para comprar|despues activo|despues te consulto)\b/.test(
      t,
    );

  const tSinPlayStore = t.replace(/\bplay store\b/g, "tienda");
  const tieneErrorOSoporte =
    (!preguntaComoInstalarOUsar &&
      /\b(ayuda|error|problema|no me anda|no anda|no anduvo|no me anduvo|no funciona|no me funciona|no funciono|no me funciono|no conecta|no me conecta|no conecto|no me conecto|no puedo conectar|no me puedo conectar|no pude conectar|no pude|falla|me sale error|tira error|contrasena incorrecta|usuario incorrecto|pide una contrasena|expirado|conecta pero no|operador|humano|persona|admin|administrador|hablar con alguien|revender|revendedor|panel|creditos|mayorista|play 4|play 5|ps4|ps5|playstation)\b/.test(
        tSinPlayStore,
      )) ||
    pideAyudaODudaAbierta;

  const tieneNegacionOAdversativa =
    /\b(no|nono|nunca|tampoco|sin|pero|nada|mal|lento|imposible|corta|desconecta|error|falla|problema|todavia|aun|duda|consulta)\b/.test(
      t,
    );

  // Blindaje: nunca clasificar como agradecimiento o cierre una frase que pida precios, planes, alias o tenga verbos de pedido ("pasame", "mandame")
  function esAgradecimientoOCierrePuro() {
    if (
      esPregunta ||
      tieneNegacionOAdversativa ||
      tieneErrorOSoporte ||
      contienePedidoOSolicitudComercial(t)
    ) {
      return false;
    }
    const esDespedidaTipica =
      /\b(despues te aviso|manana te aviso|mas tarde te hablo|cuando termine te aviso|cuando se venza te hablo|cualquier cosa te aviso|cualquier cosa te escribo|yo te aviso|yo le aviso)\b/.test(
        t,
      );
    if (palabras.length > 7 && !esDespedidaTipica) return false;

    return (
      esDespedidaTipica ||
      /\b(bien|bien ahi|bueno|gracias|muchas gracias|mil gracias|dale|buenisimo|joya|genial|ok|okey|listo|si|sii|de una|perfecto|excelente|barbaro)\b/.test(
        t,
      )
    );
  }

  const preguntaPrecioAntesDeProbar =
    /\b(antes de probar|antes de la prueba)\b/.test(t) &&
    /\b(cuanto sale|cuanto cuesta|cuanto vale|precio|precios|planes)\b/.test(t);

  const pidePrueba =
    !preguntaPrecioAntesDeProbar &&
    (/\b(prueba\w*|probar\w*|pruebo|probamos|probando|gratis|demo|test\w*)\b/.test(
      t,
    ) ||
      /\b(tenes internet gratis|internet gratis)\b/.test(t) ||
      ((pasoActual === 0 || pasoActual === 1) &&
        /\b(no tengo internet|me quede sin internet|sin megas|sin datos|necesito internet)\b/.test(
          t,
        )));

  // Diferenciar comprar un plan VPN vs "mañana compro el chip en el kiosco"
  const hablaDeComprarChip =
    /\b(compro|comprar|comprarme|consigo|conseguir)\s+(el\s+|un\s+)?chip\b/.test(
      t,
    );

  const pideCompra =
    !tieneErrorOSoporte &&
    !noInteresado &&
    !postergaCompra &&
    !pidePrueba &&
    !hablaDeComprarChip &&
    (/\b(comprar|compro|comprarte|comprarle|precio|precios|cuanto sale|cuanto cuesta|cuanto vale|que sale|que vale|que precio|alias|cvu|cbu|quiero pagar|como pago|como se paga|planes|un plan|abonar|mercado pago|mercadopago|rapipago|pago facil|quiero activar|activar el servicio|activar un plan|renovar|renovacion|2000|3000|5000|7000|3 dias|7 dias|15 dias|30 dias|un mes|una semana)\b/.test(
      t,
    ) ||
      /\b(pasame|pasa|mandame|manda|enviame|decime|mostrame)\s+(despues\s+)?(los\s+|el\s+|la\s+)?(precio\w*|plan\w*|valor\w*|costo\w*|alias|cbu|cvu)\b/.test(
        t,
      ) ||
      (citaMensajeDePrecios && !pidePrueba && !tieneErrorOSoporte));

  const esIncompatible =
    niegaOperador ||
    /\b(movistar|tuenti|iphone|ios|apple)\b/.test(t) ||
    /\b(no tengo ninguno)\b/.test(t);

  if (yaPago) return "PAGO_REALIZADO";
  if (postergaCompra && !tieneErrorOSoporte) return "POSTERGAR_COMPRA";
  if (noInteresado && !pidePrueba && !pideCompra) return "NO_INTERESADO";
  if (preguntaComoInstalarOUsar && (pasoActual === 3 || yaTuvoPruebaReal))
    return "INFO_COMO_INSTALAR";
  if (preguntaComoFunciona && !tienePersonal && !tieneClaro)
    return "INFO_COMO_FUNCIONA";

  const esSaludoOAnuncioPuro =
    !pidePrueba &&
    !pideCompra &&
    !tienePersonal &&
    !tieneClaro &&
    !esIncompatible &&
    !tieneErrorOSoporte &&
    (mencionaAnuncioOInfoInicial ||
      /^(hola+|buenas+|buen dia|buenos dias|buenas tardes|buenas noches)(\s+(buenas|buen dia|buenas tardes|buenas noches|info|informacion|che|como va|todo bien|amigo))*$/.test(
        t,
      ));

  if (esSaludoOAnuncioPuro) {
    return "SALUDO";
  }

  function resolverIntencionPrueba() {
    if (tienePersonal || operadorRecordado === "personal")
      return "PRUEBA_PERSONAL";
    if (tieneClaro || operadorRecordado === "claro") return "PRUEBA_CLARO";
    return "FALTA_OPERADOR";
  }

  // Paso 8
  if (pasoActual === 8) {
    if (tieneErrorOSoporte) return "DUDA_HUMANO";
    if (esIncompatible) return "NO_COMPATIBLE";
    if (pideCompra) return "COMPRAR";
    if (tienePersonal) return "PRUEBA_PERSONAL";
    if (tieneClaro) return "PRUEBA_CLARO";
    if (
      /\b(ya compre|ya consegui|ya tengo el chip|ya lo tengo|ya lo active)\b/.test(
        t,
      ) ||
      pidePrueba
    ) {
      return resolverIntencionPrueba();
    }
    if (
      esAgradecimientoOCierrePuro() ||
      hablaDeComprarChip ||
      /\b(despues|manana|entiendo)\b/.test(t)
    ) {
      return "DESPEDIDA_CHIP";
    }
    if (
      /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches)$/.test(t)
    ) {
      return "SALUDO";
    }
  }

  // Paso 4
  if (pasoActual === 4 && !yaTuvoPruebaReal) {
    if (tieneErrorOSoporte) return "DUDA_HUMANO";
    if (esIncompatible) return "NO_COMPATIBLE";
    if (pidePrueba || t === "1" || t === "1️⃣") {
      return resolverIntencionPrueba();
    }
    if (tienePersonal && !pideCompra) return "PRUEBA_PERSONAL";
    if (tieneClaro && !pideCompra) return "PRUEBA_CLARO";
    if (pideCompra || t === "2" || t === "2️⃣") return "COMPRAR";
    if (esAgradecimientoOCierrePuro()) {
      return "AGRADECIMIENTO_FINAL";
    }
  }

  // Menú Principal (Paso 0 o 1)
  if (pasoActual === 0 || pasoActual === 1) {
    if (t === "1" || t === "uno" || t === "1️⃣" || t === "opcion 1")
      return resolverIntencionPrueba();
    if (t === "2" || t === "dos" || t === "2️⃣" || t === "opcion 2")
      return "COMPRAR";
    if (
      t === "3" ||
      t === "tres" ||
      t === "3️⃣" ||
      t === "opcion 3" ||
      t === "4"
    )
      return "NO_COMPATIBLE";

    if (esIncompatible) return "NO_COMPATIBLE";

    if (pidePrueba) {
      return resolverIntencionPrueba();
    }

    if (pideCompra) return "COMPRAR";
    if (tieneErrorOSoporte) return "DUDA_HUMANO";

    if (tienePersonal) return "PRUEBA_PERSONAL";
    if (tieneClaro) return "PRUEBA_CLARO";

    if (
      pasoActual === 1 &&
      !esPregunta &&
      /^(si+|sii|dale+|ok+|okey|bueno+|bien|quiero|me interesa|pasame|de una|si quiero|si dale|dale quiero|bueno dale|si me interesa|si por favor|dale por favor)$/.test(
        t,
      )
    ) {
      return resolverIntencionPrueba();
    }

    if (/^(info|informacion)$/.test(t)) {
      return "SALUDO";
    }
  }

  // Submenú de Operador (Paso 7)
  else if (pasoActual === 7) {
    if (
      esIncompatible ||
      t === "3" ||
      t === "tres" ||
      t === "3️⃣" ||
      t === "opcion 3"
    )
      return "NO_COMPATIBLE";
    if (t === "1" || t === "uno" || t === "1️⃣" || tienePersonal)
      return "PRUEBA_PERSONAL";
    if (t === "2" || t === "dos" || t === "2️⃣" || tieneClaro)
      return "PRUEBA_CLARO";
    if (pideCompra) return "COMPRAR";
    if (tieneErrorOSoporte) return "DUDA_HUMANO";
    if (pidePrueba) return resolverIntencionPrueba();
  }

  // Paso 3 (Post-Prueba o Cliente Pago Activo)
  else if (pasoActual === 3 || yaTuvoPruebaReal) {
    if (
      memoriaDisco.soporteNivel1Enviado[numeroLimpio] &&
      /\b(ya hice eso|ya lo hice|ya probe|sigue igual|sigue sin|tampoco|no hay caso|nada che|sigue dando error)\b/.test(
        t,
      )
    ) {
      return "SOPORTE";
    }

    if (pideAyudaODudaAbierta) {
      return "DUDA_HUMANO";
    }

    if (t === "2" || t === "2️⃣" || pideCompra) return "COMPRAR";

    if (
      /\b(ahora si|ahi si|ahi conecto|ya conecto|ahi agarro|ya agarro|ahi anduvo|ya anduvo|ahi funciono|ya funciono|ahora conecto|ahora anda|ahora funciona|ya me conecte|ya pude conectar)\b/.test(
        t,
      ) &&
      !/\b(no conecta|no conecto|no anda|no anduvo|no funciona|no funciono)\b/.test(
        t,
      )
    ) {
      return "EXITO";
    }

    const estaPorProbarONoLaHizo =
      /\b(no la hice|no lo hice|aun no la hice|aun no|todavia no|no la probe|no lo probe|no probe|no llegue a probar|no pude probar|estoy viendo|aun estoy viendo|recien veo|recien lo veo|recien la bajo|recien la descargo|descargando|instalando|estoy descargando|estoy instalando|vuelvo a la app|vuelvo a la aplicacion|bancame|espera que pruebo|todavia no pude probar)\b/.test(
        t,
      ) ||
      /\b(ahi|ahora|ya|voy a|despues|mas tarde|en un rato)\s+((lo|la)\s+)?(pruebo|probar|probarlo|probarla|instalo|descargo|me fijo|veo)\b/.test(
        t,
      );
    if (estaPorProbarONoLaHizo) return "EN_PROCESO_PRUEBA";

    if (tieneErrorOSoporte) return "SOPORTE";

    if (
      tieneNegacionOAdversativa &&
      /\b(funciona|funciono|funcionando|conecto|conecta|conecte|conectar|conectado|anda|anduvo|andando|agarra|agarro|internet|carga|velocidad|puedo|pude)\b/.test(
        t,
      ) &&
      !pidePrueba
    ) {
      return "SOPORTE";
    }

    if (
      !esPregunta &&
      !tieneNegacionOAdversativa &&
      !contienePedidoOSolicitudComercial(t) &&
      /\b(funciono|me funciono|si funciono|funciona|me funciona|funcionando|conecto|me conecto|ya conecto|si conecto|conecta|me conecte|conectado|conectada|anduvo|me anduvo|si anduvo|anda|me anda|andando|agarro|me agarro|ya agarro|si pude|ya pude|pude conectar|anda joya|anda bien|todo bien|re bien|muy bien|anda de diez|de diez|10 puntos|excelente|barbaro|espectacular|un lujo|vuela)\b/.test(
        t,
      )
    ) {
      return "EXITO";
    }

    const pideExplicitamenteOtraPrueba =
      t === "1" ||
      t === "1️⃣" ||
      t === "personal" ||
      t === "claro" ||
      pidePrueba ||
      /\b(otra prueba|otro usuario|otro cuenta|probar de nuevo|me das una prueba|me das otra|quiero una prueba|quiero otra prueba|dame una prueba|dame otra prueba|pasame una prueba|mandame la prueba)\b/.test(
        t,
      );

    if (pideExplicitamenteOtraPrueba) {
      return "RECHAZO_PRUEBA";
    }

    if (esAgradecimientoOCierrePuro()) {
      return "AGRADECIMIENTO_FINAL";
    }
  }

  // Filtro anti-alucinación para textos ultra-cortos (ej. "Q 1", "a", "??")
  if (t.length <= 4) {
    return "DESCONOCIDO";
  }

  // Fallback hacia Ollama con Memoria Conversacional
  metadatosClasificacionIA.set(numeroLimpio, "OLLAMA");
  const historialUsuario = Array.isArray(
    memoriaDisco.historialChat[numeroLimpio],
  )
    ? memoriaDisco.historialChat[numeroLimpio]
    : [];
  const ultimoMsgBot = [...historialUsuario]
    .reverse()
    .find((h) => h.rol === "BOT" || h.rol === "OPERADOR");
  const resumenContextoPrevio = ultimoMsgBot
    ? `\nÚltimo mensaje enviado al cliente: "${ultimoMsgBot.texto.replace(/\s+/g, " ").slice(0, 140)}"`
    : "";

  let SYSTEM_PROMPT = "";

  if (pasoActual === 3 || yaTuvoPruebaReal) {
    SYSTEM_PROMPT = `El cliente ya recibió sus credenciales y APK de VPN. Clasifica su mensaje en UNA sola palabra exacta:
- INFO_DURACION_PRUEBA (si pregunta cuanto dura, cuantos dias le quedan, hasta que hora/dia tiene, o cuando vence su plan/prueba)
- TIENE_ABONO (si dice que tiene gigas, saldo activo o abono y pregunta si se le consumen)
- INFO_COMPARTIR_TV (si pregunta si se puede compartir internet, wifi, hotspot o usar en Smart TV / PC)
- SOPORTE_INSTALACION_APK (si dice que no puede instalar o abrir la aplicacion APK)
- INFO_COMO_INSTALAR (si pregunta como hago, donde poner el usuario/contraseña o que servidor elegir)
- INFO_COMO_FUNCIONA (si pregunta si necesita saldo, credito o si gasta megas)
- EN_PROCESO_PRUEBA (si dice "ahora lo pruebo", que aun no se conectó, que está viendo o descargando la app)
- PAGO_REALIZADO (si afirma que ya hizo la transferencia o ya pago)
- SOPORTE (si dice que no le conecta, tiene un error en la app, tiene una duda o pide ayuda)
- EXITO (si dice "me funciono", "ahora si", que ya le conectó o que le anda bien)
- POSTERGAR_COMPRA (si dice que le anduvo bien pero comprará cuando cobre o mas adelante)
- NO_INTERESADO (SOLO si dice explicitamente que no quiere contratar ni comprar)
- AGRADECIMIENTO_FINAL (SOLO si agradece o dice ok, bien ahi, bueno, dale, muchas gracias SIN hacer ninguna pregunta ni pedir precios ni nada mas)
- COMPRAR (si pregunta precios, pide que le pasen los precios, alias, quiere renovar o contratar un plan)
- RECHAZO_PRUEBA (si pide una prueba gratis o que le generen otra prueba)
- SALUDO (si solo saluda o pide informacion inicial del anuncio)
- DESCONOCIDO (si no se entiende)
Responde SOLO con la palabra de la categoria sin tildes.`;
  } else if (pasoActual === 7) {
    SYSTEM_PROMPT = `El bot preguntó "¿Usás Personal (1) o Claro (2)?". Clasifica la respuesta en UNA sola palabra exacta:
- PRUEBA_PERSONAL (si elige 1 o Personal)
- PRUEBA_CLARO (si elige 2 o Claro)
- NO_COMPATIBLE (si elige 3, o tiene Movistar, Tuenti, iPhone o dice que NO tiene Personal ni Claro)
- TIENE_ABONO (si dice que tiene plan con factura, abono o gigas activos)
- INFO_DURACION_PRUEBA (si pregunta cuanto dura la prueba)
- INFO_COMPARTIR_TV (si pregunta si se puede compartir internet o conectar a TV/PC)
- INFO_COMO_FUNCIONA (si pregunta como funciona o si necesita saldo)
- DESCONOCIDO (si dice otra cosa o no se entiende)
Responde SOLO con la palabra de la categoria sin tildes.`;
  } else {
    SYSTEM_PROMPT = `Clasifica el mensaje del cliente de VPN en UNA sola palabra exacta:
- FALTA_OPERADOR (si quiere probar gratis pero NO aclara si tiene Personal o Claro)
- PRUEBA_PERSONAL (si quiere probar y dice tener Personal)
- PRUEBA_CLARO (si quiere probar y dice tener Claro)
- COMPRAR (si pregunta precios, cuanto cuesta, pide alias o quiere un plan)
- INFO_DURACION_PRUEBA (si pregunta cuanto tiempo dura la prueba gratis)
- INFO_COMPARTIR_TV (si pregunta si se puede compartir internet, wifi o usar en Smart TV / PC)
- INFO_COMO_FUNCIONA (si pregunta como funciona el servicio o si necesita saldo/credito)
- NO_COMPATIBLE (si tiene Movistar, Tuenti, iPhone o no tiene chip compatible)
- TIENE_ABONO (si dice tener abono, factura o gigas activos)
- POSTERGAR_COMPRA (si dice que ahora no tiene plata o que comprará cuando cobre)
- NO_INTERESADO (SOLO si dice explicitamente que no quiere contratar o no le interesa)
- AGRADECIMIENTO_FINAL (SOLO si afirma bien, gracias, dale, despues te aviso SIN hacer preguntas ni pedir nada)
- SALUDO (si solo saluda, dice hola info, pregunta por el anuncio o pide informacion general)
- DESCONOCIDO (si no se entiende o pregunta otra cosa)
Responde SOLO con la palabra de la categoria sin tildes.`;
  }

  const textoParaPrompt = esPregunta ? `¿${t}?` : t;
  try {
    const respuesta = await ejecutarOllamaSerializado(() =>
      axios.post(
        "http://127.0.0.1:11434/api/generate",
        {
          model: "llama3.2",
          prompt: `${SYSTEM_PROMPT}${resumenContextoPrevio}\nMensaje: "${textoParaPrompt}"\nCategoria:`,
          stream: false,
          options: {
            temperature: 0,
            num_predict: 15,
          },
        },
        { timeout: 8000 },
      ),
    );

    const respuestaLimpia = String(respuesta.data.response || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

    const permitidas = [
      "PAGO_REALIZADO",
      "SALUDO",
      "FALTA_OPERADOR",
      "PRUEBA_PERSONAL",
      "PRUEBA_CLARO",
      "COMPRAR",
      "INFO_DURACION_PRUEBA",
      "INFO_COMPARTIR_TV",
      "SOPORTE_INSTALACION_APK",
      "INFO_COMO_FUNCIONA",
      "INFO_COMO_INSTALAR",
      "NO_COMPATIBLE",
      "TIENE_ABONO",
      "POSTERGAR_COMPRA",
      "NO_INTERESADO",
      "DESPEDIDA_CHIP",
      "EXITO",
      "AGRADECIMIENTO_FINAL",
      "EN_PROCESO_PRUEBA",
      "SOPORTE",
      "RECHAZO_PRUEBA",
    ];

    let categoria =
      permitidas.find((cat) => respuestaLimpia.includes(cat)) || "DESCONOCIDO";

    if (
      categoria === "AGRADECIMIENTO_FINAL" &&
      (esPregunta ||
        pideAyudaODudaAbierta ||
        contienePedidoOSolicitudComercial(t) ||
        palabras.length <= 1)
    ) {
      categoria = "DESCONOCIDO";
    }

    if (categoria === "NO_INTERESADO" && mencionaAnuncioOInfoInicial) {
      categoria = "SALUDO";
    }

    if (categoria === "FALTA_OPERADOR" && operadorRecordado) {
      return operadorRecordado === "claro" ? "PRUEBA_CLARO" : "PRUEBA_PERSONAL";
    }

    return categoria;
  } catch (error) {
    console.error("❌ Error/Timeout Ollama:", error.message);
    return "DESCONOCIDO";
  }
}

// ============================================================================
// DETECTOR DE MÚLTIPLES INTENCIONES EN UNA MISMA INTERVENCIÓN
// Ej: "¿Cuánto sale y cómo funciona?" o "¿Cuánto cuesta y me das una prueba?"
// ============================================================================
function detectarMultiplesIntenciones(
  numeroLimpio,
  textoCliente,
  intencionPrincipal,
  pasoActual,
  yaTuvoPruebaReal,
) {
  const intenciones = [intencionPrincipal];
  const sinTildes = String(textoCliente || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?¡¿"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const t = normalizarFoneticaArgentina(sinTildes);
  if (!t || t.split(/\s+/).length < 4) return intenciones;

  const pidePrecio =
    /\b(precio|precios|cuanto sale|cuanto cuesta|cuanto vale|planes|como lo contrato|como contrato)\b/.test(
      t,
    );
  const pideComoFunciona =
    /\b(como funciona|como es el servicio|necesito saldo|necesito tener saldo|consume megas|sin saldo)\b/.test(
      t,
    );
  const pideDuracion =
    /\b(cuanto dura|cuantas horas|cuando vence|hasta que hora)\b/.test(t);
  const pideCompartir =
    /\b(compartir|zona wifi|hotspot|smart tv|tele|pc)\b/.test(t);
  const pidePrueba =
    /\b(prueba|probar|gratis)\b/.test(t) &&
    !/\b(antes de probar|antes de la prueba)\b/.test(t) &&
    !yaTuvoPruebaReal &&
    pasoActual !== 3;

  if (
    pideComoFunciona &&
    !intenciones.includes("INFO_COMO_FUNCIONA") &&
    intencionPrincipal === "COMPRAR"
  ) {
    intenciones.unshift("INFO_COMO_FUNCIONA");
  } else if (
    pidePrecio &&
    !intenciones.includes("COMPRAR") &&
    (intencionPrincipal === "INFO_COMO_FUNCIONA" ||
      intencionPrincipal === "INFO_DURACION_PRUEBA" ||
      intencionPrincipal === "INFO_COMPARTIR_TV")
  ) {
    intenciones.push("COMPRAR");
  }

  if (
    pideDuracion &&
    !intenciones.includes("INFO_DURACION_PRUEBA") &&
    intencionPrincipal === "COMPRAR"
  ) {
    intenciones.unshift("INFO_DURACION_PRUEBA");
  }

  if (
    pideCompartir &&
    !intenciones.includes("INFO_COMPARTIR_TV") &&
    intencionPrincipal === "COMPRAR"
  ) {
    intenciones.unshift("INFO_COMPARTIR_TV");
  }

  if (pidePrueba && intencionPrincipal === "COMPRAR") {
    const op = memoriaDisco.operadorDetectado[numeroLimpio];
    const intPrueba =
      op === "claro"
        ? "PRUEBA_CLARO"
        : op === "personal"
          ? "PRUEBA_PERSONAL"
          : "FALTA_OPERADOR";
    if (!intenciones.includes(intPrueba)) {
      intenciones.push(intPrueba);
    }
  }

  return intenciones;
}

module.exports = {
  normalizarFoneticaArgentina,
  detectarInsulto,
  esMensajeAperturaIncompleta,
  esConfirmacionOCierreCorto,
  esCancelacionOperacion,
  detectarMultiplesIntenciones,
  ejecutarOllamaSerializado,
  descubrirIntencionConIA,
};
