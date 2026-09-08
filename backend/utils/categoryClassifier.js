// Auto-detect complaint category from title + description text
// Uses a keyword-scoring algorithm (each category has weighted keywords)

const categoryKeywords = {
  water: ['paani', 'water', 'pipe', 'leak', 'tap', 'supply', 'pressure', 'tanki', 'tank', 'dhara'],
  electric: ['batti', 'light', 'electric', 'bulb', 'wire', 'switch', 'fuse', 'current', 'power', 'meter', 'short circuit'],
  lift: ['lift', 'elevator', 'button', 'floor', 'stuck'],
  sanitation: ['sewage', 'drain', 'garbage', 'dirty', 'smell', 'gandhinya', 'fohor', 'safai', 'toilet', 'gutter'],
  security: ['security', 'guard', 'theft', 'cctv', 'gate', 'stranger', 'lock', 'suraksha', 'chor', 'unsafe']
};

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\u0900-\u097F\s]/g, '').split(/\s+/).filter(Boolean);
}

function detectCategory(title, description) {
  const text = tokenize(`${title} ${description}`).join(' ');
  const scores = {};

  for (let category in categoryKeywords) {
    scores[category] = 0;
    categoryKeywords[category].forEach(keyword => {
      if (text.includes(keyword)) {
        // Title matches weighted higher than description-only matches
        scores[category] += title.toLowerCase().includes(keyword) ? 2 : 1;
      }
    });
  }

  // Pick category with highest score
  let bestCategory = 'other';
  let bestScore = 0;
  for (let category in scores) {
    if (scores[category] > bestScore) {
      bestScore = scores[category];
      bestCategory = category;
    }
  }

  return { category: bestCategory, confidence: bestScore, scores };
}

module.exports = { detectCategory };
