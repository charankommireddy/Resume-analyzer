/* ============================================================
   AI RESUME CHECKER — script.js  (v2 — Full Implementation)
   Real PDF/DOCX parsing · JD matching · ATS check · Claude AI
   ============================================================ */


/* ============================================================
   1. APPLICATION STATE
   ============================================================ */
const state = {
  currentTab: 'file',   // 'file' | 'paste'
  resumeText: '',        // Extracted / pasted resume text
  fileName: '',        // Uploaded file name
  analysisResult: null,      // Last analysis result object
  theme: 'dark',    // 'dark' | 'light'
  jdOpen: false,     // Is the JD panel expanded?
  isAnalyzing: false,     // Guard against double-clicks
};

/* Configure PDF.js worker (CDN) */
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}


/* ============================================================
   2. THEME TOGGLE
   ============================================================ */
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  document.getElementById('themeIcon').textContent = state.theme === 'dark' ? '🌙' : '☀️';
  document.getElementById('themeLabel').textContent = state.theme === 'dark' ? 'Dark' : 'Light';
}


/* ============================================================
   3. TAB SWITCHING
   ============================================================ */
function switchTab(tab) {
  state.currentTab = tab;
  document.getElementById('tab-file').classList.toggle('active', tab === 'file');
  document.getElementById('tab-paste').classList.toggle('active', tab === 'paste');
  document.getElementById('dropzone-wrap').classList.toggle('hidden', tab !== 'file');
  document.getElementById('paste-area').classList.toggle('active', tab === 'paste');
}


/* ============================================================
   4. JOB DESCRIPTION PANEL
   ============================================================ */
function toggleJD() {
  state.jdOpen = !state.jdOpen;
  const body = document.getElementById('jd-body');
  const btn = document.getElementById('jd-toggle-btn');

  body.classList.toggle('open', state.jdOpen);
  btn.classList.toggle('active', state.jdOpen);
  // Set innerHTML first, then re-query the icon (avoids stale reference)
  btn.innerHTML = `<span id="jd-toggle-icon">${state.jdOpen ? '−' : '＋'}</span> ${state.jdOpen ? 'Hide Job Description' : 'Add Job Description'}`;
}

function updateJDCharCount() {
  const text = document.getElementById('jd-textarea').value;
  const count = text.length;
  document.getElementById('jd-char-count').textContent =
    `${count.toLocaleString()} character${count !== 1 ? 's' : ''}`;
}

function clearJD() {
  document.getElementById('jd-textarea').value = '';
  updateJDCharCount();
  showToast('info', 'JD Cleared', 'Job description removed.');
}


/* ============================================================
   5. DRAG & DROP HANDLERS
   ============================================================ */
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('dropzone').classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('dropzone').classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length > 0) processFile(files[0]);
}


/* ============================================================
   6. FILE SELECTION & PROCESSING
   ============================================================ */
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

/**
 * Validates the file and kicks off extraction.
 * @param {File} file
 */
function processFile(file) {
  const validExtensions = ['.pdf', '.doc', '.docx', '.txt'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();

  if (!validExtensions.includes(ext)) {
    showToast('error', '✕ Invalid Format', 'Please upload a PDF, DOCX, DOC, or TXT file.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('error', '✕ File Too Large', 'Please upload a file under 10 MB.');
    return;
  }

  state.fileName = file.name;
  document.getElementById('attached-name').textContent = file.name;
  document.getElementById('file-attached').classList.add('visible');

  // Show progress bar then extract
  simulateProgress(() => extractTextFromFile(file));
}

/**
 * Animates a multi-step progress bar.
 * @param {Function} callback - Called after animation
 */
function simulateProgress(callback) {
  const progressEl = document.getElementById('upload-progress');
  const barEl = document.getElementById('progress-bar');
  const pctEl = document.getElementById('progress-pct');
  const labelEl = document.getElementById('progress-label-text');

  const steps = [
    { pct: 20, label: 'Reading file...' },
    { pct: 50, label: 'Extracting text...' },
    { pct: 80, label: 'Preparing data...' },
    { pct: 100, label: 'Ready!' },
  ];

  progressEl.style.display = 'block';
  let i = 0;

  const run = () => {
    if (i >= steps.length) {
      setTimeout(() => {
        progressEl.style.display = 'none';
        barEl.style.width = '0%';
        if (callback) callback();
      }, 400);
      return;
    }
    const step = steps[i++];
    barEl.style.width = step.pct + '%';
    pctEl.textContent = step.pct + '%';
    labelEl.textContent = step.label;
    setTimeout(run, 350);
  };

  run();
}

/**
 * Routes the file to the correct parser based on extension.
 * Uses PDF.js for PDFs, Mammoth.js for DOCX, FileReader for TXT.
 * @param {File} file
 */
async function extractTextFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  try {
    let text = '';

    if (ext === 'txt') {
      // ── Plain text ────────────────────────────────────────
      text = await readAsText(file);

    } else if (ext === 'pdf') {
      // ── PDF via PDF.js ────────────────────────────────────
      if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js library not loaded. Check your internet connection.');
      }
      text = await extractPDFText(file);

    } else if (ext === 'docx') {
      // ── DOCX via Mammoth.js ───────────────────────────────
      if (typeof mammoth === 'undefined') {
        throw new Error('Mammoth.js library not loaded. Check your internet connection.');
      }
      text = await extractDOCXText(file);

    } else if (ext === 'doc') {
      // ── Legacy .doc — try Mammoth, fall back gracefully ───
      try {
        text = await extractDOCXText(file);
      } catch {
        text = getExampleResumeText();
        showToast('warn', '⚠ Legacy Format', '.doc files have limited support. Demo content used.');
        return;
      }
    }

    if (!text || text.trim().length < 50) {
      throw new Error('Could not extract meaningful text from this file.');
    }

    state.resumeText = text.trim();
    showToast('success', '✓ File Loaded', `"${file.name}" is ready to analyze (${countWords(text)} words extracted).`);

  } catch (err) {
    console.error('Text extraction error:', err);
    showToast('error', '✕ Extraction Failed', err.message || 'Could not read the file. Try pasting text instead.');
    // Offer graceful fallback for demo
    state.resumeText = '';
  }
}

/**
 * Reads a file as plain text using FileReader.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

/**
 * Extracts all text from a PDF file using PDF.js.
 * Iterates each page and concatenates the text content.
 * @param {File} file
 * @returns {Promise<string>}
 */
async function extractPDFText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    // Join text items, preserving line breaks for structure
    const pageText = content.items
      .map(item => item.str + (item.hasEOL ? '\n' : ' '))
      .join('');
    fullText += pageText + '\n';
  }

  return fullText;
}

/**
 * Extracts plain text from a DOCX file using Mammoth.js.
 * @param {File} file
 * @returns {Promise<string>}
 */
async function extractDOCXText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  if (result.messages && result.messages.length > 0) {
    console.warn('Mammoth warnings:', result.messages);
  }
  return result.value;
}

/**
 * Removes the attached file and resets state.
 */
function removeFile() {
  state.resumeText = '';
  state.fileName = '';
  document.getElementById('file-attached').classList.remove('visible');
  document.getElementById('file-input').value = '';
  showToast('info', 'File Removed', 'Upload a new file to continue.');
}


/* ============================================================
   7. CHARACTER COUNT
   ============================================================ */
function updateCharCount() {
  const text = document.getElementById('resume-textarea').value;
  const count = text.length;
  document.getElementById('char-count').textContent =
    `${count.toLocaleString()} character${count !== 1 ? 's' : ''}`;
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}


/* ============================================================
   8. EXAMPLE RESUME
   ============================================================ */
