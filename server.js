const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

loadEnvFile();

const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');
const geminiModel = 'gemini-3.6-flash';

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function parseGeminiJson(text) {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  return Array.isArray(parsed) ? parsed : parsed.articles;
}

async function getNews(topic, category) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Add it to a .env file.');
  }

  const focus = topic ? `Focus on the topic: "${topic}".` : `Focus on the ${category.toLowerCase()} category.`;
  const sectionRule = category === 'Top stories'
    ? 'For Top stories, select a balanced mix of the most important news.'
    : `Every article must be strictly about ${category} news. Do not include stories from any other section.`;
  const prompt = `You are the editorial desk for a concise daily news app. ${focus}
${sectionRule}
Create exactly 8 current, factual news briefings based on information available to you. If live verification is unavailable, be transparent in the summary and do not invent exact quotes, numbers, or events.
Return only a JSON array. Each item must have exactly these fields:
- title: short headline
- summary: 2 concise sentences
- category: one of India, World, Business, Technology, Science, Culture, Sports
- source: a plausible publication name, without a URL
- time: a short relative label such as "2h ago"
- accent: one of coral, mint, blue, gold, violet
- image: a stable Unsplash source URL using https://images.unsplash.com/ and a relevant photo
No markdown and no extra keys.`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const result = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
    })
  });

  const payload = await result.json();
  if (!result.ok) {
    throw new Error(payload.error?.message || `Gemini returned HTTP ${result.status}`);
  }

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response.');
  const articles = parseGeminiJson(text);
  if (!Array.isArray(articles) || articles.length === 0) throw new Error('Gemini returned an unexpected news format.');
  if (category === 'Top stories') return articles;

  const matchingArticles = articles.filter((article) =>
    String(article.category || '').trim().toLowerCase() === category.toLowerCase()
  );
  if (matchingArticles.length === 0) {
    throw new Error(`Gemini did not return valid ${category} stories. Please try again.`);
  }
  return matchingArticles;
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/news') {
    try {
      const topic = requestUrl.searchParams.get('topic')?.trim() || '';
      const category = requestUrl.searchParams.get('category')?.trim() || 'Top stories';
      const articles = await getNews(topic, category);
      return sendJson(response, 200, { articles });
    } catch (error) {
      const status = /quota|rate limit|too many requests/i.test(error.message) ? 429 : 500;
      return sendJson(response, status, { error: error.message });
    }
  }

  const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const filePath = path.normalize(path.join(publicDir, requestedPath));
  if (!filePath.startsWith(publicDir)) return sendJson(response, 404, { error: 'Not found' });

  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(response, 404, { error: 'Not found' });
    const extension = path.extname(filePath);
    const contentTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
    response.writeHead(200, { 'Content-Type': `${contentTypes[extension] || 'text/plain'}; charset=utf-8` });
    response.end(content);
  });
}

http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => sendJson(response, 500, { error: error.message }));
}).listen(port, () => {
  console.log(`news.daily is running at http://localhost:${port}`);
});
