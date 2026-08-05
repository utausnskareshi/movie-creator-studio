import { describe, expect, it } from 'vitest'
import { findMinimaxTagIssue, hasMinimaxTag } from '../src/shared/minimaxTags'

describe('MiniMax H3 R2V prompt tags', () => {
  it('accepts prompts whose tags all resolve to provided references', () => {
    const issue = findMinimaxTagIssue(
      'The person in <Picture 1> sings <Audio 1> while <Video 2> guides the camera.',
      { images: 1, videos: 2, audios: 1 }
    )
    expect(issue).toBeNull()
  })

  it('flags a Picture index past the provided images', () => {
    const issue = findMinimaxTagIssue('<Picture 2> smiles.', { images: 1, videos: 0, audios: 0 })
    expect(issue).toEqual({ kind: 'Picture', index: 2, available: 1 })
  })

  it('flags an Audio tag when no audio reference exists', () => {
    const issue = findMinimaxTagIssue('sings along to <Audio 1>', { images: 3, videos: 1, audios: 0 })
    expect(issue).toEqual({ kind: 'Audio', index: 1, available: 0 })
  })

  it('flags index 0 (tags are 1-based)', () => {
    const issue = findMinimaxTagIssue('<Video 0> style', { images: 0, videos: 3, audios: 0 })
    expect(issue).toEqual({ kind: 'Video', index: 0, available: 3 })
  })

  it('ignores prompts without tags and unrelated angle brackets', () => {
    expect(findMinimaxTagIssue('a calm <b>scene</b> at dusk', { images: 0, videos: 0, audios: 0 })).toBeNull()
    expect(hasMinimaxTag('a calm scene')).toBe(false)
    expect(hasMinimaxTag('the person in <Picture 1>')).toBe(true)
  })

  it('reports the FIRST offending tag in prompt order', () => {
    const issue = findMinimaxTagIssue('<Picture 1> then <Video 3> then <Audio 9>', {
      images: 1,
      videos: 1,
      audios: 1
    })
    expect(issue).toEqual({ kind: 'Video', index: 3, available: 1 })
  })
})
