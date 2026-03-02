// Nosso Universo - Joaquim & Isadora

// ==========================================
// 0. Configuração Supabase
// ==========================================
const SUPABASE_URL = 'https://amivjrwedwpczlziatuc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtaXZqcndlZHdwY3psemlhdHVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDcwOTQsImV4cCI6MjA4Nzk4MzA5NH0.cZyXJ8PIbDTA6VpDmkjy0XjgAVudEizSz7FP2ZWDs_Y';

let supabaseClient = null;

function initSupabase() {
    if (typeof window.supabase !== 'undefined' && !supabaseClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
}

// ==========================================
// 1. Armazenamento
// ==========================================
const Storage = {
    async getMemories() {
        if (!supabaseClient) {
            const data = localStorage.getItem('nosso_universo_memories');
            return data ? JSON.parse(data) : [];
        }

        const { data, error } = await supabaseClient
            .from('memories')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Erro ao buscar memórias:', error);
            return [];
        }

        // Mapear campos do banco para o App
        return data.map(m => ({
            id: m.id,
            url: m.image_url,
            date: m.memory_date,
            desc: m.description
        }));
    },

    async saveNewMemory(imageBase64, date, desc) {
        if (!supabaseClient) {
            // Fallback para localStorage se não houver Supabase configurado
            const memories = await this.getMemories();
            const newMemory = { id: Date.now().toString(), url: imageBase64, date, desc };
            memories.push(newMemory);
            localStorage.setItem('nosso_universo_memories', JSON.stringify(memories));
            return newMemory;
        }

        try {
            // 1. Converter Base64 para Blob para upload
            const response = await fetch(imageBase64);
            const blob = await response.blob();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

            // 2. Upload para o Storage
            const { data: uploadData, error: uploadError } = await supabaseClient.storage
                .from('memories')
                .upload(fileName, blob);

            if (uploadError) throw uploadError;

            // 3. Pegar URL Pública
            const { data: { publicUrl } } = supabaseClient.storage
                .from('memories')
                .getPublicUrl(fileName);

            // 4. Salvar no Banco
            const { data: dbData, error: dbError } = await supabaseClient
                .from('memories')
                .insert([{
                    image_url: publicUrl,
                    memory_date: date,
                    description: desc
                }])
                .select();

            if (dbError) throw dbError;

            const m = dbData[0];
            return {
                id: m.id,
                url: m.image_url,
                date: m.memory_date,
                desc: m.description
            };
        } catch (err) {
            console.error('Erro detalhado do Supabase:', err);
            // Se o erro tiver uma mensagem específica do Supabase, mostramos
            const msg = err.message || 'Erro desconhecido';
            alert(`Erro ao eternizar memória: ${msg}\n\nVerifique o console (F12) para detalhes.`);
            throw err;
        }
    }
};

// ==========================================
// 2. Estado Global
// ==========================================
const AppState = {
    memories: [],
    phase: 'PRE_BANG',
    camera: { x: 0, y: 0, zoom: 1.0 },
    drag: { active: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0 },
    pinch: { active: false, startDist: 0, startZoom: 1.0 },
    mouse: { x: -1000, y: -1000, active: false },
    lastTime: 0,
    currentImageBase64: null,
    isSavingMemory: false,
    introTimer: 0,
};

// ==========================================
// 3. Estruturas de Dados do Universo
// ==========================================

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.baseX = x;
        this.baseY = y;
        this.size = Math.random() * 2.5 + 1.5;
        const colors = ['#ffffff', '#ff4d85', '#bd6cdb', '#c252a1', '#f9a8d4', '#fcb045', '#fd1d1d'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.alpha = 1;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = Math.random() * 25 + 10;
        this.friction = 0.96;
    }

    vibrate() {
        this.x = this.baseX + (Math.random() - 0.5) * 8;
        this.y = this.baseY + (Math.random() - 0.5) * 8;
    }

    explode(dt) {
        this.x += Math.cos(this.angle) * this.speed * (dt / 16);
        this.y += Math.sin(this.angle) * this.speed * (dt / 16);
        this.alpha -= 0.006 * (dt / 16);
        this.speed *= Math.pow(this.friction, dt / 16);
    }

    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
}


