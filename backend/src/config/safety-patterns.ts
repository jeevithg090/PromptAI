import type { SafetyCategory, SafetySeverity } from '../types/Safety';

/**
 * Content Safety Classifier v1 pattern set — spec §33.1–33.2.
 *
 * This is configuration, not logic (§32.3): tightening safety rules is an edit
 * here (or, later, a config-store update), not a classifier rewrite. The v2
 * model-based classifier (production, §33.2) replaces the *matching mechanism*
 * but keeps these categories, which map 1:1 to docs/acceptable-use-policy.md.
 *
 * Design notes (§33.9 — avoid over-blocking):
 * - Patterns target *intent phrasing* ("how to synthesize X", "write a fake
 *   news article claiming...") rather than bare topic words, so "atomic bomb
 *   in World War 2" or dark fiction is not flagged.
 * - Severity 'high' → always block. 'medium' → block + flag for review queue.
 */
export interface SafetyPatternRule {
  category: SafetyCategory;
  severity: SafetySeverity;
  /** Case-insensitive regexes tested against the normalized input. */
  patterns: RegExp[];
}

const INSTRUCT = '(?:how\\s+to|help\\s+me|steps?\\s+(?:to|for)|guide\\s+(?:to|for|me)|instructions?\\s+(?:to|for|on)|teach\\s+me|show\\s+me\\s+how|walk\\s+me\\s+through)';

