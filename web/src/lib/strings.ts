/**
 * All UI strings — i18n discipline (§29.6). No hardcoded English in components.
 * Import from here. Add new strings here, not in JSX.
 */

// Canonical (English) dictionary (F2.6). Other locales in ./locales override
// a subset; anything they don't provide falls back to English.
const en = {
  // Global
  appName: 'PromptForge',
  tagline: 'Draft great AI prompts in seconds.',
  loading: 'Loading…',
  error: 'Something went wrong. Please try again.',
  close: 'Close',
  back: 'Back',
  next: 'Next',
  submit: 'Submit',
  cancel: 'Cancel',
  save: 'Save',
  edit: 'Edit',
  copy: 'Copy',
  copied: 'Copied!',
  done: 'Done',

  // Nav
  navHome: 'Home',
  navTry: 'Try now',
  navBuild: 'Build',
  navEnhance: 'Enhance',
  navLibrary: 'Library',
  navHistory: 'History',
  navAccount: 'Account',
  navSignIn: 'Sign in',
  navSignUp: 'Sign up',
  navSignOut: 'Sign out',

  // Auth
  authSignUp: 'Create your free account',
  authSignIn: 'Sign in',
  authSignOut: 'Sign out',
  authEmail: 'Email',
  authPassword: 'Password',
  authName: 'Display name',
  authResetPassword: 'Reset password',
  authSendReset: 'Send reset link',
  authNoAccount: "Don't have an account?",
  authHasAccount: 'Already have an account?',
  authSignUpSuccess: 'Check your email for the confirmation link.',
  authResetSent: 'Check your email for the reset link.',
  authErrorGeneric: 'Authentication error. Please try again.',
  authErrorInvalid: 'Invalid email or password.',
  authPending: 'Please wait…',

  // Landing page
  landingHero: 'Turn rough ideas into excellent AI prompts.',
  landingSubtitle: 'Tell us what you want to create, and we\'ll help you craft a prompt that works — for Midjourney, ChatGPT, Claude, Gemini, Stable Diffusion, and more.',
  landingCta: 'Try it now — no account needed',
  landingLearnMore: 'How it works',
  landingFeature1: 'Every prompt is built from the platform’s own docs — real syntax, real quirks, cited sources.',
  landingFeature2: 'An 8-dimension quality score with a breakdown, so you know exactly why a prompt works.',
  landingFeature3: 'Edit the prompt node-by-node or refine it by chat — never a wall of text you can’t change.',
  landingFeatureTitle1: 'Grounded in the docs',
  landingFeatureTitle2: 'Scored, not guessed',
  landingFeatureTitle3: 'Editable, node by node',
  landingBadge: 'Reverse-prompting for every AI platform',
  landingLibraryTitle: 'A library of proven prompts',
  landingLibraryBody: 'Browse 24+ battle-tested prompts across 8 niches — copy one, or open it in the builder and make it yours.',
  landingPlatformsTitle: 'Learn any platform',
  landingPlatformsBody: 'Guides for Gemini, ChatGPT, Claude, Midjourney and more — how each one thinks and how to prompt it well.',
  landingBrowse: 'Browse the library',
  landingExplore: 'Explore platforms',

  // Try flow
  tryTitle: 'Try it now',
  tryDescription: 'Pick an example to see what PromptForge can do. No account needed.',
  tryPickExample: 'Choose an example',
  trySignupBanner: 'Sign up free to save, edit node-by-node, and build your own prompts.',
  tryRateLimited: 'You\'ve used all your demo tries today. Create a free account for unlimited drafting.',
  tryJustGenerate: 'Just generate now',

  // Preview
  previewLabel: 'Likely result',
  previewLabelShort: 'Preview',
  previewUnavailable: 'Preview unavailable.',
  previewLoading: 'Generating preview…',

  // Build / clarify
  buildTitle: 'Build a prompt',
  buildIdeaLabel: 'What do you want to create?',
  buildIdeaPlaceholder: 'e.g. "an image of a horse running at sunset"',
  buildPlatformLabel: 'Target platform',
  buildHelpRefine: 'Help me refine it',
  buildJustGenerate: 'Just generate now',
  buildClarifyProgress: (answered: number, total: number) => `${answered} of ${total} answered`,
  buildClarifyOther: 'Other…',
  buildClarifyOtherPlaceholder: 'Describe…',
  buildClarifySubmit: 'Submit answers',
  buildClarifyJustGenerate: 'Skip — just generate now',
  buildClarifyAnswered: (count: number) => `${count} question${count === 1 ? '' : 's'} answered`,
  buildGenerating: 'Drafting…',
  buildScoring: 'Scoring…',

  // Result
  resultStrength: 'Strength score',
  resultImprove: 'Make it stronger',
  resultWhyWorks: 'Why this prompt works',
  resultAssembled: 'Assembled prompt',
  resultCopy: 'Copy prompt',
  resultDefaulted: 'Assumed — click to confirm',
  resultDraftAnother: 'Draft another with the same style',

  // Chat-first drafting (V1.4)
  chatDraft: {
    modeGuided: 'Guided form',
    modeChat: 'Chat',
    intro: 'Describe what you want to create. I’ll ask a couple of questions, then build you a scored prompt.',
    placeholder: 'e.g. “a launch email for my productivity app”',
    send: 'Send',
    thinking: 'Thinking…',
    attach: 'Attach file',
    attaching: 'Reading file…',
    attachHint: 'Text, code, CSV, JSON, or PDF — for extra context',
    openInEditor: 'Open in editor',
    draftReady: 'Draft ready',
    error: 'Something went wrong — please try again.',
    selectPlatformFirst: 'Pick a target platform above to start chatting.',
  },

  // Chat refine
  chatRefineToggleOpen: 'Refine with chat',
  chatRefineToggleClose: 'Close chat',
  chatRefineIntro: "Tell me what you'd like to change about this prompt.",
  chatRefinePlaceholder: 'e.g. "make it more dramatic" or "change the setting to a rainy evening"',
  chatRefineSend: 'Send',
  chatRefineThinking: 'Thinking…',
  chatRefineError: 'Something went wrong — please try again.',
  chatRefineUpdated: 'Prompt updated below.',

  // Node editor
  nodeLock: 'Lock',
  nodeUnlock: 'Unlock',
  nodeLocked: 'Locked',
  nodeRegenerate: 'Regenerate',
  nodeAlternatives: 'Alternatives',
  nodeEdit: 'Edit',
  nodeDefaulted: 'Assumed',
  nodeFanOut: 'Generate for other platforms',
  nodeEditSave: 'Done',
  nodeEditCancel: 'Cancel',
  nodeRegeneratePending: 'Regenerating…',
  nodeRegenerateError: 'Regeneration not available yet.',
  nodeAlternativesNone: 'No alternatives available.',
  nodeAlternativesRationale: 'Why this alternative?',
  nodeValueEmpty: '(empty — add a value)',

  // Strength score
  strengthNeedsWork: 'Needs work',
  strengthSolid: 'Solid',
  strengthStrong: 'Strong',
  strengthExcellent: 'Excellent',
  strengthSubScores: 'Breakdown',
  strengthDimensionInfo: 'Click for definition',
  strengthHeuristicNote: 'Scored heuristically — quality model unavailable',
  strengthWhyWorks: 'Why this prompt works',
  strengthHowToImprove: 'How to improve',
  strengthWeight: 'weight',
  strengthScoreLabel: (score: number, band: string) => `${score} · ${band}`,

  // Library
  libraryTitle: 'Prompt Library',
  librarySubtitle: 'Proven prompts across every niche — copy one, or open it in the builder and make it yours.',
  libraryRemix: 'Remix',
  libraryFromSeed: 'Seed templates',
  libraryFilterAll: 'All',
  libraryEmpty: 'No templates found for the selected filters.',
  librarySearchPlaceholder: 'Search prompts…',
  libraryUseThis: 'Use this prompt',
  libraryOpenEnhance: 'Open in Enhance',
  libraryCopyTemplate: 'Copy prompt',
  libraryCommunityBadge: 'community',
  libraryViewPrompt: 'View prompt',
  libraryNiches: {
    all: 'All',
    marketing: 'Marketing',
    coding: 'Coding',
    art: 'Art & Illustration',
    writing: 'Writing',
    education: 'Education',
    'product-ux': 'Product & UX',
    data: 'Data Analysis',
    video: 'Video',
  } as Record<string, string>,

  // History
  historyTitle: 'Prompt history',
  historyEmpty: 'No saved prompts yet.',
  historyRestore: 'Restore this version',
  historyDiff: 'What changed',
  historyVersions: 'Versions',
  historyPlatformLabel: 'Platform',
  historyStateLabel: 'State',
  historyScoreLabel: 'Score',
  historyDateLabel: 'Date',
  historyRestoreConfirm: 'Restored to version',
  historyRestoreError: 'Could not restore version.',
  historyStateDrafting: 'Drafting',
  historyStateClarifying: 'Clarifying',
  historyStateDone: 'Done',
  historyStateError: 'Error',

  // Feedback
  feedbackDialogTitle: 'How did this prompt work?',
  feedbackWorked: 'Yes — worked well',
  feedbackDidnt: 'Not really',
  feedbackMixed: 'Mixed results',
  feedbackThanks: 'Thanks for your feedback!',
  feedbackError: 'Could not save feedback.',

  // Account
  accountTitle: 'Account',
  accountEmail: 'Email',
  accountName: 'Display name',
  accountSave: 'Save changes',
  accountDeleteData: 'Delete my data',
  accountDeleteHint: 'This will delete all your data. Cannot be undone.',
  accountDeleteConfirm: 'This permanently deletes your account and all associated data. This cannot be undone.',
  accountPlan: 'Plan',
  accountUsage: 'Usage',
  accountProgress: 'Your prompts improved',
  accountProgressPoints: (points: number) => `${points} points`,
  accountMemory: 'Memory',
  accountMemoryEmpty: 'No saved preferences yet.',
  accountMemoryDesc: 'Saved preferences that carry across sessions. Memory is encrypted end-to-end.',
  accountMemoryNone: 'No saved memories yet.',
  accountMemoryAdd: 'Add memory',
  accountMemoryAddPlaceholder: 'e.g. Prefer concise, bullet-point answers',
  accountMemoryLocked: 'Unlock encryption to view or add memories.',
  accountMemoryStatement: 'Statement',
  accountMemoryScope: 'Scope',
  accountMemoryStatus: 'Status',
  accountMemoryEdit: 'Edit',
  accountMemoryDelete: 'Delete',
  accountMemoryReset: 'Reset all memory',
  accountMemoryResetConfirm: 'Type DELETE to confirm:',
  accountMemoryProposal: 'Remember this?',
  accountMemorySave: 'Save',
  accountMemoryDismiss: 'Dismiss',
  accountConnections: 'Provider connections',
  accountConnectionsDesc: 'Connect your own API key to use OpenAI or Gemini models.',
  accountConnectionsAdd: 'Add connection',
  accountConnectionsProvider: 'Provider',
  accountConnectionsStatus: 'Status',
  accountConnectionsCreated: 'Created',
  accountConnectionsDelete: 'Revoke',
  accountConnectionsDeleteConfirm: 'Are you sure? This cannot be undone.',
  accountConnectionsNone: 'No provider connections yet.',
  accountConnectionsApiKey: 'API key',
  accountConnectionsApiKeyPlaceholder: 'sk-...',
  accountConnectionsAdded: 'Connection added.',
  accountConnectionsRevoked: 'Connection revoked.',
  accountExport: 'Export my data',
  accountExportButton: 'Download',
  accountTeachingToggle: 'Teaching mode',

  // Recommendation
  recommendation: {
    title: 'Which model fits this task?',
    findButton: 'Find best platform',
    loading: 'Finding the best platform for your task…',
    draftFor: 'Draft for {platform}',
    empty: 'No recommendations available. Try adjusting your preferences.',
    tradeoff: 'Trade-off: {tradeoff}',
    costTier: 'Cost: {tier}',
    latencyTier: 'Speed: {tier}',
    contextWindow: 'Context: {tokens} tokens',
    lastVerified: 'Data last verified {date}',
    stalenessWarning: 'Capability data last verified over 60 days ago — may be outdated',
    modalityLabel: 'What are you making?',
  },

  // V2 flagship tools
  tools: {
    navTools: 'Tools',
    debugTitle: 'Prompt Debugger',
    debugSubtitle: 'Ran a prompt and got the wrong output? Paste all three and we’ll find the fault and patch it.',
    debugPrompt: 'Your prompt',
    debugActual: 'What you got (the wrong output)',
    debugExpected: 'What you expected',
    debugRun: 'Diagnose',
    debugRunning: 'Diagnosing…',
    debugDiagnosis: 'Diagnosis',
    debugPatched: 'Patched prompt',
    debugOpenEditor: 'Open patched in editor',
    reverseTitle: 'Reverse Prompt',
    reverseSubtitle: 'Saw a great output? Paste it and we’ll infer the prompt that could produce it.',
    reverseOutput: 'Example output',
    reverseRun: 'Infer the prompt',
    reverseRunning: 'Inferring…',
    reverseDisclaimer: 'This is inference, not extraction — tune the result to taste.',
    simulateTitle: 'Simulate cost',
    simulateRun: 'Estimate across models',
    simulateRunning: 'Estimating…',
    simulateCheapest: 'cheapest safe pick',
    ambiguityTitle: 'Analyze ambiguity',
    ambiguityRun: 'Find risky spans',
    ambiguityRunning: 'Analyzing…',
    ambiguityApply: 'Apply fix',
    ambiguityClean: 'No high-risk spans found.',
    migrateTitle: 'Port to another platform',
    migrateRun: 'Port',
    migrateRunning: 'Porting…',
    migrateChanges: 'Change report',
    migrateRisks: 'Risks',
    migrateOpen: 'Open ported prompt in editor',
    lintTitle: 'Style guide',
    lintClean: 'Passes your style guide.',
    lintViolations: (n: number) => `${n} style ${n === 1 ? 'issue' : 'issues'}`,
    genericError: 'Something went wrong — please try again.',
  },

  // Workflows (V2.5) + Tests (V2.3)
  workflows: {
    title: 'Workflow Composer',
    subtitle: 'Chain prompts together — each step’s output feeds the next as a variable. Great for research → outline → draft.',
    inputsLabel: 'Starting variables (name = value, one per line)',
    inputsPlaceholder: 'topic = sustainable coffee',
    stepName: 'Step name',
    stepPrompt: 'Prompt (use {{variable}} to pull earlier outputs)',
    outputVar: 'Save output as',
    addStep: 'Add step',
    removeStep: 'Remove',
    run: 'Run workflow',
    running: 'Running…',
    exportJson: 'Export JSON',
    importJson: 'Import JSON',
    totalTokens: (n: number) => `${n} tokens total`,
  },
  regression: {
    title: 'Regression tests',
    subtitle: 'Add test cases with assertions; run them to catch prompt rot.',
    caseName: 'Case name',
    run: 'Run all',
    running: 'Running…',
    passRate: (n: number) => `${n}% passing`,
    addCase: 'Add case',
    addAssertion: 'Add assertion',
  },

  // Style guide (V2.8)
  styleGuide: {
    title: 'Style guide',
    subtitle: 'Rules enforced on every prompt — banned/required terms, length, tone, required nodes.',
    add: 'Add rule',
  },

  // Custom platform (V1.1)
  customPlatform: {
    optionLabel: '＋ Custom platform (from docs URL)…',
    badge: 'custom',
    title: 'Add a custom platform',
    subtitle: "Paste the platform's documentation URL — we'll read the docs and learn how to prompt it.",
    urlLabel: 'Documentation URL',
    urlPlaceholder: 'https://docs.example.com/prompting',
    nameLabel: 'Name (optional)',
    namePlaceholder: 'e.g. "Runway Gen-4"',
    analyze: 'Analyze docs',
    analyzing: 'Reading the docs and profiling the platform… (~20s)',
    success: (name: string, pages: number) => `${name} added — profiled from ${pages} doc page${pages === 1 ? '' : 's'}.`,
    error: 'Could not analyze those docs.',
    remove: 'Remove',
  },

  // Platform guides (V1.8)
  navPlatforms: 'Platforms',
  platformGuide: {
    indexTitle: 'Platforms',
    indexSubtitle: 'What each platform is, how it thinks, and how to prompt it well — grounded in the official docs.',
    openGuide: 'Open guide',
    contextLine: (n: string) => `Practical prompt ceiling: ~${n} tokens`,
    howTitle: 'How prompting works here',
    quirksTitle: 'Quirks to know',
    modesTitle: 'Modes — which to use when',
    modeBestFor: 'Best for',
    modeAvoidFor: 'Avoid for',
    lessonsTitle: 'Learn from the docs',
    startersTitle: 'Starter prompts',
    startersUse: 'Use this',
    cta: (name: string) => `Build a prompt for ${name}`,
    officialDocs: 'Official docs ↗',
    notFound: 'Unknown platform.',
  },

  // Doc grounding (V1.6)
  grounding: {
    summary: (n: number, domains: string) => `Grounded in ${n} doc passage${n === 1 ? '' : 's'} from ${domains}`,
  },

  // Token meter (V1.5)
  tokenMeter: {
    label: 'Prompt size',
    overLimit: 'Over the platform limit — see suggestions',
    nearLimit: 'Close to the platform limit — see suggestions',
    perNode: (n: string) => `≈${n} tok`,
    contextSize: (n: string) => `context ${n} tokens`,
  },

  // Platform mode suggestion (V1.2)
  modeSuggestion: {
    title: 'Which mode fits this task?',
    loading: 'Checking the platform docs…',
    topPick: 'Recommended mode',
    showAll: 'See all modes',
    hideAll: 'Hide modes',
    docsLink: 'docs ↗',
    empty: 'This platform has a single mode — nothing to choose.',
  },

  // Desktop download (F1.2)
  download: {
    title: 'Get the desktop app',
    subtitle: 'PromptForge for macOS and Windows — draft, enhance, and dictate from a menu-bar icon and a floating widget, anywhere on your screen.',
    mac: 'Download for macOS',
    windows: 'Download for Windows',
    generic: 'Download',
    allPlatforms: 'All platforms & versions →',
    macNoteTitle: 'First launch on macOS',
    macNote: 'The build is not yet notarized — right-click the app and choose "Open", then confirm, to bypass Gatekeeper the first time.',
    winNoteTitle: 'First launch on Windows',
    winNote: 'SmartScreen may show "Windows protected your PC" for the unsigned build — click "More info" then "Run anyway".',
  },

  // Onboarding tour (F2.6)
  tour: {
    title: 'Quick tour',
    skip: 'Skip',
    back: 'Back',
    next: 'Next',
    done: 'Got it',
    relaunch: 'Replay the tour',
    s1Title: '1. Pick a platform',
    s1Body: 'Choose where the prompt will run — we tailor it to that platform\'s style and quirks.',
    s2Title: '2. Describe your idea',
    s2Body: 'A rough idea is enough. We\'ll ask a couple of quick questions, or you can paste a finished prompt to enhance instead.',
    s3Title: '3. Edit node-by-node',
    s3Body: 'Your prompt breaks into typed parts you can edit, swap for alternatives, or lock so they never change.',
    s4Title: '4. Read the score',
    s4Body: 'The strength score rates your prompt across 8 dimensions and explains why it works.',
  },

  // Locale switcher (F2.6)
  locale: {
    label: 'Language',
    note: 'Switching reloads the app.',
  },

  // A/B compare via BYOK (F2.5)
  compare: {
    button: 'Test them on your model',
    upsell: 'Connect your own API key (Pro) to run both versions and see the difference.',
    running: 'Running both on your model…',
    original: 'Original',
    enhanced: 'Enhanced',
    whichBetter: 'Which was better?',
    voteA: 'Original',
    voteB: 'Enhanced',
    voteTie: 'About the same',
    thanks: 'Thanks — recorded.',
    error: 'Your provider couldn\'t complete the comparison.',
    latency: '{ms}ms',
  },

  // Share links + template variables (F2.4)
  share: {
    button: 'Share',
    creating: 'Creating link…',
    copyLink: 'Copy link',
    copied: 'Copied ✓',
    revoke: 'Revoke link',
    revoked: 'Link revoked',
    blocked: 'This prompt can\'t be shared — it didn\'t pass our safety check.',
    publicTitle: 'A prompt shared with you',
    openInApp: 'Open in PromptForge',
    notFound: 'This link is no longer available.',
    fillTitle: 'Fill in the variables',
    fillApply: 'Apply',
    fillPreview: 'Preview',
    reportButton: 'Report this link',
    reportPrompt: 'Why are you reporting it?',
    reportChoose: 'Choose a reason',
    reportSubmit: 'Send report',
    reportThanks: 'Thanks. We\'ll review this link.',
    reportError: 'Couldn\'t send the report. Please try again.',
    // Keys are the backend's reason codes (SHARE_REPORT_REASONS).
    reportReasons: {
      illegal: 'Illegal content',
      child_safety: 'Child safety',
      harassment: 'Harassment or hate',
      sexual: 'Sexual content',
      privacy: 'Private information',
      copyright: 'Copyright',
      spam: 'Spam or scam',
      other: 'Something else',
    },
  },

  // Command palette (F2.3)
  palette: {
    title: 'Command palette',
    placeholder: 'Type a command or search…',
    empty: 'No matching commands.',
    newDraft: 'New draft',
    enhance: 'Enhance a prompt',
    prompts: 'My saved prompts',
    history: 'History',
    library: 'Library',
    account: 'Account',
    download: 'Get the desktop app',
  },

  // Saved prompts & version history (F2.2)
  prompts: {
    navLink: 'My prompts',
    listTitle: 'Saved prompts',
    listEmpty: 'You haven\'t saved any prompts yet. Draft or enhance one, then hit "Save prompt".',
    save: 'Save prompt',
    saved: 'Saved ✓',
    saveVersion: 'Save as new version',
    versionsTitle: 'Versions',
    version: 'v{n}',
    restore: 'Restore',
    restoreNote: 'Restoring creates a new version — history is never rewritten.',
    diffTitle: 'Compare versions',
    diffFrom: 'From',
    diffTo: 'To',
    diffAdded: 'Added',
    diffRemoved: 'Removed',
    diffChanged: 'Changed',
    noDiff: 'No differences between these versions.',
    interimNote: 'Saved prompt content is stored server-side in the interim pre-E2EE format (§ migration 006); end-to-end encryption of versions arrives with T7.1.',
    strength: 'Strength {n}',
  },

  // Real pipeline progress (F2.1) — honest step labels by Supervisor state.
  progressStates: {
    context_resolved: 'Getting started…',
    intent_classified: 'Understanding your idea…',
    docs_retrieved: 'Reading platform docs…',
    clarifying: 'Preparing questions…',
    drafting: 'Drafting your prompt…',
    critiqued: 'Scoring quality…',
    alternatives_attached: 'Preparing alternatives…',
    governed: 'Finishing up…',
    ready_for_review: 'Done',
  } as Record<string, string>,

  // Voice dictation (F1.3)
  mic: {
    start: 'Dictate',
    listening: 'Listening… tap to stop',
    processing: 'Transcribing…',
  },

  // Enhance mode (F1.1)
  enhance: {
    title: 'Enhance a prompt you already have',
    subtitle: 'Paste a finished prompt — we\'ll parse it, score it, and improve it node-by-node.',
    pasteLabel: 'Your prompt',
    pastePlaceholder: 'Paste the prompt you want to improve…',
    platformLabel: 'Target platform (optional)',
    platformAuto: 'Auto-detect',
    button: 'Enhance it',
    loading: 'Parsing, scoring, and improving…',
    beforeTitle: 'Before',
    afterTitle: 'After',
    deltaTitle: 'What changed, dimension by dimension',
    alreadyStrong: 'This prompt is already strong — we couldn\'t meaningfully improve it. Nice work.',
    improvedBy: 'Strength improved from {before} to {after}.',
    platformHint: 'This looks written for {platform}. ',
    reEnhanceForHint: 'Re-enhance targeting it →',
    tryAnother: 'Enhance another',
    nudgeTitle: 'Looks like a finished prompt',
    nudgeBody: 'Want to improve this existing prompt instead of drafting a new one?',
    nudgeAction: 'Enhance it →',
    nudgeDismiss: 'No, draft new',
  },

  // Errors
  errorNetwork: 'Network error. Check your connection and try again.',
  errorServer: 'Server error. Please try again later.',
  errorPlatformUnknown: 'Unknown platform.',
  errorBudgetExceeded: 'Your monthly token budget has been reached.',
  errorPlanRestricted: 'This platform requires a paid plan. Upgrade in your account settings.',
  errorUpgrade: 'Upgrade required to use this feature.',
  error404: 'Not found.',
  error401: 'Please sign in to continue.',
};

