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
  // Setup Titlebar Controls
  if (window.electronAPI) {
    document.getElementById('min-btn').addEventListener('click', () => window.electronAPI.minimize());
    document.getElementById('max-btn').addEventListener('click', () => window.electronAPI.maximize());
    document.getElementById('close-btn').addEventListener('click', () => window.electronAPI.close());
  }

  const github = new GitHubService();
  let universe = null;
  let originalCommander = null;

  // Elements
  const exploreBtn = document.getElementById('explore-btn');
  const usernameInput = document.getElementById('github-username');
  const gatewayLoader = document.getElementById('gateway-loader');
  const gatewayScreen = document.getElementById('gateway-screen');
  const mainScreen = document.getElementById('main-screen');
  const detailsPanel = document.getElementById('details-panel');
  const explorerInput = document.getElementById('explorer-input');

  // Navigation Logic
  const navBtns = document.querySelectorAll('.nav-btn[data-target]');
  const tabContents = document.querySelectorAll('.tab-content');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => {
        c.classList.remove('active');
        setTimeout(() => {
           if (!c.classList.contains('active')) c.classList.add('hidden');
        }, 300);
      });
      
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      const targetContent = document.getElementById(targetId);
      targetContent.classList.remove('hidden');
      setTimeout(() => targetContent.classList.add('active'), 50);
    });
  });

  // Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.addEventListener('click', () => {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    body.setAttribute('data-theme', newTheme);
    showToast(`Tema alterado para ${newTheme === 'dark' ? 'Escuro' : 'Claro'}`, 'ph-moon');
  });

  // Recent Searches Logic
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

  // Main Explore Function
  const exploreUniverse = async (username, isInitial = false) => {
    const loader = document.getElementById('universe-loader');
    if (loader) loader.classList.remove('hidden');

    try {
      const user = await github.fetchUser(username);
      const repos = await github.fetchRepos(username);

      if (isInitial) {
        originalCommander = user.login;
      }

      saveRecent(user.login);

      // Populate Dashboard
      document.getElementById('user-name').textContent = user.name || user.login;
      document.getElementById('user-login').textContent = `@${user.login}`;
      document.getElementById('user-avatar').src = user.avatar_url;
      document.getElementById('user-avatar').classList.remove('hidden');

      document.getElementById('metric-repos').textContent = repos.length;
      document.getElementById('metric-stars').textContent = github.getTotalStars(repos);
      document.getElementById('metric-lang').textContent = github.getDominantLanguage(repos);
      
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

      // Badges Update
      const badgesContainer = document.getElementById('badges-container');
      badgesContainer.innerHTML = '';
      
      const badges = [
        { icon: 'ph-rocket', title: 'Explorador', earned: repos.length >= 5 },
        { icon: 'ph-star', title: 'Astronauta', earned: repos.length >= 10 },
        { icon: 'ph-planet', title: 'Mestre Galáctico', earned: repos.length >= 20 },
        { icon: 'ph-crown', title: 'Dev Lendário', earned: repos.length >= 50 }
      ];

      badges.forEach(b => {
        const div = document.createElement('div');
        div.className = `badge ${b.earned ? 'earned' : ''}`;
        div.title = b.title;
        div.innerHTML = `<i class="ph ${b.icon}"></i><span>${b.title}</span>`;
        badgesContainer.appendChild(div);
      });

      // Update Universe
      if (universe) {
        universe.createGalaxy(repos);
        detailsPanel.classList.add('hidden'); // close details panel if open
      }

      showToast(`Viajando para o universo de ${user.login}...`, 'ph-rocket');

    } catch (err) {
      showToast('Usuário não encontrado na galáxia.', 'ph-warning');
      throw err; // throw so initial load doesn't transition on bad username
    } finally {
      if (loader) loader.classList.add('hidden');
    }
  };

  // Gateway Initial Explore
  exploreBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!username) return;

    exploreBtn.classList.add('hidden');
    gatewayLoader.classList.remove('hidden');

    try {
      await github.fetchUser(username); // fast check before transition
      
      gatewayScreen.classList.remove('active');
      setTimeout(() => gatewayScreen.classList.add('hidden'), 500);
      mainScreen.classList.remove('hidden');
      setTimeout(() => {
        mainScreen.classList.add('active');
        
        if (!universe) {
          universe = new Universe('universe-canvas');
          
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

          window.onEmptySpaceClick = () => {
            detailsPanel.classList.add('hidden');
          };

          document.getElementById('close-details-btn').addEventListener('click', () => {
            detailsPanel.classList.add('hidden');
            universe.selectedPlanet = null;
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
    if (e.key === 'Enter') {
      exploreBtn.click();
    }
  });

  // Sidebar Explorer
  explorerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const target = explorerInput.value.trim();
      if (target) {
        document.querySelector('.nav-btn[data-target="tab-universe"]').click();
        exploreUniverse(target).catch(() => {}); // catch handled in exploreUniverse
        explorerInput.value = '';
      }
    }
  });

  // Share & My Universe actions
  document.getElementById('share-btn').addEventListener('click', () => {
    const login = document.getElementById('user-login').textContent.replace('@', '');
    const url = `https://github.com/${login}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Universo compartilhado! Link copiado.', 'ph-share-network');
    }).catch(() => {
      showToast('Erro ao copiar link.', 'ph-warning');
    });
  });

  document.getElementById('my-universe-btn').addEventListener('click', () => {
    if (originalCommander) {
      document.querySelector('.nav-btn[data-target="tab-universe"]').click();
      exploreUniverse(originalCommander);
    }
  });

  // Init Recents on load
  loadRecents();
});
