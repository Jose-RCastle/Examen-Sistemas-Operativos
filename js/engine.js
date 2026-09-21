/* Motor independiente de la interfaz. Se carga como script clásico para funcionar con file://. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MMU = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const ALGORITHMS = Object.freeze({ FIFO: "FIFO", OPT: "Óptimo", LRU: "LRU", NRU: "NRU", SC: "Segunda oportunidad", CLOCK: "Reloj" });
  const LIMITS = Object.freeze({ frames: 64, references: 2000 });

  function integer(value, min, max, name) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name}: debe ser un entero entre ${min} y ${max}.`);
    return value;
  }
  function pageId(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,20}$/.test(value) || value === "-") {
      throw new Error("Página inválida. Usa de 1 a 20 letras, números, guiones o guiones bajos; «-» se reserva para un marco vacío.");
    }
    return value;
  }
  function parseReferences(text) {
    if (typeof text !== "string" || !text.trim()) throw new Error("Escribe al menos una referencia.");
    const tokens = text.trim().split(/[\s,;]+/).filter(Boolean);
    if (tokens.length > LIMITS.references) throw new Error(`El máximo es ${LIMITS.references} referencias por ejercicio.`);
    return tokens.map((token, i) => {
      const match = token.match(/^([A-Za-z0-9_-]{1,20})(?::([rRwW]))?$/);
      if (!match) throw new Error(`Referencia ${i + 1}: «${token}» no es válida. Ejemplos: 2, P1, 2:W.`);
      let page = match[1], write = (match[2] || "R").toUpperCase() === "W";
      // Atajo inequívoco para páginas numéricas: 2w equivale a 2:W.
      if (!match[2] && /^\d+[rRwW]$/.test(page)) { write = /w$/i.test(page); page = page.slice(0, -1); }
      return { page: pageId(page), write };
    });
  }
  function parseInitial(text, frameCount) {
    if (!text.trim()) return [];
    const entries = text.trim().split(/[\s,;]+/).filter(Boolean);
    if (entries.length > frameCount) throw new Error("La memoria inicial tiene más posiciones que marcos físicos.");
    return entries.map((entry, i) => {
      if (entry === "-") return null;
      const parts = entry.split(":");
      if (![1, 3, 5].includes(parts.length)) throw new Error(`Marco ${i + 1}: usa página:R:M o página:R:M:carga:uso.`);
      const page = pageId(parts[0]);
      const r = parts.length >= 3 ? Number(parts[1]) : 0;
      const m = parts.length >= 3 ? Number(parts[2]) : 0;
      const loadedAt = parts.length === 5 ? Number(parts[3]) : i - frameCount;
      const lastUsed = parts.length === 5 ? Number(parts[4]) : i - frameCount;
      if (parts.some(p => !p)) throw new Error(`Marco ${i + 1}: faltan datos en la memoria inicial.`);
      return { page, r, m, loadedAt, lastUsed };
    });
  }
  function normalize(input) {
    if (!input || typeof input !== "object") throw new Error("El ejercicio debe ser un objeto.");
    const algorithm = input.algorithm ?? "FIFO";
    if (!Object.hasOwn(ALGORITHMS, algorithm)) throw new Error("Selecciona uno de los seis algoritmos disponibles.");
    const frameCount = integer(input.frameCount ?? 4, 1, LIMITS.frames, "Marcos");
    const refs = typeof input.references === "string" ? parseReferences(input.references) : input.references;
    if (!Array.isArray(refs) || !refs.length || refs.length > LIMITS.references) throw new Error(`Introduce entre 1 y ${LIMITS.references} referencias.`);
    const references = refs.map(ref => {
      if (!ref || typeof ref.write !== "boolean") throw new Error("Cada referencia debe contener page y write (booleano).");
      return { page: pageId(ref.page), write: ref.write };
    });
    const resetEvery = integer(input.resetEvery ?? 0, 0, LIMITS.references, "Intervalo de reinicio de R");
    const resetTiming = input.resetTiming ?? "before";
    if (!["before", "after"].includes(resetTiming)) throw new Error("Momento de reinicio inválido.");
    const nruTie = input.nruTie ?? "random";
    if (!["random", "frame", "fifo"].includes(nruTie)) throw new Error("Desempate NRU inválido.");
    const seed = integer(input.seed ?? 2026, 0, 4294967295, "Semilla");
    const hand = integer(input.hand ?? 0, 0, frameCount - 1, "Puntero (índice desde cero)");
    const initialInput = input.initialFrames ?? [];
    if (!Array.isArray(initialInput) || initialInput.length > frameCount) throw new Error("Memoria inicial inválida.");
    const seen = new Set();
    const initialFrames = Array.from({ length: frameCount }, (_, i) => {
      const f = initialInput[i];
      if (f == null) return null;
      const page = pageId(f.page);
      if (seen.has(page)) throw new Error(`La página ${page} aparece en dos marcos iniciales.`);
      seen.add(page);
      const loadedAt = integer(f.loadedAt ?? i - frameCount, -1000000, 0, "Instante inicial de carga");
      const lastUsed = integer(f.lastUsed ?? i - frameCount, loadedAt, 0, "Instante inicial de último uso");
      return { page, r: integer(f.r ?? 0, 0, 1, "Bit R"), m: integer(f.m ?? 0, 0, 1, "Bit M"), loadedAt, lastUsed };
    });
    return { algorithm, frameCount, references, resetEvery, resetTiming, nruTie, seed, hand, initialFrames };
  }
  function randomGenerator(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const copyFrames = frames => frames.map(f => f ? { ...f } : null);

  function simulate(input) {
    const config = normalize(input);
    const { algorithm, references, frameCount } = config;
    const frames = copyFrames(config.initialFrames);
    const queue = frames.map((f, i) => f ? i : -1).filter(i => i >= 0).sort((a, b) => frames[a].loadedAt - frames[b].loadedAt || a - b);
    let hand = config.hand, faults = 0, hits = 0, replacements = 0, writebacks = 0;
    const random = randomGenerator(config.seed), steps = [];
    const snapshot = () => ({ frames: copyFrames(frames), queue: [...queue], hand });
    const initial = snapshot();
    for (let i = 0; i < references.length; i++) {
      const reference = references[i], before = snapshot(), events = [];
      const event = (type, message, frame = null) => events.push({ type, message, frame, ...snapshot() });
      function clearBits() {
        frames.forEach(f => { if (f) f.r = 0; });
        event("reset", `Reinicio periódico de R: todos los bits R pasan a 0. M se conserva. Intervalo: ${config.resetEvery} referencias.`);
      }
      if (algorithm === "NRU" && config.resetEvery && config.resetTiming === "before" && i > 0 && i % config.resetEvery === 0) clearBits();
      let frame = frames.findIndex(f => f && f.page === reference.page);
      const hit = frame >= 0;
      let victim = null, candidates = [];
      if (hit) {
        hits++;
        frames[frame].r = 1;
        if (reference.write) frames[frame].m = 1;
        frames[frame].lastUsed = i + 1;
        event("hit", `Acierto: ${reference.page} ya está en el marco ${frame + 1}. R=1${reference.write ? "; la escritura fija M=1" : "; M conserva su valor"}.`, frame);
      } else {
        faults++;
        event("fault", `Fallo: la página ${reference.page} no está en memoria.`);
        frame = frames.findIndex(f => f === null);
        if (frame >= 0) {
          if (algorithm === "CLOCK") {
            frame = hand;
            while (frames[frame] !== null) frame = (frame + 1) % frameCount;
          }
          event("free", `Se usa el marco ${frame + 1}, que está vacío. La carga inicial también cuenta como fallo.`, frame);
        } else {
          if (algorithm === "FIFO") {
            frame = queue[0];
            event("choose", `FIFO: sale ${frames[frame].page}, la primera página de la cola de llegada. Los aciertos no cambian esta cola.`, frame);
          } else if (algorithm === "LRU") {
            candidates = frames.map((f, j) => ({ frame: j, page: f.page, value: f.lastUsed }));
            frame = candidates.reduce((a, b) => b.value < a.value ? b : a).frame;
            event("choose", `LRU: sale ${frames[frame].page}; su último uso (${frames[frame].lastUsed}) es el más antiguo.`, frame);
          } else if (algorithm === "OPT") {
            candidates = frames.map((f, j) => {
              const next = references.findIndex((r, k) => k > i && r.page === f.page);
              return { frame: j, page: f.page, value: next < 0 ? null : next + 1 };
            });
            frame = candidates.reduce((a, b) => (b.value ?? Infinity) > (a.value ?? Infinity) ? b : a).frame;
            const next = candidates[frame].value;
            event("choose", `Óptimo: sale ${frames[frame].page}; ${next === null ? "no vuelve a aparecer" : `su próxima referencia (${next}) es la más lejana`}. Si hay empate, se elige el marco de menor número.`, frame);
          } else if (algorithm === "NRU") {
            candidates = frames.map((f, j) => ({ frame: j, page: f.page, value: 2 * f.r + f.m }));
            const lowest = Math.min(...candidates.map(c => c.value));
            const eligible = candidates.filter(c => c.value === lowest).map(c => c.frame);
            if (config.nruTie === "random") frame = eligible[Math.floor(random() * eligible.length)];
            else if (config.nruTie === "fifo") frame = eligible.reduce((a, b) => frames[b].loadedAt < frames[a].loadedAt ? b : a);
            else frame = eligible[0];
            const tie = { random: `sorteo reproducible (semilla ${config.seed})`, fifo: "antigüedad de carga y luego número de marco", frame: "menor número de marco" }[config.nruTie];
            event("choose", `NRU: la clase no vacía más baja es ${lowest}. Candidatas: ${eligible.map(j => frames[j].page).join(", ")}. Selección: ${tie}. Sale ${frames[frame].page}.`, frame);
          } else if (algorithm === "SC") {
            while (frames[queue[0]].r === 1) {
              const j = queue[0];
              event("inspect", `Segunda oportunidad: ${frames[j].page} encabeza la cola y tiene R=1.`, j);
              frames[j].r = 0;
              queue.push(queue.shift());
              event("clear", `Se pone R=0 en ${frames[j].page} y se envía al final de la cola.`, j);
            }
            frame = queue[0];
            event("choose", `Segunda oportunidad: sale ${frames[frame].page}, la primera de la cola con R=0.`, frame);
          } else if (algorithm === "CLOCK") {
            while (frames[hand].r === 1) {
              const j = hand;
              event("inspect", `El puntero revisa el marco ${j + 1}: ${frames[j].page} tiene R=1.`, j);
              frames[j].r = 0;
              hand = (hand + 1) % frameCount;
              event("clear", `Se pone R=0 en ${frames[j].page}; el puntero avanza al marco ${hand + 1}.`, j);
            }
            frame = hand;
            event("choose", `Reloj: el marco ${frame + 1} tiene R=0. Se reemplaza ${frames[frame].page}.`, frame);
          }
          victim = { ...frames[frame], frame };
          replacements++;
          if (victim.m) {
            writebacks++;
            event("writeback", `La página ${victim.page} tiene M=1: requiere escritura a disco antes de reemplazarla. No se añade otra referencia ni otro fallo.`, frame);
          }
        }
        frames[frame] = { page: reference.page, r: 1, m: reference.write ? 1 : 0, loadedAt: i + 1, lastUsed: i + 1 };
        if (algorithm === "FIFO" || algorithm === "SC") {
          const oldIndex = queue.indexOf(frame);
          if (oldIndex >= 0) queue.splice(oldIndex, 1);
          queue.push(frame);
        }
        if (algorithm === "CLOCK") hand = (frame + 1) % frameCount;
        event("load", `Se carga ${reference.page} en el marco ${frame + 1}: R=1, M=${reference.write ? 1 : 0}.${algorithm === "CLOCK" ? ` El puntero queda en el marco ${hand + 1}.` : ""}`, frame);
      }
      if (algorithm === "NRU" && config.resetEvery && config.resetTiming === "after" && (i + 1) % config.resetEvery === 0) clearBits();
      steps.push({ index: i + 1, reference: { ...reference }, hit, frame, victim, candidates, before, after: snapshot(), events, faults, hits, replacements, writebacks });
    }
    return { config, initial, steps, totals: { references: references.length, faults, hits, replacements, writebacks, faultRate: faults / references.length, hitRate: hits / references.length } };
  }
  function compare(input) { return Object.keys(ALGORITHMS).map(algorithm => simulate({ ...input, algorithm })); }
  return Object.freeze({ ALGORITHMS, LIMITS, parseReferences, parseInitial, normalize, simulate, compare });
});
