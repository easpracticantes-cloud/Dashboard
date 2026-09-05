import { describe, expect, it } from 'vitest';
import { VoiceInputService } from './voice-input.service';

describe('VoiceInputService', () => {
  it('no se queda bloqueado tras reset', () => {
    const svc = new VoiceInputService();
    svc.reset();
    expect(svc.state()).toBe('idle');
    expect(svc.lastError()).toBe('');
  });

  it('supported() es boolean', () => {
    const svc = new VoiceInputService();
    expect(typeof svc.supported()).toBe('boolean');
  });
});
