import type { LyricsResult, LyricLine } from './types.ts';

// Regex detecting any Indic Brahmi family scripts:
// Devanagari (0900-097F), Bengali (0980-09FF), Gurmukhi (0A00-0A7F), Gujarati (0A80-0AFF),
// Oriya (0B00-0B7F), Tamil (0B80-0BFF), Telugu (0C00-0C7F), Kannada (0C80-0CFF), Malayalam (0D00-0D7F)
const INDIC_REGEX = /[\u0900-\u0D7F]/;

export function containsIndic(text: string): boolean {
  return INDIC_REGEX.test(text);
}

// ---------------------------------------------------------------------------
// Devanagari mappings (Hindi, Marathi, Nepali, Sanskrit, Urdu in Devanagari)
// ---------------------------------------------------------------------------
const DEV_VOWELS: Record<string, string> = {
  '\u0904': 'a',
  '\u0905': 'a',
  '\u0906': 'aa',
  '\u0907': 'i',
  '\u0908': 'ee',
  '\u0909': 'u',
  '\u090A': 'oo',
  '\u090B': 'ri',
  '\u090E': 'e',
  '\u090F': 'e',
  '\u0910': 'ai',
  '\u0911': 'o',
  '\u0912': 'o',
  '\u0913': 'o',
  '\u0914': 'au',
};

const DEV_MATRAS: Record<string, string> = {
  '\u093E': 'a',
  '\u093F': 'i',
  '\u0940': 'i',
  '\u0941': 'u',
  '\u0942': 'oo',
  '\u0943': 'ri',
  '\u0946': 'e',
  '\u0947': 'e',
  '\u0948': 'ai',
  '\u094A': 'o',
  '\u094B': 'o',
  '\u094C': 'au',
};

const DEV_CONSONANTS: Record<string, string> = {
  '\u0915': 'k',
  '\u0916': 'kh',
  '\u0917': 'g',
  '\u0918': 'gh',
  '\u0919': 'ng',
  '\u091A': 'ch',
  '\u091B': 'chh',
  '\u091C': 'j',
  '\u091D': 'jh',
  '\u091E': 'ny',
  '\u091F': 't',
  '\u0920': 'th',
  '\u0921': 'd',
  '\u0922': 'dh',
  '\u0923': 'n',
  '\u0924': 't',
  '\u0925': 'th',
  '\u0926': 'd',
  '\u0927': 'dh',
  '\u0928': 'n',
  '\u092A': 'p',
  '\u092B': 'ph',
  '\u092C': 'b',
  '\u092D': 'bh',
  '\u092E': 'm',
  '\u092F': 'y',
  '\u0930': 'r',
  '\u0931': 'r',
  '\u0932': 'l',
  '\u0933': 'l',
  '\u0935': 'v',
  '\u0936': 'sh',
  '\u0937': 'sh',
  '\u0938': 's',
  '\u0939': 'h',
  // Precomposed Nuktas
  '\u0958': 'q',
  '\u0959': 'kh',
  '\u095A': 'gh',
  '\u095B': 'z',
  '\u095C': 'd',
  '\u095D': 'dh',
  '\u095E': 'f',
};

const DEV_NUKTA_MAP: Record<string, string> = {
  '\u0915': 'q',
  '\u0916': 'kh',
  '\u0917': 'gh',
  '\u091C': 'z',
  '\u0921': 'd',
  '\u0922': 'dh',
  '\u092B': 'f',
};

// ---------------------------------------------------------------------------
// Gurmukhi mappings (Punjabi)
// ---------------------------------------------------------------------------
const GUR_VOWELS: Record<string, string> = {
  '\u0A05': 'a',
  '\u0A06': 'aa',
  '\u0A07': 'i',
  '\u0A08': 'ee',
  '\u0A09': 'u',
  '\u0A0A': 'oo',
  '\u0A0F': 'e',
  '\u0A10': 'ai',
  '\u0A13': 'o',
  '\u0A14': 'au',
};

