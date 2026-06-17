class Dashboard {
  constructor() {
    this.chart = null;
  }

  generateInsights(repos, user) {
    if (!repos || repos.length === 0) return "Exploração inicial detectada. Repositórios vazios.";
    
    let text = `Bem-vindo, Comandante ${user.name || user.login}. `;
    
    // Most active language
    const langCounts = {};
    repos.forEach(r => {
      if(r.language) {
        langCounts[r.language] = (langCounts[r.language] || 0) + 1;
      }
    });
    
    const entries = Object.entries(langCounts).sort((a,b) => b[1] - a[1]);
    if (entries.length > 0) {
      const topLang = entries[0][0];
      const pct = Math.round((entries[0][1] / repos.length) * 100);
      text += `Seu universo tem forte atração por ${topLang}, que representa ${pct}% das estrelas mapeadas. `;
    }

    // Stars
    const stars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
    if (stars > 100) {
      text += `Com um total de ${stars} estrelas captadas, você atrai forte campo gravitacional da comunidade. `;
    }

    // Recent activity
    const lastActive = [...repos].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
    if (lastActive) {
      text += `O ponto mais quente do seu sistema atual é o núcleo "${lastActive.name}".`;
    }

    return text;
  }

  updateChart(repos) {
    const langCounts = {};
    repos.forEach(r => {
      const l = r.language || 'Unknown';
      langCounts[l] = (langCounts[l] || 0) + 1;
    });

    const labels = Object.keys(langCounts);
    const data = Object.values(langCounts);
    const colors = labels.map(l => this.getHexForLanguage(l));

    const ctx = document.getElementById('lang-chart').getContext('2d');
    
    if (this.chart) {
      this.chart.destroy();
    }

    this.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderWidth: 1,
          borderColor: '#141622'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: window.innerWidth < 600 ? 'bottom' : 'right', 
            labels: { color: '#A0AEC0' } 
          }
        }
      }
    });
  }

  getHexForLanguage(lang) {
    const colors = {
      'JavaScript': '#f1e05a', 'TypeScript': '#3178c6', 'Python': '#3572A5',
      'Java': '#b07219', 'C#': '#178600', 'C++': '#f34b7d', 'PHP': '#4F5D95',
      'HTML': '#e34c26', 'CSS': '#563d7c', 'Ruby': '#701516', 'Go': '#00ADD8',
      'Rust': '#dea584', 'Unknown': '#4b5563'
    };
    return colors[lang] || '#8b949e';
  }
}

window.Dashboard = Dashboard;