function loadExample() {
  switchTab('paste');
  document.getElementById('resume-textarea').value = getExampleResumeText();
  updateCharCount();
  scrollToUpload();
  showToast('info', '📄 Example Loaded', 'An example resume has been pasted for you.');
}

/**
 * Returns a realistic example resume as plain text.
 * @returns {string}
 */
function getExampleResumeText() {
  return `JOHN SMITH
Software Engineer
john.smith@email.com | +1 (555) 234-5678 | linkedin.com/in/johnsmith | github.com/johnsmith
San Francisco, CA

SUMMARY
Results-driven Software Engineer with 5+ years of experience building scalable web applications.
Expertise in React, Node.js, Python, and cloud platforms. Passionate about clean code,
performance optimization, and delivering exceptional user experiences.

WORK EXPERIENCE

Senior Software Engineer — TechCorp Inc, San Francisco, CA (2021 – Present)
• Led development of a microservices architecture handling 2M+ daily requests using Node.js & Kubernetes
• Improved application performance by 45% through code optimization and caching strategies
• Mentored a team of 4 junior engineers and conducted code reviews
• Collaborated with product and design teams using Agile/Scrum methodology
• Built CI/CD pipelines with GitHub Actions, reducing deployment time by 60%

Software Engineer — StartupXYZ, Remote (2019 – 2021)
• Developed full-stack features using React, TypeScript, and Django REST Framework
• Designed and maintained PostgreSQL and MongoDB databases
• Integrated third-party APIs including Stripe, Twilio, and Sendgrid
• Participated in on-call rotation and resolved production incidents

Junior Developer — WebAgency, New York, NY (2018 – 2019)
• Built responsive websites for 20+ clients using HTML, CSS, JavaScript
• Maintained WordPress and Shopify e-commerce platforms

EDUCATION

Bachelor of Science, Computer Science
University of California, Berkeley — Graduated 2018
GPA: 3.7/4.0

SKILLS
Programming Languages: JavaScript, TypeScript, Python, Java, Go
Frontend: React, Next.js, Vue.js, HTML5, CSS3, Tailwind CSS
Backend: Node.js, Express, Django, FastAPI, GraphQL
Databases: PostgreSQL, MySQL, MongoDB, Redis
Cloud & DevOps: AWS, GCP, Docker, Kubernetes, Terraform, GitHub Actions
Tools: Git, Jira, Figma, Postman

CERTIFICATIONS
• AWS Certified Developer – Associate (2022)
• Google Cloud Professional Developer (2023)
• Certified Kubernetes Administrator (CKA) (2023)

PROJECTS
Open Source Contributions — github.com/johnsmith
• Contributed to React and Next.js open-source projects with 200+ GitHub stars
• Built "DevMetrics" – a developer productivity tool with 500+ weekly users`;
}


/* ============================================================
   9. CLEAR ALL
   ============================================================ */
function clearAll() {
  state.resumeText = '';
  state.fileName = '';
  document.getElementById('resume-textarea').value = '';
  document.getElementById('file-input').value = '';
  document.getElementById('file-attached').classList.remove('visible');
  document.getElementById('upload-progress').style.display = 'none';
  updateCharCount();
  hideResults();
  showToast('info', '↺ Cleared', 'All inputs have been reset.');
}


/* ============================================================
   10. MAIN ANALYSIS TRIGGER
   ============================================================ */
async function analyzeResume() {
  if (state.isAnalyzing) return;

  // Resolve resume text from active tab
  let text = state.currentTab === 'paste'
    ? document.getElementById('resume-textarea').value.trim()
    : state.resumeText.trim();

  if (!text) {
    showToast('warn', '⚠ No Content', 'Please upload a file or paste your resume text first.');
    return;
  }
  if (text.length < 100) {
    showToast('warn', '⚠ Too Short', 'Resume seems too short. Please provide more content.');
    return;
  }

  state.resumeText = text;
  state.isAnalyzing = true;
  const jdText = document.getElementById('jd-textarea')?.value.trim() || '';

  showLoading();

  try {
    // Run analysis with optional job description
    const result = await runAnalysis(text, jdText);
    state.analysisResult = result;
    hideLoading();
    renderResults(result);
    showToast('success', '✓ Analysis Complete', `Your score: ${result.score}/100`);
  } catch (err) {
    hideLoading();
    showToast('error', '✕ Analysis Failed', err.message || 'Something went wrong. Please try again.');
    console.error(err);
  } finally {
    state.isAnalyzing = false;
  }
}


/* ============================================================
   11. ANALYSIS ENGINE — DATA DEFINITIONS
   ============================================================ */

/** Resume sections to detect */
const SECTIONS = [
  { key: 'contact', label: 'Contact Information', patterns: [/email|phone|linkedin|github|address|@/i] },
  { key: 'summary', label: 'Summary / Objective', patterns: [/summary|objective|profile|about me/i] },
  { key: 'experience', label: 'Work Experience', patterns: [/experience|employment|work history|career|position/i] },
  { key: 'education', label: 'Education', patterns: [/education|university|college|degree|bachelor|master|phd|school/i] },
  { key: 'skills', label: 'Skills', patterns: [/skills|technologies|tech stack|proficiencies|expertise/i] },
  { key: 'projects', label: 'Projects', patterns: [/project|portfolio|built|developed/i] },
  { key: 'certifications', label: 'Certifications', patterns: [/certif|license|credential/i] },
  { key: 'achievements', label: 'Achievements', patterns: [/award|achievement|honor|recognition/i] },
];

/** Built-in keyword library grouped by category */
const KEYWORDS = {
  'Action Verbs': [
    'led', 'managed', 'developed', 'built', 'designed', 'improved', 'created',
    'implemented', 'collaborated', 'mentored', 'launched', 'increased',
    'reduced', 'optimized', 'delivered', 'architected', 'streamlined', 'spearheaded',
  ],
  'Soft Skills': [
    'leadership', 'communication', 'teamwork', 'problem-solving', 'collaboration',
    'analytical', 'agile', 'scrum', 'cross-functional', 'stakeholder',
  ],
  'Tech Keywords': [
    'api', 'cloud', 'database', 'frontend', 'backend', 'fullstack', 'devops',
    'ci/cd', 'microservices', 'rest', 'graphql', 'docker', 'kubernetes',
    'aws', 'python', 'javascript', 'react', 'node', 'typescript', 'git',
  ],
  'Quantifiers': [
    '%', 'million', 'billion', 'k+', 'x faster', 'users', 'clients', 'revenue',
    'growth', 'efficiency', 'performance',
  ],
};

