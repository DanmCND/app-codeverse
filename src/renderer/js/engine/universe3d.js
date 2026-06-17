import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

class Universe3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    
    // Core Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070A);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100000);
    this.camera.position.set(0, 150, 250);

    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Reduzido o pixel ratio máximo para 1.25 para ganhar muita performance com post-processing
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.container.appendChild(this.renderer.domElement);

    // Verificação de Aceleração de Hardware do WebGL
    const gl = this.renderer.getContext();
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const rendererString = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
        console.log("WebGL Device Renderer:", rendererString);
        if (rendererString.toLowerCase().includes('swiftshader') || 
            rendererString.toLowerCase().includes('software') || 
            rendererString.toLowerCase().includes('llvmpipe')) {
          console.warn("Aceleração de hardware desativada detectada!");
          setTimeout(() => {
            if (window.showToast) {
              window.showToast("Aceleração de hardware desativada. O visual 3D pode sofrer lentidão.", "ph-warning");
            }
          }, 1500);
        }
      }
    }

    // =========================================================
    // Post-Processing (Bloom / Glow Neon)
    // =========================================================
    const renderScene = new RenderPass(this.scene, this.camera);
    // Resolução do bloom reduzida e parâmetros atenuados para performance
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
      0.75, // intensity reduzida ainda mais para melhorar fluidez e evitar exageros
      0.3,  // radius do glow menor
      0.4   // threshold maior
    );
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderScene);
    this.composer.addPass(bloomPass);

    // =========================================================
    // Camada de Interação Invisível (Mantida, pois arrumou o Zoom e Arrasto Geral)
    // =========================================================
    if (document.getElementById('universe-interact-layer')) {
      document.getElementById('universe-interact-layer').remove();
    }
    this.interactLayer = document.createElement('div');
    this.interactLayer.id = 'universe-interact-layer';
    this.interactLayer.style.position = 'fixed';
    this.interactLayer.style.top = '0';
    this.interactLayer.style.left = '0';
    this.interactLayer.style.width = '100%';
    this.interactLayer.style.height = '100%';
    this.interactLayer.style.zIndex = '5';
    this.interactLayer.style.cursor = 'grab';
    this.interactLayer.style.touchAction = 'none'; // FIX MOBILE: Permite arrastar no touch sem mover a página
    
    // A CHAVE DO BUG DE ARRASTAR NO PLANETA: 
    // Impede que o Chromium tente fazer "Drag and Drop" de imagem/link quando o cursor vira "pointer"
    this.interactLayer.style.userSelect = 'none';
    this.interactLayer.style.webkitUserDrag = 'none';
    this.interactLayer.style.webkitUserSelect = 'none';
    
    document.body.appendChild(this.interactLayer);

    this.controls = new OrbitControls(this.camera, this.interactLayer);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 20000;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.zoomSpeed = 1.2;
    // Configuração de Navegação: Clique esquerdo arrasta (Pan), clique direito rotaciona (Rotate)
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };

    this.interactLayer.addEventListener('mousedown', () => {
      this.interactLayer.style.cursor = 'grabbing';
    });
    this.interactLayer.addEventListener('mouseup', () => {
      this.interactLayer.style.cursor = this.hoveredObject ? 'pointer' : 'grab';
    });

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.hoveredObject = null;
    this.tooltip = document.getElementById('planet-tooltip');

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambientLight);

    this.sunLight = new THREE.PointLight(0xffffff, 0.8, 1000); // Brilho do sol reduzido de 1.5 para 0.8
    this.scene.add(this.sunLight);

    // Grupos de órbita para inclinação 3D
    this.orbitGroups = [];
    this.planetMeshes = [];
    this.starSprite = null;
    this.nebulaSprite = null;
    this.isPaused = false; 
    this.is2D = false; // Estado inicial da dimensão (3D)
    // Bloom sempre ativo — pipeline foi reescrito para ser leve o suficiente
    this.useBloom = true;
    // Contador de frame para throttle do raycaster
    this._frameCount = 0;
    // Flag de mousemove pendente para throttle
    this._mouseDirty = false;

    // =========================================================
    // Gerenciamento de Texturas (Geradas Localmente para Performance e Offline-First)
    // =========================================================
    this.textures = {
      gas: this.generateGasTexture(),
      rock: this.generateRockTexture(),
      star: this.generateStarTexture()
    };
    
    // Garantir que a textura de gás possa ser colorida mantendo o padrão da linguagem
    this.textures.gas.colorSpace = THREE.SRGBColorSpace;
    this.textures.rock.colorSpace = THREE.SRGBColorSpace;

    // Shared unit sphere geometry for planets e Sol (segmentos reduzidos para performance)
    this.sharedSphereGeometry = new THREE.SphereGeometry(1, 16, 16);

    this.createBackgroundStars(25000);

    this.animate = this.animate.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    
    window.addEventListener('resize', this.onWindowResize);
    this.interactLayer.addEventListener('pointermove', this.onMouseMove);
    
    // A CHAVE DO BUG DO CLIQUE:
    // OrbitControls "engole" o evento de clique padrão. Precisamos medir a distância entre pointerdown e pointerup.
    this.mouseDownPos = { x: 0, y: 0 };
    this.interactLayer.addEventListener('pointerdown', (e) => {
      this.mouseDownPos = { x: e.clientX, y: e.clientY };
    });

    this.interactLayer.addEventListener('pointerup', (e) => {
      const dist = Math.hypot(e.clientX - this.mouseDownPos.x, e.clientY - this.mouseDownPos.y);
      // Se moveu menos de 5 pixels, foi um clique/toque intencional no planeta (não arrasto de câmera)
      if (dist < 5) {
        // Atualiza a posição de mouse temporariamente para o cálculo do Raycast direto (importante para touch no mobile)
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.planetMeshes);
        
        if (intersects.length > 0) {
          const clickedPlanet = intersects[0].object;
          if (window.onPlanetClick && clickedPlanet.userData.repo) {
            window.onPlanetClick(clickedPlanet.userData.repo);
          }
        }
      }
    });

    requestAnimationFrame(this.animate);
  }

  generateGasTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Fundo branco base (o material do planeta multiplica esta cor pela cor da linguagem)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 256);
    
    // Desenha faixas horizontais simulando a atmosfera de gigantes gasosos
    for (let y = 0; y < 256; y += 4) {
      const noise = Math.sin(y * 0.1) * 0.15 + Math.cos(y * 0.03) * 0.1;
      const alpha = 0.55 + noise;
      const colorVal = Math.floor(200 + noise * 55);
      ctx.fillStyle = `rgba(${colorVal}, ${colorVal}, ${colorVal}, ${alpha})`;
      ctx.fillRect(0, y, 512, 4);
    }
    
    // Detalhes orgânicos de ruído ao longo das faixas
    for (let i = 0; i < 30; i++) {
      const y = Math.random() * 256;
      const h = 5 + Math.random() * 15;
      const opacity = 0.05 + Math.random() * 0.1;
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(0.5, `rgba(0, 0, 0, ${opacity})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, 512, h);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  generateRockTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    
    // Ruído fino de superfície
    for (let i = 0; i < 1500; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = Math.random() * 1.5;
      const gray = Math.floor(180 + Math.random() * 75);
      ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Crateras
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = 3 + Math.random() * 7;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.beginPath();
      ctx.arc(x + 1, y + 1, r, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  generateCloudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 128, 128);
    
    // Gradiente radial super suave para as nuvens de fumaça da nebulosa
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.15, 'rgba(255, 255, 255, 0.85)');
    gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)');
    gradient.addColorStop(0.65, 'rgba(255, 255, 255, 0.12)');
    gradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.02)');
    gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  generateStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 16, 16);
    
    // Estrela suave com brilho centralizado
    const gradient = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 16, 16);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  // =========================================================
  // NOVA TÉCNICA: Pré-renderizar estrelas e nebulosa em Canvas 2D
  // Uma única textura = 1 draw call, zero overhead de partículas/blending
  // =========================================================
  createBackgroundStars(systemRadius = 1200) {
    // Remove sprite anterior se existir
    if (this.starSprite) {
      this.scene.remove(this.starSprite);
      if (this.starSprite.material.map) this.starSprite.material.map.dispose();
      this.starSprite.material.dispose();
      this.starSprite = null;
    }

    const isMobile = window.innerWidth <= 768;
    const size = isMobile ? 1024 : 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Fundo totalmente transparente
    ctx.clearRect(0, 0, size, size);

    const starCount = isMobile ? 1200 : 3500;
    for (let i = 0; i < starCount; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() < 0.15 ? (Math.random() * 1.5 + 1) : (Math.random() * 0.8 + 0.3);
      const alpha = Math.random() * 0.7 + 0.3;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      // Estrelas mais brilhantes com um halo sutil
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
      grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.9
    });
    this.starSprite = new THREE.Sprite(spriteMat);
    // Escalar o sprite para cobrir toda a "abóbada" atrás da cena
    const skySize = Math.max(systemRadius * 5.0, 50000);
    this.starSprite.scale.set(skySize, skySize, 1);
    this.scene.add(this.starSprite);
  }

  getColorForLanguage(lang) {
    const colors = {
      'JavaScript': 0xf1e05a, 'TypeScript': 0x3178c6, 'Python': 0x3572A5,
      'Java': 0xb07219, 'C#': 0x178600, 'C++': 0xf34b7d, 'PHP': 0x4F5D95,
      'HTML': 0xe34c26, 'CSS': 0x563d7c, 'Ruby': 0x701516, 'Go': 0x00ADD8,
      'Rust': 0xdea584, 'Vue': 0x41b883, 'React': 0x61dafb
    };
    return colors[lang] || 0x8b949e;
  }

  createAtmosphere(radius, color) {
    const vertexShader = `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const fragmentShader = `
      varying vec3 vNormal;
      uniform vec3 glowColor;
      void main() {
        // Cálculo de Fresnel (brilho nas bordas, transparente no centro) reduzido para menos brilho
        float intensity = pow(0.60 - dot(vNormal, vec3(0, 0, 1.0)), 4.5);
        gl_FragColor = vec4(glowColor, 1.0) * (intensity * 0.7); // Reduzindo o brilho global do halo
      }
    `;
    const material = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(color) } },
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
    
    // Use the shared sphere geometry and scale the mesh inside createGalaxy
    return new THREE.Mesh(this.sharedSphereGeometry, material);
  }

  createGalaxy(repos, dominantLanguage = 'JavaScript') {
    // Proper WebGL garbage collection to avoid GPU memory leaks
    if (this.orbitGroups) {
      this.orbitGroups.forEach(group => {
        group.traverse(child => {
          if (child.isMesh || child.isLine || child.isLineLoop) {
            // Dispose of custom geometries (keep the shared unit sphere geometry!)
            if (child.geometry && child.geometry !== this.sharedSphereGeometry) {
              child.geometry.dispose();
            }
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
        this.scene.remove(group);
      });
    }
    this.planetMeshes = [];
    this.orbitGroups = [];

    // Calcular o tamanho total do sistema solar deterministicamente
    this.orbitData = [];
    let tempDistance = 40;
    repos.forEach((repo) => {
      let sizeScore = repo.size || 10;
      let radius = 2.5 + Math.pow(sizeScore, 0.25) * 1.2; 
      radius += Math.log2((repo.stargazers_count || 0) + 1) * 0.5;
      if (radius > 22) radius = 22;
      if (radius < 3) radius = 3;
      
      let orbitGap = 15 + (radius * 1.8) + (Math.random() * 15);
      tempDistance += orbitGap;
      
      this.orbitData.push({ radius, distance: tempDistance, repo });
    });
    const maxSystemRadius = Math.max(500, tempDistance);

    // =========================================================
    // NOVA TÉCNICA: Nebulosa pré-renderizada como textura Canvas
    // Substitui centenas de partículas por 1-2 sprites estáticos.
    // =========================================================
    if (this.nebulaSprite) {
      this.scene.remove(this.nebulaSprite);
      if (this.nebulaSprite.material.map) this.nebulaSprite.material.map.dispose();
      this.nebulaSprite.material.dispose();
      this.nebulaSprite = null;
    }

    const isMobile = window.innerWidth <= 768;
    const nebSize = isMobile ? 512 : 1024;
    const nebCanvas = document.createElement('canvas');
    nebCanvas.width = nebSize;
    nebCanvas.height = nebSize;
    const nebCtx = nebCanvas.getContext('2d');
    nebCtx.clearRect(0, 0, nebSize, nebSize);

    // Cor da linguagem dominante
    const langColorHex = this.getColorForLanguage(dominantLanguage);
    const lc = new THREE.Color(langColorHex);
    const langR = Math.round(lc.r * 255);
    const langG = Math.round(lc.g * 255);
    const langB = Math.round(lc.b * 255);

    // Nuvens de nebulosa centrais (blob radial difuso)
    const themeRGB = [
      { r: 79,  g: 70,  b: 229 }, // Indigo
      { r: 124, g: 58,  b: 237 }, // Roxo
      { r: 0,   g: 229, b: 255 }, // Ciano
      { r: langR, g: langG, b: langB } // Cor da linguagem dominante
    ];

    const blobCount = isMobile ? 12 : 28;
    for (let i = 0; i < blobCount; i++) {
      const cx = (0.2 + Math.random() * 0.6) * nebSize;
      const cy = (0.2 + Math.random() * 0.6) * nebSize;
      const radius = (0.08 + Math.random() * 0.22) * nebSize;
      const col = themeRGB[Math.floor(Math.random() * themeRGB.length)];
      const alpha = 0.04 + Math.random() * 0.07;

      const grad = nebCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0,   `rgba(${col.r},${col.g},${col.b},${alpha})`);
      grad.addColorStop(0.5, `rgba(${col.r},${col.g},${col.b},${alpha * 0.4})`);
      grad.addColorStop(1,   `rgba(${col.r},${col.g},${col.b},0)`);
      nebCtx.fillStyle = grad;
      nebCtx.beginPath();
      nebCtx.ellipse(cx, cy, radius, radius * (0.5 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
      nebCtx.fill();
    }

    const nebTex = new THREE.CanvasTexture(nebCanvas);
    const nebMat = new THREE.SpriteMaterial({
      map: nebTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.8
    });
    this.nebulaSprite = new THREE.Sprite(nebMat);
    const nebWorldSize = maxSystemRadius * 2.2;
    this.nebulaSprite.scale.set(nebWorldSize, nebWorldSize, 1);
    this.scene.add(this.nebulaSprite);

    // O Sol
    if (!this.sun) {
      // Brilho do sol central reduzido
      const sunMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.5, // Brilho central bem menor 
        roughness: 0.1
      });
      this.sun = new THREE.Mesh(this.sharedSphereGeometry, sunMat);
      this.sun.scale.set(15, 15, 15);
      this.scene.add(this.sun);
    }

    this.orbitData.forEach((orbit, i) => {
      const { radius, distance, repo } = orbit;
      const speed = 0.001 + Math.random() * 0.003;
      const color = this.getColorForLanguage(repo.language);

      // Todos os planetas agora recebem o "Novo Gráfico" (Textura Atmosférica + Halo)
      const mat = new THREE.MeshStandardMaterial({ 
        color: color, 
        map: this.textures.gas,
        roughness: 0.4, 
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: 0.02
      });
      
      // Use the shared sphere geometry and scale the planet mesh
      const mesh = new THREE.Mesh(this.sharedSphereGeometry, mat);
      mesh.scale.set(radius, radius, radius);

      // Todos os planetas ganham o Halo atmosférico
      const atmos = this.createAtmosphere(radius, color);
      const atmosScale = 1.3125; // 1.25 (atmos radius factor) * 1.05 (fixed scale)
      atmos.scale.set(atmosScale, atmosScale, atmosScale);
      mesh.add(atmos);

      // Rotação inicial aleatória
      mesh.rotation.x = Math.random() * Math.PI;
      mesh.rotation.y = Math.random() * Math.PI;

      mesh.userData = {
        repo: repo,
        name: repo.name,
        angle: Math.random() * Math.PI * 2, // Posição inicial na órbita
        distance: distance,
        speed: speed,
        baseColor: color
      };

      // Sleek vector-style orbit lines using LineLoop (extremely lightweight)
      const orbitPoints = [];
      const segments = 64;
      for (let j = 0; j <= segments; j++) {
        const theta = (j / segments) * Math.PI * 2;
        orbitPoints.push(new THREE.Vector3(Math.cos(theta) * distance, 0, Math.sin(theta) * distance));
      }
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
      const orbitMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
      const orbitMesh = new THREE.LineLoop(orbitGeo, orbitMat);
      
      // Criar um Grupo para este planeta e sua órbita, permitindo inclinação 3D
      const orbitGroup = new THREE.Group();
      
      // Inclinação aleatória da órbita (entre -15 e +15 graus no X e Z)
      const maxTilt = 15 * (Math.PI / 180);
      const tiltX = (Math.random() - 0.5) * 2 * maxTilt;
      const tiltZ = (Math.random() - 0.5) * 2 * maxTilt;
      orbitGroup.userData = { tiltX, tiltZ };
      
      if (this.is2D) {
        orbitGroup.rotation.x = 0;
        orbitGroup.rotation.z = 0;
      } else {
        orbitGroup.rotation.x = tiltX;
        orbitGroup.rotation.z = tiltZ;
      }
      
      orbitGroup.add(orbitMesh);
      orbitGroup.add(mesh);
      
      this.scene.add(orbitGroup);
      this.orbitGroups.push(orbitGroup);
      this.planetMeshes.push(mesh);
    });
  }

  onMouseMove(e) {
    // Apenas salva a posição. O raycasting de fato ocorre no loop de animação
    // para evitar execução excessiva a 60+ eventos/s durante o movimento.
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this._mouseDirty = true;
    this._lastMouseEvent = e;
  }

  // Separado do evento — chamado pelo loop animate() a cada 3 frames
  _processRaycast() {
    if (!this._mouseDirty || !this.planetMeshes.length) return;
    this._mouseDirty = false;

    const e = this._lastMouseEvent;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.planetMeshes);

    if (intersects.length > 0) {
      if (this.hoveredObject !== intersects[0].object) {
        if (this.hoveredObject) {
          this.hoveredObject.material.emissiveIntensity = 0.02;
        }
        this.hoveredObject = intersects[0].object;
        this.hoveredObject.material.emissiveIntensity = 2.5; // Glow intenso no hover
        
        if (this.tooltip) {
          this.tooltip.classList.remove('hidden');
          this.tooltip.style.display = 'block';
          this.tooltip.textContent = this.hoveredObject.userData.name;
        }
        this.interactLayer.style.cursor = 'pointer';
      }
      
      if (this.tooltip && e) {
        this.tooltip.style.left = `${e.clientX}px`;
        this.tooltip.style.top = `${e.clientY - 20}px`;
      }
    } else {
      if (this.hoveredObject) {
        this.hoveredObject.material.emissiveIntensity = 0.02;
        this.hoveredObject = null;
        if (this.tooltip) {
          this.tooltip.classList.add('hidden');
          this.tooltip.style.display = 'none';
        }
        this.interactLayer.style.cursor = 'grab';
      }
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  resetCamera() {
    if (this.is2D) {
      this.camera.position.set(0, 550, 0.001);
    } else {
      this.camera.position.set(0, 150, 250);
    }
    this.controls.target.set(0, 0, 0);
  }

  togglePause() {
    this.isPaused = !this.isPaused;
  }

  animate() {
    requestAnimationFrame(this.animate);
    this._frameCount = (this._frameCount || 0) + 1;
    
    if (window.TWEEN) {
      window.TWEEN.update();
    }
    
    this.planetMeshes.forEach(mesh => {
      if (!this.isPaused) {
        mesh.userData.angle += mesh.userData.speed;
      }
      
      mesh.position.x = Math.cos(mesh.userData.angle) * mesh.userData.distance;
      mesh.position.z = Math.sin(mesh.userData.angle) * mesh.userData.distance;
      
      if (!this.isPaused) {
        mesh.rotation.y += 0.008;
      }
    });

    // Raycasting throttlado: apenas a cada 3 frames (20fps é mais do que suficiente para hover)
    if (this._frameCount % 3 === 0) {
      this._processRaycast();
    }

    // Sprite de estrelas: rotação muito lenta para paralaxe sutil (sem custo)
    if (this.starSprite && !this.isPaused) {
      this.starSprite.material.rotation += 0.00005;
    }

    this.controls.update();
    // Pipeline sempre usa o composer com bloom (a cena foi otimizada para suportá-lo)
    this.composer.render();
  }

  toggleDimension() {
    this.is2D = !this.is2D;

    // Se houver alguma animação de Tween pendente, para tudo para não ter conflito
    if (window.TWEEN) {
      window.TWEEN.removeAll();
    }

    if (this.is2D) {
      // Desativa os controles temporariamente para não ter conflito de input do usuário durante o voo
      this.controls.enabled = false;

      // Anima a câmera para uma posição ortogonal superior (vista 2D de cima)
      // Usamos 0.001 no Z para evitar Gimbal Lock / Singularidade de olhar direto para baixo no Three.js
      if (window.TWEEN) {
        new window.TWEEN.Tween(this.camera.position, true)
          .to({ x: 0, y: 550, z: 0.001 }, 1200)
          .easing(window.TWEEN.Easing.Cubic.Out)
          .start();

        new window.TWEEN.Tween(this.controls.target, true)
          .to({ x: 0, y: 0, z: 0 }, 1200)
          .easing(window.TWEEN.Easing.Cubic.Out)
          .onComplete(() => {
            // Trava o ângulo de inclinação vertical (PolarAngle) em 0 para que o usuário não consiga rotacionar em 3D
            this.controls.minPolarAngle = 0;
            this.controls.maxPolarAngle = 0;
            // No modo 2D, o clique esquerdo arrasta e navega (Pan) em vez de tentar rotacionar
            this.controls.mouseButtons = {
              LEFT: THREE.MOUSE.PAN,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.PAN
            };
            this.controls.enabled = true;
          })
          .start();

        // Alinha as órbitas dos planetas para ficarem planas (plano X-Z local, rotação 0)
        this.orbitGroups.forEach(group => {
          new window.TWEEN.Tween(group.rotation, true)
            .to({ x: 0, z: 0 }, 1200)
            .easing(window.TWEEN.Easing.Cubic.Out)
            .start();
        });
      } else {
        // Fallback caso TWEEN falhe por algum motivo
        this.camera.position.set(0, 550, 0.001);
        this.controls.target.set(0, 0, 0);
        this.controls.minPolarAngle = 0;
        this.controls.maxPolarAngle = 0;
        this.controls.mouseButtons = {
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN
        };
        this.controls.enabled = true;
        this.orbitGroups.forEach(group => {
          group.rotation.x = 0;
          group.rotation.z = 0;
        });
      }
    } else {
      // Modo 3D: Destrava as restrições de inclinação da câmera
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = Math.PI;
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
      };
      this.controls.enabled = false;

      // Anima a câmera de volta para a posição inclinada 3D clássica
      if (window.TWEEN) {
        new window.TWEEN.Tween(this.camera.position, true)
          .to({ x: 0, y: 150, z: 250 }, 1200)
          .easing(window.TWEEN.Easing.Cubic.Out)
          .start();

        new window.TWEEN.Tween(this.controls.target, true)
          .to({ x: 0, y: 0, z: 0 }, 1200)
          .easing(window.TWEEN.Easing.Cubic.Out)
          .onComplete(() => {
            this.controls.enabled = true;
          })
          .start();

        // Devolve a inclinação aleatória das órbitas
        this.orbitGroups.forEach(group => {
          new window.TWEEN.Tween(group.rotation, true)
            .to({ 
              x: group.userData.tiltX || 0, 
              z: group.userData.tiltZ || 0 
            }, 1200)
            .easing(window.TWEEN.Easing.Cubic.Out)
            .start();
        });
      } else {
        // Fallback
        this.camera.position.set(0, 150, 250);
        this.controls.target.set(0, 0, 0);
        this.controls.mouseButtons = {
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE
        };
        this.controls.enabled = true;
        this.orbitGroups.forEach(group => {
          group.rotation.x = group.userData.tiltX || 0;
          group.rotation.z = group.userData.tiltZ || 0;
        });
      }
    }
  }
}

window.Universe3D = Universe3D;
