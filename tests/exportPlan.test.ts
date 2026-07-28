import { describe, expect, it } from 'vitest'
import { buildExportArgs, q } from '../src/main/media/exportPlan'
import type { ExportRequest, VideoRecord } from '../src/shared/types'

/**
 * Independent reimplementation of the token-unescaping BEHAVIOR ffmpeg
 * documents for filtergraphs (ffmpeg-utils "Quoting and escaping"; applied
 * by av_get_token to BOTH the filtergraph description and each filter's
 * option string). Written from the documented rules, not from ffmpeg's
 * source. Escaping is only "correct" if running this twice returns the
 * original text — asserting on the escaped bytes proves nothing.
 *   - "\x"  -> x  (anywhere outside quotes)
 *   - "'..'" -> contents copied VERBATIM (no backslash processing)
 *   - stops at any character in `term`
 */
function avGetToken(s: string, term: string): { token: string; rest: string } {
  let out = ''
  let p = 0
  while (p < s.length && !term.includes(s[p])) {
    const c = s[p++]
    if (c === '\\' && p < s.length) {
      out += s[p++]
    } else if (c === "'") {
      while (p < s.length && s[p] !== "'") out += s[p++]
      if (p < s.length) p++ // consume the closing quote
    } else {
      out += c
    }
  }
  return { token: out, rest: s.slice(p) }
}

/**
 * What drawtext finally receives for an option VALUE: the filtergraph pass
 * (terminators "[],;"), then the option pass. av_opt_get_key_value() splits
 * the key at "=" and then reads the value with av_get_token(&buf, pairs_sep),
 * so the value token stops at ":" only — "=" inside a value is ordinary.
 */
function ffmpegUnescapeTwice(escaped: string): string {
  const pass1 = avGetToken(escaped, '[],;').token
  return avGetToken(pass1, ':').token
}

function rec(id: string, durationSec = 5): VideoRecord {
  return {
    id,
    filePath: `C:\\lib\\${id}.mp4`,
    thumbPath: `C:\\lib\\${id}.jpg`,
    family: 'wan22',
    mode: 't2v',
    prompt: 'p',
    negative: 'n',
    seed: 1,
    width: 1280,
    height: 704,
    fps: 16,
    frames: 81,
    durationSec,
    createdAt: 0,
    favorite: false,
    tags: [],
    requestJson: '{}',
    modelLabel: 'test'
  }
}

function baseReq(partial?: Partial<ExportRequest>): ExportRequest {
  return {
    project: {
      clips: [
        { videoId: 'a', inSec: 0, outSec: 0 },
        { videoId: 'b', inSec: 1, outSec: 4 }
      ],
      bgm: { path: 'C:\\music\\bgm.mp3', offsetSec: 0, gainDb: -12, loop: true },
      overlays: [
        {
          text: "It's a 100% test: value",
          startSec: 0,
          endSec: 3,
          position: 'bottom',
          fontSizePct: 5,
          color: '#ffffff',
          outline: true
        }
      ],
      fadeInSec: 0.5,
      fadeOutSec: 0.5,
      keepClipAudio: false
    },
    presetId: 'shorts',
    aspectMode: 'blurpad',
    smoothInterpolation: true,
    upscale: true,
    loudnessNormalize: true,
    outputName: 'test',
    ...partial
  }
}

