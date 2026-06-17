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

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.camera.position.set(0, 150, 250);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

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
    this.controls.maxDistance = 2000;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.zoomSpeed = 1.2;

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

    this.sunLight = new THREE.PointLight(0xffffff, 1.5, 1000); // Brilho do sol reduzido de 2 para 1.5
    this.scene.add(this.sunLight);

    // Grupos de órbita para inclinação 3D
    this.orbitGroups = [];
    this.planetMeshes = [];
    this.starParticles = null;
    this.nebulaGroup = null;
    this.isPaused = false; 

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

    this.createBackgroundStars();

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

  createBackgroundStars() {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < 6000; i++) {
      vertices.push(
        (Math.random() - 0.5) * 4000,
        (Math.random() - 0.5) * 4000,
        (Math.random() - 0.5) * 4000
      );
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    const material = new THREE.PointsMaterial({ 
      color: 0xffffff, 
      size: 4.0, 
      map: this.textures.star,
      transparent: true, 
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.starParticles = new THREE.Points(geometry, material);
    this.scene.add(this.starParticles);
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
    
    // A atmosfera é um pouco maior que o planeta
    return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.25, 64, 64), material);
  }

  createGalaxy(repos, dominantLanguage = 'JavaScript') {
    this.planetMeshes.forEach(mesh => {
      this.scene.remove(mesh);
    });
    if (this.orbitGroups) {
      this.orbitGroups.forEach(group => this.scene.remove(group));
    }
    this.planetMeshes = [];
    this.orbitGroups = [];

    if (this.nebulaGroup) {
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

    // 1. Núcleo Interno da Nebulosa (reduzido e afastado para dar visibilidade ao centro)
    const coreGeo = new THREE.BufferGeometry();
    const coreVertices = [];
    const coreColors = [];
    
    for (let i = 0; i < 150; i++) {
      const r = 120 + Math.random() * 250; // Começa afastado (120) para criar um vazio no centro para o sol e planetas
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.25; // achatado no Y
      const z = r * Math.cos(phi);
      
      coreVertices.push(x, y, z);
      
      // Cor próxima à cor dominante da linguagem com pequenas variações de brilho
      const c = colorObj.clone();
      c.offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.1);
      coreColors.push(c.r, c.g, c.b);
    }
    
    coreGeo.setAttribute('position', new THREE.Float32BufferAttribute(coreVertices, 3));
    coreGeo.setAttribute('color', new THREE.Float32BufferAttribute(coreColors, 3));
    
    const coreMat = new THREE.PointsMaterial({
      size: 200.0, // menor para não sobrepor completamente o centro
      map: this.textures.cloud,
      transparent: true,
      opacity: 0.025, // muito mais suave para visibilidade total
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });
    
    const coreNebula = new THREE.Points(coreGeo, coreMat);
    this.nebulaGroup.add(coreNebula);

    // 2. Disco Galáctico Externo da Nebulosa (mais amplo, cores misturadas, suavizado)
    const outerGeo = new THREE.BufferGeometry();
    const outerVertices = [];
    const outerColors = [];
    
    for (let i = 0; i < 450; i++) {
      const r = 320 + Math.random() * 880;
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.12; // disco bem achatado
      const z = r * Math.cos(phi);
      
      outerVertices.push(x, y, z);
      
      // Interpolação entre a cor dominante e cores do tema espacial
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
      size: 320.0, // menor e mais sutil
      map: this.textures.cloud,
      transparent: true,
      opacity: 0.018, // super sutil
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });
    
    const outerNebula = new THREE.Points(outerGeo, outerMat);
    this.nebulaGroup.add(outerNebula);

    // 3. Partículas de Poeira Cósmica (pontos brilhantes dentro da nebulosa, suavizados)
    const dustGeo = new THREE.BufferGeometry();
    const dustVertices = [];
    const dustColors = [];
    
    for (let i = 0; i < 180; i++) {
      const r = 100 + Math.random() * 800;
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
      const sunGeo = new THREE.SphereGeometry(15, 64, 64);
      // Brilho do sol central reduzido
      const sunMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 1.0, 
        roughness: 0.1
      });
      this.sun = new THREE.Mesh(sunGeo, sunMat);
      this.scene.add(this.sun);
    }

    let currentDistance = 40; // Distância inicial a partir do Sol

    repos.forEach((repo, i) => {
      // Ajuste "Meio-Termo": Usando uma potência suave e bônus logarítmico para as estrelas
      // Isso cria uma diferença perceptível sem estourar o tamanho da tela
      let sizeScore = repo.size || 10;
      let radius = 2.5 + Math.pow(sizeScore, 0.25) * 1.2; 
      
      // Bônus moderado para repositórios com estrelas
      radius += Math.log2((repo.stargazers_count || 0) + 1) * 0.5;
      
      // Limites: Maior que o antigo (15), menor que o extremo (45)
      if (radius > 22) radius = 22;
      if (radius < 3) radius = 3;
      
      // Variação na distância da órbita: o "gap" depende do tamanho do planeta
      // Planetas maiores geram espaçamentos maiores, parecendo um sistema solar real
      let orbitGap = 15 + (radius * 1.8) + (Math.random() * 15);
      currentDistance += orbitGap;
      
      const distance = currentDistance;
      const speed = 0.001 + Math.random() * 0.003;
      const color = this.getColorForLanguage(repo.language);

      const geo = new THREE.SphereGeometry(radius, 64, 64);
      // Todos os planetas agora recebem o "Novo Gráfico" (Textura Atmosférica + Halo)
      const mat = new THREE.MeshStandardMaterial({ 
        color: color, 
        map: this.textures.gas,
        roughness: 0.4, 
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: 0.02
      });
      
      const mesh = new THREE.Mesh(geo, mat);

      // Todos os planetas ganham o Halo atmosférico
      const atmos = this.createAtmosphere(radius, color);
      const scale = 1.05; // Escala fixa para a atmosfera
      atmos.scale.set(scale, scale, scale);
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

      const orbitGeo = new THREE.RingGeometry(distance - 0.5, distance + 0.5, 128);
      const orbitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.08 });
      const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
      orbitMesh.rotation.x = Math.PI / 2; // Deita o anel na horizontal local
      
      // Criar um Grupo para este planeta e sua órbita, permitindo inclinação 3D
      const orbitGroup = new THREE.Group();
      
      // Inclinação aleatória da órbita (entre -15 e +15 graus no X e Z)
      const maxTilt = 15 * (Math.PI / 180);
      orbitGroup.rotation.x = (Math.random() - 0.5) * 2 * maxTilt;
      orbitGroup.rotation.z = (Math.random() - 0.5) * 2 * maxTilt;
      
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
      
      if (this.tooltip) {
        this.tooltip.style.left = `${e.clientX}px`;
        this.tooltip.style.top = `${e.clientY - 20}px`;
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
    this.camera.position.set(0, 150, 250);
    this.controls.target.set(0, 0, 0);
  }

  togglePause() {
    this.isPaused = !this.isPaused;
  }

  animate() {
    requestAnimationFrame(this.animate);
    
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

    if (this.starParticles && !this.isPaused) {
      this.starParticles.rotation.y += 0.0002;
    }

    if (this.nebulaGroup && !this.isPaused) {
      // Rotaciona as camadas da nebulosa em velocidades ligeiramente diferentes para paralaxe
      this.nebulaGroup.children.forEach((layer, idx) => {
        const speed = (idx === 0) ? -0.0003 : (idx === 1) ? -0.000155 : 0.0002;
        layer.rotation.y += speed;
      });
    }

    this.controls.update();
    // Renderiza a cena com Pós-Processamento (Bloom)
    this.composer.render();
  }
}

window.Universe3D = Universe3D;
