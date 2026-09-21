# Laboratorio MMU

Simulador de paginación para practicar los seis algoritmos del examen de Sistemas Operativos: **FIFO, Óptimo, LRU, NRU, Segunda oportunidad y Reloj (Clock)**.

Introduce la cadena exacta del ejercicio, define los marcos y revisa la matriz de páginas y fallos, como en las tablas de clase. Puedes recorrer cada referencia y sus acciones intermedias.

## Abrir la app

1. Descarga el repositorio con **Code → Download ZIP** y **extrae el ZIP**; o clónalo:

   ```bash
   git clone https://github.com/Jose-RCastle/Examen-Sistemas-Operativos.git
   ```

2. Abre **`index.html`** con Chrome, Edge o Firefox.
3. Presiona **Resolver ejercicio**. El ejemplo inicial debe mostrar **11 fallos, 4 aciertos y 26.67 % de rendimiento**.

También puedes abrir la carpeta en VS Code y usar **Open with Live Server** sobre `index.html`. Live Server es opcional. **Para usar la app no necesitas Node.js, npm, compilación, base de datos ni internet.** Mantén juntos `index.html`, `styles.css` y la carpeta `js`.

## Resolver un ejercicio

1. Pega las referencias, por ejemplo `2 4 6 5 1 2 4 3 3 2 4 6 5 1 3`.
2. Configura los marcos y el algoritmo.
3. Si el enunciado especifica memoria inicial, bits o reglas NRU, introdúcelos antes de resolver.
4. Pulsa **Resolver ejercicio**.
5. Selecciona una columna o usa anterior/siguiente. En el panel inferior, selecciona cada acción para ver su efecto sobre la memoria.

La tabla siempre muestra el estado **posterior** a cada referencia. `X` indica fallo; `—` indica acierto en la fila de fallos y marco vacío en las filas de memoria. Cargar en un marco libre también cuenta como fallo. El último estado permanece visible.

### Entrada y convenciones

- Separadores: espacios, comas, punto y coma o saltos de línea.
- Páginas: `0`, `1`, `12`, `P1`, etc. Se conserva la identidad textual: `01` y `1` son distintas, igual que `P1` y `p1`.
- Lectura: `2` o `2:R`. Escritura: `2:W` o el atajo numérico `2w`. Para una etiqueta que termine en W, usa `P2:W` para marcar la escritura sin ambigüedad.
- Límites visibles: 1–64 marcos y hasta 2,000 referencias. Las pruebas de examen de 30–40 referencias están dentro de estos límites.
- Por defecto, memoria vacía. Los ajustes de NRU se muestran al seleccionar ese algoritmo. **NRU no tiene una tabla única si el enunciado no fija bits, reinicios y desempates.**

Lee [las convenciones exactas](docs/CONVENCIONES.md) antes de comparar una tabla con una solución de clase. No se deben modificar reglas solo para forzar un resultado esperado.

## Herramientas

- **Comparar los 6:** misma cadena y memoria inicial; NRU usa las reglas configuradas en el formulario.
- **Reproducir / Pausar**, controles de avance y memoria inicial.
- **Ocultar referencias futuras:** recorrido progresivo de la tabla.
- **Guardar / Abrir ejercicio:** JSON con todos los datos y reglas; útil para llevar ejercicios de una computadora a otra.
- **Imprimir / PDF:** abre el diálogo del navegador. Elige “Guardar como PDF”. Divide las referencias en bloques de 12 columnas, sin omitir ninguna.
- **CSV:** matriz y totales para consultar con una hoja de cálculo.
- Recuperación del último ejercicio resuelto si el navegador permite almacenamiento local. El JSON descargado es el respaldo portable; no dependas del borrador del navegador.

Cambiar un dato marca el resultado anterior como pendiente de actualizar. Pulsa **Resolver ejercicio** para que la tabla corresponda a los nuevos datos.

## Ejemplos y validación

| Ejemplo | Marcos | Fallos | Aciertos | Rendimiento |
|---|---:|---:|---:|---:|
| FIFO de clase, 15 referencias | 4 | 11 | 4 | 26.67 % |
| Misma cadena, anomalía de Belady | 5 | 12 | 3 | 20.00 % |
| LRU de clase, 12 referencias | 3 | 6 | 6 | 50.00 % |
| Reloj de clase, 12 referencias, sin reinicio periódico de R | 4 | 10 | 2 | 16.67 % |
| Segunda oportunidad, misma cadena del reloj | 4 | 10 | 2 | 16.67 % |
| Óptimo, ejemplo OSTEP de 11 referencias | 3 | 5 | 6 | 54.55 % |

El ejemplo de NRU incluido es una práctica construida para mostrar lecturas, escrituras y reinicio de R; **no se presenta como una solución confirmada del profesor**.

### Pruebas del motor (solo desarrollo)

Con Node.js 20 o superior:

```bash
npm test
```

No hace falta instalar paquetes. Las pruebas usan el ejecutor incorporado de Node e incluyen las columnas esperadas, bits y punteros, validación de entradas, un oráculo exhaustivo de Óptimo y cadenas largas. Consulta [qué se comprobó](docs/VALIDACION.md).

### Prueba opcional de navegador

Requiere Playwright únicamente para desarrollo:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/browser-smoke.cjs
```

La app se abre con `file://` y la prueba bloquea todas las peticiones HTTP/HTTPS. Comprueba navegación, acciones intermedias, comparación, JSON, impresión y diseño móvil.

## Organización

```text
index.html               Pantalla de la app
styles.css               Diseño y formato de impresión
js/engine.js             Motor independiente y validación de entrada
js/app.js                Interfaz, reproducción y exportación
tests/engine.test.cjs     Pruebas matemáticas y de estado
tests/browser-smoke.cjs   Prueba de la interfaz real
docs/CONVENCIONES.md      Reglas reproducibles por algoritmo
docs/VALIDACION.md        Evidencia y límites de la validación
```

## Alcance

Esta app resuelve ejercicios de **reemplazo de páginas**. Las referencias son las que introduces: no se generan a partir de ráfagas o de un planificador. El porcentaje llamado “rendimiento” es la tasa de aciertos que se usa en clase, no una medición de velocidad del sistema operativo.

El proyecto completo de Sistemas Operativos tiene requisitos adicionales (procesos, planificador, quantum y listas enlazadas). Este repositorio es la herramienta de paginación para el examen; no sustituye esos entregables.

## Fuentes para contrastar las reglas

- [OSTEP, capítulo 22: Beyond Physical Memory — Policies](https://pages.cs.wisc.edu/~remzi/OSTEP/vm-beyondphys-policy.pdf): FIFO, Óptimo, LRU y Reloj; ejemplos y cálculo de aciertos.
- [Allan Gottlieb, NYU: notas de Sistemas Operativos, sección 3.4](https://cs.nyu.edu/~gottlieb/courses/2010s/2015-16-fall/os202/class-notes.html): NRU, clases R/M, Segunda oportunidad y Reloj.
- Tablas de FIFO, Belady, LRU y Reloj compartidas en la conversación de la clase, incorporadas como resultados esperados en las pruebas.

Las fuentes respaldan las reglas generales. Los desempates y las condiciones particulares del examen deben coincidir con su enunciado.
