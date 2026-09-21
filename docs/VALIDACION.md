# Validación de la primera versión

## Motor

Ejecutar `npm test` con Node.js 20 o superior. La suite no depende de la interfaz ni de paquetes externos.

Las pruebas incluyen:

- Todas las columnas y posiciones de fallos de FIFO (4 marcos), Belady (5), LRU (3) y Reloj (4) de los ejemplos de clase.
- Segunda oportunidad con las mismas condiciones que Reloj: se comprueban también las limpiezas de bits.
- Ejemplo Óptimo de OSTEP: 5 fallos y el desempate explícito de páginas sin uso futuro.
- NRU: prioridad de las cuatro clases, conservación de M, límites exactos de reinicio, convenciones de desempate y reproducción con semilla.
- Estado inicial, mano inicial, huecos, aciertos, páginas modificadas y escritura al reemplazar.
- Validación de entradas y conservación de las instantáneas históricas.
- Oráculo independiente de Óptimo: busca todas las víctimas posibles para obtener el mínimo global en las 729 cadenas de longitud 6 sobre tres páginas, con capacidades 1, 2 y 3 (2,187 comparaciones).
- 120 cadenas de 40 referencias: invariantes en los seis algoritmos, comparación con Óptimo y equivalencia Reloj/Segunda oportunidad bajo condiciones equivalentes.
- 2,000 referencias en cada algoritmo, un marco, repeticiones y memoria suficiente.

Estas pruebas detectan errores específicos de selección y conteo; no son una promesa de ausencia absoluta de errores.

## Interfaz

La prueba `tests/browser-smoke.cjs` abre el archivo local en Chromium y bloquea toda solicitud HTTP/HTTPS. Verifica ejemplos, navegación, memoria inicial, estados intermedios, comparación, cambios pendientes, errores de entrada, descarga/importación JSON, preparación de impresión de 40 referencias, borrador y anchura móvil.

En la primera comprobación local pasaron las 22 pruebas del motor. La revisión visual local quedó bloqueada por las restricciones del navegador del entorno. El repositorio incluye un trabajo separado de GitHub Actions para ejecutar la prueba real de interfaz; su resultado aparece en la pestaña Actions. No se debe dar esa prueba por aprobada hasta que ese trabajo termine correctamente.

Para reproducirla se requiere Playwright; consulta el README. El navegador y las dependencias de pruebas no se necesitan para ejecutar la app.

## Alcance de la evidencia

Los resultados de FIFO, LRU y Reloj se contrastan con las capturas compartidas. Óptimo se contrasta con un ejemplo de un libro de texto y con un oráculo independiente. NRU tiene pruebas explícitas de sus reglas, pero aún debe compararse con un enunciado completo del profesor que incluya bits, intervalo y desempate.

La prueba automatizada de navegador no sustituye la comprobación final en el equipo Windows que se utilizará para el examen. Al abrir allí la app, verifica al menos el ejemplo FIFO (11 fallos), Reloj (10 fallos), el guardado de un JSON y una vista previa de impresión.
