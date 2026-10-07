# Auditoría de la implementación legal (2026-10-07)

## Base de datos (SQL pendiente `2026-10-07_legal_privacidad.sql`)
- Todas las tablas nuevas con RLS. Usuarios: solo sus aceptaciones y solicitudes. Borradores legales, inventario PI y cumplimiento: solo admin.
- Sin INSERT/UPDATE/DELETE de usuario en documentos, aceptaciones ni solicitudes: todo por funciones con `search_path` fijo que validan al actor.
- Aceptaciones: solo de versiones publicadas; fecha, versión y cuenta las pone el servidor; registro inmutable (revocar = nuevo evento).
- Una sola versión publicada por documento+idioma+jurisdicción (índice único + bloqueo al publicar). Lo publicado no se puede editar ni borrar.
- Eliminación de cuenta = solicitud revisada por una persona; no borra registros que la ley exige conservar.
- Funciones de usuario no ejecutables por `anon`. Lectura pública solo de versiones publicadas/archivadas (necesario para leer los términos antes de registrarse).

## Frontend
- Registro: casillas separadas (términos+privacidad; tratamiento de datos y mayoría de edad; comunicaciones comerciales opcional). Solo se guarda una intención local; Foundation registra la aceptación en el primer inicio de sesión de esa misma cuenta.
- Si hay una versión publicada sin aceptar, la app pide aceptarla antes de continuar.
- Sin sellos falsos: textos marcados como borrador; marca "en proceso de registro"; no se usa ®.

## Riesgos abiertos
- Mientras el SQL no se ejecute, la app muestra borradores y no registra aceptaciones.
- La intención de registro se guarda en el navegador: si la persona confirma su correo en otro dispositivo, se le pedirá aceptar de nuevo (es lo correcto).
- Plazos legales de respuesta configurados de forma orientativa (14/21 días naturales); confirmar con abogado.
- Tests automáticos con cuentas reales no ejecutados (requieren el SQL y cuentas de prueba).
