// Suggests a sidebar folder for an unfiled thread by comparing its title with
// the titles already in each folder. Rare shared words count for more than
// common ones, so "Buildkite" says more than "review".

const STOPWORDS = new Set([
  // English
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "new",
  "no",
  "not",
  "of",
  "on",
  "or",
  "our",
  "so",
  "than",
  "that",
  "the",
  "their",
  "then",
  "this",
  "to",
  "up",
  "vs",
  "was",
  "we",
  "what",
  "when",
  "where",
  "which",
  "why",
  "will",
  "with",
  "you",
  "your",
  // Italian
  "al",
  "alla",
  "alle",
  "agli",
  "che",
  "come",
  "con",
  "cosa",
  "da",
  "dal",
  "dalla",
  "dei",
  "del",
  "della",
  "delle",
  "di",
  "e",
  "è",
  "gli",
  "il",
  "la",
  "le",
  "lo",
  "nel",
  "nella",
  "non",
  "per",
  "più",
  "quale",
  "quali",
  "se",
  "su",
  "sul",
  "sulla",
  "tra",
  "un",
  "una",
  "uno",
]);

export function titleTokens(title: string): ReadonlySet<string> {
  const tokens = new Set<string>();
  for (const raw of title.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
    // Plurals match their singular: "runners" and "runner", "checks" and "check".
    tokens.add(raw.length > 3 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw);
  }
  return tokens;
}

export interface FolderSuggestionInput {
  readonly folders: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  /** Every thread the client knows, filed or not, for word rarity and folder vocabularies. */
  readonly threads: ReadonlyArray<{ readonly key: string; readonly title: string }>;
  readonly folderIdByThreadKey: Readonly<Record<string, string>>;
  /** Unfiled threads that may get a suggestion. */
  readonly candidateKeys: ReadonlyArray<string>;
  /** Suggestions the user dismissed, by thread key. */
  readonly dismissedFolderIdByThreadKey: Readonly<Record<string, string>>;
}

/** Share of the title's word weight a folder must cover. */
const MIN_SCORE = 0.25;
/** How far the best folder must lead the runner-up. */
const MIN_LEAD = 1.5;

export function suggestFolders(input: FolderSuggestionInput): ReadonlyMap<string, string> {
  const suggestions = new Map<string, string>();
  if (input.folders.length === 0 || input.candidateKeys.length === 0) return suggestions;

  const tokensByKey = new Map<string, ReadonlySet<string>>();
  const documentFrequency = new Map<string, number>();
  for (const thread of input.threads) {
    const tokens = titleTokens(thread.title);
    tokensByKey.set(thread.key, tokens);
    for (const token of tokens)
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }
  const documents = Math.max(input.threads.length, 1);
  const weight = (token: string) =>
    Math.log(1 + documents / (1 + (documentFrequency.get(token) ?? 0)));

  // A folder's vocabulary: its name and the titles filed in it.
  const vocabularyByFolder = new Map<string, Set<string>>();
  for (const folder of input.folders) {
    vocabularyByFolder.set(folder.id, new Set(titleTokens(folder.name)));
  }
  for (const [threadKey, folderId] of Object.entries(input.folderIdByThreadKey)) {
    const vocabulary = vocabularyByFolder.get(folderId);
    const tokens = tokensByKey.get(threadKey);
    if (!vocabulary || !tokens) continue;
    for (const token of tokens) vocabulary.add(token);
  }

  for (const key of input.candidateKeys) {
    if (key in input.folderIdByThreadKey) continue;
    const tokens = tokensByKey.get(key);
    if (!tokens || tokens.size === 0) continue;
    let total = 0;
    for (const token of tokens) total += weight(token);
    let best: { id: string; score: number } | null = null;
    let runnerUp = 0;
    for (const [folderId, vocabulary] of vocabularyByFolder) {
      let shared = 0;
      for (const token of tokens) if (vocabulary.has(token)) shared += weight(token);
      const score = shared / total;
      if (best === null || score > best.score) {
        runnerUp = best?.score ?? 0;
        best = { id: folderId, score };
      } else if (score > runnerUp) {
        runnerUp = score;
      }
    }
    if (best === null || best.score < MIN_SCORE || best.score < runnerUp * MIN_LEAD) continue;
    if (input.dismissedFolderIdByThreadKey[key] === best.id) continue;
    suggestions.set(key, best.id);
  }
  return suggestions;
}
