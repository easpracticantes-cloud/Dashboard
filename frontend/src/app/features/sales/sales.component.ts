import { Component, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CommercialService, SaleDto } from '../../core/services/commercial.service';
import { ClientsService } from '../../core/services/clients.service';
import { LiveSyncService } from '../../core/services/live-sync.service';
import { OpsService } from '../../core/services/ops.service';
import { Client } from '../../core/models/client.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'eas-sales',
  standalone: true,
  imports: [DatePipe, CurrencyPipe, FormsModule, MatIconModule, PageHeaderComponent, EmptyStateComponent],
  templateUrl: './sales.component.html',
  styleUrl: '../quotes/commercial-page.scss'
})
export class SalesComponent {
  private readonly commercial = inject(CommercialService);
  private readonly clientsService = inject(ClientsService);
  private readonly liveSync = inject(LiveSyncService);
  private readonly ops = inject(OpsService);

  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly items = signal<SaleDto[]>([]);
  readonly clients = signal<Client[]>([]);
  readonly showForm = signal(false);

  form = {
    clientId: '',
    concept: '',
    amount: 0,
    saleDate: '',
    paymentMethod: 'Transferencia'
  };

  constructor() {
    effect(() => {
      this.liveSync.tick();
      this.reload();
    });
    this.clientsService.list(0, 200).subscribe((res) => this.clients.set(res.items));
  }

  reload(): void {
    this.commercial.listSales().subscribe((items) => {
      this.items.set(items);
      this.loading.set(false);
    });
  }

  exportCsv(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.ops.exportSalesCsv().subscribe((blob) => {
      this.exporting.set(false);
      if (blob) this.ops.downloadBlob(blob, 'ventas.csv');
    });
  }

  create(): void {
    if (!this.form.clientId || !this.form.concept || !this.form.saleDate) return;
    this.commercial
      .createSale({
        clientId: this.form.clientId,
        concept: this.form.concept,
        amount: Number(this.form.amount) || 0,
        currency: 'COP',
        saleDate: this.form.saleDate,
        status: 'COMPLETED',
        paymentMethod: this.form.paymentMethod
      })
      .subscribe((created) => {
        if (created) {
          this.showForm.set(false);
          this.reload();
        }
      });
  }

  remove(id: string): void {
    if (!confirm('¿Eliminar esta venta?')) return;
    this.commercial.deleteSale(id).subscribe((ok) => ok && this.reload());
  }
}
