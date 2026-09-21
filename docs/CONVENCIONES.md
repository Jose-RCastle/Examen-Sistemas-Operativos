# Convenciones de simulación

## Modelo compartido

Una referencia solicita una sola página. Si está presente es un acierto; en caso contrario es un fallo. Primero se usa espacio libre; si todos los marcos están ocupados se elige una víctima. Se conserva la cadena completa, con repeticiones y operaciones de lectura/escritura.

La numeración visual de marcos y referencias empieza en 1. Los índices internos de arrays comienzan en 0. La página `0` es válida y no representa un hueco. Los huecos son `null` internamente y se muestran como `—`.

La identidad de la página es textual y distingue mayúsculas y ceros iniciales. No se agrupan páginas de procesos diferentes automáticamente. Si el ejercicio usa identificadores compuestos, usa etiquetas distintas, como `P1_0` y `P2_0`.

En cada acceso completado se pone R=1. Una escritura pone M=1; una lectura conserva M. Una carga por lectura inicia M=0. La página expulsada con M=1 produce un evento de escritura a disco, sin añadir otra referencia ni otro fallo. No se simulan latencias ni escritura anticipada a disco.

Cada columna muestra el estado después de completar la referencia y, en NRU si corresponde, el reinicio posterior de bits. Las acciones intermedias son instantáneas independientes. Retroceder no recalcula ni sortea de nuevo.

## Estado inicial

Sin configuración se empieza con todos los marcos vacíos. Las páginas precargadas no cuentan como referencias atendidas.

La entrada inicial acepta una posición por marco, separada con comas o espacios:

- `-`: marco libre.
- `A`: página A con R=M=0.
- `A:1:0`: página A con R=1, M=0.
- `A:1:0:-5:-2`: carga en -5 y último uso en -2.

Los instantes iniciales deben cumplir carga ≤ uso ≤ 0. Las referencias de la cadena se atienden en los instantes 1, 2, 3… Si solo se conocen tiempos absolutos del enunciado, réstales un mismo valor para situar todo el historial previo en instantes ≤ 0; esto conserva su orden. Si no se dan tiempos, el marco de menor número se considera más antiguo. No se permiten páginas duplicadas en los marcos iniciales.

## Reglas por algoritmo

| Algoritmo | Regla | Empate y otras condiciones |
|---|---|---|
| FIFO | Cola por orden de carga; sale la primera. | Cargas iniciales con misma fecha: menor marco primero. Un acierto no mueve la cola. |
| Óptimo | Sale la página cuyo próximo uso está más lejos; sin uso futuro equivale a distancia infinita. | Menor marco si dos candidatas no vuelven a aparecer. |
| LRU | Sale la página con instante de último uso más antiguo. | Menor marco en empate inicial. Cada acierto actualiza el uso. |
| NRU | Se toma la clase no vacía menor, calculada como 2R+M. | Sorteo reproducible por defecto. También se ofrecen menor marco o antigüedad como convenciones explícitas. |
| Segunda oportunidad | Examina la cabeza de la cola. R=1 pasa a R=0 y al final; R=0 es víctima. | Se empieza por orden de carga; cada carga nueva queda al final. Un acierto solo actualiza bits y uso. |
| Reloj | Desde la mano: R=1 se limpia y se avanza; R=0 es víctima. | Puntero inicial configurable. Tras carga/reemplazo avanza; en acierto permanece. |

En FIFO, LRU, Óptimo, NRU y Segunda oportunidad se ocupa el hueco con menor número. En Reloj se busca el primer hueco desde la mano en orden circular. Esto permite representar un puntero inicial distinto y memoria precargada.

Segunda oportunidad y Reloj se implementan con estados diferentes (cola y mano circular), pero con memoria inicialmente vacía y el orden equivalente pueden dar las mismas víctimas. No se introduce una diferencia artificial entre ellos.

## NRU: datos que cambian la respuesta

Las clases son 0: R=0/M=0; 1: R=0/M=1; 2: R=1/M=0; 3: R=1/M=1.

El NRU clásico selecciona al azar dentro de la clase menor disponible. Esta app usa un generador pseudoaleatorio reproducible Mulberry32 y una semilla de 32 bits. La semilla fija una ejecución, pero no convierte esa tabla en la única respuesta NRU válida. Las alternativas “menor marco” y “página más antigua” son convenciones didácticas, no una afirmación de que el profesor las use.

El intervalo de reinicio de R se mide aquí en **número de referencias**, no en tiempo de CPU. 0 desactiva el reinicio periódico. Este valor se muestra siempre en el resultado de NRU y debe ajustarse al enunciado.

Con intervalo k:

- **Antes del bloque siguiente:** se limpia R antes de k+1, 2k+1, 3k+1… No se limpia antes de la primera referencia.
- **Después del bloque:** se limpia R después de k, 2k, 3k… Las decisiones posteriores equivalen a la opción anterior, pero las instantáneas de bits en el límite difieren.

M nunca se limpia por ese reinicio. La configuración periódica solo se aplica a NRU. Reloj y Segunda oportunidad limpian R exclusivamente al examinar candidatas durante un reemplazo.

## Métricas

- Referencias = fallos + aciertos.
- Frecuencia de fallos F = fallos / referencias.
- Rendimiento de clase = aciertos / referencias × 100 = (1 − F) × 100.
- Reemplazos: fallos con memoria llena y una víctima. Cargas en huecos no son reemplazos.
- Escrituras a disco: víctimas con M=1.

Se calcula con los conteos enteros y se redondea solo la presentación. Por ello 4/15 se muestra como 26.67 %, aunque una diapositiva lo redondee al 27 %.

## Límites conocidos

Hasta 2,000 referencias y 64 marcos para evitar entradas que saturen el navegador. Las cadenas grandes pueden generar tablas extensas; la tabla permite desplazamiento horizontal. El formato de impresión divide cada 12 referencias y el navegador pagina verticalmente si hay muchos marcos.

Se admiten memoria inicial, bits y antigüedad, pero no cambios externos arbitrarios de los bits a mitad de una cadena. El reinicio de NRU es periódico según las dos opciones descritas. Si un enunciado define otra intervención, se debe extender esa regla expresamente y añadir su prueba antes de usarla.
