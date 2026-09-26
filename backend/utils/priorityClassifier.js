// Auto-detect complaint urgency from title + description text.
// Same keyword-scoring approach as categoryClassifier.js, but scores
// how SEVERE the issue sounds rather than which trade it belongs to.

const priorityKeywords = {
  urgent: [
    'fire', 'aago', 'burning', 'spark', 'sparking', 'short circuit',
    'gas leak', 'gas smell', 'flooding', 'flood', 'baadhi', 'collapse',
    'collapsing', 'dhalyo', 'danger', 'khatra', 'emergency', 'accident',
    'injured', 'injury', 'bleeding', 'electrocut', 'life threat', 'trapped'
  ],
  high: [
    'no water', 'paani xaina', 'pani aaudaina', 'water supply stopped',
    'leak', 'leaking', 'chuhirako', 'chuhiyo', 'not working', 'band bhayo',
    'broken', 'phuteko', 'security', 'chor', 'theft', 'stolen', 'break-in',
    'sewage overflow', 'overflow', 'stuck', 'lift stuck', 'power cut',
    'no electricity', 'batti gayo'
  ],
  low: [
    'paint', 'rang', 'repaint', 'cosmetic', 'minor', 'suggestion', 'sujhab',
    'request', 'aesthetic', 'decoration', 'garden', 'bagaicha', 'noise',
    'sound', 'painting', 'cleaning schedule'
  ]
};

function tokenizeText(text) {
  return text.toLowerCase();
}

// Detect the highest-severity level whose keywords appear in the text.
// Returns 'urgent' | 'high' | 'low' | null (null = no strong signal either way,
// caller should fall back to its own default, usually 'medium').
function detectPriority(title, description) {
  const text = tokenizeText(`${title} ${description}`);
  const titleText = tokenizeText(title);
  const scores = { urgent: 0, high: 0, low: 0 };

  for (const level in priorityKeywords) {
    priorityKeywords[level].forEach(keyword => {
      if (text.includes(keyword)) {
        scores[level] += titleText.includes(keyword) ? 2 : 1;
      }
    });
  }

  // Severity order matters: if both "urgent" and "high" keywords appear
  // (e.g. "small water leak turning into flooding"), prefer the more severe one.
  const order = ['urgent', 'high', 'low'];
  let best = null, bestScore = 0;
  order.forEach(level => {
    if (scores[level] > bestScore) {
      bestScore = scores[level];
      best = level;
    }
  });

  return { priority: best, confidence: bestScore, scores };
}

const SEVERITY_ORDER = ['low', 'medium', 'high', 'urgent'];

// Combine two priority levels and keep whichever is more severe.
// Used so a resident's manual choice never SUPPRESSES an auto-detected
// emergency, but a resident also can't manually claim urgent themselves.
function maxSeverity(a, b) {
  const ia = SEVERITY_ORDER.indexOf(a);
  const ib = SEVERITY_ORDER.indexOf(b);
  return ia >= ib ? a : b;
}

module.exports = { detectPriority, maxSeverity, SEVERITY_ORDER };