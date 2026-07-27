import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'timeAgo', standalone: true, pure: false })
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    if (!value) {
      return '';
    }
    const date = typeof value === 'string' ? new Date(value) : value;
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.round(diffMs / 1000);

    if (diffSec < 60) {
      return 'ahora';
    }
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) {
      return `hace ${diffMin} min`;
    }
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) {
      return `hace ${diffHr} h`;
    }
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 7) {
      return `hace ${diffDay} d`;
    }
    return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