const GUR_MATRAS: Record<string, string> = {
  '\u0A3E': 'a',
  '\u0A3F': 'i',
  '\u0A40': 'i',
  '\u0A41': 'u',
  '\u0A42': 'oo',
  '\u0A47': 'e',
  '\u0A48': 'ai',
  '\u0A4B': 'o',
  '\u0A4C': 'au',
};

const GUR_CONSONANTS: Record<string, string> = {
  '\u0A15': 'k',
  '\u0A16': 'kh',
  '\u0A17': 'g',
  '\u0A18': 'gh',
  '\u0A19': 'ng',
  '\u0A1A': 'ch',
  '\u0A1B': 'chh',
  '\u0A1C': 'j',
  '\u0A1D': 'jh',
  '\u0A1E': 'ny',
  '\u0A1F': 't',
  '\u0A20': 'th',
  '\u0A21': 'd',
  '\u0A22': 'dh',
  '\u0A23': 'n',
  '\u0A24': 't',
  '\u0A25': 'th',
  '\u0A26': 'd',
  '\u0A27': 'dh',
  '\u0A28': 'n',
  '\u0A2A': 'p',
  '\u0A2B': 'ph',
  '\u0A2C': 'b',
  '\u0A2D': 'bh',
  '\u0A2E': 'm',
  '\u0A2F': 'y',
  '\u0A30': 'r',
  '\u0A32': 'l',
  '\u0A33': 'l',
  '\u0A35': 'v',
  '\u0A36': 'sh',
  '\u0A38': 's',
  '\u0A39': 'h',
  '\u0A59': 'kh',
  '\u0A5A': 'gh',
  '\u0A5B': 'z',
  '\u0A5C': 'r',
  '\u0A5E': 'f',
};

const GUR_NUKTA_MAP: Record<string, string> = {
  '\u0A16': 'kh',
  '\u0A17': 'gh',
  '\u0A1C': 'z',
  '\u0A2B': 'f',
  '\u0A32': 'l',
  '\u0A38': 'sh',
};

// ---------------------------------------------------------------------------
// Bengali mappings (Bangla, Assamese)
// ---------------------------------------------------------------------------
const BEN_VOWELS: Record<string, string> = {
  '\u0985': 'a',
  '\u0986': 'aa',
  '\u0987': 'i',
  '\u0988': 'i',
  '\u0989': 'u',
  '\u098A': 'u',
  '\u098B': 'ri',
  '\u098F': 'e',
  '\u0990': 'oi',
  '\u0993': 'o',
  '\u0994': 'ou',
};

const BEN_MATRAS: Record<string, string> = {
  '\u09BE': 'a',
  '\u09BF': 'i',
  '\u09C0': 'i',
  '\u09C1': 'u',
  '\u09C2': 'u',
  '\u09C3': 'ri',
  '\u09C7': 'e',
  '\u09C8': 'oi',
  '\u09CB': 'o',
  '\u09CC': 'ou',
};

const BEN_CONSONANTS: Record<string, string> = {
  '\u0995': 'k',
  '\u0996': 'kh',
  '\u0997': 'g',
  '\u0998': 'gh',
  '\u0999': 'ng',
  '\u099A': 'ch',
  '\u099B': 'chh',
  '\u099C': 'j',
  '\u099D': 'jh',
  '\u099E': 'ny',
  '\u099F': 't',
  '\u09A0': 'th',
  '\u09A1': 'd',
  '\u09A2': 'dh',
  '\u09A3': 'n',
  '\u09A4': 't',
  '\u09A5': 'th',
  '\u09A6': 'd',
  '\u09A7': 'dh',
  '\u09A8': 'n',
  '\u09AA': 'p',
  '\u09AB': 'ph',
  '\u09AC': 'b',
  '\u09AD': 'bh',
  '\u09AE': 'm',
  '\u09AF': 'j',
  '\u09B0': 'r',
  '\u09B2': 'l',
  '\u09B6': 'sh',
  '\u09B7': 'sh',
  '\u09B8': 'sh',
  '\u09B9': 'h',
  '\u09DC': 'r',
  '\u09DD': 'rh',
  '\u09DF': 'y',
};

