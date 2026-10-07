/**
 * AnyOne¹⁶ — BORRADORES de documentos legales (es-CO).
 * Fuente para que un administrador cree la versión 1.0 en Foundation.
 * NO son documentos vigentes ni asesoría jurídica: requieren revisión de abogado.
 * La app solo trata como vigente lo que Foundation tenga en estado "published".
 */
export type LegalDocType =
  | "terms"
  | "privacy_policy"
  | "data_treatment"
  | "cancellations_refunds"
  | "platform_rules"
  | "intellectual_property"
  | "cookies";

export const OPERATOR = {
  name: "Valentina Gómez Acevedo",
  idLabel: "NIT 1000149319-6",
  city: "Bogotá D.C., Colombia",
  address: "PENDIENTE DE DEFINICIÓN (dirección de notificaciones)",
  email: "anyone16foundation@gmail.com",
};

const HEAD = `> **Borrador pendiente de revisión por abogado.** Este texto fue preparado como base de trabajo y no constituye asesoría jurídica. No está vigente hasta que se publique formalmente.\n\n`;
const OP = `**${OPERATOR.name}**, persona natural identificada con ${OPERATOR.idLabel}, con domicilio en ${OPERATOR.city}. Dirección de notificaciones: ${OPERATOR.address}. Correo: ${OPERATOR.email}.`;

export const LEGAL_TITLES: Record<LegalDocType, string> = {
  terms: "Términos y condiciones de AnyOne¹⁶",
  privacy_policy: "Política de privacidad",
  data_treatment: "Política de tratamiento de datos personales",
  cancellations_refunds: "Política de cancelaciones y reembolsos",
  platform_rules: "Reglas de uso de AnyOne¹⁶",
  intellectual_property: "Propiedad intelectual",
  cookies: "Cookies y tecnologías similares",
};

export const REQUIRES_ACCEPTANCE: Record<LegalDocType, boolean> = {
  terms: true,
  privacy_policy: true,
  data_treatment: true,
  cancellations_refunds: false,
  platform_rules: false,
  intellectual_property: false,
  cookies: false,
};