export type Strings = typeof en;
export type StringKey = keyof Strings;

// ── i18n activation (F2.6) ──
// Locale is persisted; switching reloads so every `import { strings }` picks up
// the new dictionary without a per-component context refactor (the incremental
// next step is migrating components to a useStrings() hook for live switching).
import { es } from './locales/es';

export const LOCALES: Record<string, { label: string; dict: DeepPartial<Strings> }> = {
  en: { label: 'English', dict: {} },
  es: { label: 'Español (machine — needs review)', dict: es },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  const out = { ...base } as T;
  for (const k in override) {
    const ov = override[k];
    if (ov && typeof ov === 'object' && !Array.isArray(ov)) {
      out[k] = deepMerge(base[k], ov as DeepPartial<T[typeof k]>);
    } else if (ov !== undefined) {
      out[k] = ov as T[typeof k];
    }
  }
  return out;
}

export function getLocale(): string {
  if (typeof localStorage === 'undefined') return 'en';
  return localStorage.getItem('pf_locale') ?? 'en';
}

export function setLocale(locale: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('pf_locale', locale in LOCALES ? locale : 'en');
  location.reload();
}

const activeLocale = getLocale();
export const strings: Strings =
  activeLocale !== 'en' && LOCALES[activeLocale]
    ? deepMerge(en, LOCALES[activeLocale].dict)
    : en;