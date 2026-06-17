class GitHubService {
  constructor() {
    this.baseUrl = 'https://api.github.com/users';
  }

  async fetchUser(username) {
    const response = await fetch(`${this.baseUrl}/${username}`);
    if (!response.ok) {
      throw new Error(`Usuário não encontrado: ${response.status}`);
    }
    return response.json();
  }

  async fetchRepos(username) {
    const response = await fetch(`${this.baseUrl}/${username}/repos?per_page=100&sort=updated`);
    if (!response.ok) {
      throw new Error(`Erro ao buscar repositórios: ${response.status}`);
    }
    return response.json();
  }

  getDominantLanguage(repos) {
    const langs = {};
    let max = 0;
    let dominant = '-';

    repos.forEach(repo => {
      if (repo.language) {
        langs[repo.language] = (langs[repo.language] || 0) + 1;
        if (langs[repo.language] > max) {
          max = langs[repo.language];
          dominant = repo.language;
        }
      }
    });

    return dominant;
  }

  getTotalStars(repos) {
    return repos.reduce((acc, repo) => acc + repo.stargazers_count, 0);
  }
}

window.GitHubService = GitHubService;