/** Advanced skill dictionary by category */
const SKILL_DICT = {
  'Programming Languages': ['python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'go', 'rust', 'swift', 'kotlin', 'ruby', 'php', 'scala', 'r', 'matlab'],
  'Frontend Frameworks': ['react', 'angular', 'vue', 'next.js', 'nuxt', 'svelte', 'gatsby', 'tailwind', 'bootstrap', 'jquery', 'redux'],
  'Backend Frameworks': ['node.js', 'express', 'django', 'fastapi', 'flask', 'spring', 'laravel', 'rails', 'nestjs', 'graphql'],
  'Databases': ['mysql', 'postgresql', 'mongodb', 'redis', 'sqlite', 'oracle', 'dynamodb', 'elasticsearch', 'cassandra', 'firebase'],
  'Cloud Platforms': ['aws', 'gcp', 'azure', 'heroku', 'vercel', 'netlify', 'digitalocean', 'cloudflare'],
  'DevOps & Tools': ['docker', 'kubernetes', 'terraform', 'jenkins', 'github actions', 'ci/cd', 'ansible', 'nginx', 'linux', 'bash', 'git', 'jira', 'figma', 'postman'],
  'Soft Skills': ['leadership', 'communication', 'collaboration', 'problem-solving', 'agile', 'scrum', 'mentoring', 'stakeholder', 'cross-functional', 'analytical'],
};

/**
 * Escapes all special regex metacharacters in a string so it can be
 * safely embedded inside `new RegExp()`. Handles: c++, c#, node.js etc.
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Extract skills from resume text */
function extractSkills(text) {
  const lower = text.toLowerCase();
  const result = {};
  let totalMatched = 0, totalSkills = 0;

  for (const [cat, skills] of Object.entries(SKILL_DICT)) {
    result[cat] = { matched: [], missing: [] };
    for (const skill of skills) {
      totalSkills++;
      // word-boundary-aware check — escapeRegex handles c++, c#, node.js etc.
      const re = new RegExp(`(?<![a-z])${escapeRegex(skill)}(?![a-z])`, 'i');
      if (re.test(lower)) {
        result[cat].matched.push(skill);
        totalMatched++;
      } else {
        result[cat].missing.push(skill);
      }
    }
  }
  const skillScore = Math.round((totalMatched / totalSkills) * 100);
  return { skillsByCategory: result, skillScore, totalMatched, totalSkills };
}

/** Compute keyword density from text (top N keywords by frequency) */
function computeKeywordDensity(text, jdText = '', topN = 12) {
  const stopwords = STOPWORDS;
  const words = tokenize(text).filter(w => w.length >= 4 && !stopwords.has(w));
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

  // If JD provided, weight JD keywords higher
  let candidates;
  if (jdText) {
    const jdWords = new Set(tokenize(jdText).filter(w => w.length >= 4 && !stopwords.has(w)));
    candidates = Object.entries(freq)
      .sort((a, b) => {
        const aJd = jdWords.has(a[0]) ? 1 : 0;
        const bJd = jdWords.has(b[0]) ? 1 : 0;
        return (bJd - aJd) || (b[1] - a[1]);
      });
  } else {
    candidates = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  }

  return candidates.slice(0, topN).map(([kw, count]) => ({ kw, count }));
}

/** Analyze resume readability */
function analyzeReadability(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const avgWordsPerSentence = sentences.length > 0 ? Math.round(words.length / sentences.length) : 0;

  // Count passive voice patterns
  const passiveMatches = (text.match(/\b(was|were|been|is|are|being)\s+\w+ed\b/gi) || []).length;

  // Count repeated words (top offenders)
  const wordFreq = {};
  words.forEach(w => {
    const lw = w.toLowerCase().replace(/[^a-z]/g, '');
    if (lw.length > 4 && !STOPWORDS.has(lw)) wordFreq[lw] = (wordFreq[lw] || 0) + 1;
  });
  const repeatedWords = Object.entries(wordFreq).filter(([, c]) => c >= 4).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Bullet point count
  const bulletCount = (text.match(/^\s*[•\-\*]\s/gm) || []).length;

  // Count long sentences
  const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 25).length;

  // Flesch-Kincaid grade estimate (simplified)
  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  const fkGrade = sentences.length > 0
    ? Math.max(0, Math.round(0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59))
    : 0;

  const readabilityScore = Math.max(0, Math.min(100,
    100 - (passiveMatches * 5) - (longSentences * 8) - Math.max(0, (avgWordsPerSentence - 20) * 3)
  ));

  return {
    readabilityScore,
    avgWordsPerSentence,
    passiveCount: passiveMatches,
    bulletCount,
    longSentenceCount: longSentences,
    repeatedWords,
    fkGrade,
    wordCount: words.length,
  };
}

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  let count = (word.match(/[aeiouy]+/g) || []).length;
  if (word.endsWith('e') && count > 1) count--;
  return Math.max(1, count);
}

/** Generate improvement checklist */
function buildChecklist(local, skills) {
  const items = [
    { label: 'Contact Information (email + phone)', done: local.sectionResults.find(s => s.key === 'contact')?.found },
    { label: 'Professional Summary / Objective', done: local.sectionResults.find(s => s.key === 'summary')?.found },
    { label: 'Work Experience Section', done: local.sectionResults.find(s => s.key === 'experience')?.found },
    { label: 'Education Section', done: local.sectionResults.find(s => s.key === 'education')?.found },
    { label: 'Skills Section', done: local.sectionResults.find(s => s.key === 'skills')?.found },
    { label: 'Projects / Portfolio', done: local.sectionResults.find(s => s.key === 'projects')?.found },
    { label: 'Certifications / Licenses', done: local.sectionResults.find(s => s.key === 'certifications')?.found },
    { label: 'Quantified Achievements (e.g. 30%)', done: local.atsResults.find(a => a.id === 'quantified_results')?.result },
    { label: 'Action Verbs Used (≥5)', done: local.verbsUsed.length >= 5 },
    { label: 'LinkedIn Profile URL', done: /linkedin\.com/i.test(state.resumeText) },
    { label: 'GitHub / Portfolio Link', done: /github\.com|portfolio/i.test(state.resumeText) },
    { label: 'ATS-Friendly Formatting', done: local.atsScore >= 70 },
    { label: 'Technical Skills Listed', done: skills.totalMatched >= 5 },
    { label: 'Ideal Length (400–900 words)', done: local.wordCount >= 400 && local.wordCount <= 900 },
  ];
  return items;
}

/** ATS compatibility checks (enhanced) */
const ATS_CHECKS = [
  {
    id: 'standard_sections',
    label: 'Standard section headings used',
    check: (text) => /experience|education|skills/i.test(text),
  },
  {
    id: 'no_tables',
    label: 'Avoids complex tables (ATS friendly)',
    check: (text) => !/\|\s*\w+\s*\|/.test(text),
  },
  {
    id: 'contact_info',
    label: 'Contact info present (email/phone)',
    check: (text) => /@\w+\.\w+/.test(text) && /\+?\d[\d\s\-(.)]{7,}/.test(text),
  },
  {
    id: 'consistent_dates',
    label: 'Consistent date formatting',
    check: (text) => /\d{4}/.test(text),
  },
  {
    id: 'no_images',
    label: 'Plain text parseable (no image-only content)',
    check: (text) => text.length > 200,
  },
  {
    id: 'keywords_present',
    label: 'Industry keywords present (≥4 tech terms)',
    check: (text) => {
      const lower = text.toLowerCase();
      return KEYWORDS['Tech Keywords'].filter(k => lower.includes(k)).length >= 4;
    },
  },
  {
    id: 'action_verbs',
    label: 'Action verbs in experience bullets (≥4)',
    check: (text) => {
      const lower = text.toLowerCase();
      return KEYWORDS['Action Verbs'].filter(v => lower.includes(v)).length >= 4;
    },
  },
  {
    id: 'quantified_results',
    label: 'Quantified achievements (numbers/metrics)',
    check: (text) => /\d+[%+]|\d+x|\d+\s*(million|billion|k|users)/i.test(text),
  },
  {
    id: 'bullet_points',
    label: 'Bullet points used for experience',
    check: (text) => (text.match(/^\s*[•\-\*]\s/gm) || []).length >= 3,
  },
  {
    id: 'contact_completeness',
    label: 'Complete contact block (email, phone, LinkedIn)',
    check: (text) => /@\w+\.\w+/.test(text) && /\d{3}/.test(text) && /linkedin\.com/i.test(text),
  },
  {
    id: 'measurable_impact',
    label: 'Measurable impact statements present',
    check: (text) => /improved|increased|reduced|saved|grew|generated|achieved/i.test(text) && /\d+/.test(text),
  },
  {
    id: 'section_order',
    label: 'Logical section order (contact → summary → exp)',
    check: (text) => {
      const ci = text.search(/@|phone|\+1/i);
      const exp = text.search(/experience|employment/i);
      return ci < exp && ci !== -1;
    },
  },
];


/* ============================================================
   12. ANALYSIS ENGINE — CORE LOGIC
   ============================================================ */

