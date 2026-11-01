const canvas = document.getElementById('circuitCanvas');
const ctx = canvas.getContext('2d');
const sidebar = document.getElementById('sidebar');
const toggleMenuBtn = document.getElementById('toggleMenu');
const componentsList = document.getElementById('componentsList');
const freqInput = document.getElementById('freqInput');
const simBtn = document.getElementById('simBtn');

const resultsPanel = document.getElementById('resultsPanel');
const resultsContent = document.getElementById('resultsContent');
const closeResultsBtn = document.getElementById('closeResultsBtn');

const editModal = document.getElementById('editModal');
const editTitle = document.getElementById('editTitle');
const editValue = document.getElementById('editValue');
const fixedUnit = document.getElementById('fixedUnit');
const selectUnit = document.getElementById('selectUnit');
const phaseGroup = document.getElementById('phaseGroup');
const editPhase = document.getElementById('editPhase');
const saveEditBtn = document.getElementById('saveEditBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
let componentToEdit = null;

const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeHelpBtn = document.getElementById('closeHelpBtn');

closeResultsBtn.addEventListener('click', () => { resultsPanel.classList.add('hidden'); });
cancelEditBtn.addEventListener('click', () => { editModal.classList.add('hidden'); componentToEdit = null; });
helpBtn.addEventListener('click', () => { helpModal.classList.remove('hidden'); });
closeHelpBtn.addEventListener('click', () => { helpModal.classList.add('hidden'); });

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let isDrawingWire = false;
let currentWire = null;
const placedComponents = [];
const wires = [];
let nodes = [];
let draggingComponent = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

function parseUnit(valueStr) {
    const units = { 'p': 1e-12, 'n': 1e-9, 'µ': 1e-6, 'u': 1e-6, '\u03bc': 1e-6, 'm': 1e-3, 'k': 1e3, 'M': 1e6, 'G': 1e9 };
    let cleanStr = valueStr.replace(/[VvAaFfHhΩ]/g, '').trim();
    let multiplier = 1;
    let lastChar = cleanStr.slice(-1);
    if (units[lastChar]) { multiplier = units[lastChar]; cleanStr = cleanStr.slice(0, -1); }
    let val = parseFloat(cleanStr);
    return isNaN(val) ? 0 : val * multiplier;
}

function formatComplex(c) {
    if (!c) return "0.00000000 ∠0.00000000° (0.00000000 + j0.00000000)";
    const mag = math.abs(c);
    let phase = math.arg(c) * 180 / Math.PI;
    const re = c.re || 0; const im = c.im || 0;
    const sign = im >= 0 ? '+' : '-';
    if (Math.abs(phase) < 1e-10) phase = 0; 
    return `${mag.toFixed(8)} ∠${phase.toFixed(8)}° (${re.toFixed(8)} ${sign} j${Math.abs(im).toFixed(8)})`;
}

class Component {
    constructor(x, y, label, value) {
        this.x = x; this.y = y; this.label = label; this.value = value;
        this.size = 40; this.terminalOffset = 20; this.angle = 0; 
    }
    getTerminals() {
        const rad = this.angle * Math.PI / 180;
        const cos = Math.cos(rad); const sin = Math.sin(rad);
        return [
            { x: this.x - this.terminalOffset * cos, y: this.y - this.terminalOffset * sin },
            { x: this.x + this.terminalOffset * cos, y: this.y + this.terminalOffset * sin }
        ];
    }
    drawTerminals(ctx) {
        ctx.fillStyle = '#aaaaaa';
        ctx.beginPath(); ctx.arc(-this.terminalOffset, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.closePath();
        ctx.beginPath(); ctx.arc(this.terminalOffset, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.closePath();
    }
    drawText(ctx, offsetY = 35) {
        ctx.fillStyle = '#ffffff'; ctx.font = '12px Arial';
        // Mostrar ángulo si es fuente AC
        let displayStr = `${this.label}: ${this.value}`;
        if (this.phase !== undefined) displayStr += ` ∠${this.phase}°`;
        ctx.fillText(displayStr, this.x - 20, this.y + offsetY);
    }
    drawPolarities(ctx) {
        const rad = this.angle * Math.PI / 180;
        const cos = Math.cos(rad); const sin = Math.sin(rad);
        const perpOffset = 25; const perpX = -sin * perpOffset; const perpY = cos * perpOffset;
        const sideOffset = 18; 
        const leftX = this.x - sideOffset * cos + perpX; const leftY = this.y - sideOffset * sin + perpY;
        const rightX = this.x + sideOffset * cos + perpX; const rightY = this.y + sideOffset * sin + perpY;
        ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff3b30'; ctx.fillText('+', leftX, leftY);
        ctx.fillStyle = '#00ccff'; ctx.fillText('-', rightX, rightY);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
}

class Multimeter extends Component {
    constructor(x, y, label) {
        super(x, y, label, '');
        this.mode = 'V'; this.reading = '0.00000000'; this.width = 90; this.height = 36; this.terminalOffset = 50; 
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle * Math.PI / 180);
        ctx.beginPath(); ctx.rect(-this.width/2, -this.height/2, this.width, this.height);
        ctx.fillStyle = '#444'; ctx.fill(); ctx.strokeStyle = '#ffc107'; ctx.lineWidth = 2; ctx.stroke();
        ctx.moveTo(-this.terminalOffset, 0); ctx.lineTo(-this.width/2, 0); ctx.moveTo(this.width/2, 0); ctx.lineTo(this.terminalOffset, 0);
        ctx.strokeStyle = '#fff'; ctx.stroke(); this.drawTerminals(ctx); ctx.restore();
        ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#00ffcc'; ctx.fillText(this.reading, this.x, this.y - 5);
        ctx.fillStyle = '#ffc107'; ctx.fillText(`[${this.mode}]`, this.x, this.y + 10);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; super.drawText(ctx, 35); this.drawPolarities(ctx);
    }
}

class Ground extends Component {
    constructor(x, y, label) { super(x, y, label, '0V'); this.terminalOffset = 15; }
    getTerminals() {
        const rad = this.angle * Math.PI / 180;
        const cos = Math.cos(rad); const sin = Math.sin(rad);
        return [{ x: this.x + this.terminalOffset * sin, y: this.y - this.terminalOffset * cos }];
    }
    drawTerminals(ctx) { ctx.fillStyle = '#aaaaaa'; ctx.beginPath(); ctx.arc(0, -this.terminalOffset, 4, 0, Math.PI * 2); ctx.fill(); ctx.closePath(); }
    drawPolarities(ctx) {}
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle * Math.PI / 180);
        ctx.beginPath(); ctx.moveTo(0, -this.terminalOffset); ctx.lineTo(0, 0); 
        ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.moveTo(-10, 5); ctx.lineTo(10, 5); ctx.moveTo(-5, 10); ctx.lineTo(5, 10); 
        ctx.strokeStyle = '#28a745'; ctx.lineWidth = 2; ctx.stroke(); this.drawTerminals(ctx); ctx.restore(); super.drawText(ctx, 25);
    }
}

class VoltageSource extends Component {
    constructor(x, y, label) { super(x, y, label, '10V'); this.terminalOffset = 25; this.phase = 0; }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle * Math.PI / 180);
        ctx.beginPath(); ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
        ctx.moveTo(-this.terminalOffset, 0); ctx.lineTo(-20, 0); ctx.moveTo(20, 0); ctx.lineTo(this.terminalOffset, 0); ctx.stroke();
        this.drawTerminals(ctx); ctx.restore(); this.drawText(ctx, 40); this.drawPolarities(ctx); 
    }
}