describe('buildExportArgs', () => {
  const records = new Map([
    ['a', rec('a', 5)],
    ['b', rec('b', 5)]
  ])

  it('computes total duration from trims', () => {
    const built = buildExportArgs(baseReq(), records, [false, false], false, 'C:\\out\\o.mp4', null)
    expect(built.totalDurationSec).toBeCloseTo(5 + 3, 3)
  })

  it('builds a coherent filtergraph with all pieces', () => {
    const built = buildExportArgs(baseReq(), records, [false, false], true, 'C:\\out\\o.mp4', 'C:/Windows/Fonts/meiryo.ttc')
    const fc = built.args[built.args.indexOf('-filter_complex') + 1]
    expect(fc).toContain('concat=n=2:v=1:a=0')
    expect(fc).toContain('minterpolate=fps=30')
    expect(fc).toContain('drawtext=')
    // bgm is mixed in at its set gain
    expect(fc).toContain('[bgm0]')
    expect(fc).toContain('loudnorm=I=-14')
    expect(fc).toContain('fade=t=out')
    // 9:16 preset dims applied
    expect(fc).toContain('scale=1080:1920')
    // expansion must be off so %{...} in user text is not interpreted
    expect(fc).toContain('expansion=none')
    // ...and it must still BE an option, i.e. the apostrophe in the overlay
    // text ("It's a 100% test: value") must not have swallowed the rest of
    // the drawtext option list
    const dt = fc.slice(fc.indexOf('drawtext='))
    expect(dt).toContain(':fontsize=')
    expect(dt).toContain(':enable=')
    // nvenc path
    expect(built.args).toContain('h264_nvenc')
    expect(built.args[built.args.length - 1]).toBe('C:\\out\\o.mp4')
  })

  it('falls back to libx264 without nvenc and fps filter without smoothing', () => {
    const built = buildExportArgs(
      baseReq({ smoothInterpolation: false }),
      records,
      [false, false],
      false,
      'C:\\out\\o.mp4',
      null
    )
    const fc = built.args[built.args.indexOf('-filter_complex') + 1]
    expect(fc).toContain('fps=30')
    expect(fc).not.toContain('minterpolate')
    expect(built.args).toContain('libx264')
  })

  it('keeps clip audio on mixed timelines: silent clips become silence segments', () => {
    const req = baseReq()
    req.project.keepClipAudio = true
    req.project.bgm = null
    // clip a = LTX-2.3 (has audio), clip b = Wan (silent)
    const built = buildExportArgs(req, records, [true, false], false, 'C:\\out\\o.mp4', null)
    const fc = built.args[built.args.indexOf('-filter_complex') + 1]
    expect(fc).toContain('[0:a]atrim=')
    // each real-audio segment is padded to the exact clip duration
    expect(fc).toContain('apad=whole_dur=5.000')
    expect(fc).toContain('aevalsrc=0:d=3.000')
    expect(fc).toContain('concat=n=2:v=0:a=1[acat]')
    // real audio present → loudnorm applies
    expect(fc).toContain('loudnorm=I=-14')
  })

  it('adversarial: newlines in overlay text cannot split the filtergraph', () => {
    const req = baseReq()
    req.project.overlays = [
      {
        text: "line1\nline2\r\nend's: 100%",
        startSec: 0,
        endSec: 3,
        position: 'bottom',
        fontSizePct: 5,
        color: '#ffffff',
        outline: true
      }
    ]
    const built = buildExportArgs(req, records, [false, false], false, 'C:\\out\\o.mp4', null)
    const fc = built.args[built.args.indexOf('-filter_complex') + 1]
    expect(fc).not.toContain('\n')
    expect(fc).not.toContain('\r')
    expect(fc).toContain('line1 line2 end')
  })

  it('bgm offsetSec delays the bgm start via adelay (before the length trim)', () => {
    const req = baseReq()
    req.project.bgm = { path: 'C:\\music\\bgm.mp3', offsetSec: 2.5, gainDb: -12, loop: true }
    const built = buildExportArgs(req, records, [false, false], false, 'C:\\out\\o.mp4', null)
    const fc = built.args[built.args.indexOf('-filter_complex') + 1]
    expect(fc).toContain('adelay=2500|2500')
    expect(fc).toMatch(/adelay=2500\|2500,atrim=0:8\.000\[bgm0\]/)
    // offset 0 emits no adelay
    req.project.bgm = { path: 'C:\\music\\bgm.mp3', offsetSec: 0, gainDb: -12, loop: true }
    const built2 = buildExportArgs(req, records, [false, false], false, 'C:\\out\\o.mp4', null)
    expect(built2.args[built2.args.indexOf('-filter_complex') + 1]).not.toContain('adelay=')
  })

  it('drops clip audio entirely when keepClipAudio is false', () => {
    const built = buildExportArgs(baseReq(), records, [true, true], false, 'C:\\out\\o.mp4', null)
    const fc = built.args[built.args.indexOf('-filter_complex') + 1]
    expect(fc).not.toContain('[acat]')
  })

  it('works with a single clip and no audio extras', () => {
    const req = baseReq()
    req.project.clips = [{ videoId: 'a', inSec: 0, outSec: 2 }]
    req.project.bgm = null
    req.project.overlays = []
    const built = buildExportArgs(req, records, [false], false, 'C:\\out\\o.mp4', null)
    expect(built.totalDurationSec).toBeCloseTo(2, 3)
    const fc = built.args[built.args.indexOf('-filter_complex') + 1]
    expect(fc).toContain('concat=n=1:v=1:a=0')
    // silence comes from the -f lavfi input, not from inside the filtergraph
    expect(fc).not.toContain('anullsrc')
    expect(built.args.join(' ')).toContain('anullsrc=r=48000:cl=stereo')
  })
})

