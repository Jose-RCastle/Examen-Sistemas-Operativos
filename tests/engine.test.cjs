const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/engine.js');
const run = (algorithm, references, frameCount, options = {}) => M.simulate({ algorithm, references, frameCount, ...options });
const pages = result => result.steps.map(s => s.after.frames.map(f => f?.page ?? null));
const faultPositions = result => result.steps.filter(s => !s.hit).map(s => s.index);
const classChain = '2 4 6 5 1 2 4 3 3 2 4 6 5 1 3';

test('FIFO reproduce cada columna de la clase con 4 marcos, incluidos los aciertos', () => {
  const r = run('FIFO', classChain, 4);
  assert.deepEqual(pages(r), [
    ['2',null,null,null], ['2','4',null,null], ['2','4','6',null], ['2','4','6','5'],
    ['1','4','6','5'], ['1','2','6','5'], ['1','2','4','5'], ['1','2','4','3'],
    ['1','2','4','3'], ['1','2','4','3'], ['1','2','4','3'], ['6','2','4','3'],
    ['6','5','4','3'], ['6','5','1','3'], ['6','5','1','3']
  ]);
  assert.deepEqual(faultPositions(r), [1,2,3,4,5,6,7,8,12,13,14]);
  assert.equal(r.totals.hits, 4); assert.equal(r.totals.hitRate, 4 / 15);
});
test('FIFO reproduce Belady con 5 marcos: 12 fallos, no menos que con 4', () => {
  const r = run('FIFO', classChain, 5);
  assert.deepEqual(pages(r), [
    ['2',null,null,null,null], ['2','4',null,null,null], ['2','4','6',null,null], ['2','4','6','5',null],
    ['2','4','6','5','1'], ['2','4','6','5','1'], ['2','4','6','5','1'], ['3','4','6','5','1'],
    ['3','4','6','5','1'], ['3','2','6','5','1'], ['3','2','4','5','1'], ['3','2','4','6','1'],
    ['3','2','4','6','5'], ['1','2','4','6','5'], ['1','3','4','6','5']
  ]);
  assert.deepEqual(faultPositions(r), [1,2,3,4,5,8,10,11,12,13,14,15]);
  assert.equal(r.totals.hitRate, 0.2);
});
test('LRU reproduce las 12 columnas del ejercicio de clase', () => {
  const r = run('LRU', '1 2 3 1 2 4 1 2 3 1 2 4', 3);
  assert.deepEqual(pages(r), [
    ['1',null,null], ['1','2',null], ['1','2','3'], ['1','2','3'], ['1','2','3'], ['1','2','4'],
    ['1','2','4'], ['1','2','4'], ['1','2','3'], ['1','2','3'], ['1','2','3'], ['1','2','4']
  ]);
  assert.deepEqual(faultPositions(r), [1,2,3,6,9,12]); assert.equal(r.totals.hitRate, .5);
});
const clockStates = [
  ['1',null,null,null], ['1','2',null,null], ['1','2','3',null], ['1','2','3','4'],
  ['1','2','3','4'], ['1','2','3','4'], ['5','2','3','4'], ['5','1','3','4'],
  ['5','1','2','4'], ['5','1','2','3'], ['4','1','2','3'], ['4','5','2','3']
];
for (const algorithm of ['CLOCK', 'SC']) test(`${algorithm}: clase, 10 fallos y transiciones R=1 → R=0 antes de reemplazar`, () => {
  const r = run(algorithm, '1 2 3 4 1 2 5 1 2 3 4 5', 4, { resetEvery: 5 });
  assert.deepEqual(pages(r), clockStates); assert.equal(r.totals.faults, 10);
  assert.equal(r.steps[6].events.filter(e => e.type === 'clear').length, 4);
  assert.deepEqual(r.steps[6].events.filter(e => e.type === 'clear').at(-1).frames.map(f => f.r), [0,0,0,0]);
  assert.deepEqual(r.steps[6].after.frames.map(f => f.r), [1,0,0,0]);
  assert.ok(r.steps.every(s => !s.events.some(e => e.type === 'reset')));
});
test('Óptimo: ejemplo OSTEP, 5 fallos; empate de páginas sin futuro al menor marco', () => {
  const r = run('OPT', '0 1 2 0 1 3 0 3 1 2 1', 3);
  assert.deepEqual(pages(r), [
    ['0',null,null], ['0','1',null], ['0','1','2'], ['0','1','2'], ['0','1','2'],
    ['0','1','3'], ['0','1','3'], ['0','1','3'], ['0','1','3'], ['2','1','3'], ['2','1','3']
  ]);
  assert.equal(r.totals.faults, 5); assert.equal(r.steps[9].victim.page, '0');
});
test('Un acierto distingue FIFO y LRU; no reordena FIFO', () => {
  assert.equal(run('FIFO','1 2 1 3',2).steps[3].victim.page, '1');
  assert.equal(run('LRU','1 2 1 3',2).steps[3].victim.page, '2');
});
test('NRU prioriza las cuatro clases y nunca elige una clase superior disponible', () => {
  const all = [ {page:'A',r:0,m:0}, {page:'B',r:0,m:1}, {page:'C',r:1,m:0}, {page:'D',r:1,m:1} ];
  for (let i = 0; i < 4; i++) {
    const initialFrames = all.slice(i);
    const r = run('NRU', 'X', initialFrames.length, { initialFrames, nruTie: 'random' });
    assert.equal(r.steps[0].victim.page, all[i].page);
  }
});
test('NRU reinicia R en el límite exacto, conserva M y cuenta cada referencia una vez', () => {
  const r = run('NRU', '1:W 2 1 3 1', 2, { resetEvery: 2, nruTie: 'frame' });
  assert.equal(r.steps[2].events[0].type, 'reset');
  assert.deepEqual(r.steps[2].events[0].frames.map(f => [f.r, f.m]), [[0,1],[0,0]]);
  assert.equal(r.steps[3].victim.page, '2'); assert.equal(r.totals.faults, 3);
  assert.deepEqual(r.steps.map(s => s.faults + s.hits), [1,2,3,4,5]);
});
test('NRU: antes/después del límite producen iguales decisiones pero distintas instantáneas de bits', () => {
  const before = run('NRU', '1 2 1 3 1', 2, { resetEvery: 2, nruTie: 'frame', resetTiming:'before' });
  const after = run('NRU', '1 2 1 3 1', 2, { resetEvery: 2, nruTie: 'frame', resetTiming:'after' });
  assert.deepEqual(pages(before), pages(after));
  assert.deepEqual(before.steps[1].after.frames.map(f=>f.r), [1,1]);
  assert.deepEqual(after.steps[1].after.frames.map(f=>f.r), [0,0]);
  assert.equal(before.totals.faults,3);
  assert.equal(run('NRU','1 2 1 3 1',2,{nruTie:'frame'}).totals.faults,4);
});
test('NRU: las dos convenciones deterministas de desempate son explícitas', () => {
  const initialFrames = [{page:'A',r:0,m:0,loadedAt:-1,lastUsed:-1}, {page:'B',r:0,m:0,loadedAt:-2,lastUsed:-2}];
  assert.equal(run('NRU','C',2,{initialFrames,nruTie:'frame'}).steps[0].victim.page,'A');
  assert.equal(run('NRU','C',2,{initialFrames,nruTie:'fifo'}).steps[0].victim.page,'B');
});
test('NRU con semilla es reproducible y solo sortea entre candidatos válidos', () => {
  const config = {algorithm:'NRU',references:'1 2 3 4 1 2 5 1 6 2 3 4 5',frameCount:3,resetEvery:3,seed:2026};
  const a=M.simulate(config), b=M.simulate(config);
  assert.deepEqual(a,b);
  a.steps.filter(s=>s.victim).forEach(s=>assert.equal(s.candidates.find(c=>c.frame===s.victim.frame).value,Math.min(...s.candidates.map(c=>c.value))));
});
test('Leer no borra M; una página modificada se escribe al salir, sin un fallo adicional', () => {
  const r=run('FIFO','0:W 0 1 0',1);
  assert.equal(r.steps[1].after.frames[0].m,1);
  assert.equal(r.totals.writebacks,1); assert.equal(r.totals.faults,3);
  assert.equal(r.steps[3].after.frames[0].m,0);
});
test('Reloj: posición inicial, acierto sin mover la mano y uso de huecos', () => {
  const r=run('CLOCK','A B A C D',3,{hand:1});
  assert.equal(r.steps[0].frame,1); assert.equal(r.steps[1].frame,2);
  assert.equal(r.steps[2].after.hand,0); assert.equal(r.steps[3].frame,0);
  assert.equal(r.steps[4].victim.page,'A');
  const preload=run('CLOCK','C',3,{hand:2,initialFrames:[null,{page:'A'},null]});
  assert.equal(preload.steps[0].frame,2);
});
test('La memoria inicial no cuenta como referencias; antigüedad y últimos usos se respetan', () => {
  const initialFrames=[{page:'A',loadedAt:-3,lastUsed:0},{page:'B',loadedAt:-2,lastUsed:-1}];
  assert.equal(run('FIFO','C',2,{initialFrames}).steps[0].victim.page,'A');
  assert.equal(run('LRU','C',2,{initialFrames}).steps[0].victim.page,'B');
  assert.equal(run('FIFO','A',2,{initialFrames}).totals.faults,0);
  assert.equal(run('FIFO','A',2,{initialFrames}).totals.references,1);
});
test('Analizador: conserva repeticiones, cero, etiquetas y escritura; rechaza referencias rotas', () => {
  assert.deepEqual(M.parseReferences('0, 12w\nP1; 0\t2:R P2:W'),[
    {page:'0',write:false},{page:'12',write:true},{page:'P1',write:false},{page:'0',write:false},{page:'2',write:false},{page:'P2',write:true}
  ]);
  for (const text of ['', '1 <script>', '1 2.5', '1:Q', '1::W', '-']) assert.throws(()=>M.parseReferences(text));
  assert.throws(()=>M.parseReferences('1 '.repeat(2001)));
});
test('Validación: no oculta marcos inválidos, bits inválidos, duplicados ni errores de configuración', () => {
  for (const n of [0,-1,1.5,65,NaN]) assert.throws(()=>run('FIFO','1',n));
  assert.throws(()=>run('OTRO','1',1));
  assert.throws(()=>run('NRU','1',1,{resetEvery:-1}));
  assert.throws(()=>run('NRU','1',1,{nruTie:'otro'}));
  assert.throws(()=>run('CLOCK','1',1,{hand:1}));
  assert.throws(()=>run('FIFO','1',2,{initialFrames:[{page:'A'},{page:'A'}]}));
  assert.throws(()=>run('FIFO','1',1,{initialFrames:[{page:'A',r:2}]}));
  assert.throws(()=>run('FIFO','1',1,{initialFrames:[{page:'A',loadedAt:0,lastUsed:-1}]}));
  assert.throws(()=>M.parseInitial('A::0',2));
  assert.throws(()=>M.parseInitial('A B C',2));
});
test('No muta las entradas ni comparte estados históricos; el último estado se conserva', () => {
  const config={algorithm:'CLOCK',references:'1 2 3 1 4',frameCount:2};
  const copy=structuredClone(config), a=M.simulate(config), b=M.simulate(config);
  assert.deepEqual(config,copy); assert.deepEqual(a,b);
  const first=structuredClone(a.steps[0].after);
  a.steps.at(-1).after.frames[0].page='CAMBIO';
  assert.deepEqual(a.steps[0].after,first);
  assert.ok(b.steps.at(-1).after.frames.every(Boolean));
});

