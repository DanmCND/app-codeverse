class Universe2D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    
    // Configura o Canvas
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.container.appendChild(this.canvas);
    
    // Estado da Câmera (Pan & Zoom)
    this.camera = { x: 0, y: 0, zoom: 1 };
    
    // Dados da Cena
    this.planets = [];
    this.stars = [];
    this.nebulaParticles = [];
    this.sun = { radius: 30, color: '#ffffff' };
    this.isPaused = false;
    
    // Interação
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.cameraStart = { x: 0, y: 0 };
    this.hoveredPlanet = null;
    this.tooltip = document.getElementById('planet-tooltip');
    
    // Cores das Linguagens (Padrão)
    this.colors = {
      'JavaScript': '#f1e05a', 'TypeScript': '#3178c6', 'Python': '#3572A5',
      'Java': '#b07219', 'C#': '#178600', 'C++': '#f34b7d', 'PHP': '#4F5D95',
      'HTML': '#e34c26', 'CSS': '#563d7c', 'Ruby': '#701516', 'Go': '#00ADD8',
      'Rust': '#dea584', 'Vue': '#41b883', 'React': '#61dafb'
    };
    
    this.onWindowResize();
    this.createBackground();
    
    // Binds
    this.animate = this.animate.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);
    
    // Eventos
    window.addEventListener('resize', this.onWindowResize);
    this.setupInteractions();
    
    // Inicia Loop
    requestAnimationFrame(this.animate);
  }

  getColorForLanguage(lang) {
    return this.colors[lang] || '#8b949e';
  }

  onWindowResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    
    // Ajuste para telas retina mantendo performance
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
    
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  createBackground() {
    this.stars = [];
    this.nebulaParticles = [];
    const isMobile = window.innerWidth <= 768;
    const starCount = isMobile ? 800 : 2000;
    const nebulaCount = isMobile ? 30 : 80;
    
    // Estrelas
    for (let i = 0; i < starCount; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * 6000,
        y: (Math.random() - 0.5) * 6000,
        radius: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.8 + 0.2
      });
    }
    
    // Nebulosa (Círculos difusos gigantes)
    const themeColors = ['rgba(79, 70, 229, 0.05)', 'rgba(124, 58, 237, 0.05)', 'rgba(0, 229, 255, 0.03)'];
    for (let i = 0; i < nebulaCount; i++) {
      this.nebulaParticles.push({
        x: (Math.random() - 0.5) * 4000,
        y: (Math.random() - 0.5) * 4000,
        radius: Math.random() * 300 + 100,
        color: themeColors[Math.floor(Math.random() * themeColors.length)]
      });
    }
  }

  createGalaxy(repos, dominantLanguage = 'JavaScript') {
    this.planets = [];
    let tempDistance = 80; // Distância mínima do sol
    
    repos.forEach((repo) => {
      let sizeScore = repo.size || 10;
      let radius = 4 + Math.pow(sizeScore, 0.25) * 2; 
      radius += Math.log2((repo.stargazers_count || 0) + 1);
      if (radius > 35) radius = 35;
      if (radius < 5) radius = 5;
      
      let orbitGap = 25 + (radius * 2) + (Math.random() * 20);
      tempDistance += orbitGap;
      
      this.planets.push({
        repo: repo,
        radius: radius,
        distance: tempDistance,
        angle: Math.random() * Math.PI * 2,
        speed: 0.0005 + Math.random() * 0.0015,
        color: this.getColorForLanguage(repo.language),
        glowIntensity: 0
      });
    });
    
    this.resetCamera();
  }

  resetCamera() {
    this.camera.x = 0;
    this.camera.y = 0;
    this.camera.zoom = 1;
    if (this.planets.length > 0) {
      // Zoom out para ver o sistema inteiro
      const maxDist = this.planets[this.planets.length - 1].distance;
      const minDimension = Math.min(this.width, this.height);
      const targetZoom = (minDimension / 2) / (maxDist + 50);
      this.camera.zoom = Math.min(1.5, Math.max(0.1, targetZoom));
    }
  }

  togglePause() {
    this.isPaused = !this.isPaused;
  }

  toggleDimension() {
    if (window.showToast) window.showToast('Essa engine de teste é estritamente 2D.', 'ph-info');
  }

  // Compatibilidade com app.js
  set useBloom(value) {
    // Canvas 2D não usa bloom properties, então ignoramos
  }
  get useBloom() { return false; }

  setupInteractions() {
    this.canvas.style.touchAction = 'none'; // Previne scroll no celular
    
    const getMousePos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    // Posição no mundo virtual
    const getWorldPos = (screenX, screenY) => {
      return {
        x: (screenX - this.width / 2) / this.camera.zoom - this.camera.x,
        y: (screenY - this.height / 2) / this.camera.zoom - this.camera.y
      };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.canvas.style.cursor = 'grabbing';
      const pos = getMousePos(e);
      this.dragStart = { x: pos.x, y: pos.y };
      this.cameraStart = { x: this.camera.x, y: this.camera.y };
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const pos = getMousePos(e);
      
      if (this.isDragging) {
        const dx = (pos.x - this.dragStart.x) / this.camera.zoom;
        const dy = (pos.y - this.dragStart.y) / this.camera.zoom;
        this.camera.x = this.cameraStart.x + dx;
        this.camera.y = this.cameraStart.y + dy;
      } else {
        // Hover Detection
        const worldPos = getWorldPos(pos.x, pos.y);
        let found = null;
        
        for (let i = this.planets.length - 1; i >= 0; i--) {
          const p = this.planets[i];
          const px = Math.cos(p.angle) * p.distance;
          const py = Math.sin(p.angle) * p.distance;
          
          const dist = Math.hypot(worldPos.x - px, worldPos.y - py);
          if (dist < p.radius + 5) {
            found = p;
            break;
          }
        }
        
        if (found !== this.hoveredPlanet) {
          if (this.hoveredPlanet) this.hoveredPlanet.glowIntensity = 0;
          this.hoveredPlanet = found;
          
          if (this.hoveredPlanet) {
            this.hoveredPlanet.glowIntensity = 1;
            this.canvas.style.cursor = 'pointer';
            if (this.tooltip) {
              this.tooltip.classList.remove('hidden');
              this.tooltip.style.display = 'block';
              this.tooltip.textContent = this.hoveredPlanet.repo.name;
            }
          } else {
            this.canvas.style.cursor = 'grab';
            if (this.tooltip) {
              this.tooltip.classList.add('hidden');
              this.tooltip.style.display = 'none';
            }
          }
        }
        
        if (this.tooltip && this.hoveredPlanet) {
          this.tooltip.style.left = `${pos.x}px`;
          this.tooltip.style.top = `${pos.y - 20}px`;
        }
      }
    });

    this.canvas.addEventListener('pointerup', (e) => {
      this.isDragging = false;
      this.canvas.style.cursor = this.hoveredPlanet ? 'pointer' : 'grab';
      
      const pos = getMousePos(e);
      const dist = Math.hypot(pos.x - this.dragStart.x, pos.y - this.dragStart.y);
      
      // Se for clique (moveu menos de 5 pixels)
      if (dist < 5 && this.hoveredPlanet) {
        if (window.onPlanetClick) {
          window.onPlanetClick(this.hoveredPlanet.repo);
        }
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      if (e.deltaY < 0) {
        this.camera.zoom *= zoomFactor;
      } else {
        this.camera.zoom /= zoomFactor;
      }
      this.camera.zoom = Math.max(0.05, Math.min(5, this.camera.zoom));
    });
  }

  animate() {
    requestAnimationFrame(this.animate);
    const ctx = this.ctx;
    
    // Fundo
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, this.width, this.height);
    
    ctx.save();
    
    // Centro da tela + Camera Pan + Camera Zoom
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(this.camera.x, this.camera.y);
    
    // Draw Nebulas (Parallax leve no fundo)
    ctx.globalCompositeOperation = 'screen';
    this.nebulaParticles.forEach(n => {
      const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
      gradient.addColorStop(0, n.color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';

    // Draw Stars
    ctx.fillStyle = '#ffffff';
    this.stars.forEach(s => {
      // Pequeno parallax nas estrelas com base na câmera
      const px = s.x - this.camera.x * 0.1;
      const py = s.y - this.camera.y * 0.1;
      
      ctx.globalAlpha = s.alpha;
      ctx.beginPath();
      ctx.arc(px, py, s.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Draw Orbits
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1 / this.camera.zoom; // Mantem a linha fina independente do zoom
    this.planets.forEach(p => {
      ctx.beginPath();
      ctx.arc(0, 0, p.distance, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Draw Sun
    const sunGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.sun.radius * 2);
    sunGrad.addColorStop(0, '#ffffff');
    sunGrad.addColorStop(0.2, '#fff7e6');
    sunGrad.addColorStop(0.5, 'rgba(255, 200, 100, 0.2)');
    sunGrad.addColorStop(1, 'rgba(255, 200, 100, 0)');
    
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(0, 0, this.sun.radius * 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw Planets
    this.planets.forEach(p => {
      if (!this.isPaused) {
        p.angle -= p.speed; // Rodando em sentido horário
      }
      
      const px = Math.cos(p.angle) * p.distance;
      const py = Math.sin(p.angle) * p.distance;
      
      // Glow (Hover ou natural)
      const glowRad = p.glowIntensity > 0 ? p.radius * 3 : p.radius * 1.5;
      const glowGrad = ctx.createRadialGradient(px, py, p.radius * 0.5, px, py, glowRad);
      glowGrad.addColorStop(0, p.color);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = glowGrad;
      ctx.globalAlpha = p.glowIntensity > 0 ? 0.8 : 0.3;
      ctx.beginPath();
      ctx.arc(px, py, glowRad, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;

      // Base do Planeta (Sombra volumétrica)
      const planetGrad = ctx.createRadialGradient(
        px - p.radius * 0.3, py - p.radius * 0.3, 0, // luz vindo levemente do centro/sol
        px, py, p.radius
      );
      planetGrad.addColorStop(0, p.color);
      planetGrad.addColorStop(0.8, p.color);
      planetGrad.addColorStop(1, '#111'); // borda escura

      ctx.fillStyle = planetGrad;
      ctx.beginPath();
      ctx.arc(px, py, p.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }
}

// Substitui a variável global para que app.js use o novo motor no ambiente de testes
window.Universe3D = Universe2D;
