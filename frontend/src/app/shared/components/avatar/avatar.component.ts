import { Component, computed, inject, input } from '@angular/core';
import { InitialsPipe } from '../../pipes/initials.pipe';
import { ThemeService } from '../../../core/services/theme.service';

const PALETTE = ['#14261C', '#1A3D2C', '#1F7A4C', '#3D9A6A', '#E4A01A', '#4A5560'];
/** En oscuro los verdes corporativos se funden con el fondo: se usan tonos claros. */
const PALETTE_DARK = ['#7FD6AD', '#5EC993', '#4DB882', '#8FDCC0', '#F0BC48', '#9FB6C8'];

@Component({
  selector: 'eas-avatar',
  standalone: true,
  imports: [InitialsPipe],
  template: `
    <div
      class="eas-avatar"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.font-size.px]="size() * 0.36"
      [style.background]="imageUrl() ? 'transparent' : bgColor()"
    >
      @if (imageUrl()) {
        <img [src]="imageUrl()" [alt]="name()" />
      } @else {
        <span>{{ name() | initials }}</span>
      }
    </div>
  `,
  styles: [
    `
      .eas-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        color: var(--eas-avatar-ink, #ffffff);
        font-weight: 650;
        overflow: hidden;
        flex: none;
        font-family: 'Sora', sans-serif;
        letter-spacing: -0.02em;
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.2),
          0 6px 14px rgba(20, 38, 28, 0.12);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      .eas-avatar:hover {
        transform: translateY(-1px) scale(1.03);
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.25),
          0 10px 20px rgba(20, 38, 28, 0.16);
      }

      :host-context(html[data-theme='dark']) .eas-avatar {
        --eas-avatar-ink: #06110c;
      }

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    `
  ]
})
export class AvatarComponent {
  private readonly theme = inject(ThemeService);

  readonly name = input<string>('');
  readonly imageUrl = input<string | null | undefined>(null);
  readonly size = input<number>(40);

  readonly bgColor = computed(() => {
    const palette = this.theme.isDark() ? PALETTE_DARK : PALETTE;
    const value = this.name() || '?';
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash + value.charCodeAt(i) * (i + 1)) % palette.length;
    }
    return palette[hash];
  });
}