class CurrentSource extends Component {
    constructor(x, y, label) { super(x, y, label, '1A'); this.terminalOffset = 25; this.phase = 0; }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle * Math.PI / 180);
        ctx.beginPath(); ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -10); ctx.lineTo(-5, -5); ctx.moveTo(0, -10); ctx.lineTo(5, -5); ctx.stroke();
        ctx.moveTo(-this.terminalOffset, 0); ctx.lineTo(-20, 0); ctx.moveTo(20, 0); ctx.lineTo(this.terminalOffset, 0); ctx.stroke();
        this.drawTerminals(ctx); ctx.restore(); this.drawText(ctx, 40); this.drawPolarities(ctx); 
    }
}

class Resistor extends Component {
    constructor(x, y, label) { super(x, y, label, '1kΩ'); this.width = 50; this.height = 15; this.terminalOffset = 35; }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle * Math.PI / 180);
        ctx.beginPath(); ctx.rect(-this.width/2, -this.height/2, this.width, this.height);
        ctx.moveTo(-this.terminalOffset, 0); ctx.lineTo(-this.width/2, 0); ctx.moveTo(this.width/2, 0); ctx.lineTo(this.terminalOffset, 0);
        ctx.strokeStyle = '#ff9900'; ctx.lineWidth = 2; ctx.stroke();
        this.drawTerminals(ctx); ctx.restore(); super.drawText(ctx, 35); this.drawPolarities(ctx); 
    }
}

