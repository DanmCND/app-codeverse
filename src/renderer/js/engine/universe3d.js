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

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.3, // intensity reduzida para não estourar a cena
      0.45, // radius do glow
      0.25  // threshold levemente maior para evitar glow exagerado
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
    this.screenMouse = { x: 0, y: 0 };
    this.hoveredObject = null;
    this.tooltip = document.getElementById('planet-tooltip');

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambientLight);

    this.sunLight = new THREE.PointLight(0xffffff, 1.5, 1000); // Brilho do sol reduzido de 2 para 1.5
    this.scene.add(this.sunLight);

    // Grupos de órbita para inclinação 3D
    this.orbitGroups = [];
    this.planetMeshes = [];
    this.starGroup = null;
    this.nebulaGroup = null;
    this.isPaused = false; 
    this.is2D = false; // Estado inicial da dimensão (3D)
    this.useBloom = true; // Modo Bloom/Glow ativo por padrão

    // =========================================================
    // Gerenciamento de Texturas (Geradas Localmente para Performance e Offline-First)
    // =========================================================
    this.textures = {
      gas: this.generateGasTexture(),
      rock: this.generateRockTexture(),
      cloud: this.generateCloudTexture(),
      star: this.generateStarTexture()
    };
    
    // Garantir que a textura de gás possa ser colorida mantendo o padrão da linguagem
    this.textures.gas.colorSpace = THREE.SRGBColorSpace;
    this.textures.rock.colorSpace = THREE.SRGBColorSpace;

    // Shared unit sphere geometry for planets, atmospheres and the Sun
    this.sharedSphereGeometry = new THREE.SphereGeometry(1, 24, 24);

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
      // Se moveu menos de 5 pixels, foi um clique intencional no planeta (não arrasto de câmera)
      if (dist < 5 && this.hoveredObject && this.hoveredObject.userData.repo) {
        if (window.onPlanetClick) window.onPlanetClick(this.hoveredObject.userData.repo);
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

  createBackgroundStars(systemRadius = 1200) {
    // Remove o grupo de estrelas se ele já existir
    if (this.starGroup) {
      this.scene.remove(this.starGroup);
    }

    this.starGroup = new THREE.Group();

    // Define limites dinâmicos para a casca de estrelas (background) de modo que sempre fiquem no fundo
    const minRadius = Math.max(systemRadius * 2.0, 10000);
    const maxRadius = Math.max(systemRadius * 4.0, 25000);

    // 1. Estrelas pequenas de fundo (tênues e numerosas)
    const smallGeo = new THREE.BufferGeometry();
    const smallVertices = [];
    for (let i = 0; i < 6000; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = Math.cbrt(Math.random() * (Math.pow(maxRadius, 3) - Math.pow(minRadius, 3)) + Math.pow(minRadius, 3));
      smallVertices.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
    }
    smallGeo.setAttribute('position', new THREE.Float32BufferAttribute(smallVertices, 3));
    const smallMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.8, // Tamanho fixo em pixels (sizeAttenuation: false)
      sizeAttenuation: false,
      map: this.textures.star,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const smallStars = new THREE.Points(smallGeo, smallMat);
    this.starGroup.add(smallStars);

    // 2. Estrelas médias/brilhantes (maiores e menos numerosas)
    const brightGeo = new THREE.BufferGeometry();
    const brightVertices = [];
    for (let i = 0; i < 2000; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = Math.cbrt(Math.random() * (Math.pow(maxRadius, 3) - Math.pow(minRadius, 3)) + Math.pow(minRadius, 3));
      brightVertices.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
    }
    brightGeo.setAttribute('position', new THREE.Float32BufferAttribute(brightVertices, 3));
    const brightMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 3.0, // Tamanho fixo em pixels (sizeAttenuation: false)
      sizeAttenuation: false,
      map: this.textures.star,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const brightStars = new THREE.Points(brightGeo, brightMat);
    this.starGroup.add(brightStars);

    this.scene.add(this.starGroup);
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

    if (this.nebulaGroup) {
      this.nebulaGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(this.nebulaGroup);
    }
    this.nebulaGroup = new THREE.Group();

    const nebulaColor = this.getColorForLanguage(dominantLanguage);
    const colorObj = new THREE.Color(nebulaColor);
    
    // Cores do tema espacial para misturar
    const themeColors = [
      new THREE.Color(0x4F46E5), // Indigo
      new THREE.Color(0x7C3AED), // Roxo
      new THREE.Color(0x00E5FF)  // Ciano
    ];

    // Calcula os limites dinâmicos para a nebulosa com base no raio máximo
    const coreStart = Math.max(120, maxSystemRadius * 0.15);
    const coreEnd = Math.max(350, maxSystemRadius * 0.45);
    const outerStart = coreEnd;
    const outerEnd = Math.max(1200, maxSystemRadius * 1.4);

    // 1. Núcleo Interno da Nebulosa (reduzido, afastado do centro e dinâmico)
    const coreGeo = new THREE.BufferGeometry();
    const coreVertices = [];
    const coreColors = [];
    
    for (let i = 0; i < 150; i++) {
      const r = coreStart + Math.random() * (coreEnd - coreStart);
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.25; // achatado no Y
      const z = r * Math.cos(phi);
      
      coreVertices.push(x, y, z);
      
      const c = colorObj.clone();
      c.offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.1);
      coreColors.push(c.r, c.g, c.b);
    }
    
    coreGeo.setAttribute('position', new THREE.Float32BufferAttribute(coreVertices, 3));
    coreGeo.setAttribute('color', new THREE.Float32BufferAttribute(coreColors, 3));
    
    const coreMat = new THREE.PointsMaterial({
      size: Math.max(80.0, maxSystemRadius * 0.06), // tamanho dinâmico reduzido
      map: this.textures.cloud,
      transparent: true,
      opacity: 0.025,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });
    
    const coreNebula = new THREE.Points(coreGeo, coreMat);
    this.nebulaGroup.add(coreNebula);

    // 2. Disco Galáctico Externo da Nebulosa (mais amplo e dinâmico)
    const outerGeo = new THREE.BufferGeometry();
    const outerVertices = [];
    const outerColors = [];
    
    for (let i = 0; i < 450; i++) {
      const r = outerStart + Math.random() * (outerEnd - outerStart);
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.12; // disco bem achatado
      const z = r * Math.cos(phi);
      
      outerVertices.push(x, y, z);
      
      const c = colorObj.clone();
      if (Math.random() < 0.5) {
        const mixColor = themeColors[Math.floor(Math.random() * themeColors.length)];
        c.lerp(mixColor, 0.4 + Math.random() * 0.4);
      } else {
        c.offsetHSL((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
      }
      outerColors.push(c.r, c.g, c.b);
    }
    
    outerGeo.setAttribute('position', new THREE.Float32BufferAttribute(outerVertices, 3));
    outerGeo.setAttribute('color', new THREE.Float32BufferAttribute(outerColors, 3));
    
    const outerMat = new THREE.PointsMaterial({
      size: Math.max(120.0, maxSystemRadius * 0.10), // tamanho dinâmico reduzido
      map: this.textures.cloud,
      transparent: true,
      opacity: 0.018,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });
    
    const outerNebula = new THREE.Points(outerGeo, outerMat);
    this.nebulaGroup.add(outerNebula);

    // 3. Partículas de Poeira Cósmica (pontos brilhantes dentro da nebulosa, dinâmicos)
    const dustGeo = new THREE.BufferGeometry();
    const dustVertices = [];
    const dustColors = [];
    
    for (let i = 0; i < 180; i++) {
      const r = 100 + Math.random() * (maxSystemRadius * 1.1);
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.2;
      const z = r * Math.cos(phi);
      
      dustVertices.push(x, y, z);
      
      const c = new THREE.Color();
      const rand = Math.random();
      if (rand < 0.4) {
        c.setHex(0x00E5FF); // Ciano
      } else if (rand < 0.7) {
        c.setHex(0x7C3AED); // Roxo
      } else {
        c.setHex(0xffffff); // Branco
      }
      dustColors.push(c.r, c.g, c.b);
    }
    
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustVertices, 3));
    dustGeo.setAttribute('color', new THREE.Float32BufferAttribute(dustColors, 3));
    
    const dustMat = new THREE.PointsMaterial({
      size: 3.5,
      map: this.textures.star,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });
    
    const dustParticles = new THREE.Points(dustGeo, dustMat);
    this.nebulaGroup.add(dustParticles);

    this.scene.add(this.nebulaGroup);

    // O Sol
    if (!this.sun) {
      // Brilho do sol central reduzido
      const sunMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 1.0, 
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
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.screenMouse.x = e.clientX;
    this.screenMouse.y = e.clientY;
  }

  updateRaycast() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.planetMeshes);

    if (intersects.length > 0) {
      if (this.hoveredObject !== intersects[0].object) {
        if (this.hoveredObject) {
          this.hoveredObject.material.emissiveIntensity = 0.05; // Voltar ao glow natural
        }
        this.hoveredObject = intersects[0].object;
        this.hoveredObject.material.emissiveIntensity = 3.0; // Brilho EXTREMO no hover (Neon)
        
        if (this.tooltip) {
          this.tooltip.classList.remove('hidden');
          this.tooltip.style.display = 'block'; // Forçar exibição caso o css esteja conflitando
          this.tooltip.textContent = this.hoveredObject.userData.name;
        }
        this.interactLayer.style.cursor = 'pointer';
      }
      
      if (this.tooltip && this.screenMouse) {
        this.tooltip.style.left = `${this.screenMouse.x}px`;
        this.tooltip.style.top = `${this.screenMouse.y - 20}px`;
      }
    } else {
      if (this.hoveredObject) {
        this.hoveredObject.material.emissiveIntensity = 0.05; // Voltar ao glow natural
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
    
    if (window.TWEEN) {
      window.TWEEN.update();
    }
    
    this.planetMeshes.forEach(mesh => {
      // Se não estiver pausado, avança o ângulo
      if (!this.isPaused) {
        mesh.userData.angle += mesh.userData.speed;
      }
      
      // Atualiza posição matemática independente do pause
      mesh.position.x = Math.cos(mesh.userData.angle) * mesh.userData.distance;
      mesh.position.z = Math.sin(mesh.userData.angle) * mesh.userData.distance;
      
      // O planeta em si continua rodando no seu próprio eixo mesmo se a órbita estiver pausada?
      // O usuário pediu "pause na orbita". Faz sentido manter a rotação local para dar vida, 
      // ou pausar tudo. Vamos pausar tudo para ficar "estático" para clique fácil.
      if (!this.isPaused) {
        mesh.rotation.y += 0.01; 
      }
    });

    if (this.starGroup && !this.isPaused) {
      this.starGroup.rotation.y += 0.0002;
    }

    if (this.nebulaGroup && !this.isPaused) {
      // Rotaciona as camadas da nebulosa em velocidades ligeiramente diferentes para paralaxe
      this.nebulaGroup.children.forEach((layer, idx) => {
        const speed = (idx === 0) ? -0.0003 : (idx === 1) ? -0.000155 : 0.0002;
        layer.rotation.y += speed;
      });
    }

    // Update raycasting once per frame
    this.updateRaycast();

    // Toggle nebula visibility dynamically based on performance mode
    if (this.nebulaGroup) {
      this.nebulaGroup.visible = this.useBloom;
    }

    this.controls.update();
    // Renderiza a cena: com Pós-Processamento (Bloom) ou renderização direta (Alta Performance)
    if (this.useBloom) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
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
