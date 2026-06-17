// Function to show Toast Notifications
window.showToast = function(message, icon = 'ph-info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="ph ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 100);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

document.addEventListener('DOMContentLoaded', () => {
  // Titlebar
  if (window.electronAPI) {
    document.getElementById('min-btn').addEventListener('click', () => window.electronAPI.minimize());
    document.getElementById('max-btn').addEventListener('click', () => window.electronAPI.maximize());
    document.getElementById('close-btn').addEventListener('click', () => window.electronAPI.close());
  } else {
    const titlebarControls = document.querySelector('.titlebar-controls');
    if (titlebarControls) {
      titlebarControls.style.display = 'none';
    }
  }

  const github = new GitHubService();
  let universe3D = null;
  let dashboardPro = new Dashboard();
  let originalCommander = null;

  // Elements
  const exploreBtn = document.getElementById('explore-btn');
  const usernameInput = document.getElementById('github-username');
  const gatewayLoader = document.getElementById('gateway-loader');
  const gatewayScreen = document.getElementById('gateway-screen');
  const mainScreen = document.getElementById('main-screen');
  const detailsPanel = document.getElementById('details-panel');
  const explorerInput = document.getElementById('explorer-input');
  
  // Compare Elements
  const compareBtn = document.getElementById('compare-btn');
  const compareInput = document.getElementById('compare-input');

  // Navigation Logic
  const navBtns = document.querySelectorAll('.nav-btn[data-target]');
  const tabContents = document.querySelectorAll('.tab-content');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => {
        c.classList.remove('active');
        setTimeout(() => { if (!c.classList.contains('active')) c.classList.add('hidden'); }, 300);
      });
      
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      const targetContent = document.getElementById(targetId);
      targetContent.classList.remove('hidden');
      setTimeout(() => targetContent.classList.add('active'), 50);
    });
  });

  // Theme
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const body = document.body;
    const newTheme = body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    body.setAttribute('data-theme', newTheme);
    showToast(`Tema alterado para ${newTheme === 'dark' ? 'Escuro' : 'Claro'}`, 'ph-moon');
  });

  // Recents
  const loadRecents = () => {
    const recents = JSON.parse(localStorage.getItem('codeverse_recents') || '[]');
    const list = document.getElementById('recent-list');
    list.innerHTML = '';
    recents.forEach(user => {
      const badge = document.createElement('span');
      badge.className = 'recent-badge';
      badge.textContent = user;
      badge.addEventListener('click', () => {
        document.querySelector('.nav-btn[data-target="tab-universe"]').click();
        exploreUniverse(user);
      });
      list.appendChild(badge);
    });
  };

  const saveRecent = (username) => {
    let recents = JSON.parse(localStorage.getItem('codeverse_recents') || '[]');
    recents = recents.filter(u => u.toLowerCase() !== username.toLowerCase());
    recents.unshift(username);
    if (recents.length > 6) recents.pop();
    localStorage.setItem('codeverse_recents', JSON.stringify(recents));
    loadRecents();
  };

  // Main Explore
  const exploreUniverse = async (username, isInitial = false) => {
    const loader = document.getElementById('universe-loader');
    if (loader) loader.classList.remove('hidden');

    try {
      const user = await github.fetchUser(username);
      const repos = await github.fetchRepos(username);

      if (isInitial) originalCommander = user.login;
      saveRecent(user.login);

      // Populate User
      document.getElementById('user-name').textContent = user.name || user.login;
      document.getElementById('user-login').textContent = `@${user.login}`;
      document.getElementById('user-avatar').src = user.avatar_url;
      document.getElementById('user-avatar').classList.remove('hidden');

      // Populate Dashboard Core Metrics
      document.getElementById('metric-repos').textContent = repos.length;
      document.getElementById('metric-stars').textContent = github.getTotalStars(repos);
      document.getElementById('metric-lang').textContent = github.getDominantLanguage(repos);
      
      const uniqueLangs = new Set(repos.map(r => r.language).filter(Boolean));
      document.getElementById('metric-lang-count').textContent = uniqueLangs.size;
      
      const recentRepos = repos.slice(0, 10);
      let mostActive = recentRepos[0];
      recentRepos.forEach(r => {
        if ((r.stargazers_count + r.forks_count) > ((mostActive?.stargazers_count||0) + (mostActive?.forks_count||0))) {
          mostActive = r;
        }
      });
      
      if (mostActive) {
        document.getElementById('metric-active').textContent = mostActive.name;
        document.getElementById('metric-active-desc').textContent = `${mostActive.stargazers_count} stars | Atualizado: ${new Date(mostActive.updated_at).toLocaleDateString()}`;
      } else {
        document.getElementById('metric-active').textContent = "Nenhum projeto encontrado";
        document.getElementById('metric-active-desc').textContent = "";
      }

      // Insights & Chart
      document.getElementById('ai-insights').textContent = dashboardPro.generateInsights(repos, user);
      dashboardPro.updateChart(repos);

      // Populate Timeline
      const timelineContainer = document.getElementById('timeline-container');
      timelineContainer.innerHTML = '';
      
      const reposByYear = {};
      repos.forEach(r => {
        const year = new Date(r.created_at).getFullYear();
        if(!reposByYear[year]) reposByYear[year] = [];
        reposByYear[year].push(r);
      });

      Object.keys(reposByYear).sort((a,b) => b - a).forEach(year => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        
        let reposHtml = reposByYear[year].map(r => `
          <div class="timeline-repo">
            <i class="ph ph-git-commit"></i> ${r.name}
          </div>
        `).join('');

        item.innerHTML = `
          <div class="timeline-year">${year}</div>
          <div class="timeline-repos">${reposHtml}</div>
        `;
        timelineContainer.appendChild(item);
      });

      // Update Compare User A Side
      document.getElementById('comp-a-name').textContent = user.login;
      document.getElementById('comp-a-avatar').src = user.avatar_url;
      document.getElementById('comp-a-repos').textContent = repos.length;
      document.getElementById('comp-a-stars').textContent = github.getTotalStars(repos);
      document.getElementById('comp-a-lang').textContent = github.getDominantLanguage(repos);

      // Badges
      const badgesContainer = document.getElementById('badges-container');
      badgesContainer.innerHTML = '';
      const badges = [
        { icon: 'ph-rocket', title: 'Explorador Novato', earned: repos.length >= 5 },
        { icon: 'ph-star', title: 'Cadete Espacial', earned: repos.length >= 10 },
        { icon: 'ph-planet', title: 'Engenheiro Orbital', earned: repos.length >= 20 },
        { icon: 'ph-galaxy', title: 'Arquiteto Galáctico', earned: repos.length >= 50 },
        { icon: 'ph-crown', title: 'Imperador do Código', earned: repos.length >= 100 }
      ];

      badges.forEach(b => {
        const div = document.createElement('div');
        div.className = `badge ${b.earned ? 'earned' : ''}`;
        div.title = b.title;
        div.innerHTML = `<i class="ph ${b.icon}"></i><span>${b.title}</span>`;
        badgesContainer.appendChild(div);
      });

      // Update Universe
      if (universe3D) {
        const dominantLanguage = github.getDominantLanguage(repos);
        universe3D.createGalaxy(repos, dominantLanguage);
        detailsPanel.classList.add('hidden');
      }

      showToast(`Viajando para o universo de ${user.login}...`, 'ph-rocket');

    } catch (err) {
      showToast('Usuário não encontrado na galáxia.', 'ph-warning');
      throw err;
    } finally {
      if (loader) loader.classList.add('hidden');
    }
  };

  // Compare Function
  compareBtn.addEventListener('click', async () => {
    const target = compareInput.value.trim();
    if (!target) return;
    
    compareBtn.disabled = true;
    
    try {
      const userB = await github.fetchUser(target);
      const reposB = await github.fetchRepos(target);

      document.getElementById('compare-arena').classList.remove('hidden');
      document.getElementById('comp-b-name').textContent = userB.login;
      document.getElementById('comp-b-avatar').src = userB.avatar_url;
      document.getElementById('comp-b-repos').textContent = reposB.length;
      document.getElementById('comp-b-stars').textContent = github.getTotalStars(reposB);
      document.getElementById('comp-b-lang').textContent = github.getDominantLanguage(reposB);
      
    } catch (err) {
      showToast('Usuário não encontrado para duelo.', 'ph-warning');
    } finally {
      compareBtn.disabled = false;
    }
  });

  // Gateway Initial Explore
  exploreBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!username) return;

    exploreBtn.classList.add('hidden');
    gatewayLoader.classList.remove('hidden');

    try {
      await github.fetchUser(username); 
      
      gatewayScreen.classList.remove('active');
      setTimeout(() => gatewayScreen.classList.add('hidden'), 500);
      mainScreen.classList.remove('hidden');
      setTimeout(() => {
        mainScreen.classList.add('active');
        
        if (!universe3D) {
          universe3D = new Universe3D('webgl-container');
          
          // Sincroniza o ícone do botão de glow com o estado inicial (desativado no mobile por padrão)
          if (!universe3D.useBloom) {
            const glowIcon = document.querySelector('#toggle-glow-btn i');
            if (glowIcon) {
              glowIcon.className = 'ph ph-lightning-slash';
            }
          }
          
          window.onPlanetClick = (repo) => {
            document.getElementById('repo-name').textContent = repo.name;
            document.getElementById('repo-desc').textContent = repo.description || 'Sem descrição fornecida.';
            document.getElementById('repo-lang').textContent = repo.language || 'N/A';
            document.getElementById('repo-stars').textContent = repo.stargazers_count;
            document.getElementById('repo-forks').textContent = repo.forks_count;
            document.getElementById('repo-updated').textContent = new Date(repo.updated_at).toLocaleDateString();
            document.getElementById('repo-link').href = repo.html_url;

            detailsPanel.classList.remove('hidden');
          };

          document.getElementById('close-details-btn').addEventListener('click', () => {
            detailsPanel.classList.add('hidden');
          });

          document.getElementById('reset-camera-btn').addEventListener('click', () => {
             universe3D.resetCamera();
             detailsPanel.classList.add('hidden');
          });

          document.getElementById('pause-orbit-btn').addEventListener('click', (e) => {
              universe3D.togglePause();
              const icon = document.querySelector('#pause-orbit-btn i');
              if (universe3D.isPaused) {
                icon.classList.remove('ph-pause');
                icon.classList.add('ph-play');
              } else {
                icon.classList.remove('ph-play');
                icon.classList.add('ph-pause');
              }
          });

          document.getElementById('toggle-dimension-btn').addEventListener('click', () => {
             universe3D.toggleDimension();
             const icon = document.querySelector('#toggle-dimension-btn i');
             if (universe3D.is2D) {
               icon.className = 'ph ph-circle-dashed';
               showToast('Visualização 2D ativada (Top-Down)', 'ph-planet');
             } else {
               icon.className = 'ph ph-cube';
               showToast('Visualização 3D ativada (Perspectiva)', 'ph-cube');
             }
          });

          document.getElementById('toggle-glow-btn').addEventListener('click', () => {
             universe3D.useBloom = !universe3D.useBloom;
             const icon = document.querySelector('#toggle-glow-btn i');
             if (universe3D.useBloom) {
               icon.className = 'ph ph-lightning';
               showToast('Efeitos de brilho (Bloom) ativados', 'ph-sparkles');
             } else {
               icon.className = 'ph ph-lightning-slash';
               showToast('Modo de Alto Desempenho (Glow desativado)', 'ph-lightning');
             }
          });
        }
        
        exploreUniverse(username, true);
        
      }, 50);

    } catch (err) {
      showToast('Usuário não encontrado na galáxia.', 'ph-warning');
      exploreBtn.classList.remove('hidden');
      gatewayLoader.classList.add('hidden');
    }
  });

  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') exploreBtn.click();
  });

  // Sidebar Explorer
  explorerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const target = explorerInput.value.trim();
      if (target) {
        document.querySelector('.nav-btn[data-target="tab-universe"]').click();
        exploreUniverse(target).catch(() => {});
        explorerInput.value = '';
      }
    }
  });

  compareInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') compareBtn.click();
  });

  document.getElementById('share-btn').addEventListener('click', () => {
    const login = document.getElementById('user-login').textContent.replace('@', '');
    navigator.clipboard.writeText(`https://github.com/${login}`).then(() => {
      showToast('Universo compartilhado! Link copiado.', 'ph-share-network');
    });
  });

  document.getElementById('my-universe-btn').addEventListener('click', () => {
    if (originalCommander) {
      document.querySelector('.nav-btn[data-target="tab-universe"]').click();
      exploreUniverse(originalCommander);
    }
  });

  // Mobile Sidebar Toggle
  const sidebar = document.querySelector('.main-sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const sidebarToggle = document.getElementById('mobile-sidebar-toggle');
  
  if (sidebarToggle && sidebar && sidebarBackdrop) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      sidebarBackdrop.classList.toggle('active');
      
      const isOpen = sidebar.classList.contains('open');
      sidebarToggle.innerHTML = isOpen ? '<i class="ph ph-x"></i>' : '<i class="ph ph-list"></i>';
    });

    sidebarBackdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarBackdrop.classList.remove('active');
      sidebarToggle.innerHTML = '<i class="ph ph-list"></i>';
    });

    // Fechar a sidebar ao selecionar um tab no mobile
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
          sidebarBackdrop.classList.remove('active');
          sidebarToggle.innerHTML = '<i class="ph ph-list"></i>';
        }
      });
    });
  }

  loadRecents();
});