// ---------------------------------------------------------------------------
// Gujarati mappings
// ---------------------------------------------------------------------------
const GUJ_VOWELS: Record<string, string> = {
  '\u0A85': 'a',
  '\u0A86': 'aa',
  '\u0A87': 'i',
  '\u0A88': 'ee',
  '\u0A89': 'u',
  '\u0A8A': 'oo',
  '\u0A8B': 'ri',
  '\u0A8F': 'e',
  '\u0A90': 'ai',
  '\u0A93': 'o',
  '\u0A94': 'au',
};

const GUJ_MATRAS: Record<string, string> = {
  '\u0ABE': 'a',
  '\u0ABF': 'i',
  '\u0AC0': 'i',
  '\u0AC1': 'u',
  '\u0AC2': 'oo',
  '\u0AC3': 'ri',
  '\u0AC7': 'e',
  '\u0AC8': 'ai',
  '\u0ACB': 'o',
  '\u0ACC': 'au',
};

const GUJ_CONSONANTS: Record<string, string> = {
  '\u0A95': 'k',
  '\u0A96': 'kh',
  '\u0A97': 'g',
  '\u0A98': 'gh',
  '\u0A99': 'ng',
  '\u0A9A': 'ch',
  '\u0A9B': 'chh',
  '\u0A9C': 'j',
  '\u0A9D': 'jh',
  '\u0A9E': 'ny',
  '\u0A9F': 't',
  '\u0AA0': 'th',
  '\u0AA1': 'd',
  '\u0AA2': 'dh',
  '\u0AA3': 'n',
  '\u0AA4': 't',
  '\u0AA5': 'th',
  '\u0AA6': 'd',
  '\u0AA7': 'dh',
  '\u0AA8': 'n',
  '\u0AAA': 'p',
  '\u0AAB': 'ph',
  '\u0AAC': 'b',
  '\u0AAD': 'bh',
  '\u0AAE': 'm',
  '\u0AAF': 'y',
  '\u0AB0': 'r',
  '\u0AB2': 'l',
  '\u0AB3': 'l',
  '\u0AB5': 'v',
  '\u0AB6': 'sh',
  '\u0AB7': 'sh',
  '\u0AB8': 's',
  '\u0AB9': 'h',
};

// ---------------------------------------------------------------------------
// South Indian Dravidian mappings (Telugu, Tamil, Kannada, Malayalam)
// ---------------------------------------------------------------------------
const TEL_VOWELS: Record<string, string> = {
  '\u0C05': 'a',
  '\u0C06': 'aa',
  '\u0C07': 'i',
  '\u0C08': 'ee',
  '\u0C09': 'u',
  '\u0C0A': 'oo',
  '\u0C0E': 'e',
  '\u0C0F': 'e',
  '\u0C10': 'ai',
  '\u0C12': 'o',
  '\u0C13': 'o',
  '\u0C14': 'au',
};
const TEL_MATRAS: Record<string, string> = {
  '\u0C3E': 'aa',
  '\u0C3F': 'i',
  '\u0C40': 'ee',
  '\u0C41': 'u',
  '\u0C42': 'oo',
  '\u0C46': 'e',
  '\u0C47': 'e',
  '\u0C48': 'ai',
  '\u0C4A': 'o',
  '\u0C4B': 'o',
  '\u0C4C': 'au',
};
const TEL_CONSONANTS: Record<string, string> = {
  '\u0C15': 'k',
  '\u0C16': 'kh',
  '\u0C17': 'g',
  '\u0C18': 'gh',
  '\u0C1A': 'ch',
  '\u0C1B': 'chh',
  '\u0C1C': 'j',
  '\u0C1D': 'jh',
  '\u0C1F': 't',
  '\u0C20': 'th',
  '\u0C21': 'd',
  '\u0C22': 'dh',
  '\u0C23': 'n',
  '\u0C24': 't',
  '\u0C25': 'th',
  '\u0C26': 'd',
  '\u0C27': 'dh',
  '\u0C28': 'n',
  '\u0C2A': 'p',
  '\u0C2B': 'ph',
  '\u0C2C': 'b',
  '\u0C2D': 'bh',
  '\u0C2E': 'm',
  '\u0C2F': 'y',
  '\u0C30': 'r',
  '\u0C32': 'l',
  '\u0C33': 'l',
  '\u0C35': 'v',
  '\u0C36': 'sh',
  '\u0C37': 'sh',
  '\u0C38': 's',
  '\u0C39': 'h',
};