class Capacitor extends Component {
    constructor(x, y, label) { super(x, y, label, '1µF'); this.terminalOffset = 20; }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle * Math.PI / 180);
        ctx.beginPath(); ctx.moveTo(-5, -15); ctx.lineTo(-5, 15); ctx.moveTo(5, -15); ctx.lineTo(5, 15);
        ctx.moveTo(-this.terminalOffset, 0); ctx.lineTo(-5, 0); ctx.moveTo(5, 0); ctx.lineTo(this.terminalOffset, 0);
        ctx.strokeStyle = '#00ccff'; ctx.lineWidth = 2; ctx.stroke();
        this.drawTerminals(ctx); ctx.restore(); super.drawText(ctx, 35); this.drawPolarities(ctx); 
    }
}

class Inductor extends Component {
    constructor(x, y, label) { super(x, y, label, '1mH'); this.terminalOffset = 25; }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle * Math.PI / 180);
        ctx.beginPath(); ctx.arc(-10, 0, 5, Math.PI, 0); ctx.arc(0, 0, 5, Math.PI, 0); ctx.arc(10, 0, 5, Math.PI, 0);
        ctx.moveTo(-this.terminalOffset, 0); ctx.lineTo(-15, 0); ctx.moveTo(15, 0); ctx.lineTo(this.terminalOffset, 0);
        ctx.strokeStyle = '#ff33cc'; ctx.lineWidth = 2; ctx.stroke();
        this.drawTerminals(ctx); ctx.restore(); super.drawText(ctx, 30); this.drawPolarities(ctx); 
    }
}

toggleMenuBtn.addEventListener('click', () => { sidebar.classList.toggle('collapsed'); });
componentsList.addEventListener('dragstart', (e) => { e.dataTransfer.setData('type', e.target.dataset.type); });
canvas.addEventListener('dragover', (e) => { e.preventDefault(); });

canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('type');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    
    let newComp = null; let label = '';
    
    switch(type) {
        case 'voltageSource': label = 'V' + (placedComponents.filter(c => c instanceof VoltageSource).length + 1); newComp = new VoltageSource(x, y, label); break;
        case 'currentSource': label = 'I' + (placedComponents.filter(c => c instanceof CurrentSource).length + 1); newComp = new CurrentSource(x, y, label); break;
        case 'resistor': label = 'R' + (placedComponents.filter(c => c instanceof Resistor).length + 1); newComp = new Resistor(x, y, label); break;
        case 'capacitor': label = 'C' + (placedComponents.filter(c => c instanceof Capacitor).length + 1); newComp = new Capacitor(x, y, label); break;
        case 'inductor': label = 'L' + (placedComponents.filter(c => c instanceof Inductor).length + 1); newComp = new Inductor(x, y, label); break;
        case 'multimeter': label = 'M' + (placedComponents.filter(c => c instanceof Multimeter).length + 1); newComp = new Multimeter(x, y, label); break;
        case 'ground': label = 'GND'; newComp = new Ground(x, y, label); break;
    }
    
    if(newComp) placedComponents.push(newComp);
    updateNodes(); redraw();
});

canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;

    const clickedComp = placedComponents.find(c => Math.abs(c.x - x) < 25 && Math.abs(c.y - y) < 25);

    if (clickedComp) {
        if (clickedComp instanceof Multimeter) {
            const newMode = prompt(`Modo para ${clickedComp.label} (V = Voltaje, A = Corriente):`, clickedComp.mode);
            if (newMode && (newMode.toUpperCase() === 'V' || newMode.toUpperCase() === 'A')) {
                clickedComp.mode = newMode.toUpperCase(); clickedComp.reading = '0.00000000'; redraw();
            }
        } else if (!(clickedComp instanceof Ground)) {
            componentToEdit = clickedComp;
            
            let valStr = clickedComp.value;
            let unit = valStr.slice(-1);
            let num = valStr.slice(0, -1);
            if (!['V','A','Ω','F','H'].includes(unit.toUpperCase())) { num = valStr; unit = ''; }

            editTitle.textContent = `Editar ${clickedComp.label}`;
            editValue.value = num;
            
            fixedUnit.classList.add('hidden');
            selectUnit.classList.add('hidden');
            phaseGroup.classList.add('hidden'); // Ocultar fase por defecto
            
            if (clickedComp instanceof Resistor) {
                fixedUnit.textContent = 'Ω'; fixedUnit.classList.remove('hidden');
            } else if (clickedComp instanceof VoltageSource || clickedComp instanceof CurrentSource) {
                fixedUnit.textContent = clickedComp instanceof VoltageSource ? 'V' : 'A'; 
                fixedUnit.classList.remove('hidden');
                
                // Mostrar ángulo si es fuente
                editPhase.value = clickedComp.phase || 0;
                phaseGroup.classList.remove('hidden');
            } else if (clickedComp instanceof Capacitor) {
                selectUnit.innerHTML = '<option value="F">F (Faradios)</option><option value="Ω">Ω (Reactancia)</option>';
                selectUnit.value = (unit === 'Ω') ? 'Ω' : 'F'; selectUnit.classList.remove('hidden');
            } else if (clickedComp instanceof Inductor) {
                selectUnit.innerHTML = '<option value="H">H (Henrios)</option><option value="Ω">Ω (Reactancia)</option>';
                selectUnit.value = (unit === 'Ω') ? 'Ω' : 'H'; selectUnit.classList.remove('hidden');
            }
            
            editModal.classList.remove('hidden');
            editValue.focus();
        }
    }
});