/**
 * Orchestrates the full analysis pipeline.
 * Calls the Anthropic Claude API for intelligent suggestions,
 * with a robust local heuristic fallback.
 *
 * @param {string} resumeText - Plain-text resume
 * @param {string} jdText     - Optional job description
 * @returns {Promise<Object>} Analysis result
 */
async function runAnalysis(resumeText, jdText) {
  // Step 1: Local heuristic analysis (instant)
  const local = performLocalAnalysis(resumeText, jdText);

  // Step 2: Claude AI enrichment (async, non-blocking)
  let aiInsights = null;
  try {
    aiInsights = await fetchClaudeInsights(resumeText, jdText, local);
  } catch (err) {
    console.warn('Claude API unavailable, using local analysis only:', err.message);
  }

  // Step 3: Merge AI insights with local results
  if (aiInsights) {
    if (aiInsights.suggestions?.length) local.suggestions = aiInsights.suggestions;
    if (aiInsights.strengths?.length) local.strengths = aiInsights.strengths;
    if (aiInsights.scoreAdjustment) local.score = Math.min(100, Math.max(0, local.score + aiInsights.scoreAdjustment));
    if (aiInsights.grade) local.grade = aiInsights.grade;
    if (aiInsights.message) local.message = aiInsights.message;
    if (aiInsights.rewrites?.length) local.aiRewriteSuggestions = aiInsights.rewrites;
    local.aiPowered = true;
  }

  return local;
}

/**
 * Calls the Anthropic Claude API to get AI-powered resume insights.
 * @param {string} resumeText
 * @param {string} jdText
 * @param {Object} localResult - Pre-computed local analysis
 * @returns {Promise<Object>}
 */
async function fetchClaudeInsights(resumeText, jdText, localResult) {
  const systemPrompt = `You are a professional resume coach and ATS expert. Analyze the provided resume and return ONLY a valid JSON object. Do not include markdown, backticks, or any text outside the JSON.

The JSON must have exactly this structure:
{
  "strengths": ["string", "string", "string"],
  "suggestions": ["string", "string", "string"],
  "scoreAdjustment": number,
  "grade": { "label": "string", "color": "string" },
  "message": "string",
  "rewrites": [
    { "original": "string", "improved": "string" },
    { "original": "string", "improved": "string" },
    { "original": "string", "improved": "string" }
  ]
}

Rules:
- strengths: 3-5 specific, concrete positive observations about the resume
- suggestions: 3-6 specific, actionable improvement tips
- scoreAdjustment: integer between -10 and +10 to adjust the base score (${localResult.score})
- grade.label: one of "Excellent 🏆", "Strong 👍", "Good 📈", "Needs Work ⚠", "Weak ✕"
- grade.color: a hex color matching the grade (#34d399, #7c6af7, #f59e0b, #f87171)
- message: 1-2 sentence overall assessment
- rewrites: 3 examples of weak bullet points from the resume rewritten with strong action verbs, specific metrics, and impact. original must be an actual phrase/sentence from the resume; improved must be a stronger rewrite.
${jdText ? `\nA job description is provided — prioritize keyword gap analysis and role fit in your suggestions.` : ''}`;

  const userMessage = `RESUME:
${resumeText.slice(0, 3000)}
${jdText ? `\nJOB DESCRIPTION:\n${jdText.slice(0, 1500)}` : ''}
${jdText ? `\nLocal keyword match: ${localResult.jdMatchPct ?? 'N/A'}%` : ''}
Local base score: ${localResult.score}/100`;

  // Call Cloudflare Worker proxy — the API key stays server-side
  const response = await fetch('https://lucky-morning-5878.komminreddycharanteja.workers.dev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`API error ${response.status}: ${errData?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const raw = data.content?.[0]?.text || '';

  // Strip any markdown fences and parse JSON safely
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

/**
 * Pure heuristic analysis — runs entirely in the browser, no network required.
 * @param {string} text   - Resume text
 * @param {string} jdText - Optional job description
 * @returns {Object} Analysis result
 */
function performLocalAnalysis(text, jdText = '') {
  const lower = text.toLowerCase();

  // ── Section Detection ───────────────────────────────────────
  const sectionResults = SECTIONS.map(sec => ({
    ...sec,
    found: sec.patterns.some(p => p.test(text)),
  }));
  const sectionsFound = sectionResults.filter(s => s.found).length;
  const sectionScore = Math.round((sectionsFound / SECTIONS.length) * 100);

  // ── Built-in Keyword Detection ──────────────────────────────
  const keywordResults = {};
  let totalKwFound = 0, totalKw = 0;

  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    keywordResults[cat] = kws.map(kw => {
      const found = lower.includes(kw.toLowerCase());
      if (found) totalKwFound++;
      totalKw++;
      return { kw, found };
    });
  }
  const kwMatchPct = Math.round((totalKwFound / totalKw) * 100);

  // ── Job Description Matching ────────────────────────────────
  let jdMatchPct = null;
  let jdMatched = [];
  let jdUnmatched = [];

  if (jdText) {
    const jdTokens = tokenize(jdText);
    const resumeTokens = new Set(tokenize(text));
    // Filter for meaningful tokens (≥4 chars, not stopwords)
    const meaningful = jdTokens.filter(t => t.length >= 4 && !STOPWORDS.has(t));
    // Deduplicate
    const uniqueJdTokens = [...new Set(meaningful)];

    uniqueJdTokens.forEach(token => {
      if (resumeTokens.has(token) || lower.includes(token)) {
        jdMatched.push(token);
      } else {
        jdUnmatched.push(token);
      }
    });

    // Compute percentage BEFORE slicing so counts are accurate
    jdMatchPct = uniqueJdTokens.length > 0
      ? Math.round((jdMatched.length / Math.min(uniqueJdTokens.length, 50)) * 100)
      : 0;
    // Cap lists for display only (after percentage computed)
    jdMatched = jdMatched.slice(0, 30);
    jdUnmatched = jdUnmatched.slice(0, 20);
  }

  // ── Length Analysis ─────────────────────────────────────────
  const wordCount = countWords(text);
  const lengthScore =
    wordCount < 200 ? 40 :
      wordCount < 400 ? 65 :
        wordCount < 900 ? 90 :
          wordCount < 1500 ? 100 :
            wordCount < 2000 ? 85 : 70;

  // ── Quantified Metrics ──────────────────────────────────────
  const hasMetrics = /\d+[%+]|\d+x|\d+\s*(million|billion|k|users|clients)/i.test(text);
  const metricsScore = hasMetrics ? 100 : 40;

  // ── Contact Info ────────────────────────────────────────────
  const hasEmail = /@\w+\.\w+/.test(text);
  const hasPhone = /\+?\d[\d\s\-(.)]{7,}/.test(text);
  const hasLinkedIn = /linkedin\.com/i.test(text);
  const contactScore =
    (hasEmail ? 34 : 0) +
    (hasPhone ? 33 : 0) +
    (hasLinkedIn ? 33 : 0);

  // ── Action Verbs ────────────────────────────────────────────
  const actionVerbs = KEYWORDS['Action Verbs'];
  const verbsUsed = actionVerbs.filter(v => lower.includes(v));
  const verbScore = Math.min(100, Math.round((verbsUsed.length / actionVerbs.length) * 140));

  // ── JD Score Bonus ──────────────────────────────────────────
  const jdBonus = jdMatchPct !== null ? Math.round(jdMatchPct * 0.1) : 0;

  // ── ATS Compatibility ────────────────────────────────────────
  const atsResults = ATS_CHECKS.map(c => ({
    ...c,
    result: c.check(text),
  }));
  const atsPassed = atsResults.filter(r => r.result).length;
  const atsScore = Math.round((atsPassed / ATS_CHECKS.length) * 100);

  // ── Skill Extraction ─────────────────────────────────────────
  const skillData = extractSkills(text);

  // ── Readability ───────────────────────────────────────────────
  const readability = analyzeReadability(text);

  // ── Keyword Density ───────────────────────────────────────────
  const jdTextForDensity = jdText || '';
  const keywordDensity = computeKeywordDensity(text, jdTextForDensity);

  // ── Overall Weighted Score ───────────────────────────────────
  const overallScore = Math.min(100, Math.round(
    sectionScore * 0.20 +
    kwMatchPct * 0.15 +
    lengthScore * 0.15 +
    metricsScore * 0.12 +
    contactScore * 0.08 +
    verbScore * 0.15 +
    atsScore * 0.10 +
    jdBonus
  ));

  // ── Strengths ────────────────────────────────────────────────
  const strengths = [];
  if (hasEmail && hasPhone) strengths.push('Contact details are complete with email and phone number.');
  if (hasLinkedIn) strengths.push('LinkedIn profile URL is included — great for recruiter visibility.');
  if (hasMetrics) strengths.push('Quantified achievements with numbers and metrics detected.');
  if (verbsUsed.length >= 8) strengths.push(`Strong use of ${verbsUsed.length} action verbs (e.g. ${verbsUsed.slice(0, 3).join(', ')}).`);
  if (sectionsFound >= 5) strengths.push(`All major sections present (${sectionsFound}/${SECTIONS.length} detected).`);
  if (wordCount >= 400 && wordCount <= 900) strengths.push('Resume length is in the ideal 400–900 word range.');
  if (kwMatchPct >= 60) strengths.push(`Good keyword density — ${kwMatchPct}% of tracked keywords detected.`);
  if (/github\.com/i.test(text)) strengths.push('GitHub profile link found — valuable for tech roles.');
  if (jdMatchPct !== null && jdMatchPct >= 60) strengths.push(`Strong job description match — ${jdMatchPct}% of JD keywords found.`);
  if (strengths.length === 0) strengths.push('Your resume has been submitted. See suggestions below to improve your score.');

  // ── Suggestions ──────────────────────────────────────────────
  const suggestions = [];
  if (!hasEmail) suggestions.push('Add a professional email address to your contact section.');
  if (!hasPhone) suggestions.push('Include a phone number so recruiters can reach you easily.');
  if (!hasLinkedIn) suggestions.push('Add your LinkedIn profile URL to increase discoverability.');
  if (!hasMetrics) suggestions.push('Add quantified achievements (e.g. "increased sales by 30%") — numbers stand out to recruiters.');
  if (wordCount < 300) suggestions.push('Your resume appears short. Expand with more detail in experience and skills.');
  if (wordCount > 1500) suggestions.push('Resume may be too long (1–2 pages ideal). Consider condensing older roles.');
  if (verbsUsed.length < 5) suggestions.push('Use more action verbs (led, built, optimized) to strengthen your bullet points.');
  if (sectionsFound < 4) suggestions.push('Add missing sections: Summary, Education, Skills, and Experience are essential.');
  if (kwMatchPct < 40) suggestions.push('Include more industry keywords to improve ATS (Applicant Tracking System) performance.');
  if (!sectionResults.find(s => s.key === 'summary')?.found)
    suggestions.push('Add a professional summary at the top to hook recruiters in the first 6 seconds.');
  if (jdMatchPct !== null && jdMatchPct < 50 && jdUnmatched.length > 0)
    suggestions.push(`Add missing JD keywords: ${jdUnmatched.slice(0, 5).join(', ')} — these appear in the job description.`);
  if (atsScore < 70) suggestions.push('Improve ATS compatibility: use standard headings and avoid complex formatting.');
  if (suggestions.length === 0)
    suggestions.push('Excellent foundation! Tailor your keywords to each specific job description for best results.');

  // ── Grade ────────────────────────────────────────────────────
  const grade =
    overallScore >= 90 ? { label: 'Excellent 🏆', color: '#34d399' } :
      overallScore >= 75 ? { label: 'Strong 👍', color: '#7c6af7' } :
        overallScore >= 55 ? { label: 'Good 📈', color: '#f59e0b' } :
          overallScore >= 35 ? { label: 'Needs Work ⚠', color: '#f87171' } :
            { label: 'Weak ✕', color: '#f87171' };

  const message =
    overallScore >= 90 ? 'Outstanding resume! Well-structured, keyword-rich, and impactful.' :
      overallScore >= 75 ? 'Solid resume with most key elements. A few tweaks will make it shine.' :
        overallScore >= 55 ? 'Decent start, but there are clear areas to strengthen.' :
          overallScore >= 35 ? 'Your resume needs improvements before applying to top roles.' :
            'Resume requires major work. Start with key sections and contact info.';

  return {
    score: overallScore,
    grade, message,
    sectionScore, kwMatchPct, lengthScore, metricsScore, atsScore,
    wordCount, strengths, suggestions,
    sectionResults, keywordResults, atsResults, verbsUsed,
    jdText, jdMatchPct, jdMatched, jdUnmatched,
    skillData, readability, keywordDensity,
    aiPowered: false,
    aiRewriteSuggestions: null,
  };
}

/**
 * Tokenizes text into lowercase words.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return text.toLowerCase().match(/\b[a-z][a-z0-9+#.\-]{1,}/g) || [];
}

/** Common English stopwords to exclude from JD matching */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'with', 'that', 'this', 'have', 'from', 'they', 'will',
  'your', 'what', 'their', 'been', 'more', 'also', 'which', 'when', 'were', 'there',
  'than', 'into', 'not', 'but', 'all', 'can', 'our', 'you', 'its', 'one', 'about',
  'would', 'some', 'who', 'may', 'has', 'was', 'had', 'each', 'she', 'his', 'her',
  'him', 'them', 'these', 'those', 'such', 'both', 'very', 'over', 'just', 'like',
  'only', 'other', 'well', 'use', 'used', 'using', 'should', 'could', 'must', 'need',
]);