const TAM_VOWELS: Record<string, string> = {
  '\u0B85': 'a',
  '\u0B86': 'aa',
  '\u0B87': 'i',
  '\u0B88': 'ee',
  '\u0B89': 'u',
  '\u0B8A': 'oo',
  '\u0B8E': 'e',
  '\u0B8F': 'e',
  '\u0B90': 'ai',
  '\u0B92': 'o',
  '\u0B93': 'o',
  '\u0B94': 'au',
};
const TAM_MATRAS: Record<string, string> = {
  '\u0BBE': 'aa',
  '\u0BBF': 'i',
  '\u0BC0': 'ee',
  '\u0BC1': 'u',
  '\u0BC2': 'oo',
  '\u0BC6': 'e',
  '\u0BC7': 'e',
  '\u0BC8': 'ai',
  '\u0BCA': 'o',
  '\u0BCB': 'o',
  '\u0BCC': 'au',
};
const TAM_CONSONANTS: Record<string, string> = {
  '\u0B95': 'k',
  '\u0B99': 'ng',
  '\u0B9A': 'ch',
  '\u0B9C': 'j',
  '\u0B9E': 'ny',
  '\u0B9F': 't',
  '\u0BA3': 'n',
  '\u0BA4': 'th',
  '\u0BA8': 'n',
  '\u0BA9': 'n',
  '\u0BAA': 'p',
  '\u0BAE': 'm',
  '\u0BAF': 'y',
  '\u0BB0': 'r',
  '\u0BB1': 'r',
  '\u0BB2': 'l',
  '\u0BB3': 'l',
  '\u0BB4': 'zh',
  '\u0BB5': 'v',
  '\u0BB6': 'sh',
  '\u0BB7': 'sh',
  '\u0BB8': 's',
  '\u0BB9': 'h',
};