saveEditBtn.addEventListener('click', () => {
    if (componentToEdit) {
        let numStr = editValue.value.trim();
        let unitStr = "";
        if (componentToEdit instanceof Capacitor || componentToEdit instanceof Inductor) {
            unitStr = selectUnit.value;
        } else {
            unitStr = fixedUnit.textContent;
        }
        componentToEdit.value = numStr + unitStr;

        // Guardar la fase si es una fuente
        if (componentToEdit instanceof VoltageSource || componentToEdit instanceof CurrentSource) {
            componentToEdit.phase = parseFloat(editPhase.value) || 0;
        }

        redraw();
    }
    editModal.classList.add('hidden');
    componentToEdit = null;
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault(); 
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;

    const compIndex = placedComponents.findIndex(c => Math.abs(c.x - x) < 25 && Math.abs(c.y - y) < 25);
    if (compIndex !== -1) { placedComponents.splice(compIndex, 1); updateNodes(); redraw(); return; }
    
    const wireIndex = wires.findIndex(w => distanceToLineSegment(x, y, w.startX, w.startY, w.endX, w.endY) < 8);
    if (wireIndex !== -1) { wires.splice(wireIndex, 1); updateNodes(); redraw(); }
});

function getClosestPointOnLineSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return {x: x1, y: y1};
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

function distanceToLineSegment(px, py, x1, y1, x2, y2) {
    const closest = getClosestPointOnLineSegment(px, py, x1, y1, x2, y2); return Math.hypot(px - closest.x, py - closest.y);
}

const snapDistance = 15;

function getSnapPoint(x, y) {
    for (let comp of placedComponents) {
        for (let t of comp.getTerminals()) { if (Math.hypot(t.x - x, t.y - y) < snapDistance) return {x: t.x, y: t.y}; }
    }
    for (let wire of wires) {
        if (Math.hypot(wire.startX - x, wire.startY - y) < snapDistance) return {x: wire.startX, y: wire.startY};
        if (Math.hypot(wire.endX - x, wire.endY - y) < snapDistance) return {x: wire.endX, y: wire.endY};
    }
    for (let wire of wires) {
        const closest = getClosestPointOnLineSegment(x, y, wire.startX, wire.startY, wire.endX, wire.endY);
        if (Math.hypot(closest.x - x, closest.y - y) < snapDistance) return {x: closest.x, y: closest.y};
    }
    return {x, y};
}

function updateNodes() {
    nodes = []; const endpoints = [];
    wires.forEach((w, idx) => {
        endpoints.push({x: w.startX, y: w.startY, type: 'wire', idx: idx});
        endpoints.push({x: w.endX, y: w.endY, type: 'wire', idx: idx});
    });
    placedComponents.forEach(comp => {
        comp.getTerminals().forEach(t => endpoints.push({x: t.x, y: t.y, type: 'comp', idx: -1}));
    });

    endpoints.forEach((pt, i) => {
        let isNode = false;
        for (let j = i + 1; j < endpoints.length; j++) {
            if (Math.hypot(pt.x - endpoints[j].x, pt.y - endpoints[j].y) < snapDistance) { isNode = true; break; }
        }
        if (!isNode) {
            for (let w = 0; w < wires.length; w++) {
                if (pt.type === 'wire' && pt.idx === w) continue; 
                const wire = wires[w];
                const dist = distanceToLineSegment(pt.x, pt.y, wire.startX, wire.startY, wire.endX, wire.endY);
                if (dist < snapDistance) { isNode = true; break; }
            }
        }
        if (isNode) {
            const exists = nodes.find(n => Math.hypot(n.x - pt.x, n.y - pt.y) < snapDistance);
            if (!exists) nodes.push({x: pt.x, y: pt.y});
        }
    });
}

canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; 
    const rect = canvas.getBoundingClientRect();
    let mouseX = e.clientX - rect.left; let mouseY = e.clientY - rect.top;

    if (e.shiftKey) {
        const comp = placedComponents.find(c => Math.abs(c.x - mouseX) < 25 && Math.abs(c.y - mouseY) < 25);
        if (comp) {
            const newAngle = prompt(`Introduce el nuevo ángulo (en grados) para ${comp.label}:`, comp.angle);
            if (newAngle !== null && !isNaN(newAngle)) { comp.angle = parseFloat(newAngle); updateNodes(); redraw(); }
            return; 
        }
    }

    const clickedComp = placedComponents.find(c => Math.abs(c.x - mouseX) < 25 && Math.abs(c.y - mouseY) < 25);
    if (clickedComp) {
        draggingComponent = clickedComp; dragOffsetX = mouseX - clickedComp.x; dragOffsetY = mouseY - clickedComp.y; return; 
    }
    isDrawingWire = true;
    const snap = getSnapPoint(mouseX, mouseY); currentWire = { startX: snap.x, startY: snap.y, endX: snap.x, endY: snap.y };
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    let mouseX = e.clientX - rect.left; let mouseY = e.clientY - rect.top;
    
    if (draggingComponent) {
        draggingComponent.x = mouseX - dragOffsetX; draggingComponent.y = mouseY - dragOffsetY; updateNodes(); redraw(); return;
    }
    if (!isDrawingWire) return;
    
    const snap = getSnapPoint(mouseX, mouseY); currentWire.endX = snap.x; currentWire.endY = snap.y;
    redraw();
    ctx.beginPath(); ctx.moveTo(currentWire.startX, currentWire.startY); ctx.lineTo(currentWire.endX, currentWire.endY);
    ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 2; ctx.stroke();
});

canvas.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return; 
    if (draggingComponent) { draggingComponent = null; updateNodes(); redraw(); return; }
    if (isDrawingWire && currentWire) {
        if (currentWire.startX !== currentWire.endX || currentWire.startY !== currentWire.endY) { wires.push({...currentWire}); updateNodes(); }
    }
    isDrawingWire = false; currentWire = null; redraw();
});

window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; redraw(); });

function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    wires.forEach(wire => {
        ctx.beginPath(); ctx.moveTo(wire.startX, wire.startY); ctx.lineTo(wire.endX, wire.endY);
        ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 2; ctx.stroke();
    });
    placedComponents.forEach(component => component.draw(ctx));
    nodes.forEach(node => {
        ctx.beginPath(); ctx.arc(node.x, node.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ff3b30'; ctx.fill(); ctx.closePath();
    });
}
redraw();

function buildNetlist() {
    let parent = {};
    function find(i) {
        if (parent[i] === undefined) return i;
        if (parent[i] !== i) parent[i] = find(parent[i]); return parent[i];
    }
    function union(i, j) {
        let rootI = find(i); let rootJ = find(j); if (rootI !== rootJ) parent[rootI] = rootJ;
    }

    const pointToId = (x, y) => `${Math.round(x)},${Math.round(y)}`;
    let allPoints = [];

    wires.forEach(w => { 
        allPoints.push({x: w.startX, y: w.startY}); allPoints.push({x: w.endX, y: w.endY}); 
        union(pointToId(w.startX, w.startY), pointToId(w.endX, w.endY)); 
    });
    placedComponents.forEach(c => c.getTerminals().forEach(t => allPoints.push({x: t.x, y: t.y})));

    for(let i = 0; i < allPoints.length; i++) {
        let id1 = pointToId(allPoints[i].x, allPoints[i].y);
        if (parent[id1] === undefined) parent[id1] = id1;
        for(let j = i + 1; j < allPoints.length; j++) {
            if (Math.hypot(allPoints[i].x - allPoints[j].x, allPoints[i].y - allPoints[j].y) < snapDistance) {
                let id2 = pointToId(allPoints[j].x, allPoints[j].y);
                if (parent[id2] === undefined) parent[id2] = id2; union(id1, id2);
            }
        }
    }

    wires.forEach(w => {
        let wireStartId = pointToId(w.startX, w.startY);
        allPoints.forEach(pt => {
            if (distanceToLineSegment(pt.x, pt.y, w.startX, w.startY, w.endX, w.endY) < snapDistance) {
                union(wireStartId, pointToId(pt.x, pt.y));
            }
        });
    });

    let groundComp = placedComponents.find(c => c instanceof Ground);
    if (!groundComp) { 
        resultsContent.textContent = "¡Error! Necesitas colocar una Tierra (GND) para simular.";
        resultsPanel.classList.remove('hidden'); return null; 
    }
    
    let gndTerminal = groundComp.getTerminals()[0];
    let groundRoot = find(pointToId(gndTerminal.x, gndTerminal.y));
    let nextNodeId = 1; let rootToNodeId = {}; rootToNodeId[groundRoot] = 0;

    let netlist = placedComponents.map(comp => {
        if (comp instanceof Ground) return null;
        let terms = comp.getTerminals();
        let n1_root = find(pointToId(terms[0].x, terms[0].y)); let n2_root = find(pointToId(terms[1].x, terms[1].y)); 
        if (rootToNodeId[n1_root] === undefined) rootToNodeId[n1_root] = nextNodeId++;
        if (rootToNodeId[n2_root] === undefined) rootToNodeId[n2_root] = nextNodeId++;

        return {
            tipo: comp.constructor.name, etiqueta: comp.label, valorNum: parseUnit(comp.value),
            nodo1: rootToNodeId[n1_root], nodo2: rootToNodeId[n2_root], ref: comp
        };
    }).filter(c => c !== null);

    return { netlist, numNodes: nextNodeId - 1 };
}