class Star {
    constructor(w, h) {
        this.x = (Math.random() - 0.5) * w * 4;
        this.y = (Math.random() - 0.5) * h * 4;
        this.size = Math.random() > 0.9 ? Math.random() * 2.5 + 1 : Math.random() * 1.2 + 0.3;
        this.baseAlpha = Math.random() * 0.6 + 0.1;
        this.alpha = this.baseAlpha;
        this.depth = Math.random() * 0.5 + 0.1;
        this.blinkPhase = Math.random() * Math.PI * 2;
        this.blinkSpeed = Math.random() * 0.02 + 0.005;
    }

    draw(ctx, camX, camY, zoom, w, h) {
        const zDepth = 1 + (zoom - 1) * 0.2;

        let drawX = (this.x + camX * this.depth) * zDepth + w / 2;
        let drawY = (this.y + camY * this.depth) * zDepth + h / 2;

        if (drawX < -20 || drawX > w + 20 || drawY < -20 || drawY > h + 20) return;

        this.blinkPhase += this.blinkSpeed;
        this.alpha = this.baseAlpha + Math.sin(this.blinkPhase) * 0.2;

        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(drawX, drawY, this.size * Math.max(0.2, zDepth), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

class HeartStar {
    constructor(w, h) {
        this.x = (Math.random() - 0.5) * w * 4;
        this.y = (Math.random() - 0.5) * h * 4;
        this.baseSize = Math.random() * 6 + 3;
        this.phase = Math.random() * Math.PI * 2;
        this.speed = Math.random() * 0.015 + 0.005;
        this.depth = Math.random() * 0.7 + 0.2;
        const colors = ['#ff4d85', '#ff8fab', '#ffb3c6', '#d63384'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    draw(ctx, camX, camY, zoom, w, h) {
        const zDepth = 1 + (zoom - 1) * Math.max(0.2, this.depth * 0.8);

        let drawX = (this.x + camX * this.depth) * zDepth + w / 2;
        let drawY = (this.y + camY * this.depth) * zDepth + h / 2;

        if (drawX < -50 || drawX > w + 50 || drawY < -50 || drawY > h + 50) return;

        this.phase += this.speed;
        const scale = 1 + Math.sin(this.phase) * 0.3;
        const size = this.baseSize * scale * zDepth;
        const alpha = 0.4 + Math.sin(this.phase) * 0.4;

        if (size < 0.5) return;

        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10 * zDepth;
        ctx.shadowColor = this.color;

        ctx.beginPath();
        ctx.moveTo(drawX, drawY + size / 4);
        ctx.bezierCurveTo(drawX, drawY - size / 2, drawX - size, drawY - size / 2, drawX - size, drawY + size / 4);
        ctx.bezierCurveTo(drawX - size, drawY + size, drawX, drawY + size * 1.5, drawX, drawY + size * 2);
        ctx.bezierCurveTo(drawX, drawY + size * 1.5, drawX + size, drawY + size, drawX + size, drawY + size / 4);
        ctx.bezierCurveTo(drawX + size, drawY - size / 2, drawX, drawY - size / 2, drawX, drawY + size / 4);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
}

class SystemSun {
    constructor(x, y) {
        this.baseX = x;
        this.baseY = y;
        this.size = 70;
        this.phase = Math.random() * Math.PI * 2;
    }

    draw(ctx, camX, camY, zoom, w, h) {
        let drawX = (this.baseX + camX) * zoom + w / 2;
        let drawY = (this.baseY + camY) * zoom + h / 2;
        let s = this.size * zoom;

        if (drawX < -s * 4 || drawX > w + s * 4 || drawY < -s * 4 || drawY > h + s * 4) return;

        this.phase += 0.01;
        const pulse = 1 + Math.sin(this.phase) * 0.05;

        // Coroa
        const gradient = ctx.createRadialGradient(drawX, drawY, s * 0.2, drawX, drawY, s * 3.5 * pulse);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.15, 'rgba(255, 240, 150, 0.9)');
        gradient.addColorStop(0.4, 'rgba(255, 120, 30, 0.5)');
        gradient.addColorStop(0.7, 'rgba(180, 20, 60, 0.15)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(drawX, drawY, s * 3.5 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 25 * zoom;
        ctx.shadowColor = '#ffffff';
        ctx.beginPath();
        ctx.arc(drawX, drawY, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class DriftingCanvasText {
    constructor(w, h, text) {
        this.text = text;
        this.x = (Math.random() - 0.5) * w * 4;
        this.y = (Math.random() - 0.5) * h * 4 + (h / 3);
        this.depth = Math.random() * 0.6 + 0.3;
        this.size = Math.random() * 10 + 12;
        this.alpha = 0;
        this.vy = -(Math.random() * 0.15 + 0.05);
        this.lifePhase = 0;
        this.speed = 0.0015;
    }

    update(dt) {
        this.y += this.vy * (dt / 16);
        this.lifePhase += this.speed * (dt / 16);

        if (this.lifePhase < 0.2) this.alpha = this.lifePhase / 0.2;
        else if (this.lifePhase > 0.8) this.alpha = (1 - this.lifePhase) / 0.2;
        else this.alpha = 1;
    }

    draw(ctx, camX, camY, zoom, w, h) {
        const zDepth = 1 + (zoom - 1) * this.depth;
        let drawX = (this.x + camX * this.depth) * zDepth + w / 2;
        let drawY = (this.y + camY * this.depth) * zDepth + h / 2;

        if (drawX < -100 || drawX > w + 100 || drawY < -100 || drawY > h + 100) return;

        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = '#ffffff';
        ctx.font = `${this.size * zDepth}px 'Cinzel', serif`;
        ctx.textAlign = 'center';

        ctx.shadowBlur = 10 * zDepth;
        ctx.shadowColor = '#ff4d85';

        ctx.fillText(this.text, drawX, drawY);

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
}

class Moon {
    constructor(parentRadius) {
        this.orbitRadius = parentRadius * (Math.random() * 0.3 + 0.7);
        this.size = Math.random() * 8 + 10;
        this.phase = Math.random() * Math.PI * 2;
        // REDUCED: Lua orbita super divagar! (Levemente aumentado)
        this.speed = (Math.random() * 0.005 + 0.003) * 1.5;
        if (Math.random() > 0.5) this.speed *= -1;

        this.element = document.createElement('div');
        this.element.className = 'planet-moon';
        this.element.style.width = `${this.size}px`;
        this.element.style.height = `${this.size}px`;
    }

    updatePhase(dt) {
        this.phase += this.speed * (dt / 16);
    }
}

class Memory {
    constructor(data, container) {
        this.id = data.id || Date.now().toString();
        this.url = data.url;
        this.date = data.date;
        this.desc = data.desc;

        this.dodgeX = 0;
        this.dodgeY = 0;
        this.baseSize = 90;

        this.moons = [];
        const moonCount = Math.floor(Math.random() * 4);
        for (let i = 0; i < moonCount; i++) {
            this.moons.push(new Moon(this.baseSize));
        }

        this.element = document.createElement('div');
        this.element.className = 'memory-node';

        // Handling image loading
        const img = new Image();
        img.src = this.url;
        img.onload = () => {
            this.element.style.backgroundImage = `url(${this.url})`;
        };
        img.onerror = () => {
            // Se der erro, colocar uma cor vibrante para não ficar preto
            this.element.style.background = 'linear-gradient(45deg, #ff4d85, #6e3996)';
            console.warn('Falha ao carregar imagem para a memória:', this.id);
        };

        for (const moon of this.moons) container.appendChild(moon.element);

        this.labelInfo = document.createElement('div');
        this.labelInfo.className = 'planet-label';

        let displayDate = this.date || "Data Especial";
        if (displayDate.includes('-')) {
            const parts = displayDate.split('-');
            if (parts.length === 3) displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }

        this.labelInfo.innerText = displayDate;
        this.element.appendChild(this.labelInfo);

        this.element.addEventListener('pointerdown', (e) => e.stopPropagation());
        this.element.addEventListener('click', () => openViewModal(this, displayDate));

        container.appendChild(this.element);
    }

    updateAndDraw(camX, camY, zoom, w, h, dt) {
        const index = memoryObjects.indexOf(this);
        if (index === -1) return;

        const galaxyId = Math.floor(index / 28);
        const systemId = Math.floor((index % 28) / 7);
        const planetId = index % 7;

        const time = performance.now();

        // Galáxias  (Separadas por 4000)
        const galAngle = galaxyId * (Math.PI * 2 / 5);
        const galDist = galaxyId === 0 ? 0 : 4000 + galaxyId * 500;
        const gx = galDist * Math.cos(galAngle);
        const gy = galDist * Math.sin(galAngle);

        // Se está hovering, paralisa a Órbita (faz o tempo ir muito mais lento)
        let actualTime = time;
        if (this.isHovered) {
            this.orbitPauseOffset = this.orbitPauseOffset || 0;
            this.orbitPauseOffset += dt;
        }
        actualTime -= (this.orbitPauseOffset || 0);

        // SPEED BALANCE: Órbita do sistema no centro galáctico mais visível
        const sysAngle = (actualTime * 0.000035) + systemId * (Math.PI * 2 / 4);
        const sDist = systemId === 0 ? 0 : 1500;
        const sx = gx + sDist * Math.cos(sysAngle);
        const sy = gy + sDist * Math.sin(sysAngle);

        // Planetas Órbita
        const orbitalRadii = [180, 280, 400, 550, 750, 950, 1200];
        const pRadius = orbitalRadii[planetId];

        // SPEED BALANCE: Planet speed set to intermediate value so it's majestic but alive
        const baseSpeed = 0.0025;
        const planetSpeed = baseSpeed * (1 / Math.sqrt(pRadius));

        const planetAngle = (actualTime * planetSpeed) + (index * 4.3);

        let targetX = sx + pRadius * Math.cos(planetAngle);
        let targetY = sy + pRadius * Math.sin(planetAngle);

        const drawX = (targetX + camX) * zoom + w / 2;
        const drawY = (targetY + camY) * zoom + h / 2;
        const boundsRadius = this.baseSize * zoom;

        // Culling Check
        if (drawX < -boundsRadius * 3 || drawX > w + boundsRadius * 3 || drawY < -boundsRadius * 3 || drawY > h + boundsRadius * 3) {
            this.element.style.display = 'none';
            for (let moon of this.moons) moon.element.style.display = 'none';
            // Return gal coord to draw Galaxies
            return { sysId: `${galaxyId}-${systemId}`, sx, sy, galId: galaxyId, gx, gy };
        } else {
            this.element.style.display = 'block';
        }

        this.vx = this.vx || 0;
        this.vy = this.vy || 0;

        // Sistemas - HOVER e DODGE
        if (AppState.mouse.active) {
            const dx = (drawX + this.dodgeX) - AppState.mouse.x;
            const dy = (drawY + this.dodgeY) - AppState.mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const influence = 180 * Math.max(0.5, zoom);

            // Pausar na Colisão DIRETA do mouse com a foto para permitir clique!
            if (dist < (this.baseSize / 2) * zoom) {
                this.isHovered = true;
            } else {
                this.isHovered = false;
            }

            // Exerce a força de repulsão SE estiver perto mas não EM CIMA do mouse
            if (dist < influence && dist > (this.baseSize / 2.5) * zoom && !this.isHovered) {
                const force = (influence - dist) / influence;
                this.vx += (dx / dist) * force * 2.5;
                this.vy += (dy / dist) * force * 2.5;
            }
        } else {
            this.isHovered = false;
        }

        // Se não esta com mouse em cima, Molas e Fricção normais agem
        if (!this.isHovered) {
            // Spring force returning to orbit anchor
            this.vx += (-this.dodgeX) * 0.08;
            this.vy += (-this.dodgeY) * 0.08;

            // Friction dampening
            this.vx *= 0.85;
            this.vy *= 0.85;
        } else {
            // Se está hover, zera as velocidades para travar e "focar" nele
            this.vx *= 0.2;
            this.vy *= 0.2;
        }

        if (isNaN(this.vx)) this.vx = 0;
        if (isNaN(this.vy)) this.vy = 0;

        this.dodgeX += this.vx;
        this.dodgeY += this.vy;

        const finalDrawX = drawX + this.dodgeX - (this.baseSize / 2);
        const finalDrawY = drawY + this.dodgeY - (this.baseSize / 2);

        this.element.style.transform = `translate(${finalDrawX}px, ${finalDrawY}px) scale(${zoom})`;

        const invZoom = 1 / zoom;
        this.labelInfo.style.transform = `translateX(-50%) scale(${Math.max(0.4, Math.min(1.5, invZoom))})`;

        for (let moon of this.moons) {
            moon.element.style.display = 'block';

            const mRadius = moon.orbitRadius * zoom;
            const phaseTime = this.isHovered ? 0 : dt;
            moon.updatePhase(phaseTime);

            const mx = (drawX + this.dodgeX) + mRadius * Math.cos(moon.phase);
            const my = (drawY + this.dodgeY) + mRadius * Math.sin(moon.phase);

            const mSize = moon.size;
            moon.element.style.transform = `translate(${mx - mSize / 2}px, ${my - mSize / 2}px) scale(${zoom})`;

            if (Math.sin(moon.phase) > 0) {
                moon.element.style.zIndex = 11;
            } else {
                moon.element.style.zIndex = 9;
            }
            this.element.style.zIndex = 10;
        }

        return { sysId: `${galaxyId}-${systemId}`, sx, sy, galId: galaxyId, gx, gy };
    }

    toJSON() {
        return {
            id: this.id, url: this.url, date: this.date, desc: this.desc
        };
    }
}

// ==========================================
// 4. Elementos do DOM
// ==========================================
const canvas = document.getElementById('universe-canvas');
const ctx = canvas.getContext('2d');
const uiLayer = document.getElementById('ui-layer');
const screen1 = document.getElementById('screen-1');
const screen2 = document.getElementById('screen-2');
const btnStart = document.getElementById('btn-start');
const btnAddMemory = document.getElementById('btn-add-memory');
const fileInput = document.getElementById('file-input');
const memoriesContainer = document.getElementById('memories-container');

const uploadModal = document.getElementById('upload-modal');
const viewModal = document.getElementById('view-modal');
const imagePreview = document.getElementById('image-preview');
const previewPlaceholder = document.getElementById('preview-placeholder');
const inputDate = document.getElementById('input-date');
const inputDesc = document.getElementById('input-desc');
const btnSaveMemory = document.getElementById('btn-save-memory');
const btnCancelMemory = document.getElementById('btn-cancel-memory');

const viewDate = document.getElementById('view-date');
const viewDesc = document.getElementById('view-desc');
const btnCloseView = document.getElementById('btn-close-view');

// ==========================================
// 5. Instâncias do Universo
// ==========================================
let particles = [];
let stars = [];
let hearts = [];
let memoryObjects = [];
let canvasTexts = [];

// Gerenciadores Render
let systemSuns = new Map();

function initUniverseData() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    for (let i = 0; i < 400; i++) stars.push(new Star(w, h)); // Mais estrelas finas
    for (let i = 0; i < 45; i++) hearts.push(new HeartStar(w, h)); // Balanceado (nem tanto qt original, nem tão vazio qt antes)
}

function spawnBigBangParticles() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    particles = [];
    for (let i = 0; i < 800; i++) particles.push(new Particle(w / 2, h / 2));
}

// ==========================================
// 6. Ciclo de Vida e Renderização
// ==========================================
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();


function spawnRandomCanvasText() {
    if (AppState.phase !== 'UNIVERSE') return;
    if (canvasTexts.length > 8) canvasTexts.shift();

    const words = [
        "EU TE AMO", "JOAQUIM + ISADORA", "VOCÊ É MEU UNIVERSO",
        "NOSSO AMOR", "PARA SEMPRE", "ALÉM DAS ESTRELAS",
        "MEU TUDO", "INFINITO", "MEU CORAÇÃO É SEU",
        "NOSSA HISTÓRIA", "UMA ETERNIDADE DE AMOR",
        "MEU LUGAR SEGURO", "ILUMINA MINHA VIDA",
        "NOSSOS MOMENTOS", "SIMPLESMENTE NÓS"
    ];
    const str = words[Math.floor(Math.random() * words.length)];
    canvasTexts.push(new DriftingCanvasText(window.innerWidth, window.innerHeight, str));
}
setInterval(spawnRandomCanvasText, 4500);

function loop(time) {
    const dt = time - AppState.lastTime || 16;
    AppState.lastTime = time;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (AppState.phase === 'PRE_BANG') {
        for (let p of particles) {
            p.vibrate();
            p.draw(ctx);
        }
    } else if (AppState.phase === 'EXPLODING' || AppState.phase === 'UNIVERSE') {
        const w = canvas.width;
        const h = canvas.height;
        const z = AppState.camera.zoom;

        // Desenhar Fundos primeiro (Parallax stars & clouds)
        for (let s of stars) s.draw(ctx, AppState.camera.x, AppState.camera.y, z, w, h);

        for (let hStar of hearts) hStar.draw(ctx, AppState.camera.x, AppState.camera.y, z, w, h);

        if (AppState.phase === 'EXPLODING') {
            let activeParticles = 0;
            for (let p of particles) {
                if (p.alpha > 0) {
                    p.explode(dt);
                    p.draw(ctx);
                    activeParticles++;
                }
            }
            if (activeParticles === 0) {
                AppState.phase = 'FORMING';
                AppState.introTimer = 0;
            }
        }

        if (AppState.phase === 'FORMING') {
            AppState.introTimer += dt;

            // Desenha Título Gigante "NOSSO UNIVERSO" no meio da tela
            ctx.globalAlpha = Math.min(1, AppState.introTimer / 1000);
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold 40px 'Cinzel', serif`;
            ctx.textAlign = 'center';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ff4d85';
            ctx.fillText("NOSSO UNIVERSO", w / 2, h / 2 - 20);
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;

            if (AppState.introTimer > 4000) {
                AppState.phase = 'UNIVERSE';
                // Revela a UI deicionar Planeta com fade suave
                screen2.classList.remove('hidden');
                screen2.classList.add('active');
            }
        }

        for (let i = canvasTexts.length - 1; i >= 0; i--) {
            let t = canvasTexts[i];
            t.update(dt);
            t.draw(ctx, AppState.camera.x, AppState.camera.y, z, w, h);
            if (t.lifePhase >= 1) canvasTexts.splice(i, 1);
        }

        let activeSystemsMap = new Map();

        for (let m of memoryObjects) {
            const info = m.updateAndDraw(AppState.camera.x, AppState.camera.y, z, w, h, dt);
            if (info) {
                activeSystemsMap.set(info.sysId, { x: info.sx, y: info.sy });
            }
        }

        // Desenhar Sois Centrais
        activeSystemsMap.forEach((coords, sysId) => {
            if (!systemSuns.has(sysId)) {
                systemSuns.set(sysId, new SystemSun(coords.x, coords.y));
            } else {
                const sun = systemSuns.get(sysId);
                sun.baseX = coords.x;
                sun.baseY = coords.y;
            }
            systemSuns.get(sysId).draw(ctx, AppState.camera.x, AppState.camera.y, z, w, h);
        });

    }

    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ==========================================
// 7. Interações de Câmera (Pan / Zoom)
// ==========================================
function setupControls() {
    const updateMousePos = (e) => {
        if (e.touches && e.touches.length > 0) {
            AppState.mouse.x = e.touches[0].clientX;
            AppState.mouse.y = e.touches[0].clientY;
        } else {
            AppState.mouse.x = e.clientX;
            AppState.mouse.y = e.clientY;
        }
        AppState.mouse.active = true;
    };

    const deactivateMouse = () => { AppState.mouse.active = false; };

    window.addEventListener('mousemove', updateMousePos);
    window.addEventListener('mouseout', deactivateMouse);
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && !AppState.pinch.active) {
            updateMousePos(e);
        }
    }, { passive: false });
    window.addEventListener('touchend', deactivateMouse);
    window.addEventListener('touchcancel', deactivateMouse);

    const screenToWorld = (screenX, screenY, zoom, cx, cy) => {
        return {
            x: (screenX - window.innerWidth / 2) / zoom - cx,
            y: (screenY - window.innerHeight / 2) / zoom - cy
        };
    };

    const applyZoomAtTarget = (targetX, targetY, oldZoom, newZoom) => {
        let w_old = screenToWorld(targetX, targetY, oldZoom, AppState.camera.x, AppState.camera.y);
        let w_new = screenToWorld(targetX, targetY, newZoom, AppState.camera.x, AppState.camera.y);

        AppState.camera.x += (w_new.x - w_old.x);
        AppState.camera.y += (w_new.y - w_old.y);
        AppState.camera.zoom = newZoom;
    };

    const startDrag = (x, y) => {
        if (AppState.phase !== 'UNIVERSE') return;
        AppState.drag.active = true;
        AppState.drag.startX = x;
        AppState.drag.startY = y;
        AppState.drag.camStartX = AppState.camera.x;
        AppState.drag.camStartY = AppState.camera.y;
    };

    const moveDrag = (x, y) => {
        if (!AppState.drag.active) return;
        const dx = (x - AppState.drag.startX) / AppState.camera.zoom;
        const dy = (y - AppState.drag.startY) / AppState.camera.zoom;
        AppState.camera.x = AppState.drag.camStartX + dx;
        AppState.camera.y = AppState.drag.camStartY + dy;
    };

    const endDrag = () => { AppState.drag.active = false; };

    window.addEventListener('mousedown', e => {
        if (e.button === 0) startDrag(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', endDrag);

    window.addEventListener('wheel', (e) => {
        if (AppState.phase !== 'UNIVERSE') return;
        e.preventDefault();

        const zoomFactor = e.deltaY > 0 ? 0.88 : 1.12;
        let newZoom = AppState.camera.zoom * zoomFactor;
        newZoom = Math.max(0.05, Math.min(newZoom, 3.5)); // Limites pra poder afastar mtttt

        applyZoomAtTarget(e.clientX, e.clientY, AppState.camera.zoom, newZoom);
    }, { passive: false });

    const getPinchDistance = (touches) => {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    window.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2 && AppState.phase === 'UNIVERSE') {
            AppState.pinch.active = true;
            AppState.pinch.startDist = getPinchDistance(e.touches);
            AppState.pinch.startZoom = AppState.camera.zoom;
            AppState.pinch.focusX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            AppState.pinch.focusY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

            AppState.drag.active = false;
        } else if (e.touches.length === 1 && !AppState.pinch.active) {
            startDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && AppState.pinch.active) {
            e.preventDefault();
            const currentDist = getPinchDistance(e.touches);
            const scale = currentDist / AppState.pinch.startDist;

            let newZoom = AppState.pinch.startZoom * scale;
            newZoom = Math.max(0.05, Math.min(newZoom, 3.5));

            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;

            const dx = (cx - AppState.pinch.focusX) / newZoom;
            const dy = (cy - AppState.pinch.focusY) / newZoom;
            AppState.camera.x += dx;
            AppState.camera.y += dy;

            AppState.pinch.focusX = cx;
            AppState.pinch.focusY = cy;

            applyZoomAtTarget(cx, cy, AppState.camera.zoom, newZoom);

        } else if (e.touches.length === 1 && !AppState.pinch.active) {
            if (e.target === canvas || e.target === memoriesContainer || e.target.classList.contains('memory-node')) {
                e.preventDefault();
            }
            moveDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) AppState.pinch.active = false;
        if (e.touches.length === 0) endDrag();
    });
}
setupControls();

// ==========================================
// 8. Fluxos da UI
// ==========================================
async function bootApp() {
    // Garantir inicialização do Supabase e dos dados
    initSupabase();
    initUniverseData();

    const data = await Storage.getMemories();
    if (data && data.length > 0) {
        AppState.phase = 'UNIVERSE';
        screen1.classList.remove('active');
        screen1.classList.add('hidden');
        screen2.classList.remove('hidden');
        screen2.classList.add('active');

        for (let m of data) {
            memoryObjects.push(new Memory(m, memoriesContainer));
        }

        AppState.camera.x = 0;
        AppState.camera.y = 0;
        AppState.camera.zoom = 0.6;
    } else {
        spawnBigBangParticles();
        AppState.phase = 'PRE_BANG';
    }
}

// Chamar boot após pequeno atraso para garantir carregamento do CDN
setTimeout(bootApp, 300);
function triggerBigBang() {
    if (AppState.phase === 'PRE_BANG') {
        AppState.phase = 'EXPLODING';
        playBangSound();
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsDataURL(file);
    });
}

function openUploadModal(base64Image) {
    AppState.currentImageBase64 = base64Image;
    imagePreview.style.backgroundImage = `url(${base64Image})`;
    previewPlaceholder.style.display = 'none';
    inputDate.value = '';

    uploadModal.classList.remove('hidden');
}

function closeUploadModal() {
    uploadModal.classList.add('hidden');
    AppState.currentImageBase64 = null;
    fileInput.value = '';

    // Reset Save Button State
    AppState.isSavingMemory = false;
    btnSaveMemory.innerText = "Eternizar Memória";
    btnSaveMemory.style.opacity = '1';
}

function openViewModal(memory, displayDate) {
    viewDate.innerText = displayDate;
    viewDesc.innerText = memory.desc;
    const msgs = ["EU TE AMO", "VOCÊ É MEU UNIVERSO", "PARA SEMPRE", "JOAQUIM + ISADORA", "NOSSO AMOR"];
    document.getElementById('view-romantic-msg').innerText = msgs[Math.floor(Math.random() * msgs.length)];
    viewModal.classList.remove('hidden');
}

function closeViewModal() {
    viewModal.classList.add('hidden');
}

// Event Listeners UI
btnStart.addEventListener('click', () => { fileInput.click(); });
btnAddMemory.addEventListener('click', () => { fileInput.click(); });

fileInput.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        try {
            const b64 = await readFileAsDataURL(file);
            openUploadModal(b64);
        } catch (err) { }
    }
});

btnSaveMemory.addEventListener('click', async () => {
    if (!AppState.currentImageBase64 || AppState.isSavingMemory) return;

    const dateStr = inputDate.value;
    const descStr = inputDesc.value || "Uma memória linda nossa";

    if (!dateStr) {
        alert("Por favor, selecione uma data.");
        return;
    }

    AppState.isSavingMemory = true;
    const originalText = btnSaveMemory.innerText;
    btnSaveMemory.innerText = "Salvando...";
    btnSaveMemory.style.opacity = '0.7';

    // Simular som de criação mágico
    playMagicSound();

    try {
        const memData = await Storage.saveNewMemory(AppState.currentImageBase64, dateStr, descStr);
        const newMem = new Memory(memData, memoriesContainer);
        memoryObjects.push(newMem);

        closeUploadModal();

        if (screen1.classList.contains('active')) {
            screen1.classList.remove('active');
            screen1.classList.add('hidden');
            triggerBigBang();

            // O Screen2 agora é revelado pela phase FORMING lá no loop() de animação
            AppState.camera.zoom = 0.8;
        } else {
            createMiniFlash(window.innerWidth / 2, window.innerHeight / 2);
        }
    } catch (err) {
        // Erro já tratado no Storage
        AppState.isSavingMemory = false;
        btnSaveMemory.innerText = "Eternizar Memória";
        btnSaveMemory.style.opacity = '1';
    }
});

btnCancelMemory.addEventListener('click', () => { closeUploadModal(); });
btnCloseView.addEventListener('click', closeViewModal);
viewModal.addEventListener('click', (e) => { if (e.target === viewModal) closeViewModal(); });

function createMiniFlash(x, y) {
    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.left = `${x}px`;
    flash.style.top = `${y}px`;
    flash.style.width = '10px';
    flash.style.height = '10px';
    flash.style.backgroundColor = 'white';
    flash.style.borderRadius = '50%';
    flash.style.transform = 'translate(-50%, -50%)';
    flash.style.boxShadow = '0 0 50px 20px rgba(255, 77, 133, 1)';
    flash.style.pointerEvents = 'none';
    flash.style.zIndex = '99';
    flash.style.transition = 'all 0.5s ease-out';

    uiLayer.appendChild(flash);

    requestAnimationFrame(() => {
        flash.style.transform = 'translate(-50%, -50%) scale(20)';
        flash.style.opacity = '0';
    });

    setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 500);
}

// ==========================================
// 8. Efeitos Sonoros (Sintetizador Básico)
// ==========================================
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
}

function playBangSound() {
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'sine';
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // Frequencia cai parecendo explosão grave
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 3);

        // Volume sobe rapido e cai lento
        gainNode.gain.setValueAtTime(0.01, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(1, audioCtx.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 3);

        osc.start();
        osc.stop(audioCtx.currentTime + 3);
    } catch (e) { }
}

function playMagicSound() {
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'triangle';
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // Sino mágico
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);

        osc.start();
        osc.stop(audioCtx.currentTime + 1);
    } catch (e) { }
}

bootApp();
