class Universe3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    
    // Core Three.js
    this.scene = new THREE.Scene();
    
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    );
    // Initial camera position (Top-down Isometric-like)
    this.camera.position.set(0, 400, 600);
    this.camera.lookAt(0, 0, 0);
    this.initialCameraPos = { x: 0, y: 400, z: 600 };

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // Interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.hoveredObject = null;
    this.tooltip = document.getElementById('planet-tooltip');

    // Data
    this.planetMeshes = [];
    this.starParticles = null;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);
    this.sunLight = new THREE.PointLight(0xffffff, 1.5, 2000);
    this.sunLight.position.set(0, 0, 0);
    this.scene.add(this.sunLight);

    // Bindings
    this.animate = this.animate.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onClick = this.onClick.bind(this);
    
    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('click', this.onClick);

    this.createBackgroundStars();

    // Start loop
    requestAnimationFrame(this.animate);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  createBackgroundStars() {
    if (this.starParticles) this.scene.remove(this.starParticles);

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < 2000; i++) {
      vertices.push(
        (Math.random() - 0.5) * 4000,
        (Math.random() - 0.5) * 4000,
        (Math.random() - 0.5) * 4000
      );
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2,
      transparent: true,
      opacity: 0.6
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

  getFactionOffset(lang) {
    const frontend = ['JavaScript', 'TypeScript', 'HTML', 'CSS', 'Vue', 'React'];
    const backend = ['Java', 'C#', 'C++', 'Go', 'Rust', 'PHP', 'Ruby'];
    const data = ['Python', 'Jupyter Notebook'];

    if (frontend.includes(lang)) return { angleOffset: 0, distOffset: 0 };
    if (backend.includes(lang)) return { angleOffset: Math.PI * (2/3), distOffset: 50 };
    if (data.includes(lang)) return { angleOffset: Math.PI * (4/3), distOffset: 100 };
    
    return { angleOffset: Math.random() * Math.PI, distOffset: 150 }; // Outros
  }

  createGalaxy(repos) {
    // Clear old planets
    this.planetMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      if(mesh.orbitLine) this.scene.remove(mesh.orbitLine);
    });
    this.planetMeshes = [];

    // Central Sun (User Node)
    if (!this.centralSun) {
      const sunGeo = new THREE.SphereGeometry(25, 32, 32);
      const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      this.centralSun = new THREE.Mesh(sunGeo, sunMat);
      this.scene.add(this.centralSun);
    }

    repos.forEach((repo, i) => {
      // Logic for size based on commits (here approximated by size/stars for API limits)
      let radius = 2 + Math.log10(repo.size || 10) * 1.5;
      if (radius > 15) radius = 15;
      
      const faction = this.getFactionOffset(repo.language);
      
      const distance = 70 + faction.distOffset + (i * 8);
      const angle = faction.angleOffset + (Math.random() * Math.PI / 2);
      const speed = (0.001 + Math.random() * 0.002) * (i % 2 === 0 ? 1 : -1);

      const color = this.getColorForLanguage(repo.language);

      // Planet Mesh
      const geo = new THREE.SphereGeometry(radius, 32, 32);
      const mat = new THREE.MeshStandardMaterial({ 
        color: color,
        roughness: 0.6,
        metalness: 0.2
      });
      const mesh = new THREE.Mesh(geo, mat);
      
      // Calculate start pos
      mesh.position.x = Math.cos(angle) * distance;
      mesh.position.z = Math.sin(angle) * distance;
      
      // User data
      mesh.userData = {
        repo,
        angle,
        distance,
        speed,
        baseColor: color
      };

      // Rings for highly active projects (> 50 stars)
      if (repo.stargazers_count >= 50) {
        const ringGeo = new THREE.RingGeometry(radius + 2, radius + 6, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2 + 0.2;
        mesh.add(ring);
      }

      // Orbit Path
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
          this.hoveredObject.material.emissive.setHex(0x000000);
        }
        this.hoveredObject = intersects[0].object;
        this.hoveredObject.material.emissive.setHex(this.hoveredObject.userData.baseColor);
        this.hoveredObject.material.emissiveIntensity = 0.5;
        
        // Show tooltip
        this.tooltip.classList.remove('hidden');
        this.tooltip.textContent = this.hoveredObject.userData.repo.name;
        document.body.style.cursor = 'pointer';
      }
      // Follow mouse
      this.tooltip.style.left = `${e.clientX}px`;
      this.tooltip.style.top = `${e.clientY - 20}px`;
    } else {
      if (this.hoveredObject) {
        this.hoveredObject.material.emissive.setHex(0x000000);
        this.hoveredObject = null;
        this.tooltip.classList.add('hidden');
        document.body.style.cursor = 'default';
      }
    }
  }

  onClick(e) {
    // Only trigger if in "tab-universe"
    const isUniverseActive = document.getElementById('tab-universe').classList.contains('active');
    if (!isUniverseActive) return;

    if (this.hoveredObject) {
      const repo = this.hoveredObject.userData.repo;
      if (window.onPlanetClick) window.onPlanetClick(repo);

      // Cinematic Camera Flight (Tween)
      const targetPos = this.hoveredObject.position.clone();
      // Offset so we don't end up inside the planet
      const dist = this.hoveredObject.geometry.parameters.radius * 4;
      targetPos.x += dist;
      targetPos.y += dist;
      targetPos.z += dist;

      new TWEEN.Tween(this.camera.position)
        .to({ x: targetPos.x, y: targetPos.y, z: targetPos.z }, 1500)
        .easing(TWEEN.Easing.Cubic.Out)
        .start();
        
      // Look at planet
      new TWEEN.Tween(this.camera.rotation)
        // A tricky part in Three is animating lookAt directly. 
        // We'll let orbit controls or manual update handle it if we had orbit controls.
        // For simplicity, we just snap lookAt in the render loop or tween the target.
        .start();

      this.currentTarget = this.hoveredObject.position;
    }
  }

  resetCamera() {
    new TWEEN.Tween(this.camera.position)
      .to(this.initialCameraPos, 2000)
      .easing(TWEEN.Easing.Cubic.InOut)
      .start();
    this.currentTarget = new THREE.Vector3(0,0,0);
  }

  animate(time) {
    requestAnimationFrame(this.animate);
    TWEEN.update(time);

    // Orbit Logic
    this.planetMeshes.forEach(mesh => {
      mesh.userData.angle += mesh.userData.speed;
      mesh.position.x = Math.cos(mesh.userData.angle) * mesh.userData.distance;
      mesh.position.z = Math.sin(mesh.userData.angle) * mesh.userData.distance;
      mesh.rotation.y += 0.01;
    });

    if (this.starParticles) {
      this.starParticles.rotation.y += 0.0005;
    }

    if (this.currentTarget) {
      this.camera.lookAt(this.currentTarget);
    } else {
      this.camera.lookAt(0, 0, 0);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.Universe3D = Universe3D;
