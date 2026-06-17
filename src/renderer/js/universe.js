class Universe {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.planets = [];
    this.stars = [];
    
    // Camera / Viewport state
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    
    this.hoveredPlanet = null;
    this.selectedPlanet = null;
    this.tooltip = document.getElementById('planet-tooltip');
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
    
    // Event listeners for Pan and Zoom
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mouseup', () => this.handleMouseUp());
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    
    this.generateStars();
    
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  resize() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
  }

  generateStars() {
    this.stars = [];
    for (let i = 0; i < 400; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * 4000,
        y: (Math.random() - 0.5) * 4000,
        size: Math.random() * 2,
        alpha: Math.random(),
        depth: Math.random() * 2 + 0.2 // for parallax
      });
    }
  }

  getColorForLanguage(lang) {
    const colors = {
      'JavaScript': '#f1e05a', 'TypeScript': '#3178c6', 'Python': '#3572A5',
      'Java': '#b07219', 'C#': '#178600', 'C++': '#f34b7d', 'PHP': '#4F5D95',
      'HTML': '#e34c26', 'CSS': '#563d7c', 'Ruby': '#701516', 'Go': '#00ADD8',
      'Rust': '#dea584'
    };
    return colors[lang] || '#8b949e';
  }

  createGalaxy(repos) {
    this.planets = [];
    
    repos.forEach((repo, i) => {
      // Scale based on size, max out around 30 to not cover screen
      let baseSize = 4 + Math.log10(repo.size || 10) * 3;
      if (baseSize > 25) baseSize = 25;
      
      const orbitDistance = 120 + (i * 22) + (Math.random() * 30);
      const speed = (0.0005 + Math.random() * 0.0015) * (Math.random() > 0.5 ? 1 : -1);
      
      this.planets.push({
        repo: repo,
        angle: Math.random() * Math.PI * 2,
        orbitDistance: orbitDistance,
        speed: speed,
        size: baseSize,
        color: this.getColorForLanguage(repo.language),
        currentX: 0,
        currentY: 0
      });
    });
  }

  // Convert screen coordinates to world coordinates
  screenToWorld(screenX, screenY) {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    return {
      x: (screenX - centerX) / this.camera.zoom - this.camera.x,
      y: (screenY - centerY) / this.camera.zoom - this.camera.y
    };
  }

  handleWheel(e) {
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY < 0) {
      this.camera.zoom *= zoomFactor; // zoom in
    } else {
      this.camera.zoom /= zoomFactor; // zoom out
    }
    // Clamping zoom
    if (this.camera.zoom < 0.2) this.camera.zoom = 0.2;
    if (this.camera.zoom > 3.0) this.camera.zoom = 3.0;
  }

  handleMouseDown(e) {
    if(e.button !== 0) return; // Only left click for dragging
    this.isDragging = true;
    this.dragStart = { x: e.clientX, y: e.clientY };
  }

  handleMouseUp() {
    this.isDragging = false;
  }

  handleMouseMove(e) {
    if (this.isDragging) {
      const dx = (e.clientX - this.dragStart.x) / this.camera.zoom;
      const dy = (e.clientY - this.dragStart.y) / this.camera.zoom;
      this.camera.x += dx;
      this.camera.y += dy;
      this.dragStart = { x: e.clientX, y: e.clientY };
    }

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const worldPos = this.screenToWorld(mouseX, mouseY);
    
    this.hoveredPlanet = null;
    
    for (const planet of this.planets) {
      const dx = worldPos.x - planet.currentX;
      const dy = worldPos.y - planet.currentY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= planet.size + 5) {
        this.hoveredPlanet = planet;
        break;
      }
    }

    if (this.hoveredPlanet) {
      this.canvas.style.cursor = 'pointer';
      this.tooltip.classList.remove('hidden');
      this.tooltip.textContent = this.hoveredPlanet.repo.name;
      // Position tooltip near cursor
      this.tooltip.style.left = `${mouseX}px`;
      this.tooltip.style.top = `${mouseY}px`;
    } else {
      this.canvas.style.cursor = this.isDragging ? 'grabbing' : 'grab';
      this.tooltip.classList.add('hidden');
    }
  }

  handleClick(e) {
    if (this.hoveredPlanet && !this.isDragging) {
      this.selectedPlanet = this.hoveredPlanet;
      if (window.onPlanetClick) {
        window.onPlanetClick(this.selectedPlanet.repo);
      }
    } else if (!this.isDragging) {
      this.selectedPlanet = null;
      if (window.onEmptySpaceClick) {
        window.onEmptySpaceClick();
      }
    }
  }

  drawPlanet(planet, cx, cy) {
    planet.angle += planet.speed;
    planet.currentX = Math.cos(planet.angle) * planet.orbitDistance;
    planet.currentY = Math.sin(planet.angle) * planet.orbitDistance;
    
    const isHovered = this.hoveredPlanet === planet;
    const isSelected = this.selectedPlanet === planet;
    
    // Draw Orbit
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, planet.orbitDistance * this.camera.zoom, 0, Math.PI * 2);
    this.ctx.strokeStyle = `rgba(255, 255, 255, ${isSelected ? 0.3 : 0.05})`;
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    const screenX = cx + planet.currentX * this.camera.zoom;
    const screenY = cy + planet.currentY * this.camera.zoom;
    const screenRadius = planet.size * this.camera.zoom;

    // Draw Planet Glow
    if (isHovered || isSelected) {
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, screenRadius * 2, 0, Math.PI * 2);
      this.ctx.fillStyle = planet.color;
      this.ctx.globalAlpha = 0.4;
      this.ctx.fill();
      this.ctx.globalAlpha = 1.0;
      
      if (isSelected) {
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, screenRadius * 3 + 4, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#00D2FF';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
    }

    // Draw Planet
    this.ctx.beginPath();
    this.ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = planet.color;
    this.ctx.fill();
  }

  animate() {
    const isLightMode = document.body.getAttribute('data-theme') === 'light';
    
    // Clear background
    if (isLightMode) {
      this.ctx.fillStyle = '#F0F4F8';
    } else {
      this.ctx.fillStyle = '#07090F';
    }
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const cx = this.canvas.width / 2 + this.camera.x * this.camera.zoom;
    const cy = this.canvas.height / 2 + this.camera.y * this.camera.zoom;

    // Draw Stars (Parallax)
    this.stars.forEach(star => {
      const sx = cx + star.x * star.depth * this.camera.zoom;
      const sy = cy + star.y * star.depth * this.camera.zoom;
      
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, star.size * this.camera.zoom, 0, Math.PI * 2);
      this.ctx.fillStyle = isLightMode ? `rgba(17, 24, 39, ${star.alpha * 0.3})` : `rgba(255, 255, 255, ${star.alpha})`;
      this.ctx.fill();
    });

    // Draw central star/sun (user)
    const sunRadius = 40 * this.camera.zoom;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, sunRadius, 0, Math.PI * 2);
    const grad = this.ctx.createRadialGradient(cx, cy, sunRadius * 0.2, cx, cy, sunRadius);
    if (isLightMode) {
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.5, '#0077FF');
      grad.addColorStop(1, 'rgba(0, 119, 255, 0)');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, '#00D2FF');
      grad.addColorStop(1, 'rgba(0, 210, 255, 0)');
    }
    this.ctx.fillStyle = grad;
    this.ctx.fill();

    this.planets.forEach(p => this.drawPlanet(p, cx, cy));
    
    requestAnimationFrame(this.animate);
  }
}

window.Universe = Universe;