// ---------------------------------------------------------------------------
// Word-level transliteration
// ---------------------------------------------------------------------------
function transliterateWord(word: string): string {
  const normalized = word.normalize('NFC');
  let res = '';
  let i = 0;
  const n = normalized.length;

  while (i < n) {
    const ch = normalized[i];
    const code = ch.charCodeAt(0);

    // 1. DEVANAGARI (0x0900 - 0x097F)
    if (code >= 0x0900 && code <= 0x097F) {
      if (DEV_VOWELS[ch]) {
        res += DEV_VOWELS[ch];
        i++;
        continue;
      }

      let hasNukta = false;
      let base = '';
      if (i + 1 < n && normalized[i + 1] === '\u093C' && DEV_NUKTA_MAP[ch]) {
        hasNukta = true;
        base = DEV_NUKTA_MAP[ch];
      } else if (DEV_CONSONANTS[ch]) {
        base = DEV_CONSONANTS[ch];
      }

      if (base) {
        const consLen = hasNukta ? 2 : 1;
        const nextIdx = i + consLen;
        const nextCh = nextIdx < n ? normalized[nextIdx] : null;

        // व -> 'w' in open vowel contexts (e.g. alawa, hawa, dawa, deewana)
        if (ch === '\u0935') {
          if (res.endsWith('a') || res.endsWith('aa') || res.endsWith('o') || res.endsWith('e')) {
            base = 'w';
          }
        }

        if (nextCh === '\u094D') {
          // Virama / Halant
          res += base;
          i = nextIdx + 1;
          continue;
        } else if (nextCh && DEV_MATRAS[nextCh]) {
          let matraVal = DEV_MATRAS[nextCh];
          let consumed = 1;

          // Determine 'a' vs 'aa' for ा
          // If followed by a closing consonant or plural matra (बातें, रातों, saath, baat, raat, aasaan, pyaar): 'aa'
          // If at end of word or open repeating vowel (अलावा, tara, mera): 'a'
          if (nextCh === '\u093E') {
            const afterMatra = nextIdx + 1 < n ? normalized[nextIdx + 1] : null;
            if (afterMatra && DEV_CONSONANTS[afterMatra]) {
              const afterAfter = nextIdx + 2 < n ? normalized[nextIdx + 2] : null;
              if (!afterAfter || afterAfter !== '\u093E') {
                matraVal = 'aa';
              }
            }
            // Check for nasalization on ा (e.g. हाँ -> haan, यहाँ -> yahan)
            if (afterMatra === '\u0901' || afterMatra === '\u0902') {
              matraVal = 'aan';
              consumed = 2;
            }
          }

          // ें -> 'ein' (baatein, yaadein, aankhein)
          if (nextCh === '\u0947' && nextIdx + 1 < n && (normalized[nextIdx + 1] === '\u0902' || normalized[nextIdx + 1] === '\u0901')) {
            matraVal = 'ein';
            consumed = 2;
          }

          // ैं -> 'ain' (hain, main)
          if (nextCh === '\u0948' && nextIdx + 1 < n && (normalized[nextIdx + 1] === '\u0902' || normalized[nextIdx + 1] === '\u0901')) {
            matraVal = 'ain';
            consumed = 2;
          }

          // Avoid duplicate 'n' in 'maine' (मैंने)
          if (base === 'n' && res.endsWith('main')) {
            base = '';
          }

          res += base + matraVal;
          i = nextIdx + consumed;
          continue;
        } else if (!nextCh || nextCh.charCodeAt(0) < 0x0900 || nextCh.charCodeAt(0) > 0x097F) {
          // Final consonant of word -> Schwa deletion
          if (res.length === 0) {
            res += base + 'a';
          } else {
            res += base;
          }
          i = nextIdx;
          continue;
        } else {
          // Medial consonant
          if (nextCh === '\u0902' || nextCh === '\u0901') {
            res += base + 'an';
            i = nextIdx + 1;
            continue;
          }
          if (nextCh === '\u0903') {
            res += base + 'ah';
            i = nextIdx + 1;
            continue;
          }

          // Medial schwa deletion: if preceded by short syllable and next consonant has explicit matra
          // e.g. इतनी (itni), मुझको/तुझको (tujhko), करके (karke), अपनी (apni)
          const afterNext = nextIdx + 1 < n ? normalized[nextIdx + 1] : null;
          if (res.length > 0 && afterNext && DEV_MATRAS[afterNext]) {
            res += base;
          } else {
            res += base + 'a';
          }
          i = nextIdx;
          continue;
        }
      }

      if (ch === '\u0901' || ch === '\u0902') {
        const nextLetter = i + 1 < n ? normalized[i + 1] : null;
        if (nextLetter !== '\u0928') {
          res += 'n';
        }
        i++;
        continue;
      }
      if (ch === '\u0903') {
        res += 'h';
        i++;
        continue;
      }
      i++;
    }

    // 2. GURMUKHI (0x0A00 - 0x0A7F)
    else if (code >= 0x0A00 && code <= 0x0A7F) {
      if (GUR_VOWELS[ch]) {
        res += GUR_VOWELS[ch];
        i++;
        continue;
      }

      let hasNukta = false;
      let base = '';
      if (i + 1 < n && normalized[i + 1] === '\u0A3C' && GUR_NUKTA_MAP[ch]) {
        hasNukta = true;
        base = GUR_NUKTA_MAP[ch];
      } else if (GUR_CONSONANTS[ch]) {
        base = GUR_CONSONANTS[ch];
      }

      if (base) {
        const consLen = hasNukta ? 2 : 1;
        const nextIdx = i + consLen;
        const nextCh = nextIdx < n ? normalized[nextIdx] : null;

        if (ch === '\u0A35') {
          if (res.endsWith('a') || res.endsWith('aa') || res.endsWith('o') || res.endsWith('e')) {
            base = 'w';
          }
        }

        if (nextCh === '\u0A4D') {
          res += base;
          i = nextIdx + 1;
          continue;
        } else if (nextCh && GUR_MATRAS[nextCh]) {
          let matraVal = GUR_MATRAS[nextCh];
          let consumed = 1;
          if (nextCh === '\u0A3E') {
            const afterMatra = nextIdx + 1 < n ? normalized[nextIdx + 1] : null;
            if (afterMatra === '\u0A02' || afterMatra === '\u0A70') {
              matraVal = 'aan';
              consumed = 2;
            }
          }
          res += base + matraVal;
          i = nextIdx + consumed;
          continue;
        } else if (!nextCh || nextCh.charCodeAt(0) < 0x0A00 || nextCh.charCodeAt(0) > 0x0A7F) {
          if (res.length === 0) res += base + 'a';
          else res += base;
          i = nextIdx;
          continue;
        } else {
          if (nextCh === '\u0A70' || nextCh === '\u0A71') {
            res += base + 'an';
            i = nextIdx + 1;
            continue;
          }

          // Medial cluster handling (e.g. husn, dost, waqt)
          if (res.length > 0 && nextIdx + 1 >= n) {
            res += base;
          } else {
            res += base + 'a';
          }
          i = nextIdx;
          continue;
        }
      }

      if (ch === '\u0A70' || ch === '\u0A71') {
        res += 'n';
        i++;
        continue;
      }
      i++;
    }

    // 3. BENGALI (0x0980 - 0x09FF)
    else if (code >= 0x0980 && code <= 0x09FF) {
      if (BEN_VOWELS[ch]) {
        res += BEN_VOWELS[ch];
        i++;
        continue;
      }
      if (BEN_CONSONANTS[ch]) {
        const base = BEN_CONSONANTS[ch];
        const nextIdx = i + 1;
        const nextCh = nextIdx < n ? normalized[nextIdx] : null;

        if (nextCh === '\u09CD') {
          res += base;
          i = nextIdx + 1;
          continue;
        } else if (nextCh && BEN_MATRAS[nextCh]) {
          res += base + BEN_MATRAS[nextCh];
          i = nextIdx + 1;
          continue;
        } else if (!nextCh || nextCh.charCodeAt(0) < 0x0980 || nextCh.charCodeAt(0) > 0x09FF) {
          if (res.length === 0) res += base + 'a';
          else res += base;
          i = nextIdx;
          continue;
        } else {
          res += base + 'a';
          i = nextIdx;
          continue;
        }
      }
      if (ch === '\u0981' || ch === '\u0982') {
        res += 'n';
        i++;
        continue;
      }
      i++;
    }

    // 4. GUJARATI (0x0A80 - 0x0AFF)
    else if (code >= 0x0A80 && code <= 0x0AFF) {
      if (GUJ_VOWELS[ch]) {
        res += GUJ_VOWELS[ch];
        i++;
        continue;
      }
      if (GUJ_CONSONANTS[ch]) {
        const base = GUJ_CONSONANTS[ch];
        const nextIdx = i + 1;
        const nextCh = nextIdx < n ? normalized[nextIdx] : null;

        if (nextCh === '\u0ACD') {
          res += base;
          i = nextIdx + 1;
          continue;
        } else if (nextCh && GUJ_MATRAS[nextCh]) {
          res += base + GUJ_MATRAS[nextCh];
          i = nextIdx + 1;
          continue;
        } else if (!nextCh || nextCh.charCodeAt(0) < 0x0A80 || nextCh.charCodeAt(0) > 0x0AFF) {
          if (res.length === 0) res += base + 'a';
          else res += base;
          i = nextIdx;
          continue;
        } else {
          res += base + 'a';
          i = nextIdx;
          continue;
        }
      }
      if (ch === '\u0A81' || ch === '\u0A82') {
        res += 'n';
        i++;
        continue;
      }
      i++;
    }

    // 5. TELUGU (0x0C00 - 0x0C7F)
    else if (code >= 0x0C00 && code <= 0x0C7F) {
      if (TEL_VOWELS[ch]) {
        res += TEL_VOWELS[ch];
        i++;
        continue;
      }
      if (TEL_CONSONANTS[ch]) {
        const base = TEL_CONSONANTS[ch];
        const nextIdx = i + 1;
        const nextCh = nextIdx < n ? normalized[nextIdx] : null;

        if (nextCh === '\u0C4D') {
          res += base;
          i = nextIdx + 1;
          continue;
        } else if (nextCh && TEL_MATRAS[nextCh]) {
          res += base + TEL_MATRAS[nextCh];
          i = nextIdx + 1;
          continue;
        } else {
          res += base + 'a';
          i = nextIdx;
          continue;
        }
      }
      i++;
    }

    // 6. TAMIL (0x0B80 - 0x0BFF)
    else if (code >= 0x0B80 && code <= 0x0BFF) {
      if (TAM_VOWELS[ch]) {
        res += TAM_VOWELS[ch];
        i++;
        continue;
      }
      if (TAM_CONSONANTS[ch]) {
        const base = TAM_CONSONANTS[ch];
        const nextIdx = i + 1;
        const nextCh = nextIdx < n ? normalized[nextIdx] : null;

        if (nextCh === '\u0BCD') {
          res += base;
          i = nextIdx + 1;
          continue;
        } else if (nextCh && TAM_MATRAS[nextCh]) {
          res += base + TAM_MATRAS[nextCh];
          i = nextIdx + 1;
          continue;
        } else {
          res += base + 'a';
          i = nextIdx;
          continue;
        }
      }
      i++;
    }

    // Passthrough non-Indic chars (Latin, numbers, symbols)
    else {
      res += ch;
      i++;
    }
  }

  return res;
}

