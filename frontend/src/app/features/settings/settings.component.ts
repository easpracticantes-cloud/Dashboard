import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SettingsService } from '../../core/services/settings.service';
import { IntegrationsService } from '../../core/services/integrations.service';
import { LiveSyncService } from '../../core/services/live-sync.service';
import { OpsService } from '../../core/services/ops.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { SettingDto } from '../../core/models/settings.model';
import { IntegrationStatusDto, IntegrationStatusValue } from '../../core/models/integration.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

const STATUS_VISUAL: Record<IntegrationStatusValue, { label: string; classes: string }> = {
  CONNECTED: { label: 'Conectado', classes: 'status status--ok' },
  READY: { label: 'Listo', classes: 'status status--ready' },
  DISABLED: { label: 'Deshabilitado', classes: 'status status--off' },
  ERROR: { label: 'Error', classes: 'status status--err' }
};

type HubSection =
  | 'GENERAL'
  | 'SHEETS'
  | 'WHATSAPP'
  | 'NOTIFICATIONS'
  | 'APPEARANCE'
  | 'HEALTH'
  | 'USERS'
  | 'SECURITY';

@Component({
  selector: 'eas-settings',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, MatIconModule, PageHeaderComponent, EmptyStateComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  private readonly settingsService = inject(SettingsService);
  private readonly integrationsService = inject(IntegrationsService);
  readonly liveSync = inject(LiveSyncService);
  private readonly ops = inject(OpsService);
  readonly theme = inject(ThemeService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly syncing = signal(false);
  readonly saved = signal(false);
  readonly syncMessage = signal<string | null>(null);
  readonly settings = signal<SettingDto[]>([]);
  readonly integrations = signal<IntegrationStatusDto[]>([]);
  readonly section = signal<HubSection>('GENERAL');

  readonly healthItems = signal<{ code: string; status: string; description?: string }[]>([]);
  readonly quality = signal<{
    missingEmail: number;
    missingAdvisor: number;
    duplicatePhones: number;
    conversationsMissingKey: number;
  } | null>(null);
  readonly audit = signal<
    { id: string; action: string; entityType: string; entityId?: string; details?: string; createdAt: string }[]
  >([]);
  readonly activeUsers = signal<{ id: string; fullName?: string; username?: string; role?: string }[]>([]);
  readonly roleCounts = signal<{ role: string; count: number }[]>([]);
  readonly digest = signal<Record<string, unknown> | null>(null);

  readonly statusVisual = STATUS_VISUAL;

  readonly sections: { key: HubSection; label: string; icon: string }[] = [
    { key: 'GENERAL', label: 'General', icon: 'tune' },
    { key: 'SHEETS', label: 'Google Sheets', icon: 'grid_on' },
    { key: 'WHATSAPP', label: 'WhatsApp', icon: 'chat' },
    { key: 'NOTIFICATIONS', label: 'Notificaciones', icon: 'notifications' },
    { key: 'APPEARANCE', label: 'Apariencia', icon: 'palette' },
    { key: 'HEALTH', label: 'Salud del sistema', icon: 'monitor_heart' },
    { key: 'USERS', label: 'Usuarios y permisos', icon: 'admin_panel_settings' },
    { key: 'SECURITY', label: 'Seguridad', icon: 'shield' }
  ];

  readonly visibleSettings = computed(() => {
    const all = this.settings();
    switch (this.section()) {
      case 'GENERAL':
        return all.filter((s) => s.category === 'GENERAL');
      case 'SHEETS':
        return all.filter((s) => s.key.toLowerCase().includes('sheets') || s.key.includes('googleSheets'));
      case 'WHATSAPP':
        return all.filter((s) => s.key.toLowerCase().includes('whatsapp'));
      case 'NOTIFICATIONS':
        return all.filter((s) => s.category === 'NOTIFICATIONS' || s.key.startsWith('notifications.'));
      case 'APPEARANCE':
        return all.filter((s) => s.category === 'APPEARANCE' || s.key.startsWith('appearance.'));
      case 'SECURITY':
        return all.filter((s) => s.category === 'SECURITY');
      default:
        return [];
    }
  });

  readonly sheetsIntegration = computed(() =>
    this.integrations().find((i) => i.code === 'GOOGLE_SHEETS' || i.name?.includes('Sheets'))
  );
  readonly whatsappIntegration = computed(() =>
    this.integrations().find((i) => i.code === 'WHATSAPP' || i.name?.toLowerCase().includes('whatsapp'))
  );

  constructor() {
    this.reload();
  }

  reload(): void {
    this.settingsService.getSettings().subscribe((settings) => {
      this.settings.set(settings);
      this.loading.set(false);
    });
    this.integrationsService.getStatus().subscribe((integrations) => this.integrations.set(integrations));
    this.loadHubData();
  }

  loadHubData(): void {
    this.ops.getIntegrationsHealth().subscribe((items) => this.healthItems.set(items));
    this.ops.getQualitySnapshot().subscribe((q) => this.quality.set(q));
    this.ops.getRecentAudit(15).subscribe((rows) => this.audit.set(rows));
    this.ops.getActiveUsers().subscribe((users) => this.activeUsers.set(users));
    this.ops.getUsersByRole().subscribe((rows) => this.roleCounts.set(rows));
    this.ops.getOperationalDigest().subscribe((d) => this.digest.set(d));
  }

  setSection(section: HubSection): void {
    this.section.set(section);
    if (section === 'HEALTH') {
      this.loadHubData();
    }
  }

  updateValue(key: string, value: string): void {
    this.settings.update((items) => items.map((s) => (s.key === key ? { ...s, value } : s)));
  }

  toggleBoolean(key: string, checked: boolean): void {
    this.updateValue(key, checked ? 'true' : 'false');
  }

  isBooleanSetting(key: string, value: string): boolean {
    const v = (value || '').toLowerCase();
    return (
      key.toLowerCase().includes('enabled') ||
      v === 'true' ||
      v === 'false'
    );
  }

  setTheme(mode: ThemeMode): void {
    this.theme.set(mode);
    this.updateValue('appearance.theme', mode);
  }

  save(): void {
    this.saving.set(true);
    const items = this.settings().map((s) => ({ key: s.key, value: s.value }));
    this.settingsService.updateSettings(items).subscribe(() => {
      this.saving.set(false);
      this.saved.set(true);
      this.reload();
      setTimeout(() => this.saved.set(false), 2500);
    });
  }

  syncSheets(): void {
    this.syncing.set(true);
    this.syncMessage.set(null);
    this.integrationsService.syncSheets().subscribe((result) => {
      this.syncing.set(false);
      this.syncMessage.set(result?.message ?? 'No se pudo sincronizar.');
      this.liveSync.refresh(false);
      this.reload();
    });
  }

  exportAdvisorCsv(): void {
    this.ops.exportQuotesCsv().subscribe((blob) => {
      if (blob) this.ops.downloadBlob(blob, 'cotizaciones.csv');
    });
  }

  friendlyLabel(key: string): string {
    const map: Record<string, string> = {
      'company.name': 'Nombre de la empresa',
      'company.timezone': 'Zona horaria',
      'company.language': 'Idioma',
      'integrations.googleSheetsEnabled': 'Habilitar Google Sheets',
      'integrations.googleSheets.spreadsheetId': 'ID del spreadsheet',
      'integrations.googleSheets.range': 'Rango de celdas',
      'integrations.googleSheets.pollSeconds': 'Intervalo de sincronización (seg)',
      'integrations.googleSheets.webAppUrl': 'URL del Web App (Apps Script)',
      'integrations.whatsappProvider': 'Proveedor WhatsApp',
      'notifications.emailEnabled': 'Notificaciones por correo',
      'notifications.whatsappEnabled': 'Notificaciones WhatsApp',
      'appearance.theme': 'Tema (light/dark)',
      'appearance.primaryColor': 'Color primario',
      'security.sessionTimeoutMinutes': 'Timeout de sesión (min)',
      'security.passwordResetTokenMinutes': 'Token de recuperación (min)'
    };
    return map[key] ?? key;
  }

  digestNumber(key: string): number | string {
    const d = this.digest();
    if (!d) return '—';
    const value = d[key];
    return typeof value === 'number' || typeof value === 'string' ? value : '—';
  }
}
