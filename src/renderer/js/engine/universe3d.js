import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

    this.sunLight = new THREE.PointLight(0xffffff, 2, 1000);
    this.scene.add(this.sunLight);

    this.planetMeshes = [];
    this.starParticles = null;

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

  createBackgroundStars() {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < 2000; i++) {
      vertices.push(
        (Math.random() - 0.5) * 2000,
        (Math.random() - 0.5) * 2000,
        (Math.random() - 0.5) * 2000
      );
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0.4 });
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

  createGalaxy(repos) {
    this.planetMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      if(mesh.orbitLine) this.scene.remove(mesh.orbitLine);
    });
    this.planetMeshes = [];

    // O Sol passa a ser "clicável" apenas por estética visual, mas representa o Dev.
    if (!this.sun) {
      const sunGeo = new THREE.SphereGeometry(20, 32, 32);
      const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
      this.sun = new THREE.Mesh(sunGeo, sunMat);
      this.scene.add(this.sun);
    }

    repos.forEach((repo, i) => {
      let radius = 2 + Math.log10(repo.size || 10) * 1.5;
      if (radius > 15) radius = 15;
      
      const distance = 50 + (i * 12);
      const speed = 0.001 + Math.random() * 0.003;
      const color = this.getColorForLanguage(repo.language);

      const geo = new THREE.SphereGeometry(radius, 32, 32);
      const mat = new THREE.MeshStandardMaterial({ 
        color: color, 
        roughness: 0.6, 
        metalness: 0.2,
        emissive: color,
        emissiveIntensity: 0.0
      });
      const mesh = new THREE.Mesh(geo, mat);

      mesh.userData = {
        repo: repo,
        name: repo.name,
        angle: Math.random() * Math.PI * 2,
        distance: distance,
        speed: speed,
        baseColor: color
      };

      const orbitGeo = new THREE.RingGeometry(distance - 0.5, distance + 0.5, 64);
      const orbitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.05 });
      const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
      orbitMesh.rotation.x = Math.PI / 2;
      
      mesh.orbitLine = orbitMesh;
      this.scene.add(orbitMesh);
      this.scene.add(mesh);
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
          this.hoveredObject.material.emissiveIntensity = 0;
        }
        this.hoveredObject = intersects[0].object;
        this.hoveredObject.material.emissiveIntensity = 0.4;
        
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
        this.hoveredObject.material.emissiveIntensity = 0;
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
  }

  resetCamera() {
    this.camera.position.set(0, 150, 250);
    this.controls.target.set(0, 0, 0);
  }

  animate() {
    requestAnimationFrame(this.animate);
    
    this.planetMeshes.forEach(mesh => {
      mesh.userData.angle += mesh.userData.speed;
      mesh.position.x = Math.cos(mesh.userData.angle) * mesh.userData.distance;
      mesh.position.z = Math.sin(mesh.userData.angle) * mesh.userData.distance;
      mesh.rotation.y += 0.02; 
    });

    if (this.starParticles) {
      this.starParticles.rotation.y += 0.0002;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

window.Universe3D = Universe3D;