export const LEGAL_DRAFTS: Record<LegalDocType, string> = {
  terms: `${HEAD}# Términos y condiciones de AnyOne¹⁶

## 1. Operador
AnyOne¹⁶ es operada por ${OP}

## 2. Qué es AnyOne¹⁶
AnyOne¹⁶ es una plataforma tecnológica que conecta personas. Tiene dos espacios:
- **Favores**: una persona (cliente) publica una tarea puntual (por ejemplo, recoger un paquete o hacer una fila) y personas trabajadoras registradas ofrecen hacerla.
- **Oportunidades**: personas ofrecen o buscan servicios (oficios, profesiones, talentos), negocian una propuesta y, si hay acuerdo, se crea una contratación entre el contratante y el prestador.

## 3. AnyOne¹⁶ no es el prestador
AnyOne¹⁶ facilita el contacto, la negociación, la comunicación y, cuando está habilitado, el pago. **Los servicios los prestan los usuarios de forma independiente.** AnyOne¹⁶ no es empleador de los trabajadores ni prestadores, ni agente de ninguna de las partes. PENDIENTE DE DEFINICIÓN: alcance exacto de la responsabilidad del operador frente al Estatuto del Consumidor (Ley 1480 de 2011) y régimen de plataformas.

## 4. Cuentas
- Necesitas una cuenta con datos verdaderos. Una persona, una cuenta.
- Eres responsable de la confidencialidad de tu contraseña y de la actividad de tu cuenta.
- Una misma cuenta puede usarse como cliente, trabajador, contratante y prestador.

## 5. Edad
Debes ser **mayor de 18 años**. No se permite el registro de menores de edad.

## 6. Verificación
Algunas funciones (por ejemplo, trabajar en Favores) pueden exigir verificación de identidad, teléfono u otros controles. La verificación reduce riesgos pero **no garantiza** la conducta de ningún usuario.

## 7. Obligaciones de todos los usuarios
Usar la plataforma de forma lícita, respetuosa y honesta; no suplantar a nadie; no publicar contenido prohibido (ver Reglas de uso); cumplir lo acordado.

## 8. Obligaciones de trabajadores y prestadores
Prestar el servicio con diligencia y según lo acordado; contar con las licencias, permisos y capacidades que la actividad exija; cumplir sus obligaciones tributarias y de seguridad social como independientes. PENDIENTE DE DEFINICIÓN: requisitos por categoría de servicio.

## 9. Publicaciones, ofertas y propuestas
Quien publica es responsable de su contenido. Las propuestas y contrapropuestas quedan registradas; cada una es una nueva oferta y las anteriores no se modifican.

## 10. Contrataciones (Oportunidades)
Cuando se acepta un precio se crea una contratación. Estados: precio acordado → confirmada por el contratante → iniciada por el prestador → completada; también puede cancelarse o abrirse una disputa. Solo el contratante confirma y solo el prestador inicia el servicio.

## 11. Comunicaciones
Las conversaciones dentro de la plataforma pueden conservarse para seguridad, soporte y resolución de disputas.

## 12. Pagos y comisiones
Cuando el pago en la plataforma está habilitado, se procesa a través de un proveedor de pagos externo (actualmente Mercado Pago). Las comisiones se calculan en el servidor y **se muestran antes de pagar**. PENDIENTE DE DEFINICIÓN: porcentajes vigentes, facturación y responsable tributario.

## 13. Ganancias y retiros (prestadores)
Las ganancias de una contratación pagada y completada quedan pendientes durante un período de seguridad antes de estar disponibles. Los retiros se solicitan desde la app y quedan pendientes de procesamiento; hoy no hay transferencias automáticas. PENDIENTE DE DEFINICIÓN: plazos, comisión de retiro y proveedor de pagos a prestadores.

## 14. Cancelaciones y disputas
Ver la Política de cancelaciones y reembolsos. Las disputas se revisan con la información registrada en la plataforma.

## 15. Reseñas
Solo las partes de una contratación completada pueden calificarse entre sí, una vez cada una. Las reseñas deben ser honestas y no pueden comprarse ni manipularse.

## 16. Contenido de los usuarios y propiedad intelectual
Conservas los derechos sobre lo que publicas y concedes a AnyOne¹⁶ una licencia no exclusiva, gratuita y limitada para mostrarlo dentro de la plataforma mientras esté publicado. La plataforma, su código, diseño y marca pertenecen al operador (ver Propiedad intelectual).

## 17. Fraude, suplantación y actividades ilegales
Está prohibido. Podemos suspender cuentas, conservar evidencia y colaborar con autoridades competentes cuando la ley lo exija.

## 18. Seguridad
Aplicamos medidas razonables de seguridad, pero ningún sistema es infalible. Reporta cualquier incidente a ${OPERATOR.email}.

## 19. Suspensión y terminación
Podemos suspender o cerrar cuentas que incumplan estos términos. Puedes solicitar el cierre de tu cuenta desde "Legal y privacidad". Algunos registros se conservan cuando la ley lo exige (por ejemplo, pagos y contrataciones).

## 20. Limitación de responsabilidad
En la medida permitida por la ley colombiana, AnyOne¹⁶ no responde por la calidad, legalidad o ejecución de los servicios que prestan los usuarios. PENDIENTE DE DEFINICIÓN: redacción final por abogado.

## 21. Disponibilidad
La plataforma puede tener interrupciones por mantenimiento o fallas de terceros.

## 22. Cambios a estos términos
Publicaremos nuevas versiones dentro de la app. Cuando un cambio requiera tu aceptación, te la pediremos antes de continuar.

## 23. Ley aplicable y jurisdicción
Ley de la República de Colombia. Jueces de Bogotá D.C., sin perjuicio de los derechos del consumidor. PENDIENTE DE DEFINICIÓN: mecanismos alternativos de solución.

## 24. Datos personales
Se rigen por la Política de privacidad y la Política de tratamiento de datos personales.

## 25. Contacto
${OPERATOR.email}
`,

  privacy_policy: `${HEAD}# Política de privacidad

## 1. Responsable del tratamiento
${OP}

## 2. Qué datos tratamos
- **Identificación y contacto**: nombre, correo, celular.
- **Cuenta**: país, idioma, moneda, preferencias, rol (cliente/trabajador/contratante/prestador).
- **Ubicación**: direcciones de recogida/entrega de favores y, si lo permites, la ubicación del dispositivo durante un favor activo.
- **Contratación**: publicaciones, propuestas, contratos, estados, reseñas.
- **Pagos**: montos, estados y referencias de pago. No guardamos números completos de tarjeta; los procesa el proveedor de pagos.
- **Prestadores**: perfil, categorías, zona, ganancias, solicitudes de retiro y método de retiro (solo un nombre y, opcionalmente, últimos 4 dígitos).
- **Verificación**: datos de verificación de identidad y antecedentes cuando aplique, con tu autorización.
- **Imágenes y evidencias**: fotos de publicaciones, portafolios y evidencias de favores.
- **Comunicaciones**: mensajes dentro de la app.
- **Datos técnicos y registros**: registros de seguridad y auditoría de acciones sensibles.

## 3. Para qué los usamos
Prestar el servicio; conectar usuarios; procesar pagos; seguridad y prevención de fraude; soporte y disputas; cumplir obligaciones legales; y, solo si lo autorizas, comunicaciones comerciales.

## 4. Base del tratamiento
Autorización previa, expresa e informada del titular (Ley 1581 de 2012 y Decreto 1377 de 2013), ejecución del contrato y obligaciones legales. PENDIENTE DE DEFINICIÓN: validación por abogado.

## 5. Proveedores que intervienen (encargados)
Solo los que la plataforma usa realmente:
- **Supabase** (base de datos, autenticación y almacenamiento de archivos).
- **Lovable / Cloudflare** (alojamiento y ejecución de la aplicación).
- **Google Maps Platform** (mapas, direcciones y rutas).
- **Mercado Pago** (procesamiento de pagos).
- **Lovable AI Gateway** (interpretar el texto con el que describes un favor; no publica nada por sí solo).
PENDIENTE DE DEFINICIÓN: región de alojamiento de cada proveedor y contratos de transmisión.

## 6. Transferencias y transmisiones internacionales
Estos proveedores pueden almacenar o procesar datos fuera de Colombia. PENDIENTE DE DEFINICIÓN: análisis de nivel adecuado de protección y, si aplica, declaración ante la SIC.

## 7. Seguridad
Control de acceso por usuario en la base de datos, archivos privados con enlaces temporales, registro de auditoría y operaciones financieras validadas en el servidor.

## 8. Conservación
Mientras tengas cuenta y, después, el tiempo que exijan obligaciones legales, contables o de defensa (por ejemplo, registros de pagos y contrataciones). PENDIENTE DE DEFINICIÓN: plazos por categoría.

## 9. Tus derechos
Conocer, actualizar, rectificar, solicitar prueba de la autorización, ser informado del uso, presentar quejas ante la Superintendencia de Industria y Comercio, revocar la autorización y pedir la supresión cuando no exista un deber legal de conservar los datos.

## 10. Cómo ejercerlos
Desde **Perfil → Legal y privacidad → Solicitudes de privacidad**, o escribiendo a ${OPERATOR.email}. Consultas: 10 días hábiles; reclamos: 15 días hábiles (prorrogables según la ley).

## 11. Cookies y almacenamiento local
Ver "Cookies y tecnologías similares".

## 12. Menores de edad
AnyOne¹⁶ no está dirigida a menores de 18 años y no recolectamos sus datos de forma consciente.

## 13. Cambios
Publicaremos cualquier cambio en la app con su número de versión y fecha.
`,

  data_treatment: `${HEAD}# Política de tratamiento de datos personales

Esta política cumple la función de manual interno exigido por el Decreto 1377 de 2013 y se complementa con la Política de privacidad.

## 1. Responsable
${OP}

## 2. Autorización
Al crear tu cuenta te pedimos autorización expresa para tratar tus datos con las finalidades descritas. La autorización queda registrada con fecha, versión del documento y cuenta. Puedes revocarla cuando no exista un deber legal o contractual de conservar los datos.

## 3. Datos sensibles
Los datos biométricos o de verificación de identidad solo se tratan con autorización específica y para fines de seguridad. Puedes negarte a entregarlos; algunas funciones (como trabajar en Favores) podrían no estar disponibles.

## 4. Procedimiento de consultas y reclamos
1. Envía la solicitud desde la app o al correo ${OPERATOR.email}.
2. Recibirás confirmación de recepción.
3. Consultas: respuesta en máximo 10 días hábiles. Reclamos: máximo 15 días hábiles.
4. Si la solicitud está incompleta, te pediremos completarla.

## 5. Área responsable
PENDIENTE DE DEFINICIÓN: persona/área encargada de atender peticiones (por ahora, el operador).

## 6. Registro Nacional de Bases de Datos
PENDIENTE DE DEFINICIÓN: verificar si aplica la obligación de inscripción ante la SIC.

## 7. Vigencia
Desde su publicación en la plataforma.
`,

  cancellations_refunds: `${HEAD}# Política de cancelaciones y reembolsos

## Oportunidades
- Cualquiera de las partes puede **cancelar** una contratación mientras esté en "precio acordado", "confirmada" o "en progreso". La cancelación queda registrada con quién la hizo.
- Se puede **abrir una disputa** explicando el motivo (mínimo 5 caracteres). La contratación queda detenida hasta resolverla.
- Una contratación completada no puede cancelarse.
- Si hubo pago, el reembolso se solicita desde el detalle del pago y lo valida el servidor; el monto nunca puede superar lo pagado. Un reembolso revierte la ganancia del prestador.

## Favores
Se aplican las políticas de cancelación configuradas para Favores, que se muestran antes de confirmar. PENDIENTE DE DEFINICIÓN: porcentajes y plazos vigentes.

## Plazos y medios
PENDIENTE DE DEFINICIÓN: plazos de devolución según el proveedor de pagos y derecho de retracto cuando aplique (Ley 1480 de 2011).
`,

  platform_rules: `${HEAD}# Reglas de uso de AnyOne¹⁶

1. Trata a todas las personas con respeto. No se tolera acoso, discriminación ni violencia.
2. Publica solo servicios y tareas lícitos.
3. **Contenido prohibido**: armas, drogas, servicios sexuales, contenido de menores, apuestas ilegales, documentos falsos, productos robados, servicios que exijan licencias que no tienes, spam, estafas y cualquier actividad ilegal.
4. No suplantes a otras personas ni empresas.
5. No intentes sacar pagos fuera de la plataforma cuando el pago está habilitado en ella para evitar comisiones o controles.
6. No manipules reseñas.
7. No subas imágenes de terceros sin autorización.
8. Reporta conductas indebidas desde Confianza y Seguridad.
9. El incumplimiento puede llevar a retirar contenido, suspender o cerrar la cuenta.
`,

  intellectual_property: `${HEAD}# Propiedad intelectual

## Titularidad
El software de AnyOne¹⁶ (código fuente, código objeto, bases de datos, arquitectura, diseños, interfaces, textos propios y elementos gráficos) es una obra protegida por el derecho de autor (Ley 23 de 1982, Decisión Andina 351 de 1993). Su titular es ${OPERATOR.name}, salvo los componentes de terceros indicados en el inventario de licencias.

## Marca
"AnyOne¹⁶" y sus logotipos se usan como signos distintivos. **A la fecha no constan como marcas registradas**; su registro está en preparación. No se debe usar el símbolo ® hasta obtener el registro.

## Software de terceros
La aplicación usa componentes de código abierto bajo sus propias licencias (MIT, Apache-2.0, ISC, BSD y otras), que se respetan. El listado está disponible bajo solicitud.

## Uso permitido
Puedes usar la aplicación para su fin. No puedes copiar, descompilar, extraer bases de datos, revender, ni usar la marca sin autorización escrita.

## Reportes
Si crees que un contenido infringe tus derechos, escribe a ${OPERATOR.email}.
`,

  cookies: `${HEAD}# Cookies y tecnologías similares

Hoy AnyOne¹⁶ **no usa cookies de publicidad ni de rastreo de terceros**.

Usamos almacenamiento local del navegador únicamente para que la app funcione:
- mantener tu sesión iniciada;
- recordar tu tema claro/oscuro y preferencias;
- recordar si diste permiso de ubicación.

Los mapas de Google pueden usar sus propias tecnologías al mostrarse; aplican las políticas de Google.

Si en el futuro se añaden herramientas de analítica o publicidad, actualizaremos esta política y pediremos tu consentimiento cuando la ley lo exija.
`,
};
