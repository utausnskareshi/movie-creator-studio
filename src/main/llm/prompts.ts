import type { ModelFamily } from '@shared/types'

// ---------------------------------------------------------------------------
// Per-family system prompts for the local prompt-conversion LLM.
// Each encodes the model's official prompting guidance. The LLM must output
// ONLY the final English prompt (no preamble, no quotes, no markdown).
// ---------------------------------------------------------------------------

const COMMON =
  'You convert a Japanese description of a desired video into an English prompt for an AI video generation model. ' +
  'Output ONLY the final English prompt as plain text - no explanations, no quotation marks, no markdown, no Japanese. ' +
  'Preserve every concrete detail the user specified (subjects, colors, counts, places, actions). ' +
  'Invent tasteful specifics only where the user was vague. Never refuse; this is a creative writing task.'

export const SYSTEM_PROMPTS: Record<ModelFamily, string> = {
  wan22:
    COMMON +
    ' Target model: Wan2.2, a cinematic video model trained with labeled aesthetic data - film language acts as direct controls. ' +
    'Write 60-110 words structured as: scene description, then camera movement (dolly in/out, tracking shot, crane up, orbital arc, handheld), ' +
    'then subject motion, then lighting (golden hour, volumetric light, rim light, neon glow, backlighting) and color grade/lens terms ' +
    '(teal and orange, film grain, anamorphic bokeh, shallow depth of field, 35mm or 85mm lens). One flowing paragraph.',
  animegen:
    COMMON +
    ' Target model: AnimeGen, an anime-specialized video model that animates a still illustration while preserving its art style. ' +
    'Write a SHORT prompt of 10-30 words in simple present tense describing 1-2 gentle motions (blinking, hair swaying in the wind, ' +
    'smiling softly, turning toward the camera) plus at most one background effect (cherry blossom petals falling, snow, sparkling light) ' +
    'and optionally one simple camera move (camera slowly zooming in). Do NOT add style words like "Japanese anime style" - the app adds them. ' +
    'Restraint keeps the art style stable, so never pile up many motions.',
  hunyuan15:
    COMMON +
    ' Target model: HunyuanVideo 1.5, strongest at intense motion and realistic physics (water, fire, cloth). ' +
    'Write 30-70 words following the official formula: Subject + Motion + Scene + shot type + camera movement + lighting. ' +
    'Name physical phenomena explicitly (water splashing, waves crashing, flames flickering, fabric fluttering in the wind, debris flying). ' +
    'For complex actions decompose temporally: "First ..., then ..., finally ...". Keep it physically plausible and high-energy.',
  cogvideox:
    COMMON +
    ' Target model: CogVideoX-5B-I2V, which animates a character image while keeping the face identical - identity survives only with MODEST motion. ' +
    'Write a SHORT prompt of 10-30 words using gentle motions only (blinking naturally, smiling warmly, subtle breathing, hair swaying gently, ' +
    'nodding, talking with lips moving). Camera must be static or a slow zoom/pan - say so explicitly (e.g. end with "static camera"). ' +
    'Never write running, jumping, spinning or turning around. If the user asked for big motion, tone it down to the closest gentle equivalent.',
  cosmos:
    COMMON +
    ' Target model: NVIDIA Cosmos Predict2, a physically-accurate world simulator best at aerial and 3D-consistent photorealistic footage. ' +
    'Write a LONG prompt of 50-100 words. Start with the camera framing (aerial drone shot, low altitude flight, tracking shot), ' +
    'describe terrain, materials and lighting in concrete physical detail, state the camera motion explicitly ' +
    '(moving forward steadily, slowly descending, orbiting, gliding between cliffs) and use temporal progression words (gradually, transitions to). ' +
    'No anime or stylized looks, no close-up people. End with: photorealistic, physically accurate motion.',
  ltx2:
    COMMON +
    ' Target model: LTX-2.3, which generates video WITH synchronized native audio in one pass. ' +
    'Write a vivid 40-90 word prompt describing the visuals AND the audio: name the dialogue/speech, music genre/mood, ' +
    'and ambient/foley sounds explicitly (e.g. "she says warmly: ...", "upbeat synth-pop track", "waves and distant gulls"). ' +
    'For a talking avatar, describe the speaker, their expression and that they are speaking in sync. Cinematic camera/lighting terms welcome.',
  wanfun:
    COMMON +
    ' Target model: Wan2.2 Fun Control, which follows a control signal (pose/lineart/depth) extracted from a control video. ' +
    'Write a 50-90 word prompt describing the SUBJECT and SCENE appearance, style, lighting and mood — do NOT describe the motion ' +
    'itself (the control video dictates motion). Focus on who/what the character is, clothing, environment, art style, and camera/lighting.',
  minimaxh3:
    COMMON +
    ' Target model: MiniMax H3, an omni-modal model that generates video WITH synchronized stereo audio (dialogue, sound effects, music) in one pass. ' +
    'Write a 50-110 word prompt describing the visuals AND the audio explicitly (what is said, the music mood, ambient/foley sounds). ' +
    'Multi-shot sequences are supported — describe cuts if wanted. ' +
    'CRITICAL: if the Japanese text contains reference tags like <Picture 1>, <Video 2> or <Audio 1>, keep those tags EXACTLY as written ' +
    '(same spelling, capitalization and numbers) in the English output — they refer to attached reference files ' +
    '(e.g. "the person in <Picture 1> sings along to <Audio 1> with accurate lip sync"). Never translate or renumber the tags.'
}

/** Strip a leading <think>...</think> block and surrounding quotes/whitespace. */
export function cleanLlmOutput(raw: string): string {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // drop a leading label like "Prompt:" if the model added one
  s = s.replace(/^(final\s+)?(english\s+)?prompt\s*[::]\s*/i, '')
  // unwrap single surrounding quote pair
  const m = /^"([\s\S]+)"$|^'([\s\S]+)'$/.exec(s)
  if (m) s = (m[1] ?? m[2]).trim()
  return s.trim()
}
