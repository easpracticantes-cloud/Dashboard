import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, Observable } from 'rxjs';
import { ReportsService } from '../../core/services/reports.service';
import { OpsService } from '../../core/services/ops.service';
import { ReportSummaryDto } from '../../core/models/report.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'eas-reports',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, MatIconModule, PageHeaderComponent],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss'
})
export class ReportsComponent {
  private readonly reportsService = inject(ReportsService);
  private readonly ops = inject(OpsService);

  readonly loading = signal(true);
  readonly summary = signal<ReportSummaryDto | null>(null);
  readonly digest = signal<Record<string, unknown> | null>(null);
  readonly exportingCsv = signal(false);
  readonly exportingPdf = signal(false);
  readonly exportingBusy = signal<string | null>(null);

  constructor() {
    forkJoin({
      summary: this.reportsService.getConversationsSummary(),
      digest: this.ops.getCommercialDigest()
    }).subscribe({
      next: ({ summary, digest }) => {
        this.summary.set(summary);
        this.digest.set(digest);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  digestNumber(key: string): number {
    const v = this.digest()?.[key];
    return typeof v === 'number' ? v : Number(v ?? 0);
  }

  exportCsv(): void {
    this.exportingCsv.set(true);
    this.reportsService.exportCsv().subscribe((blob) => {
      this.exportingCsv.set(false);
      if (blob) {
        downloadBlob(blob, 'reporte-conversaciones.csv');
      }
    });
  }

  exportPdf(): void {
    this.exportingPdf.set(true);
    this.reportsService.exportPdf().subscribe((blob) => {
      this.exportingPdf.set(false);
      if (blob) {
        downloadBlob(blob, 'reporte-conversaciones.pdf');
      }
    });
  }

  exportQuotes(): void {
    this.runExport('quotes', () => this.ops.exportQuotesCsv(), 'cotizaciones.csv');
  }

  exportSales(): void {
    this.runExport('sales', () => this.ops.exportSalesCsv(), 'ventas.csv');
  }

  exportReservations(): void {
    this.runExport('reservations', () => this.ops.exportReservationsCsv(), 'reservas.csv');
  }

  exportClients(): void {
    this.runExport('clients', () => this.ops.exportClientsCsv(), 'clientes.csv');
  }

  exportAdvisors(): void {
    this.runExport('advisors', () => this.ops.exportAdvisorPerformanceCsv(), 'desempeno-asesores.csv');
  }

  private runExport(key: string, request: () => Observable<Blob | null>, filename: string): void {
    this.exportingBusy.set(key);
    request().subscribe((blob) => {
      this.exportingBusy.set(null);
      if (blob) {
        this.ops.downloadBlob(blob, filename);
      }
    });
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
