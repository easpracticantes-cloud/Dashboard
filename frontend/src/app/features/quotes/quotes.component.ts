import { Component, effect, inject, signal } from '@angular/core';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CommercialService, CommercialStatus, QuoteDto } from '../../core/services/commercial.service';
import { ClientsService } from '../../core/services/clients.service';
import { LiveSyncService } from '../../core/services/live-sync.service';
import { OpsService } from '../../core/services/ops.service';
import { Client } from '../../core/models/client.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'eas-quotes',
  standalone: true,
  imports: [DatePipe, CurrencyPipe, FormsModule, MatIconModule, PageHeaderComponent, EmptyStateComponent],
  templateUrl: './quotes.component.html',
  styleUrl: './commercial-page.scss'
})
export class QuotesComponent {
  private readonly commercial = inject(CommercialService);
  private readonly clientsService = inject(ClientsService);
  private readonly liveSync = inject(LiveSyncService);
  private readonly ops = inject(OpsService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly items = signal<QuoteDto[]>([]);
  readonly clients = signal<Client[]>([]);
  readonly showForm = signal(false);

  form = {
    clientId: '',
    title: '',
    description: '',
    amount: 0,
    validUntil: ''
  };

  constructor() {
    effect(() => {
      this.liveSync.tick();
      this.reload();
    });
    this.clientsService.list(0, 200).subscribe((res) => this.clients.set(res.items));
  }

  reload(): void {
    this.commercial.listQuotes().subscribe((items) => {
      this.items.set(items);
      this.loading.set(false);
    });
  }

  create(): void {
    if (!this.form.clientId || !this.form.title) return;
    this.commercial
      .createQuote({
        clientId: this.form.clientId,
        title: this.form.title,
        description: this.form.description,
        amount: Number(this.form.amount) || 0,
        currency: 'COP',
        status: 'DRAFT',
        validUntil: this.form.validUntil || null
      })
      .subscribe((created) => {
        if (created) {
          this.showForm.set(false);
          this.form = { clientId: '', title: '', description: '', amount: 0, validUntil: '' };
          this.reload();
        }
      });
  }

  exportCsv(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.ops.exportQuotesCsv().subscribe((blob) => {
      this.exporting.set(false);
      if (blob) {
        this.ops.downloadBlob(blob, 'cotizaciones.csv');
      }
    });
  }

  clone(q: QuoteDto): void {
    this.ops.cloneQuote(q.id).subscribe((res) => {
      if (res) {
        this.reload();
      }
    });
  }

  extend(q: QuoteDto): void {
    const base = q.validUntil ? new Date(q.validUntil) : new Date();
    base.setDate(base.getDate() + 15);
    const validUntil = base.toISOString().slice(0, 10);
    this.ops.extendQuoteValidity(q.id, validUntil).subscribe((updated) => {
      if (updated) {
        this.reload();
      }
    });
  }

  convertToReservation(q: QuoteDto): void {
    if (!confirm(`¿Convertir ${q.code} en reserva?`)) return;
    const date = new Date();
    date.setDate(date.getDate() + 7);
    this.ops
      .convertQuoteToReservation(q.id, {
        experienceName: q.title,
        partySize: 2,
        reservationDate: date.toISOString().slice(0, 10),
        amount: q.amount
      })
      .subscribe((res) => {
        if (res) {
          void this.router.navigate(['/app/reservations']);
        }
      });
  }

  setStatus(q: QuoteDto, status: CommercialStatus): void {
    this.ops.changeQuoteStatus(q.id, status).subscribe((updated) => {
      if (updated) this.reload();
    });
  }

  statusLabel(s: string): string {
    return (
      {
        DRAFT: 'Borrador',
        SENT: 'Enviada',
        ACCEPTED: 'Aceptada',
        REJECTED: 'Rechazada',
        CANCELLED: 'Cancelada'
      } as Record<string, string>
    )[s] ?? s;
  }

  remove(id: string): void {
    if (!confirm('¿Eliminar esta cotización?')) return;
    this.commercial.deleteQuote(id).subscribe((ok) => ok && this.reload());
  }
}
