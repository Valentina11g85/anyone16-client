# Preparación para registro de soporte lógico ante la DNDA (Colombia)

> Checklist de trabajo. Verificar requisitos vigentes en el portal de la Dirección Nacional de Derecho de Autor antes de radicar.

## Datos de la obra
- Título: AnyOne¹⁶ (plataforma web de favores y oportunidades de servicios).
- Clase: soporte lógico (software).
- Autor(es): Valentina Gómez Acevedo — confirmar si hay más autores.
- Titular de derechos patrimoniales: Valentina Gómez Acevedo.
- País de origen: Colombia. Año de creación: 2026 (confirmar fecha de inicio real).
- Obra: original / derivada — confirmar (usa componentes open source bajo licencia).

## Material a preparar
- [ ] Descripción funcional (qué hace, módulos: cuentas, Favores, Oportunidades, pagos, ganancias, confianza y seguridad, legal).
- [ ] Programa fuente: exportar una copia fechada del código (sin `.env`, sin claves) y calcular su hash SHA-256.
- [ ] Manual de usuario o capturas de pantalla.
- [ ] Diagrama de arquitectura y del modelo de datos.
- [ ] Lista de componentes de terceros (`licencias-open-source.md`) para declarar que no se reclama titularidad sobre ellos.
- [ ] Cesiones firmadas de colaboradores (`plantillas-colaboradores.md`).

## Cómo generar la huella del código
```bash
git archive --format=tar HEAD | sha256sum
```
Guardar el resultado junto con la fecha. **Nunca** incluir claves privadas ni el archivo `.env`.