// Oráculo independiente: explora TODAS las víctimas posibles para obtener el mínimo
// global, sin emplear la regla de mirar el siguiente uso implementada en Óptimo.
function minimumFaults(refs, capacity) {
  const memo=new Map();
  function visit(i,resident) {
    if(i===refs.length) return 0;
    const key=i+':'+[...resident].sort().join(','); if(memo.has(key))return memo.get(key);
    const page=refs[i]; let answer;
    if(resident.includes(page)) answer=visit(i+1,resident);
    else if(resident.length<capacity) answer=1+visit(i+1,[...resident,page]);
    else answer=1+Math.min(...resident.map((_,j)=>visit(i+1,resident.map((p,k)=>k===j?page:p))));
    memo.set(key,answer);return answer;
  }
  return visit(0,[]);
}
test('Óptimo coincide con un oráculo exhaustivo en todas las cadenas de longitud 6 con 3 páginas', () => {
  for(let n=0;n<729;n++) {
    let v=n; const refs=[]; for(let i=0;i<6;i++){refs.push(String(v%3));v=Math.floor(v/3);}
    for(const capacity of [1,2,3]) assert.equal(run('OPT',refs.join(' '),capacity).totals.faults,minimumFaults(refs,capacity));
  }
});
test('Invariantes y Segunda oportunidad/Reloj equivalentes en 120 cadenas de 40 referencias', () => {
  let seed=731; const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let k=0;k<120;k++) {
    const capacity=1+random()%6, refs=Array.from({length:40},()=>String(random()%9)).join(' ');
    const runs=Object.keys(M.ALGORITHMS).map(a=>run(a,refs,capacity,{resetEvery:5}));
    const optimal=runs.find(r=>r.config.algorithm==='OPT').totals.faults;
    for(const r of runs) {
      assert.equal(r.totals.faults+r.totals.hits,40); assert.ok(r.totals.faults>=optimal);
      r.steps.forEach(s=>{
        const before=s.before.frames.filter(Boolean).map(f=>f.page), after=s.after.frames.filter(Boolean).map(f=>f.page);
        assert.equal(s.hit,before.includes(s.reference.page)); assert.ok(after.includes(s.reference.page));
        assert.equal(new Set(after).size,after.length); assert.ok(after.length<=capacity);
        assert.equal(s.faults+s.hits,s.index);
        if(s.hit)assert.deepEqual(before,after);
        if(s.victim)assert.equal(before.length,capacity);
      });
    }
    assert.deepEqual(pages(runs.find(r=>r.config.algorithm==='SC')),pages(runs.find(r=>r.config.algorithm==='CLOCK')));
  }
});
test('Todos los algoritmos: un marco, repetición constante y espacio suficiente', () => {
  for(const algorithm of Object.keys(M.ALGORITHMS)) {
    assert.equal(run(algorithm,'0 0 0 0',1).totals.faults,1);
    assert.equal(run(algorithm,'1 2 1 2',1).totals.faults,4);
    assert.equal(run(algorithm,'1 2 3 1 2 3',4).totals.faults,3);
  }
});
test('Cadena larga de 2000 referencias soportada en los seis algoritmos', () => {
  const references=Array.from({length:2000},(_,i)=>String(i%11)).join(' ');
  for(const algorithm of Object.keys(M.ALGORITHMS)) {
    const r=run(algorithm,references,4,{resetEvery:7});
    assert.equal(r.steps.length,2000); assert.equal(r.totals.faults+r.totals.hits,2000);
  }
});
