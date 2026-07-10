/**
 * All UI strings — i18n discipline (§29.6). No hardcoded English in components.
 * Import from here. Add new strings here, not in JSX.
 */

export const strings = {
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
  landingFeature1: 'Platform-aware drafting grounded in real documentation',
  landingFeature2: 'Quality score with breakdown — know why it works',
  landingFeature3: 'Editable node-by-node, not a wall of text',

  // Try flow
  tryTitle: 'Try it now',
  tryDescription: 'Pick an example to see what PromptForge can do. No account needed.',
  tryPickExample: 'Choose an example',
  trySignupBanner: 'Sign up free to save, edit node-by-node, and build your own prompts.',
  tryRateLimited: 'You\'ve used all your demo tries today. Create a free account for unlimited drafting.',
  tryJustGenerate: 'Just generate now',

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
  libraryTitle: 'Library',
  libraryRemix: 'Remix',
  libraryFromSeed: 'Seed templates',
  libraryFilterAll: 'All',
  libraryEmpty: 'No templates found for the selected filters.',

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
  accountPlan: 'Plan',
  accountUsage: 'Usage',
  accountProgress: 'Your prompts improved',
  accountProgressPoints: (points: number) => `${points} points`,
  accountMemory: 'Memory',
  accountMemoryEmpty: 'No saved preferences yet.',
  accountConnections: 'Provider connections',
  accountExport: 'Export my data',
  accountExportButton: 'Download',
  accountTeachingToggle: 'Teaching mode',

  // Errors
  errorNetwork: 'Network error. Check your connection and try again.',
  errorServer: 'Server error. Please try again later.',
  errorPlatformUnknown: 'Unknown platform.',
  errorBudgetExceeded: 'Your monthly token budget has been reached.',
  errorUpgrade: 'Upgrade required to use this feature.',
  error404: 'Not found.',
  error401: 'Please sign in to continue.',
};

export type StringKey = keyof typeof strings;