/* ============================================================
   13. LOADING OVERLAY
   ============================================================ */
function showLoading() {
  document.getElementById('loading-overlay').classList.add('active');
  animateLoadingSteps();
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('active');
}

function animateLoadingSteps() {
  const steps = [
    'Extracting text content...',
    'Detecting resume sections...',
    'Scanning for keywords...',
    'Checking ATS compatibility...',
    'Matching job description...',
    'Running AI analysis...',
    'Calculating overall score...',
  ];
  let i = 0;
  const el = document.getElementById('loading-steps');
  const interval = setInterval(() => {
    if (!document.getElementById('loading-overlay').classList.contains('active')) {
      clearInterval(interval);
      return;
    }
    el.textContent = steps[i % steps.length];
    i++;
  }, 600);
}


/* ============================================================
   14. RENDER RESULTS DASHBOARD
   ============================================================ */

/**
 * Populates all result UI elements from the analysis object.
 * @param {Object} r - Analysis result
 */
function renderResults(r) {
  const section = document.getElementById('results-section');
  section.classList.add('visible');

  // Update description with AI badge if applicable
  const summaryEl = document.getElementById('results-summary-text');
  summaryEl.innerHTML = r.aiPowered
    ? 'Analysis complete <span style="background:rgba(124,106,247,0.15);border:1px solid rgba(124,106,247,0.4);color:var(--accent2);padding:2px 8px;border-radius:50px;font-size:0.7rem;letter-spacing:0.05em;">✦ AI-POWERED</span> — here\'s your detailed breakdown.'
    : 'Analysis complete — here\'s your detailed breakdown.';

  // ── Circular Score Gauge ─────────────────────────────────────
  const circumference = 283;
  const dashOffset = circumference - (circumference * r.score / 100);
  const scoreColor =
    r.score >= 75 ? '#34d399' :
      r.score >= 55 ? '#7c6af7' :
        r.score >= 35 ? '#f59e0b' : '#f87171';

  const circle = document.getElementById('score-fill-circle');
  circle.style.stroke = scoreColor;
  circle.style.strokeDasharray = circumference;
  setTimeout(() => { circle.style.strokeDashoffset = dashOffset; }, 50);

  animateNumber('score-val', 0, r.score, 1200);

  document.getElementById('score-grade').textContent = r.grade.label;
  document.getElementById('score-grade').style.color = r.grade.color;
  document.getElementById('score-message').textContent = r.message;

  // ── Mini Progress Bars ───────────────────────────────────────
  const miniStats = document.getElementById('mini-stats');
  const miniItems = [
    { label: 'Section Coverage', val: r.sectionScore, color: '#7c6af7' },
    { label: 'Keyword Match', val: r.kwMatchPct, color: '#c084fc' },
    { label: 'Content Depth', val: r.lengthScore, color: '#34d399' },
    { label: 'ATS Score', val: r.atsScore, color: '#60a5fa' },
  ];
  if (r.jdMatchPct !== null) {
    miniItems.push({ label: 'JD Match', val: r.jdMatchPct, color: '#f59e0b' });
  }

  miniStats.innerHTML = miniItems.map(s => `
    <div class="mini-stat-item">
      <label>
        <span>${s.label}</span>
        <span>${s.val}%</span>
      </label>
      <div class="mini-bar">
        <div class="mini-bar-fill" style="background:${s.color}" data-target="${s.val}"></div>
      </div>
    </div>
  `).join('');

  setTimeout(() => {
    miniStats.querySelectorAll('.mini-bar-fill').forEach(el => {
      el.style.width = el.dataset.target + '%';
    });
  }, 50);

  // ── Build Result Cards ───────────────────────────────────────
  const grid = document.getElementById('results-grid');
  grid.innerHTML = '';

  // Card 1 — Strengths
  grid.appendChild(buildCard({
    icon: '✅', iconClass: 'green', title: 'Strengths Detected',
    content: r.strengths.map(s => `
      <div class="strength-item">
        <span class="strength-icon">✦</span>
        <span>${escapeHTML(s)}</span>
      </div>`).join(''),
    delay: '0.1s',
  }));

  // Card 2 — Suggestions
  grid.appendChild(buildCard({
    icon: '💡', iconClass: 'yellow', title: 'Improvement Tips',
    content: r.suggestions.map(s => `
      <div class="suggestion-item">${escapeHTML(s)}</div>`).join(''),
    delay: '0.2s',
  }));

  // Card 3 — Section Completeness
  grid.appendChild(buildCard({
    icon: '📋', iconClass: 'purple', title: 'Section Completeness',
    content: r.sectionResults.map(sec => `
      <div class="section-item">
        <span class="check-badge ${sec.found ? 'found' : 'missing'}">${sec.found ? '✓' : '✕'}</span>
        <span class="section-name">${sec.label}</span>
        <span class="section-status">${sec.found ? 'Found' : 'Missing'}</span>
      </div>`).join(''),
    delay: '0.3s',
  }));

  // Card 4 — Keyword Analysis (built-in library)
  const allKeywords = Object.values(r.keywordResults).flat();
  const kwFound = allKeywords.filter(k => k.found).length;

  grid.appendChild(buildCard({
    icon: '🔑', iconClass: 'blue', title: 'Keyword Analysis',
    content: `
      <div class="keyword-meta">${kwFound}/${allKeywords.length} library keywords matched</div>
      <div class="kw-bar-wrap">
        <div class="kw-bar-fill" id="kw-bar" style="width:0%"></div>
      </div>
      <div class="keyword-wrap">
        ${allKeywords.slice(0, 28).map(k =>
      `<span class="keyword-tag ${k.found ? 'found' : 'missing'}">${escapeHTML(k.kw)}</span>`
    ).join('')}
      </div>`,
    delay: '0.4s',
  }));

  setTimeout(() => {
    const kwBar = document.getElementById('kw-bar');
    if (kwBar) kwBar.style.width = r.kwMatchPct + '%';
  }, 100);

  // Card 5 — ATS Compatibility
  grid.appendChild(buildCard({
    icon: '🤖', iconClass: 'teal', title: 'ATS Compatibility',
    content: `
      <div class="keyword-meta" style="margin-bottom:14px">${r.atsResults.filter(a => a.result).length}/${r.atsResults.length} checks passed · Score: ${r.atsScore}%</div>
      ${r.atsResults.map(a => `
        <div class="ats-item">
          <div class="ats-dot ${a.result ? 'pass' : 'fail'}"></div>
          <span class="ats-label">${escapeHTML(a.label)}</span>
          <span class="ats-status ${a.result ? 'pass' : 'fail'}">${a.result ? 'PASS' : 'FAIL'}</span>
        </div>`).join('')}`,
    delay: '0.5s',
  }));

  // Card 6 — Job Description Match (only if JD provided)
  if (r.jdText && r.jdMatchPct !== null) {
    grid.appendChild(buildCard({
      icon: '🎯', iconClass: 'yellow', title: `JD Match — ${r.jdMatchPct}%`,
      content: `
        <div class="keyword-meta">${r.jdMatched.length} keywords matched · ${r.jdUnmatched.length} missing from resume</div>
        <div class="kw-bar-wrap">
          <div class="kw-bar-fill" id="jd-bar" style="width:0%;background:linear-gradient(90deg,#34d399,#60a5fa)"></div>
        </div>
        ${r.jdMatched.length > 0 ? `
          <div style="font-size:0.75rem;color:var(--text3);margin:10px 0 6px">✓ Matched keywords</div>
          <div class="keyword-wrap">
            ${r.jdMatched.slice(0, 20).map(k =>
        `<span class="jd-match-tag matched">${escapeHTML(k)}</span>`
      ).join('')}
          </div>` : ''}
        ${r.jdUnmatched.length > 0 ? `
          <div style="font-size:0.75rem;color:var(--text3);margin:12px 0 6px">✕ Missing from resume</div>
          <div class="keyword-wrap">
            ${r.jdUnmatched.slice(0, 15).map(k =>
        `<span class="jd-match-tag unmatched">${escapeHTML(k)}</span>`
      ).join('')}
          </div>` : ''}`,
      delay: '0.6s',
    }));

    setTimeout(() => {
      const jdBar = document.getElementById('jd-bar');
      if (jdBar) jdBar.style.width = r.jdMatchPct + '%';
    }, 100);
  }

  // Card 7 — Advanced Skill Extraction
  if (r.skillData) {
    const sd = r.skillData;
    const catKeys = Object.keys(sd.skillsByCategory).filter(cat => sd.skillsByCategory[cat].matched.length > 0 || sd.skillsByCategory[cat].missing.length > 0);
    let skillContent = `
      <div class="skill-score-badge">🎯 Skill Match: ${sd.skillScore}% · ${sd.totalMatched}/${sd.totalSkills} detected</div>`;

    for (const cat of catKeys) {
      const { matched, missing } = sd.skillsByCategory[cat];
      if (matched.length === 0 && missing.length === 0) continue;
      skillContent += `<div class="skill-category-label">${escapeHTML(cat)}</div>
        <div class="keyword-wrap" style="margin-bottom:8px">
          ${matched.map(s => `<span class="skill-tag matched">✓ ${escapeHTML(s)}</span>`).join('')}
          ${missing.slice(0, 4).map(s => `<span class="skill-tag missing">${escapeHTML(s)}</span>`).join('')}
        </div>`;
    }

    grid.appendChild(buildCard({
      icon: '🧠', iconClass: 'purple', title: 'Skill Extraction',
      content: skillContent,
      delay: '0.7s',
    }));
  }

  // Card 8 — Resume Readability
  if (r.readability) {
    const rd = r.readability;
    const readScore = rd.readabilityScore;
    const readColor = readScore >= 75 ? '#34d399' : readScore >= 50 ? '#f59e0b' : '#f87171';
    const readLabel = readScore >= 75 ? 'Good' : readScore >= 50 ? 'Fair' : 'Needs Work';

    grid.appendChild(buildCard({
      icon: '📖', iconClass: 'blue', title: 'Resume Readability',
      content: `
        <div class="readability-metric">
          <span class="readability-label">Readability Score</span>
          <span class="readability-val" style="color:${readColor}">${readScore}/100 · ${readLabel}</span>
        </div>
        <div class="readability-metric">
          <span class="readability-label">Avg. Words / Sentence</span>
          <span class="readability-val">${rd.avgWordsPerSentence} <span style="font-size:0.7rem;color:var(--text3)">(ideal: ≤20)</span></span>
        </div>
        <div class="readability-metric">
          <span class="readability-label">Passive Voice Instances</span>
          <span class="readability-val" style="color:${rd.passiveCount > 3 ? '#f87171' : 'var(--text)'}">${rd.passiveCount}</span>
        </div>
        <div class="readability-metric">
          <span class="readability-label">Bullet Points Detected</span>
          <span class="readability-val">${rd.bulletCount}</span>
        </div>
        <div class="readability-metric">
          <span class="readability-label">Long Sentences (>25 words)</span>
          <span class="readability-val" style="color:${rd.longSentenceCount > 2 ? '#f59e0b' : 'var(--text)'}">${rd.longSentenceCount}</span>
        </div>
        ${rd.repeatedWords.length > 0 ? `
        <div class="readability-metric" style="border-bottom:none">
          <span class="readability-label">Overused Words</span>
          <span class="readability-val" style="font-size:0.75rem;color:var(--warn)">${rd.repeatedWords.map(([w, c]) => `${w}(×${c})`).join(', ')}</span>
        </div>` : ''}`,
      delay: '0.75s',
    }));
  }

  // Card 9 — Improvement Checklist
  const checklist = buildChecklist(r, r.skillData || { totalMatched: 0 });
  const doneCount = checklist.filter(i => i.done).length;
  grid.appendChild(buildCard({
    icon: '✅', iconClass: 'teal', title: `Resume Checklist — ${doneCount}/${checklist.length}`,
    content: checklist.map(item => `
      <div class="checklist-item">
        <span class="checklist-icon">${item.done ? '✅' : '⬜'}</span>
        <span class="checklist-label">${escapeHTML(item.label)}</span>
        <span class="checklist-badge ${item.done ? 'done' : 'todo'}">${item.done ? 'Done' : 'Todo'}</span>
      </div>`).join(''),
    delay: '0.8s',
  }));

  // Card 10 — Keyword Density Chart
  if (r.keywordDensity && r.keywordDensity.length > 0) {
    const maxCount = r.keywordDensity[0].count;
    const colors = ['#7c6af7', '#c084fc', '#34d399', '#60a5fa', '#f59e0b', '#f87171', '#7c6af7', '#c084fc', '#34d399', '#60a5fa', '#f59e0b', '#f87171'];
    grid.appendChild(buildCard({
      icon: '📊', iconClass: 'blue', title: 'Keyword Density',
      content: `
        <div class="keyword-meta" style="margin-bottom:12px">Top keywords by frequency in your resume</div>
        ${r.keywordDensity.map((item, i) => `
          <div class="density-bar-row">
            <span class="density-kw">${escapeHTML(item.kw)}</span>
            <div class="density-track">
              <div class="density-fill" style="width:0%;background:${colors[i % colors.length]}" data-w="${Math.round((item.count / maxCount) * 100)}"></div>
            </div>
            <span class="density-count">×${item.count}</span>
          </div>`).join('')}`,
      delay: '0.85s',
    }));

    setTimeout(() => {
      document.querySelectorAll('.density-fill').forEach(el => {
        el.style.width = el.dataset.w + '%';
      });
    }, 100);
  }

  // Card 11 — AI Rewrite Suggestions (only if AI is powered)
  if (r.aiRewriteSuggestions && r.aiRewriteSuggestions.length > 0) {
    grid.appendChild(buildCard({
      icon: '✨', iconClass: 'purple', title: 'AI Resume Rewrite Suggestions',
      content: `
        <div class="keyword-meta" style="margin-bottom:12px">AI-powered rewrites using stronger action verbs & metrics</div>
        ${r.aiRewriteSuggestions.map(rw => `
          <div class="rewrite-item">
            <div class="rewrite-orig">✕ ${escapeHTML(rw.original)}</div>
            <div class="rewrite-arrow">↓ Improved</div>
            <div class="rewrite-new">✓ ${escapeHTML(rw.improved)}</div>
          </div>`).join('')}`,
      delay: '0.9s',
    }));
  }

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Creates a result card DOM element.
 * @param {Object} opts
 * @returns {HTMLElement}
 */
function buildCard({ icon, iconClass, title, content, delay }) {
  const card = document.createElement('div');
  card.className = 'result-card';
  card.style.animationDelay = delay;
  card.innerHTML = `
    <div class="card-header">
      <div class="card-icon ${iconClass}">${icon}</div>
      <span class="card-title">${escapeHTML(title)}</span>
    </div>
    ${content}
  `;
  return card;
}

/**
 * Animates a number from `from` to `to` in the given duration.
 * @param {string} id       - Element ID
 * @param {number} from
 * @param {number} to
 * @param {number} duration - ms
 */
function animateNumber(id, from, to, duration) {
  const el = document.getElementById(id);
  const start = performance.now();
  const update = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * ease);
    if (t < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

/** Hides the results section. */
function hideResults() {
  document.getElementById('results-section').classList.remove('visible');
}

/** Sanitises HTML to prevent XSS from resume content. */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


/* ============================================================
   15. RESULTS ACTIONS
   ============================================================ */
function reanalyze() {
  scrollToUpload();
  hideResults();
  showToast('info', '↺ Ready', 'Edit your resume and analyze again.');
}

function scrollToUpload() {
  document.getElementById('upload').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Generates a professional PDF report using jsPDF and triggers download.
 */
function downloadReport() {
  const r = state.analysisResult;
  if (!r) return;

  // Fallback to text if jsPDF not loaded
  if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
    downloadTextReport(r);
    return;
  }

  try {
    const { jsPDF } = window.jspdf || { jsPDF: window.jsPDF };
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210, margin = 18, contentW = pageW - margin * 2;
    let y = 20;

    const addText = (text, fontSize, color, bold, x = margin) => {
      doc.setFontSize(fontSize);
      doc.setTextColor(...color);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(String(text), contentW);
      doc.text(lines, x, y);
      y += lines.length * (fontSize * 0.45) + 3;
    };

    const addDivider = (color = [80, 80, 120]) => {
      doc.setDrawColor(...color);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 5;
    };

    const checkPage = (needed = 20) => {
      if (y + needed > 275) { doc.addPage(); y = 20; }
    };

    // Header
    doc.setFillColor(30, 30, 46);
    doc.rect(0, 0, 210, 36, 'F');
    doc.setFontSize(20); doc.setTextColor(232, 232, 240); doc.setFont('helvetica', 'bold');
    doc.text('AI Resume Checker', margin, 16);
    doc.setFontSize(9); doc.setTextColor(152, 152, 184); doc.setFont('helvetica', 'normal');
    doc.text(`Detailed Analysis Report · Generated ${new Date().toLocaleString()}`, margin, 25);
    doc.setFontSize(9); doc.setTextColor(192, 132, 252);
    doc.text(`Powered by Claude AI (Anthropic)`, margin, 31);
    y = 46;

    // Score Section
    addText(`Overall Score: ${r.score}/100 · ${r.grade.label}`, 16, [124, 106, 247], true);
    addText(r.message, 9, [152, 152, 184], false);
    y += 2; addDivider();

    // Score Breakdown
    addText('SCORE BREAKDOWN', 11, [192, 132, 252], true);
    y += 1;
    const breakdown = [
      ['Section Coverage', r.sectionScore + '%'],
      ['Keyword Match', r.kwMatchPct + '%'],
      ['Content Depth', r.lengthScore + '%'],
      ['ATS Score', r.atsScore + '%'],
      ...(r.jdMatchPct !== null ? [['JD Match', r.jdMatchPct + '%']] : []),
      ...(r.skillData ? [['Skill Match', r.skillData.skillScore + '%']] : []),
    ];
    breakdown.forEach(([label, val]) => {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(152, 152, 184);
      doc.text(label + ':', margin + 2, y);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(232, 232, 240);
      doc.text(val, margin + 55, y);
      y += 6;
    });
    y += 2; addDivider();

    // Strengths
    checkPage(30);
    addText('STRENGTHS', 11, [52, 211, 153], true);
    r.strengths.forEach(s => { checkPage(10); addText('✦  ' + s, 9, [152, 152, 184], false); });
    y += 2; addDivider();

    // Suggestions
    checkPage(30);
    addText('IMPROVEMENT SUGGESTIONS', 11, [245, 158, 11], true);
    r.suggestions.forEach(s => { checkPage(10); addText('→  ' + s, 9, [152, 152, 184], false); });
    y += 2; addDivider();

    // Section Completeness
    checkPage(30);
    addText('SECTION COMPLETENESS', 11, [96, 165, 250], true);
    r.sectionResults.forEach(s => {
      checkPage(8);
      const icon = s.found ? '[✓]' : '[✕]';
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.setTextColor(s.found ? 52 : 248, s.found ? 211 : 113, s.found ? 153 : 113);
      doc.text(icon + ' ' + s.label, margin + 2, y);
      y += 6;
    });
    y += 2; addDivider();

    // ATS Checks
    checkPage(30);
    addText(`ATS COMPATIBILITY — ${r.atsScore}%`, 11, [20, 184, 166], true);
    r.atsResults.forEach(a => {
      checkPage(8);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.setTextColor(a.result ? 52 : 248, a.result ? 211 : 113, a.result ? 153 : 113);
      doc.text((a.result ? '[PASS] ' : '[FAIL] ') + a.label, margin + 2, y);
      y += 6;
    });
    y += 2; addDivider();

    // Skill Summary
    if (r.skillData) {
      checkPage(30);
      addText(`SKILLS DETECTED — ${r.skillData.skillScore}% (${r.skillData.totalMatched}/${r.skillData.totalSkills})`, 11, [192, 132, 252], true);
      for (const [cat, { matched }] of Object.entries(r.skillData.skillsByCategory)) {
        if (matched.length === 0) continue;
        checkPage(10);
        addText(`${cat}: ${matched.join(', ')}`, 9, [152, 152, 184], false);
      }
      y += 2; addDivider();
    }

    // AI Rewrites
    if (r.aiRewriteSuggestions?.length) {
      checkPage(40);
      addText('AI REWRITE SUGGESTIONS', 11, [192, 132, 252], true);
      r.aiRewriteSuggestions.forEach(rw => {
        checkPage(20);
        addText('Original:  ' + rw.original, 9, [152, 152, 184], false);
        addText('Improved: ' + rw.improved, 9, [52, 211, 153], false);
        y += 2;
      });
      addDivider();
    }

    // JD Match
    if (r.jdText && r.jdMatchPct !== null) {
      checkPage(30);
      addText(`JOB DESCRIPTION MATCH — ${r.jdMatchPct}%`, 11, [245, 158, 11], true);
      addText('Matched: ' + r.jdMatched.slice(0, 20).join(', '), 9, [152, 152, 184], false);
      addText('Missing: ' + r.jdUnmatched.slice(0, 15).join(', '), 9, [248, 113, 113], false);
      y += 2; addDivider();
    }

    // Footer
    checkPage(15);
    doc.setFontSize(8); doc.setTextColor(80, 80, 120); doc.setFont('helvetica', 'italic');
    doc.text('Generated by AI Resume Checker · Powered by Anthropic Claude AI', margin, y + 5);

    doc.save(`resume-analysis-${Date.now()}.pdf`);
    showToast('success', '⬇ PDF Downloaded', 'Your professional report has been saved.');
  } catch (err) {
    console.error('PDF generation failed:', err);
    downloadTextReport(r);
  }
}

/**
 * Fallback: plain text report download.
 */
function downloadTextReport(r) {
  const divider = '='.repeat(56);
  const sub = '-'.repeat(36);

  const lines = [
    'AI RESUME CHECKER — DETAILED ANALYSIS REPORT',
    divider,
    `Date:              ${new Date().toLocaleString()}`,
    `Overall Score:     ${r.score}/100`,
    `Grade:             ${r.grade.label}`,
    `Word Count:        ${r.wordCount}`,
    `AI-Powered:        ${r.aiPowered ? 'Yes (Claude AI)' : 'No (local analysis)'}`,
    '',
    'SCORE BREAKDOWN',
    sub,
    `Section Coverage:  ${r.sectionScore}%`,
    `Keyword Match:     ${r.kwMatchPct}%`,
    `Content Depth:     ${r.lengthScore}%`,
    `ATS Score:         ${r.atsScore}%`,
    ...(r.jdMatchPct !== null ? [`JD Match:          ${r.jdMatchPct}%`] : []),
    ...(r.skillData ? [`Skill Match:       ${r.skillData.skillScore}%`] : []),
    '',
    'STRENGTHS',
    sub,
    ...r.strengths.map(s => `• ${s}`),
    '',
    'IMPROVEMENT SUGGESTIONS',
    sub,
    ...r.suggestions.map(s => `• ${s}`),
    '',
    'SECTION COMPLETENESS',
    sub,
    ...r.sectionResults.map(s => `[${s.found ? '✓' : '✕'}] ${s.label}`),
    '',
    'ATS COMPATIBILITY',
    sub,
    ...r.atsResults.map(a => `[${a.result ? 'PASS' : 'FAIL'}] ${a.label}`),
    '',
    'ACTION VERBS DETECTED',
    sub,
    r.verbsUsed.join(', ') || 'None detected',
    ...(r.jdText ? [
      '',
      'JOB DESCRIPTION MATCH',
      sub,
      `Match Rate: ${r.jdMatchPct}%`,
      `Matched Keywords:  ${r.jdMatched.slice(0, 20).join(', ')}`,
      `Missing Keywords:  ${r.jdUnmatched.slice(0, 15).join(', ')}`,
    ] : []),
    '',
    divider,
    'Generated by AI Resume Checker',
    'Powered by Claude AI (Anthropic)',
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `resume-analysis-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);

  showToast('success', '⬇ Downloaded', 'Your full report has been saved.');
}


/* ============================================================
   16. TOAST NOTIFICATIONS
   ============================================================ */

/**
 * Displays a self-dismissing toast notification.
 * @param {'success'|'error'|'warn'|'info'} type
 * @param {string} title
 * @param {string} message
 */
function showToast(type, title, message) {
  const icons = { success: '✓', error: '✕', warn: '⚠', info: 'ℹ' };
  const container = document.getElementById('toast-container');

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <div>
      <div style="font-weight:700;font-size:0.82rem;margin-bottom:2px;">${escapeHTML(title)}</div>
      <div style="color:var(--text2);font-size:0.75rem;">${escapeHTML(message)}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 350);
  }, 4500);
}