// Admitancia compleja Y = 1/Z de cada elemento pasivo (misma función para armar la matriz y para calcular I = Y·V)
const Y_SHORT = 1e6; // Admitancia usada para modelar un cortocircuito ideal (Z = 0)
function getAdmittance(comp, w) {
    const val = comp.valorNum;
    const isOhm = comp.ref.value.endsWith('Ω');
    const shortCircuit = math.complex(Y_SHORT, 0);
    switch (comp.tipo) {
        case 'Resistor':
            return val === 0 ? shortCircuit : math.complex(1 / val, 0);                  // Z = R
        case 'Capacitor':
            if (isOhm) return val === 0 ? shortCircuit : math.complex(0, 1 / val);       // Z = -jXc  ->  Y = j/Xc
            return math.complex(0, w * val);                                             // Z = 1/(jwC)  ->  Y = jwC
        case 'Inductor':
            if (isOhm) return val === 0 ? shortCircuit : math.complex(0, -1 / val);      // Z = jXl   ->  Y = -j/Xl
            if (val === 0 || w === 0) return shortCircuit;                               // L = 0 o corriente directa: cortocircuito
            return math.complex(0, -1 / (w * val));                                      // Z = jwL   ->  Y = -j/(wL)
        case 'Multimeter':
            return comp.ref.mode === 'V' ? math.complex(1e-9, 0) : math.complex(0, 0);  // Voltímetro: 1 GΩ
    }
    return math.complex(0, 0);
}

