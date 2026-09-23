(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const M = window.MMU;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const percent = value => `${(value * 100).toFixed(2)} %`;
  const labelRef = ref => ref.page + (ref.write ? ":W" : "");
  const descriptions = {
    FIFO: "Sale la página que entró primero. Un acierto no cambia su antigüedad.",
    OPT: "Sale la página cuyo próximo uso está más lejos en el futuro, o que no vuelve a usarse.",
    LRU: "Sale la página que lleva más referencias sin usarse. Cada acierto actualiza su último uso.",
    NRU: "Se elige en la clase R/M más baja: 0=(0,0), 1=(0,1), 2=(1,0), 3=(1,1). Configura el reinicio y el desempate según el enunciado.",
    SC: "Convención de clase: una página nueva entra con R=0. Un acierto pone R=1; al revisar R=1 se limpia y la página pasa al final de la cola.",
    CLOCK: "Convención de clase: una página nueva entra con R=1. El puntero queda quieto al llenar huecos y en los aciertos; se mueve al buscar y reemplazar."
  };
  const examples = {
    fifo4: { algorithm: "FIFO", frameCount: 4, references: "2 4 6 5 1 2 4 3 3 2 4 6 5 1 3" },
    fifo5: { algorithm: "FIFO", frameCount: 5, references: "2 4 6 5 1 2 4 3 3 2 4 6 5 1 3" },
    lru: { algorithm: "LRU", frameCount: 3, references: "1 2 3 1 2 4 1 2 3 1 2 4" },
    clock: { algorithm: "CLOCK", frameCount: 4, references: "1 2 3 4 1 2 5 1 2 3 4 5" },
    opt: { algorithm: "OPT", frameCount: 3, references: "0 1 2 0 1 3 0 3 1 2 1" },
    nru: { algorithm: "NRU", frameCount: 3, references: "1:W 2 3 4 2:W 1 5 2 3:W 4 1 5", resetEvery: 3, nruTie: "frame" },
    long: { algorithm: "FIFO", frameCount: 4, references: "7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1 4 2 5 2 1 0 3 2 4 1 5 0 2 3 1 4 0 2 5 1" }
  };
  let result = null, position = 0, eventIndex = 0, timer = null, stale = false, noticeTimer;
  function notify(text) {
    $("notice").textContent = text; $("notice").hidden = false;
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { $("notice").hidden = true; }, 4000);
  }
  function error(message) { $("error").textContent = message; $("error").hidden = !message; }
  function readConfig() {
    const numeric = id => $(id).value.trim() === "" ? NaN : Number($(id).value);
    const frameCount = numeric("frames"), algorithm = $("algorithm").value;
    return M.normalize({
      algorithm, frameCount, references: $("references").value,
      resetEvery: numeric("reset-every"), resetTiming: $("reset-timing").value,
      nruTie: $("nru-tie").value, seed: numeric("seed"), nruFaultWrites: $("nru-fault-writes").checked,
      hand: algorithm === "CLOCK" ? numeric("hand") - 1 : 0,
      initialFrames: M.parseInitial($("initial").value, frameCount)
    });
  }
  function applyConfig(config) {
    $("references").value = config.references.map(labelRef).join(", ");
    $("algorithm").value = config.algorithm; $("frames").value = config.frameCount;
    $("reset-every").value = config.resetEvery; $("reset-timing").value = config.resetTiming;
    $("nru-tie").value = config.nruTie; $("seed").value = config.seed; $("nru-fault-writes").checked = config.nruFaultWrites; $("hand").value = config.hand + 1;
    $("initial").value = config.initialFrames.some(Boolean) ? config.initialFrames.map(f => f ? `${f.page}:${f.r}:${f.m}:${f.loadedAt}:${f.lastUsed}` : "-").join(" ") : "";
    updateInputs();
  }
  function updateInputs() {
    const algorithm = $("algorithm").value;
    $("algorithm-hint").textContent = descriptions[algorithm];
    $("nru-options").hidden = algorithm !== "NRU";
    $("hand-options").hidden = algorithm !== "CLOCK";
    $("seed").disabled = $("nru-tie").value !== "random";
    try { $("reference-count").textContent = `${M.parseReferences($("references").value).length} referencias`; }
    catch { $("reference-count").textContent = $("references").value.trim() ? "Revisa la cadena" : "0 referencias"; }
  }
  function stop() { clearInterval(timer); timer = null; $("play").textContent = "Reproducir"; }
  function dirty() {
    stop(); updateInputs(); error("");
    if (result) { stale = true; $("stale").hidden = false; updateControls(); }
  }
  function solve(config) {
    stop();
    try {
      const next = M.simulate(config || readConfig());
      result = next; stale = false; error(""); $("stale").hidden = true;
      $("empty").hidden = true; $("results").hidden = false; $("comparison").hidden = true;
      $("seek").max = result.steps.length; position = 1;
      $("bits-label").hidden = !["NRU", "SC", "CLOCK"].includes(result.config.algorithm);
      $("show-bits").checked = result.config.algorithm === "NRU";
      $("result-title").textContent = `${M.ALGORITHMS[result.config.algorithm]} · ${result.config.frameCount} marcos`;
      $("conditions").textContent = conditions(result.config);
      renderStats(); renderRules(); renderPosition(true);
      try { localStorage.setItem("mmu-draft-v1", JSON.stringify(result.config)); } catch { /* El archivo descargable sigue disponible. */ }
    } catch (e) { dirty(); error(e.message); }
  }
  function conditions(c) {
    const loaded = c.initialFrames.filter(Boolean).length;
    let text = `${c.references.length} referencias · ${loaded ? `${loaded} páginas iniciales` : "Memoria inicialmente vacía"}`;
    if (c.algorithm === "NRU") {
      text += ` · R: ${c.resetEvery ? `reinicio cada ${c.resetEvery}, ${c.resetTiming === "before" ? "antes del bloque siguiente" : "al final del bloque"}` : "sin reinicio periódico"}`;
      text += ` · Desempate: ${{ frame: "menor marco", fifo: "más antigua", random: `sorteo, semilla ${c.seed}` }[c.nruTie]}`;
      text += ` · M: ${c.nruFaultWrites ? "cada fallo cuenta como modificación (clase)" : "solo escrituras :W"}`;
    } else if (c.algorithm === "CLOCK") text += ` · Puntero inicial: marco ${c.hand + 1} · Sin reinicio periódico de R`;
    else if (c.algorithm === "SC") text += " · Página nueva: R=0 · Sin reinicio periódico";
    else if (c.algorithm === "OPT" || c.algorithm === "LRU") text += " · Empates: menor número de marco";
    return text;
  }
  function renderStats() {
    const t = result.totals;
    $("stats").innerHTML = `<div class="stat"><span>Referencias</span><strong>${t.references}</strong></div><div class="stat faults"><span>Fallos</span><strong>${t.faults}</strong></div><div class="stat hits"><span>Aciertos</span><strong>${t.hits}</strong></div><div class="stat"><span>Rendimiento</span><strong>${percent(t.hitRate)}</strong></div>`;
    $("formula").textContent = `F = ${t.faults}/${t.references} = ${t.faultRate.toFixed(4)} (${percent(t.faultRate)}) · Rendimiento = ${t.hits}/${t.references} × 100 = ${percent(t.hitRate)} · ${t.replacements} reemplazos`;
  }
  function tableMarkup(start, end, printable = false) {
    const selected = index => !printable && index === position ? " selected" : "";
    const steps = result.steps.slice(start, end);
    let html = '<table class="matrix"><thead><tr><th scope="col">REFERENCIA</th>';
    if (!printable && start === 0) html += `<th scope="col" class="${selected(0)}" data-column="0"><button type="button" data-step="0" aria-label="Ver memoria inicial"><small>ESTADO</small>Inicial</button></th>`;
    for (const step of steps) {
      const content = `<small>#${step.index}</small>${esc(labelRef(step.reference))}`;
      html += `<th scope="col" class="${selected(step.index)}" data-column="${step.index}">${printable ? content : `<button type="button" data-step="${step.index}" aria-label="Referencia ${step.index}: ${esc(labelRef(step.reference))}">${content}</button>`}</th>`;
    }
    html += "</tr></thead><tbody>";
    for (let f = 0; f < result.config.frameCount; f++) {
      html += `<tr><th scope="row">MARCO ${f + 1}</th>`;
      if (!printable && start === 0) html += `<td class="${selected(0)}" data-column="0">${esc(result.initial.frames[f]?.page ?? "—")}</td>`;
      for (const step of steps) {
        const changed = step.frame === f ? (step.hit ? "hit-cell" : "loaded") : "";
        const page = step.after.frames[f]?.page ?? "—";
        const memory = step.after.frames[f];
        const bits = $("show-bits").checked && memory ? `<small class="matrix-bits">R=${memory.r} M=${memory.m}</small>` : "";
        html += `<td class="${changed}${selected(step.index)}" data-column="${step.index}" title="Marco ${f + 1}, referencia ${step.index}: ${esc(page)}"><span class="page-value">${esc(page)}</span>${bits}</td>`;
      }
      html += "</tr>";
    }
    html += '<tr><th scope="row">FALLOS</th>';
    if (!printable && start === 0) html += `<td class="${selected(0)}" data-column="0">—</td>`;
    for (const step of steps) html += `<td class="${step.hit ? "hit" : "fault"}${selected(step.index)}" data-column="${step.index}" aria-label="${step.hit ? "Acierto" : "Fallo"}">${step.hit ? "—" : "X"}</td>`;
    return html + "</tr></tbody></table>";
  }
  function renderMatrix() {
    const left = $("matrix").scrollLeft;
    $("matrix").innerHTML = tableMarkup(0, $("progressive").checked ? position : result.steps.length);
    $("matrix").scrollLeft = left;
  }
  function updateControls() {
    for (const id of ["compare", "print", "csv", "seek", "play"]) $(id).disabled = stale;
    $("first").disabled = stale || position === 0; $("prev").disabled = stale || position === 0;
    $("last").disabled = stale || position === result?.steps.length; $("next").disabled = stale || position === result?.steps.length;
    $("position").textContent = position ? `Referencia ${position} / ${result.steps.length}` : "Memoria inicial";
    $("seek").value = position;
  }
  function renderPosition(rebuild = false, follow = false) {
    if (!result) return;
    if (rebuild || $("progressive").checked) renderMatrix();
    else {
      $("matrix").querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
      $("matrix").querySelectorAll(`[data-column="${position}"]`).forEach(el => el.classList.add("selected"));
    }
    if (follow) {
      const cell = $("matrix").querySelector(`thead [data-column="${position}"]`);
      if (cell) {
        const left = cell.offsetLeft - $("matrix").querySelector("table").offsetLeft;
        const container = $("matrix");
        if (left < container.scrollLeft + 105 || left + cell.offsetWidth > container.scrollLeft + container.clientWidth) container.scrollLeft = Math.max(0, left - 120);
      }
    }
    updateControls(); renderDetail();
  }
  function frameMarkup(f, i, pointed = false, style = "") {
    return `<div class="frame-card${pointed ? " pointed" : ""}"${style ? ` style="${style}"` : ""}><small>${pointed ? "↳ " : ""}MARCO ${i + 1}</small><strong title="${esc(f?.page ?? "Vacío")}">${esc(f?.page ?? "—")}</strong><span class="bits">${f ? `R=${f.r} · M=${f.m}` : "libre"}</span></div>`;
  }
  function stateMarkup(state, title) {
    const algorithm = result.config.algorithm;
    let html = `<p class="state-title">${esc(title)}</p><div class="frame-grid">${state.frames.map((f, i) => frameMarkup(f, i, algorithm === "CLOCK" && i === state.hand)).join("")}</div>`;
    if (algorithm === "FIFO" || algorithm === "SC") html += `<p class="subtle">Cola: primera candidata → última</p><div class="queue">${state.queue.length ? state.queue.map(i => `<span>${esc(state.frames[i]?.page ?? "—")}</span>`).join('<span aria-hidden="true">→</span>') : '<span>Vacía</span>'}</div>`;
    if (algorithm === "CLOCK") {
      html += `<p class="subtle">Puntero: marco ${state.hand + 1}. El borde verde indica dónde comienza la siguiente búsqueda.</p>`;
      if (state.frames.length >= 2 && state.frames.length <= 8) {
        html += `<div class="clock" aria-label="Reloj, puntero en marco ${state.hand + 1}"><div class="clock-center"><strong>↻ Reloj</strong><span>Marco ${state.hand + 1}</span></div>`;
        html += state.frames.map((f, i) => {
          const angle = i * 2 * Math.PI / state.frames.length - Math.PI / 2;
          return frameMarkup(f, i, i === state.hand, `left:${50 + 38.5 * Math.cos(angle)}%;top:${50 + 38.5 * Math.sin(angle)}%`);
        }).join("") + "</div>";
      }
    }
    if (algorithm === "NRU" || algorithm === "LRU") {
      html += `<table class="candidate-table"><thead><tr><th>Página</th><th>${algorithm === "NRU" ? "Clase = 2R + M" : "Último uso"}</th></tr></thead><tbody>`;
      html += state.frames.filter(Boolean).map(f => `<tr><td>${esc(f.page)}</td><td>${algorithm === "NRU" ? 2 * f.r + f.m : f.lastUsed}</td></tr>`).join("") + "</tbody></table>";
    }
    return html;
  }
  function renderDetail() {
    if (!position) {
      $("detail-title").textContent = "Antes de la primera referencia";
      $("detail-status").textContent = "0 referencias"; $("detail-status").className = "status";
      $("detail-body").innerHTML = stateMarkup(result.initial, "Memoria inicial") + '<p class="subtle">Todavía no se cuenta ningún fallo ni acierto. Las páginas precargadas forman parte de las condiciones iniciales.</p>';
      return;
    }
    const step = result.steps[position - 1]; eventIndex = step.events.length - 1;
    $("detail-title").textContent = `Referencia ${position}: página ${step.reference.page}${step.reference.write ? " · escritura" : " · lectura"}`;
    $("detail-status").textContent = step.hit ? "Acierto" : "Fallo";
    $("detail-status").className = `status ${step.hit ? "is-hit" : "is-fault"}`;
    $("detail-body").innerHTML = `<div class="detail-grid"><div><p class="state-title">Sigue la decisión · selecciona una acción</p><ol class="event-list">${step.events.map((ev, i) => `<li><button type="button" data-event="${i}" class="${i === eventIndex ? "active" : ""}" aria-pressed="${i === eventIndex}"><span class="event-number">${i + 1}</span><span>${esc(ev.message)}</span></button></li>`).join("")}</ol><p class="subtle">Hasta esta referencia: ${step.faults} fallos · ${step.hits} aciertos · ${step.replacements} reemplazos.</p></div><div id="event-state"></div></div><details class="advanced"><summary>Ver memoria antes de esta referencia${step.candidates.length ? " y candidatos al reemplazo" : ""}</summary><div class="before-state">${stateMarkup(step.before, "Antes de atender la referencia")}</div>${candidatesMarkup(step)}</details>`;
    renderEvent();
  }
  function candidatesMarkup(step) {
    if (!step.candidates.length) return "";
    const alg = result.config.algorithm;
    const label = alg === "OPT" ? "Próxima referencia" : alg === "LRU" ? "Último uso" : "Clase al elegir víctima";
    return `<table class="candidate-table"><thead><tr><th>Página</th><th>${label}</th><th>Decisión</th></tr></thead><tbody>${step.candidates.map(c => `<tr><td>${esc(c.page)}</td><td>${c.value === null ? "No vuelve a aparecer" : c.value}</td><td>${step.victim?.frame === c.frame ? "Reemplazada" : "Se conserva"}</td></tr>`).join("")}</tbody></table>`;
  }
  function renderEvent() {
    const step = result.steps[position - 1], event = step.events[eventIndex];
    $("event-state").innerHTML = stateMarkup(event, eventIndex === step.events.length - 1 ? "Estado final de esta referencia" : `Estado intermedio · acción ${eventIndex + 1} de ${step.events.length}`);
    $("detail-body").querySelectorAll("[data-event]").forEach(btn => {
      const active = Number(btn.dataset.event) === eventIndex;
      btn.classList.toggle("active", active); btn.setAttribute("aria-pressed", String(active));
    });
  }
  function renderRules() {
    const c = result.config;
    const rRule = c.algorithm === "SC" ? "En Segunda oportunidad, una carga entra con R=0 y un acierto pone R=1." : "En este algoritmo, una carga o un acierto deja R=1.";
    const mRule = c.algorithm === "NRU" && c.nruFaultWrites ? "Por la convención de clase seleccionada, cada fallo deja M=1." : "Solo una escritura :W pone M=1; una lectura no lo limpia.";
    $("rules-content").innerHTML = `<p>${esc(descriptions[c.algorithm])}</p><ul><li>${esc(conditions(c))}.</li><li>Marcos y referencias se numeran desde 1. Las etiquetas de página se conservan; 0 es una página válida. Las etiquetas distinguen mayúsculas y ceros iniciales: P1 ≠ p1 y 01 ≠ 1.</li><li>${c.algorithm === "CLOCK" ? "Los huecos se llenan desde el marco menor sin mover el puntero. El puntero se mueve al evaluar y después del reemplazo; en un acierto no avanza." : "Se llena primero el marco libre de menor número."}</li><li>${rRule} ${mRule}</li><li>${c.algorithm === "NRU" ? "Solo NRU usa el reinicio periódico configurado de R." : "No hay un reinicio periódico adicional de R. Reloj y Segunda oportunidad limpian R durante su búsqueda."}</li><li>Una página permanece en memoria hasta su reemplazo. Terminar la cadena no libera marcos.</li><li>Los porcentajes se calculan con los conteos completos; se redondean solo al mostrarlos.</li></ul>`;
  }
  function move(next) {
    if (stale || !result) return;
    position = Math.max(0, Math.min(result.steps.length, next)); renderPosition(false, true);
  }
  function startPlayback() {
    if (stale || !result) return;
    if (timer) { stop(); return; }
    if (position === result.steps.length) move(0);
    $("play").textContent = "Pausar";
    timer = setInterval(() => { move(position + 1); if (position === result.steps.length) stop(); }, Number($("speed").value));
  }
  function download(filename, data, mime) {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const link = document.createElement("a"); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function preparePrint() {
    if (stale || !result) {
      $("print-area").innerHTML = '<h1>Laboratorio MMU</h1><p>Resuelve el ejercicio con los datos actuales antes de imprimir.</p>';
      return;
    }
    let html = `<h1>Laboratorio MMU · ${esc(M.ALGORITHMS[result.config.algorithm])}</h1><p>${esc(conditions(result.config))}</p><p>${esc($("formula").textContent)}</p><p>Rendimiento = porcentaje de aciertos. X = fallo; — = acierto. Cada columna conserva la memoria después de la referencia.</p>`;
    if (result.config.initialFrames.some(Boolean)) html += `<p>Memoria inicial (página:R:M:carga:uso, por marco): ${esc(result.config.initialFrames.map(f => f ? `${f.page}:${f.r}:${f.m}:${f.loadedAt}:${f.lastUsed}` : "—").join(" · "))}</p>`;
    for (let i = 0; i < result.steps.length; i += 12) html += `<section class="print-block"><h2>Referencias ${i + 1}–${Math.min(i + 12, result.steps.length)}</h2>${tableMarkup(i, i + 12, true)}</section>`;
    html += `<p>Regla: ${esc(descriptions[result.config.algorithm])} Empates de Óptimo/LRU: menor marco. Las etiquetas de página distinguen mayúsculas y ceros iniciales.</p>`;
    $("print-area").innerHTML = html;
  }
  function printResult() {
    if (stale || !result) return;
    stop(); preparePrint(); window.print();
  }
  $("exercise-form").addEventListener("submit", e => { e.preventDefault(); solve(); });
  for (const id of ["references", "frames", "algorithm", "reset-every", "reset-timing", "nru-tie", "seed", "nru-fault-writes", "initial", "hand"]) $(id).addEventListener("input", dirty);
  $("example").addEventListener("change", () => {
    if (!examples[$("example").value]) return;
    const config = M.normalize(examples[$("example").value]); applyConfig(config); solve(config);
  });
  $("clear").addEventListener("click", () => {
    stop(); result = null; stale = false; $("references").value = ""; $("initial").value = ""; $("example").value = "";
    $("results").hidden = true; $("empty").hidden = false; $("empty").innerHTML = '<span class="empty-symbol" aria-hidden="true">▦</span><h2>Un nuevo ejercicio</h2><p>Pega la cadena del enunciado o carga un ejemplo.</p>';
    try { localStorage.removeItem("mmu-draft-v1"); } catch { /* Sin almacenamiento local. */ }
    error(""); updateInputs(); $("references").focus();
  });
  $("matrix").addEventListener("click", e => { const btn = e.target.closest("[data-step]"); if (btn) { stop(); move(Number(btn.dataset.step)); } });
  $("detail-body").addEventListener("click", e => { const btn = e.target.closest("[data-event]"); if (btn && !stale) { eventIndex = Number(btn.dataset.event); renderEvent(); } });
  $("first").addEventListener("click", () => { stop(); move(0); });
  $("prev").addEventListener("click", () => { stop(); move(position - 1); });
  $("next").addEventListener("click", () => { stop(); move(position + 1); });
  $("last").addEventListener("click", () => { stop(); move(result.steps.length); });
  $("seek").addEventListener("input", () => { stop(); move(Number($("seek").value)); });
  $("play").addEventListener("click", startPlayback);
  $("speed").addEventListener("change", () => { if (timer) { stop(); startPlayback(); } });
  $("progressive").addEventListener("change", () => { if (result) renderMatrix(); });
  $("show-bits").addEventListener("change", () => { if (result) renderMatrix(); });
  $("help-button").addEventListener("click", () => { $("help").hidden = !$("help").hidden; $("help-button").setAttribute("aria-expanded", String(!$("help").hidden)); });
  $("compare").addEventListener("click", () => {
    if (stale || !result) return;
    stop();
    const rows = Object.keys(M.ALGORITHMS).map(algorithm => { const r = M.simulate({ ...result.config, algorithm }); return { algorithm, ...r.totals }; });
    const best = Math.min(...rows.map(r => r.faults));
    $("comparison").innerHTML = `<h3>La misma cadena, los mismos marcos</h3><table><thead><tr><th>Algoritmo</th><th>Fallos</th><th>Aciertos</th><th>Rendimiento</th><th></th></tr></thead><tbody>${rows.map(r => `<tr class="${r.faults === best ? "best" : ""}"><td>${M.ALGORITHMS[r.algorithm]}</td><td>${r.faults}</td><td>${r.hits}</td><td>${percent(r.hitRate)}</td><td><button data-algorithm="${r.algorithm}" type="button">Ver tabla</button></td></tr>`).join("")}</tbody></table><p class="hint">NRU: ${esc(conditions({ ...result.config, algorithm: "NRU" }))}. Para cambiar estas reglas, selecciona NRU en el formulario. Reloj usa el puntero inicial del ejercicio; Segunda oportunidad usa el orden de carga.</p>`;
    $("comparison").hidden = false;
  });
  $("comparison").addEventListener("click", e => {
    const btn = e.target.closest("[data-algorithm]");
    if (!btn || stale) return;
    const config = { ...result.config, algorithm: btn.dataset.algorithm }; applyConfig(config); solve(config);
  });
  $("save").addEventListener("click", () => {
    try { const config = readConfig(); download("ejercicio-mmu.json", JSON.stringify({ format: "mmu-exercise", version: 1, config }, null, 2), "application/json"); error(""); }
    catch (e) { error(e.message); }
  });
  $("import").addEventListener("click", () => $("file").click());
  $("file").addEventListener("change", async () => {
    const file = $("file").files[0]; if (!file) return;
    try {
      if (file.size > 2000000) throw new Error("El archivo es demasiado grande (máximo 2 MB).");
      const data = JSON.parse(await file.text());
      if (data.format !== "mmu-exercise" || data.version !== 1) throw new Error("No es un ejercicio MMU compatible (formato versión 1).");
      const config = M.normalize(data.config); applyConfig(config); $("example").value = ""; solve(config); notify("Ejercicio abierto.");
    } catch (e) { error(`No se pudo abrir: ${e.message}`); }
    $("file").value = "";
  });
  $("csv").addEventListener("click", () => {
    if (stale || !result) return;
    // Anteponer apóstrofo evita interpretar las etiquetas como fórmulas de hoja de cálculo.
    const cell = value => { const s = String(value ?? ""); return '"' + (/^[=+@-]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"'; };
    const rows = [["Algoritmo", M.ALGORITHMS[result.config.algorithm]], ["Condiciones", conditions(result.config)], ["Referencia", ...result.steps.map(s => labelRef(s.reference))]];
    for (let f = 0; f < result.config.frameCount; f++) rows.push([`Marco ${f + 1}`, ...result.steps.map(s => s.after.frames[f]?.page ?? "")]);
    rows.push(["Fallo", ...result.steps.map(s => s.hit ? "" : "X")], ["Fallos totales", result.totals.faults], ["Aciertos", result.totals.hits], ["Rendimiento", percent(result.totals.hitRate)]);
    download(`mmu-${result.config.algorithm.toLowerCase()}.csv`, "\uFEFF" + rows.map(r => r.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  });
  $("print").addEventListener("click", printResult);
  window.addEventListener("beforeprint", preparePrint);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  updateInputs();
  try {
    const saved = localStorage.getItem("mmu-draft-v1");
    if (saved) { const config = M.normalize(JSON.parse(saved)); applyConfig(config); solve(config); notify("Se recuperó tu último ejercicio resuelto."); }
  } catch { /* Un borrador incompatible no impide abrir la app. */ }
})();
