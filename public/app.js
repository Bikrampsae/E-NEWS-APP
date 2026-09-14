const grid = document.querySelector('#news-grid');
const errorState = document.querySelector('#error-state');
const title = document.querySelector('#feed-title');
const count = document.querySelector('#story-count');
const topicInput = document.querySelector('#topic-input');
let selectedCategory = 'Top stories';

const accents = { coral: '#f07b62', mint: '#bde9d7', blue: '#c8e3f5', gold: '#f1d17d', violet: '#d9c9f0' };

function showLoading() {
  errorState.hidden = true;
  grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join('');
}

function renderArticles(articles) {
  count.textContent = `${articles.length} stories`;
  grid.innerHTML = articles.map((article, index) => `
    <article class="card" style="animation-delay: ${Math.min(index, 5) * 0.05}s">
      <div class="card-image" style="background: ${accents[article.accent] || accents.blue}">
        <img src="${escapeAttribute(article.image)}" alt="" loading="lazy" onerror="this.style.display='none'">
      </div>
      <div class="card-body">
        <div class="card-label"><span>${escapeHtml(article.category || selectedCategory)}</span><span>${escapeHtml(article.time || 'Today')}</span></div>
        <h3>${escapeHtml(article.title)}</h3>
        <p>${escapeHtml(article.summary)}</p>
        <div class="card-meta"><span>${escapeHtml(article.source || 'News desk')}</span><span>Read brief ↗</span></div>
      </div>
    </article>
  `).join('');
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}
function escapeAttribute(value = '') { return escapeHtml(value); }

async function loadNews() {
  showLoading();
  const topic = topicInput.value.trim();
  title.textContent = topic || selectedCategory;
  const params = new URLSearchParams({ category: selectedCategory });
  if (topic) params.set('topic', topic);

  try {
    const response = await fetch(`/api/news?${params}`);
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Unable to load stories.');
      error.status = response.status;
      throw error;
    }
    renderArticles(data.articles);
    localStorage.setItem(`news.daily:${params}`, JSON.stringify({ articles: data.articles, savedAt: Date.now() }));
  } catch (error) {
    const cached = localStorage.getItem(`news.daily:${params}`);
    if (cached) {
      try {
        const saved = JSON.parse(cached);
        renderArticles(saved.articles);
        errorState.hidden = false;
        errorState.innerHTML = `<strong>Showing your last briefing.</strong><br>Gemini is temporarily unavailable. New stories will appear when the quota resets.`;
        return;
      } catch {
        localStorage.removeItem(`news.daily:${params}`);
      }
    }

    if (error.status === 429) {
      renderArticles([{
        title: 'Fresh stories are temporarily paused',
        summary: 'Gemini has reached its current request quota. Your live briefing will return when the quota resets or the API plan is upgraded.',
        category: selectedCategory,
        source: 'news.daily',
        time: 'Quota notice',
        accent: 'gold',
        image: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&q=80'
      }]);
      errorState.hidden = false;
      errorState.innerHTML = '<strong>Live updates are paused.</strong><br>Gemini API quota has been reached. No fake news is being shown.';
      return;
    }

    grid.innerHTML = '';
    errorState.hidden = false;
    const message = error.status === 429
      ? 'Gemini API quota reached. Please wait for the limit to reset or check your Google AI plan and billing details.'
      : error.message;
    errorState.innerHTML = `<strong>Could not refresh the briefing.</strong><br>${escapeHtml(message)}<br><br>Your API key is configured in <code>.env</code>.`;
  }
}

document.querySelector('#search-form').addEventListener('submit', (event) => { event.preventDefault(); loadNews(); });
document.querySelectorAll('.category').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.category').forEach((item) => { item.classList.remove('active'); item.setAttribute('aria-selected', 'false'); });
  button.classList.add('active');
  button.setAttribute('aria-selected', 'true');
  selectedCategory = button.dataset.category;
  topicInput.value = '';
  loadNews();
}));

loadNews();
