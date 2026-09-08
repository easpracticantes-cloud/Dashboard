import { describe, expect, it } from 'vitest';
import {
  rmsFromSamples,
  shouldArmSpeakingBargeIn,
  sustainedSpeech,
  voiceActivityDetected
} from './voice-barge-in';

describe('voice-barge-in', () => {
  it('solo arma VAD si Ave habla, hay mic y no está el STT', () => {
    expect(
      shouldArmSpeakingBargeIn({ speaking: true, alreadyListening: false, micGranted: true })
    ).toBe(true);
    expect(
      shouldArmSpeakingBargeIn({ speaking: true, alreadyListening: true, micGranted: true })
    ).toBe(false);
    expect(
      shouldArmSpeakingBargeIn({ speaking: false, alreadyListening: false, micGranted: true })
    ).toBe(false);
    expect(
      shouldArmSpeakingBargeIn({ speaking: true, alreadyListening: false, micGranted: false })
    ).toBe(false);
  });

  it('detecta actividad sostenida y no un clic', () => {
    expect(voiceActivityDetected(0.08)).toBe(true);
    expect(voiceActivityDetected(0.001)).toBe(false);
    expect(sustainedSpeech(50)).toBe(false);
    expect(sustainedSpeech(200)).toBe(true);
  });

  it('rms de silencio es bajo', () => {
    expect(rmsFromSamples([0, 0, 0, 0])).toBe(0);
    expect(rmsFromSamples([1, -1, 1, -1])).toBeGreaterThan(0.5);
  });
});