// ---------------------------------------------------------------------------
// Line-level transliteration
// ---------------------------------------------------------------------------
export function transliterateIndic(text: string): string {
  if (!containsIndic(text)) return text;

  // Split line into tokens preserving all whitespace, delimiters, brackets, and punctuation
  const tokens = text.split(/([\s,.\-?!;:–—'"()[\]{}]+)/);
  const out = tokens.map((token) => transliterateWord(token)).join('');

  // Capitalize first non-delimiter letter for polished typography
  return out.replace(/^([^a-zA-Z]*)([a-z])/, (_, prefix, first) => prefix + first.toUpperCase());
}

// ---------------------------------------------------------------------------
// LyricsResult-level transliteration
// ---------------------------------------------------------------------------
export function transliterateLyrics(lyrics: LyricsResult): LyricsResult {
  let hasIndicAnywhere = false;

  for (const line of lyrics.lines) {
    if (containsIndic(line.text)) {
      hasIndicAnywhere = true;
      break;
    }
  }

  if (!hasIndicAnywhere) {
    return lyrics;
  }

  const newLines: LyricLine[] = lyrics.lines.map((line) => {
    return {
      timeSec: line.timeSec,
      timeFormatted: line.timeFormatted,
      text: transliterateIndic(line.text),
    };
  });

  return {
    ...lyrics,
    lines: newLines,
    transliterated: true,
  };
}
