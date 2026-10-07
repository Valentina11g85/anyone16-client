# Secretos empresariales y control de acceso

## Información confidencial
- Claves privadas (service role de Foundation, tokens de Mercado Pago, claves de Google Maps): solo en variables secretas del servidor; **nunca** en el código del navegador ni en documentos.
- Reglas de comisiones, configuraciones antifraude y lógica de precios.
- Datos de usuarios, pagos y verificaciones.
- Hoja de ruta y métricas.

## Medidas existentes
- La clave pública (anon) es la única en el navegador; la base aplica RLS por usuario.
- Archivos de Oportunidades en bucket privado con enlaces temporales.
- Operaciones financieras y legales solo por funciones del servidor que validan al usuario.
- Registro de auditoría (`audit_logs`) para acciones sensibles.

## Acceso de personas
| Recurso | Quién | Cómo se revoca |
|---|---|---|
| Proyecto Lovable | Titular | Ajustes del workspace |
| Foundation (Supabase) | Titular | Panel del proyecto → miembros |
| Rol admin en la app | Filas en `user_roles` | Eliminar la fila del rol |
| Mercado Pago / Google Cloud | Titular | Panel de cada proveedor |

## Pendiente
- [ ] Acuerdos de confidencialidad con colaboradores.
- [ ] Rotar claves si alguna persona deja de colaborar.
- [ ] Activar 2FA en todas las cuentas de proveedores.