export const SAFETY_PATTERNS: SafetyPatternRule[] = [
  {
    category: 'jailbreak',
    severity: 'high',
    patterns: [
      /ignore\s+(?:all\s+)?(?:your\s+|previous\s+|prior\s+)?(?:instructions|guidelines|rules|safety)/i,
      /bypass\s+(?:the\s+)?(?:safety|content|moderation)\s*(?:filters?|guidelines|systems?|checks?)?/i,
      /\b(?:unrestricted|uncensored)\s+(?:mode|ai|version)\b/i,
      /pretend\s+(?:you(?:'re|\s+are)\s+)?(?:an?\s+)?(?:ai\s+)?(?:with(?:out)?|no)\s+(?:restrictions|filters|guidelines)/i,
      /\bjailbreak(?:ing|s)?\b.{0,40}\b(?:prompt|model|ai|chatgpt|claude|gemini)\b/i,
      /\bDAN\s+mode\b/i,
      /disable\s+(?:your\s+)?safety/i,
      /answer\s+without\s+(?:any\s+)?(?:filters|restrictions|censorship)/i,
    ],
  },
  {
    category: 'illegal_instruction',
    severity: 'high',
    patterns: [
      new RegExp(`${INSTRUCT}.{0,40}\\b(?:synthesi[sz]e|manufacture|cook|produce)\\b.{0,30}\\b(?:fentanyl|methamphetamine|meth|ricin|nerve\\s+agent|sarin)\\b`, 'i'),
      new RegExp(`${INSTRUCT}.{0,40}\\b(?:build|make|construct|assemble)\\b.{0,30}\\b(?:a\\s+)?(?:bomb|explosive\\s+device|pipe\\s+bomb|ied)\\b`, 'i'),
      new RegExp(`${INSTRUCT}.{0,40}\\bcommit\\b.{0,20}\\b(?:fraud|identity\\s+theft|tax\\s+evasion)\\b`, 'i'),
      new RegExp(`${INSTRUCT}.{0,40}\\b(?:launder|laundering)\\b.{0,20}\\bmoney\\b`, 'i'),
      new RegExp(`${INSTRUCT}.{0,40}\\b(?:steal|clone|skim)\\b.{0,30}\\bcredit\\s+cards?\\b`, 'i'),
      new RegExp(`${INSTRUCT}.{0,40}\\b(?:hack|break)\\s+into\\b.{0,40}\\b(?:account|network|system|phone|computer)\\b(?!.{0,60}\\b(?:my\\s+own|authoriz|pentest|ctf)\\b)`, 'i'),
    ],
  },
  {
    category: 'csam',
    severity: 'high',
    patterns: [
      /\b(?:sexual|sexuali[sz]ed|nude|naked|explicit|erotic)\b.{0,50}\b(?:child(?:ren)?|minors?|under[-\s]?age|preteens?|teens?\s+under)\b/i,
      /\b(?:child(?:ren)?|minors?|under[-\s]?age|preteens?)\b.{0,50}\b(?:sexual|sexuali[sz]ed|nude|naked|explicit|erotic)\b/i,
      /\bcsam\b/i,
      /\bgroom(?:ing)?\b.{0,30}\b(?:child(?:ren)?|minors?|kids?)\b/i,
    ],
  },
  {
    category: 'targeted_harassment',
    severity: 'high',
    patterns: [
      /\b(?:harass|doxx?|dox|swat)\b.{0,40}\b(?:person|individual|user|woman|man|girl|guy|neighbor|coworker|colleague|ex\b)/i,
      /\bincite\s+violence\s+against\b/i,
      new RegExp(`${INSTRUCT}.{0,40}\\b(?:defame|smear|ruin\\s+the\\s+reputation\\s+of)\\b`, 'i'),
      /\b(?:campaign|messages?|posts?)\b.{0,40}\bto\s+(?:harass|intimidate|threaten)\b/i,
    ],
  },
  {
    category: 'intimate_deepfake',
    severity: 'high',
    patterns: [
      /\b(?:nude|naked|sexual|intimate|undressed)\b.{0,50}\b(?:photos?|images?|pictures?|video)\b.{0,40}\bof\s+(?:a\s+)?(?:real|specific|my)\s+(?:person|woman|man|celebrity|ex|coworker|classmate)/i,
      /\bdeepfake\b.{0,50}\b(?:nude|sexual|intimate|porn)/i,
      /\b(?:undress|remove\s+(?:the\s+)?clothes\s+(?:of|from))\b.{0,40}\b(?:photo|image|picture|her|him)\b/i,
    ],
  },
  {
    category: 'disinformation',
    severity: 'high',
    patterns: [
      /\b(?:convincing|believable|realistic)\b.{0,30}\bbut\b.{0,10}\b(?:false|fake|untrue)\b/i,
      /\bfake\s+news\s+article\b.{0,40}\b(?:claiming|saying|stating)\b/i,
      /\b(?:false|fabricated|fake)\s+(?:news|article|story|report)\b.{0,60}\b(?:vaccines?|election|climate)\b.{0,60}\b(?:cause|rigged|hoax)\b/i,
      new RegExp(`${INSTRUCT}.{0,40}\\bspread\\s+(?:mis|dis)information\\b`, 'i'),
    ],
  },
  {
    category: 'impersonation',
    severity: 'medium',
    patterns: [
      /\bimpersonate\b.{0,40}\b(?:a\s+real|specific|this)\s+(?:person|company|organization|official|bank)\b/i,
      /\b(?:pretend|pose)\s+(?:to\s+be|as)\b.{0,30}\b(?:bank|government|police|irs|support\s+agent)\b.{0,40}\b(?:to\s+get|so\s+that|in\s+order\s+to)\b/i,
      /\bphishing\s+(?:email|message|page|site)\b/i,
    ],
  },
  {
    category: 'malicious_code',
    severity: 'medium',
    patterns: [
      new RegExp(`${INSTRUCT}.{0,40}\\b(?:write|create|build|code)\\b.{0,30}\\b(?:malware|ransomware|keylogger|spyware|botnet|rootkit)\\b`, 'i'),
      /\b(?:write|create|generate|code)\b.{0,30}\b(?:malware|ransomware|keylogger|spyware|botnet|rootkit)\b(?!.{0,80}\b(?:detect|defend|analysis|educational|signature)\b)/i,
      /\bsteal\b.{0,30}\b(?:passwords?|credentials|cookies|session\s+tokens?)\b/i,
      /\bcrypto(?:currency)?\s+(?:drainer|stealer|clipper)\b/i,
    ],
  },
  {
    category: 'self_harm',
    severity: 'medium',
    patterns: [
      new RegExp(`${INSTRUCT}.{0,40}\\b(?:kill\\s+myself|commit\\s+suicide|end\\s+my\\s+life)\\b`, 'i'),
      /\b(?:most\s+(?:effective|painless)|best)\s+(?:way|method)s?\b.{0,30}\b(?:to\s+)?(?:kill\s+myself|suicide|self[-\s]?harm)\b/i,
    ],
  },
];

export const CLASSIFIER_VERSION = 'v1-heuristic-2026-07';
