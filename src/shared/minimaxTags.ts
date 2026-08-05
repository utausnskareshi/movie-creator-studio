/**
 * MiniMax H3 Ref2VA prompt tags: <Picture i> / <Video k> / <Audio j>,
 * 1-based per media type, matching the node's fixed presentation order
 * (images, then videos, then standalone audio). A tag whose index has no
 * corresponding reference is undefined behavior model-side, so the app
 * blocks it before submission (screen + queue sanitize).
 */

export interface MinimaxTagIssue {
  kind: 'Picture' | 'Video' | 'Audio'
  index: number
  available: number
}

const TAG_RE = /<(Picture|Video|Audio)\s+(\d+)>/g

/** First tag referencing a missing media slot, or null when all tags resolve. */
export function findMinimaxTagIssue(
  prompt: string,
  counts: { images: number; videos: number; audios: number }
): MinimaxTagIssue | null {
  const map = { Picture: counts.images, Video: counts.videos, Audio: counts.audios } as const
  const re = new RegExp(TAG_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(prompt))) {
    const kind = m[1] as MinimaxTagIssue['kind']
    const index = Number(m[2])
    if (index < 1 || index > map[kind]) return { kind, index, available: map[kind] }
  }
  return null
}

/** Whether the prompt references any media tag at all (for a soft UI hint). */
export function hasMinimaxTag(prompt: string): boolean {
  return new RegExp(TAG_RE.source).test(prompt)
}