function solveCircuit() {
    const buildResult = buildNetlist();
    if (!buildResult) return;
    const { netlist, numNodes: N } = buildResult; 
    const freqParsed = parseFloat(freqInput.value);
    const freq = (isFinite(freqParsed) && freqParsed >= 0) ? freqParsed : 60;
    const w = 2 * Math.PI * freq; 

    let voltageSources = [];
    netlist.forEach(comp => { if (comp.tipo === 'VoltageSource' || (comp.tipo === 'Multimeter' && comp.ref.mode === 'A')) { voltageSources.push(comp); } });
    
    const M = voltageSources.length; const size = N + M;
    
    if (size === 0) {
        if (netlist.length > 0) {
            resultsContent.textContent = "🔌 CORTOCIRCUITO A TIERRA\n\nTodos los componentes de tu circuito han sido conectados directamente a Tierra (GND) mediante cables.\n\nAl no haber nodos distintos de 0V, el voltaje en todo el circuito es de 0 Volts.";
            resultsPanel.classList.remove('hidden');
        } else {
            resultsContent.textContent = "Circuito vacío."; resultsPanel.classList.remove('hidden');
        }
        return; 
    }

    let A = Array(size).fill(0).map(() => Array(size).fill(math.complex(0, 0)));
    let Z_mat = Array(size).fill(0).map(() => [math.complex(0, 0)]);
    const addA = (r, c, val) => { if (r > 0 && c > 0) A[r - 1][c - 1] = math.add(A[r - 1][c - 1], val); };
    const addZ = (r, val) => { if (r > 0) Z_mat[r - 1][0] = math.add(Z_mat[r - 1][0], val); };

    netlist.forEach(comp => {
        const n1 = comp.nodo1; const n2 = comp.nodo2; const val = comp.valorNum;

        if (comp.tipo === 'CurrentSource') {
            // Incorporación de ángulo (Phasor) a número complejo (Rectangular)
            const phaseRad = (comp.ref.phase || 0) * Math.PI / 180;
            const I_complex = math.complex(val * Math.cos(phaseRad), val * Math.sin(phaseRad));
            addZ(n1, math.multiply(I_complex, -1)); addZ(n2, I_complex);
        } else if (['Resistor', 'Capacitor', 'Inductor'].includes(comp.tipo) || (comp.tipo === 'Multimeter' && comp.ref.mode === 'V')) {
            const Y = getAdmittance(comp, w);
            const negY = math.multiply(Y, -1);
            addA(n1, n1, Y); addA(n2, n2, Y); addA(n1, n2, negY); addA(n2, n1, negY);
        }
    });
    
    voltageSources.forEach((vs, idx) => {
        const n1 = vs.nodo1; const n2 = vs.nodo2; 
        const mag = vs.tipo === 'Multimeter' ? 0 : vs.valorNum; 
        const phase = vs.tipo === 'Multimeter' ? 0 : (vs.ref.phase || 0);
        const phaseRad = phase * Math.PI / 180;
        const valComplex = math.complex(mag * Math.cos(phaseRad), mag * Math.sin(phaseRad));

        const m = N + idx + 1; 
        addA(m, n1, math.complex(1, 0)); addA(m, n2, math.complex(-1, 0));
        addA(n1, m, math.complex(1, 0)); addA(n2, m, math.complex(-1, 0));
        addZ(m, valComplex); 
    });

    try {
        const X = math.lusolve(A, Z_mat);
        const V_nodes = [math.complex(0, 0)];
        for (let i = 0; i < N; i++) V_nodes.push(X[i][0]); 

        let msg = "=== RESULTADOS DE LOS NODOS ===\n";
        for (let i = 0; i <= N; i++) {
            const v = V_nodes[i]; msg += `Nodo ${i}:\n${formatComplex(v)} V\n\n`;
        }

        const sourcesData = [];
        
        msg += "=== CORRIENTE, VOLTAJE Y POTENCIA ===\n";
        msg += "(Convención pasiva: en las fuentes, P < 0 indica que entregan potencia)\n\n";
        netlist.forEach(comp => {
            const V1 = V_nodes[comp.nodo1]; const V2 = V_nodes[comp.nodo2];
            const Vdrop = math.subtract(V1, V2);
            let I = math.complex(0, 0);
            const isPassive = ['Resistor', 'Capacitor', 'Inductor'].includes(comp.tipo) || (comp.tipo === 'Multimeter' && comp.ref.mode === 'V');

            if (isPassive) I = math.multiply(Vdrop, getAdmittance(comp, w));
            else if (comp.tipo === 'CurrentSource') {
                const pRad = (comp.ref.phase || 0) * Math.PI / 180;
                I = math.complex(comp.valorNum * Math.cos(pRad), comp.valorNum * Math.sin(pRad));
            }
            else if (comp.tipo === 'VoltageSource' || (comp.tipo === 'Multimeter' && comp.ref.mode === 'A')) {
                const idx = voltageSources.indexOf(comp);
                I = X[N + idx][0];
            }

            let S_comp = math.multiply(math.multiply(Vdrop, math.conj(I)), 0.5);
            let P_comp = S_comp.re; let Q_comp = S_comp.im; let Sapp_comp = math.abs(S_comp);

            if (comp.tipo === 'VoltageSource' || comp.tipo === 'CurrentSource') {
                // Corriente ENTREGADA por la fuente (sale del terminal +): I_entregada = -I_MNA
                sourcesData.push({ etiqueta: comp.etiqueta, V: Vdrop, I: math.multiply(I, -1) });
            }

            msg += `${comp.etiqueta}:\n  V = ${formatComplex(Vdrop)} V\n  I = ${formatComplex(I)} A\n`;
            
            if (comp.tipo !== 'Multimeter') {
                msg += `  S (Aparente) = ${Sapp_comp.toFixed(4)} VA\n  P (Activa)   = ${P_comp.toFixed(4)} W\n  Q (Reactiva) = ${Q_comp.toFixed(4)} VAR\n`;
            }
            msg += `\n`;

            if (comp.tipo === 'Multimeter') {
                if (comp.ref.mode === 'V') comp.ref.reading = math.abs(Vdrop).toFixed(8);
                if (comp.ref.mode === 'A') comp.ref.reading = math.abs(I).toFixed(8);
            }
        });

        msg += "=== IMPEDANCIA Y POTENCIA (TOTAL) ===\n";
        if (sourcesData.length > 0) {
            // Potencia ENTREGADA por todas las fuentes: S = ½·V·I*   (pico)
            // S_2w = ½·V·I (sin conjugar) define la componente de 2ω de p(t)
            let S_total = math.complex(0, 0); let S_2w = math.complex(0, 0);
            sourcesData.forEach(s => {
                S_total = math.add(S_total, math.multiply(math.multiply(s.V, math.conj(s.I)), 0.5));
                S_2w = math.add(S_2w, math.multiply(math.multiply(s.V, s.I), 0.5));
            });

            if (sourcesData.length === 1) {
                const Vs = sourcesData[0].V; const Is = sourcesData[0].I;
                if (math.abs(Is) > 1e-12) msg += `Z Total:\n${formatComplex(math.divide(Vs, Is))} Ω\n\n`;
                else msg += "Z Total: ∞ (circuito abierto)\n\n";
                if (math.abs(Vs) > 1e-12) msg += `Y Total:\n${formatComplex(math.divide(Is, Vs))} S\n\n`;
                else msg += "Y Total: ∞ (cortocircuito)\n\n";
            } else {
                msg += "Z Total / Y Total: no están definidas con varias fuentes independientes.\n\n";
            }

            let P_tot = S_total.re; let Q_tot = S_total.im; let Sapp_tot = math.abs(S_total);
            let S_sign = Q_tot >= 0 ? '+' : '-';
            const amp2w = math.abs(S_2w);
            const angSum = math.arg(S_2w) * 180 / Math.PI; let angSign = angSum >= 0 ? '+' : '-';

            msg += `(Potencias entregadas por las fuentes, asumiendo Amplitudes Pico)\n\n`;
            msg += `Potencia Aparente (|S|)  : ${Sapp_tot.toFixed(6)} VA\n`;
            msg += `Potencia Activa/Prom (P) : ${P_tot.toFixed(6)} W\n`;
            msg += `Potencia Reactiva (Q)    : ${Q_tot.toFixed(6)} VAR\n`;
            msg += `Potencia Compleja (S)    : ${P_tot.toFixed(6)} ${S_sign} j${Math.abs(Q_tot).toFixed(6)} VA\n\n`;
            msg += `Potencia Instantánea p(t):\n`;
            msg += `${P_tot.toFixed(4)} + ${amp2w.toFixed(4)} * cos(2ωt ${angSign} ${Math.abs(angSum).toFixed(2)}°) W\n\n`;
        } else { msg += "No hay una fuente principal para referenciar Z y Potencia Total.\n\n"; }

        let passivesAdj = {};
        for (let i = 0; i <= N; i++) passivesAdj[i] = new Set();
        netlist.forEach(c => {
            if (['Resistor', 'Capacitor', 'Inductor'].includes(c.tipo)) {
                passivesAdj[c.nodo1].add(c.nodo2); passivesAdj[c.nodo2].add(c.nodo1);
            }
        });

        let estrellas = [];
        for (let i = 0; i <= N; i++) { if (passivesAdj[i].size === 3) estrellas.push(i); }
        let deltas = [];
        for (let i = 0; i <= N; i++) {
            for (let j = i + 1; j <= N; j++) {
                for (let k = j + 1; k <= N; k++) {
                    if (passivesAdj[i].has(j) && passivesAdj[j].has(k) && passivesAdj[k].has(i)) {
                        deltas.push(`(${i}, ${j}, ${k})`);
                    }
                }
            }
        }

        msg += "=== ANÁLISIS TOPOLÓGICO ===\n";
        if (deltas.length > 0) msg += `Delta (Δ) lazo en nodos: ${deltas.join(', ')}\n`;
        else msg += "No se detectaron deltas (Δ).\n";
        if (estrellas.length > 0) msg += `Estrella (Y) en nodos centrales: ${estrellas.join(', ')}\n`;
        else msg += "No se detectaron estrellas (Y).\n";

        redraw();
        resultsContent.textContent = msg; resultsPanel.classList.remove('hidden');

    } catch (e) {
        console.error(e);
        let errorMsg = "❌ ERROR AL RESOLVER EL CIRCUITO\n\n";
        if (/singular|cannot solve|cannot be solved/i.test(e.message)) {
            errorMsg += "⚠️ CORTOCIRCUITO O NODO FLOTANTE DETECTADO ⚠️\n\nPosibles causas:\n1. Cortocircuito: Conectaste una fuente de voltaje directamente sobre sí misma o hacia Tierra.\n2. Nodo Flotante: Tienes un componente conectado al aire, sin un camino que cierre el circuito hacia la Tierra (GND).\n\n";
        } else {
            errorMsg += "Fallo matemático interno:\n" + e.message;
        }
        resultsContent.textContent = errorMsg; resultsPanel.classList.remove('hidden');
    }
}

simBtn.addEventListener('click', solveCircuit);