describe('clip trim validation', () => {
  const records = new Map([
    ['a', rec('a', 5)],
    ['b', rec('b', 5)]
  ])

  it('rejects an inverted in/out instead of emitting an empty trim segment', () => {
    const req = baseReq()
    req.project.clips = [{ videoId: 'a', inSec: 4, outSec: 2 }]
    expect(() => buildExportArgs(req, records, [false], false, 'C:\\out\\o.mp4', null)).toThrow(
      /切り出し範囲/
    )
  })

  it('rejects a zero-length clip', () => {
    const req = baseReq()
    req.project.clips = [{ videoId: 'a', inSec: 3, outSec: 3 }]
    expect(() => buildExportArgs(req, records, [false], false, 'C:\\out\\o.mp4', null)).toThrow(
      /切り出し範囲/
    )
  })

  it('rejects an in-point past the end of the clip (never a negative duration)', () => {
    const req = baseReq()
    // rec 'a' is 5s long; outSec 0 means "to the end"
    req.project.clips = [{ videoId: 'a', inSec: 99, outSec: 0 }]
    expect(() => buildExportArgs(req, records, [false], false, 'C:\\out\\o.mp4', null)).toThrow(
      /切り出し範囲/
    )
  })

  it('still accepts a normal trim', () => {
    const req = baseReq()
    req.project.clips = [{ videoId: 'a', inSec: 1, outSec: 4 }]
    const built = buildExportArgs(req, records, [false], false, 'C:\\out\\o.mp4', null)
    expect(built.totalDurationSec).toBeCloseTo(3, 3)
  })
})

describe('q() — ffmpeg filter-option escaping', () => {
  // The previous implementation used the POSIX shell idiom '\'' , which
  // survives ffmpeg's FIRST unescape pass but leaves a BARE apostrophe for the
  // second one — that quote then swallowed every following drawtext option
  // (fontfile, fontsize, x, y, enable...). Round-tripping through both passes
  // is the only assertion that can actually catch this.
  const cases: Array<[string, string]> = [
    ['plain', 'hello world'],
    ['apostrophe', "don't"],
    ['multiple apostrophes', "it's a 'quoted' word"],
    ['colon', 'time 12:34'],
    ['windows font path', 'C:/Windows/Fonts/meiryo.ttc'],
    ['backslash', 'a\\b'],
    ['backslash before quote', "a\\'b"],
    ['japanese + punctuation', '「テスト」: 100% それは"良い"'],
    ['filtergraph metacharacters', 'a[b],c;d=e'],
    ['percent expansion attempt', '%{pts}'],
    ['everything at once', "C:/x'y\\z: 「あ」 [1],2;3"]
  ]

  for (const [name, text] of cases) {
    it(`round-trips through both ffmpeg unescape passes: ${name}`, () => {
      expect(ffmpegUnescapeTwice(q(text))).toBe(text)
    })
  }

  it('regression: the POSIX shell idiom would NOT survive the second pass', () => {
    const posixStyle = `'${"don't".replace(/'/g, `'\\''`)}'`
    expect(ffmpegUnescapeTwice(posixStyle)).not.toBe("don't")
  })

  it('an escaped value cannot terminate the option list early', () => {
    // after pass 1 the option separator must still be intact, i.e. the
    // escaped value must not contain a bare ":" or "'"
    const pass1 = avGetToken(`text=${q("it's: [x]")}:fontsize=96`, '[],;').token
    expect(pass1).toContain(':fontsize=96')
    expect(avGetToken(pass1.slice('text='.length), ':').token).toBe("it's: [x]")
  })
})
