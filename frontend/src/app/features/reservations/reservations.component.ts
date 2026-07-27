import { Component, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CommercialService, ReservationDto } from '../../core/services/commercial.service';
import { ClientsService } from '../../core/services/clients.service';
import { LiveSyncService } from '../../core/services/live-sync.service';
import { OpsService } from '../../core/services/ops.service';
import { Client } from '../../core/models/client.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'eas-reservations',
  standalone: true,
  imports: [DatePipe, CurrencyPipe, FormsModule, MatIconModule, PageHeaderComponent, EmptyStateComponent],
  templateUrl: './reservations.component.html',
  styleUrl: '../quotes/commercial-page.scss'
})
export class ReservationsComponent {
  private readonly commercial = inject(CommercialService);
  private readonly clientsService = inject(ClientsService);
  private readonly liveSync = inject(LiveSyncService);
  private readonly ops = inject(OpsService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly items = signal<ReservationDto[]>([]);
  readonly clients = signal<Client[]>([]);
  readonly showForm = signal(false);

  form = {
    clientId: '',
    experienceName: '',
    partySize: 2,
    reservationDate: '',
    amount: 0,
    notes: ''
  };

  constructor() {
    effect(() => {
      this.liveSync.tick();
      this.reload();
    });
    this.clientsService.list(0, 200).subscribe((res) => this.clients.set(res.items));
  }

  reload(): void {
    this.commercial.listReservations().subscribe((items) => {
      this.items.set(items);
      this.loading.set(false);
    });
  }

  exportCsv(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.ops.exportReservationsCsv().subscribe((blob) => {
      this.exporting.set(false);
      if (blob) this.ops.downloadBlob(blob, 'reservas.csv');
    });
  }

  create(): void {
    if (!this.form.clientId || !this.form.experienceName || !this.form.reservationDate) return;
    this.commercial
      .createReservation({
        clientId: this.form.clientId,
        experienceName: this.form.experienceName,
        partySize: Number(this.form.partySize) || 1,
        reservationDate: this.form.reservationDate,
        amount: Number(this.form.amount) || 0,
        status: 'CONFIRMED',
        notes: this.form.notes
      })
      .subscribe((created) => {
        if (created) {
          this.showForm.set(false);
          this.reload();
        }
      });
  }

  convertToSale(r: ReservationDto): void {
    if (!confirm(`¿Convertir ${r.code} en venta?`)) return;
    this.ops
      .convertReservationToSale(r.id, {
        concept: r.experienceName,
        amount: r.amount,
        paymentMethod: 'Transferencia'
      })
      .subscribe((sale) => {
        if (sale) {
          void this.router.navigate(['/app/sales']);
        }
      });
  }

  cancel(r: ReservationDto): void {
    if (!confirm(`¿Cancelar la reserva ${r.code}?`)) return;
    this.ops.cancelReservation(r.id).subscribe((ok) => ok && this.reload());
  }

  remove(id: string): void {
    if (!confirm('¿Eliminar esta reserva?')) return;
    this.commercial.deleteReservation(id).subscribe((ok) => ok && this.reload());
  }
}
