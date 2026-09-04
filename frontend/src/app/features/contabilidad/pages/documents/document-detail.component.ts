import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import {
  DocumentDetail,
  DocumentsApiService,
} from '../../services/documents-api.service';
import { OpsApiService, OpsChain } from '../../services/ops-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import {
  formatCop,
  formatFechaContable,
  labelEstado,
  toneEstado,
} from '../../utils/contabilidad-labels';

interface ChainStep {
  key: string;
  label: string;
  present: boolean;
  detail?: string;
  link?: string;
  icon: string;
}

@Component({
  selector: 'eas-contabilidad-document-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatIconModule,
  ],
  templateUrl: './document-detail.component.html',
  styleUrl: './document-detail.component.scss',
})
export class DocumentDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(DocumentsApiService);
  private readonly opsApi = inject(OpsApiService);
  private readonly download = inject(ContabilidadDownloadService);

  doc: DocumentDetail | null = null;
  chain: OpsChain | null = null;
  previewObjectUrl: string | null = null;
  cargando = true;
  error = '';
  chainError = '';
  previewError = '';
  procesando = false;

  private previewRevoke: string | null = null;

  readonly formatCop = formatCop;
  readonly formatFechaContable = formatFechaContable;
  readonly labelEstado = labelEstado;
  readonly toneEstado = toneEstado;

  strField(obj: Record<string, unknown> | null | undefined, key: string): string {
    const v = obj?.[key];
    return v == null ? '' : String(v);
  }

  numField(obj: Record<string, unknown> | null | undefined, key: string): number | null {
    const v = obj?.[key];
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isNaN(n) ? null : n;
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.get(id).subscribe({
      next: (doc) => {
        this.doc = doc;
        this.cargando = false;
        if (doc.preview_url) {
          this.loadPreview(doc.preview_url);
        }
      },
      error: () => {
        this.error = 'Documento no encontrado.';
        this.cargando = false;
      },
    });

    this.opsApi.getChain(id).subscribe({
      next: (chain) => {
        this.chain = chain;
      },
      error: () => {
        this.chainError = 'No se pudo cargar la cadena documental.';
      },
    });
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  get chainSteps(): ChainStep[] {
    const c = this.chain;
    const docId = this.doc?.id;
    const crossing = c?.crossing as Record<string, unknown> | null;
    const payment = c?.payment as Record<string, unknown> | null;
    const autobits = c?.autobits as Record<string, unknown> | null;
    const pkg = c?.package as Record<string, unknown> | null | undefined;

    const steps: ChainStep[] = [
      {
        key: 'autobits',
        label: 'Autobits',
        icon: 'table_chart',
        present: !!c?.autobits,
        detail: autobits?.['numero_compra']
          ? `Compra ${autobits['numero_compra']}`
          : undefined,
        link: '/app/contabilidad/autobits',
      },
      {
        key: 'documento',
        label: 'Factura',
        icon: 'description',
        present: !!c?.document || !!this.doc,
        detail: this.doc?.numero_documento || this.doc?.filename,
        link: docId ? `/app/contabilidad/documentos/${docId}` : undefined,
      },
      {
        key: 'cruce',
        label: 'Cruce',
        icon: 'compare_arrows',
        present: !!c?.crossing,
        detail: crossing?.['estado']
          ? labelEstado(String(crossing['estado']), 'crossing')
          : undefined,
        link: '/app/contabilidad/cruce',
      },
      {
        key: 'pago',
        label: 'Pago',
        icon: 'payments',
        present: !!c?.payment,
        detail:
          payment?.['valor'] != null
            ? formatCop(payment['valor'] as number)
            : payment?.['estado']
              ? labelEstado(String(payment['estado']), 'payment')
              : undefined,
        link: '/app/contabilidad/pagos',
      },
      {
        key: 'comprobante',
        label: 'Comprobante',
        icon: 'receipt_long',
        present: !!c?.receipt,
        detail: c?.receipt ? 'Recibido' : undefined,
      },
      {
        key: 'paquete',
        label: 'Paquete',
        icon: 'inventory_2',
        present: !!pkg,
        detail: pkg?.['estado'] ? String(pkg['estado']) : pkg?.['id'] ? `#${pkg['id']}` : undefined,
        link: '/app/contabilidad/paquetes',
      },
    ];
    return steps;
  }

  /** Índice del primer paso pendiente (paso actual). */
  get currentStepIndex(): number {
    const idx = this.chainSteps.findIndex((s) => !s.present);
    return idx === -1 ? this.chainSteps.length - 1 : idx;
  }

  procesar(): void {
    if (!this.doc) return;
    this.procesando = true;
    this.error = '';
    this.api.process(this.doc.id).subscribe({
      next: (res) => {
        this.procesando = false;
        if (!res.ok) {
          this.error = res.error || 'Error al procesar.';
          return;
        }
        this.reloadDocument(this.doc!.id);
      },
      error: (err) => {
        this.procesando = false;
        this.error = err?.error?.detail || err?.message || 'No se pudo procesar el documento.';
      },
    });
  }

  confidenceEntries(): [string, number][] {
    if (!this.doc?.confidence?.fields) return [];
    return Object.entries(this.doc.confidence.fields);
  }

  fieldSource(key: string): string {
    return this.doc?.confidence?.fields_detail?.[key]?.fuente || '';
  }

  private reloadDocument(id: number): void {
    this.api.get(id).subscribe({
      next: (doc) => {
        this.doc = doc;
        if (doc.preview_url) {
          this.loadPreview(doc.preview_url);
        }
      },
    });
    this.opsApi.getChain(id).subscribe({
      next: (chain) => {
        this.chain = chain;
      },
    });
  }

  private loadPreview(url: string): void {
    this.previewError = '';
    this.revokePreview();
    this.download.loadPreviewObjectUrl(url).then(
      (objectUrl) => {
        this.previewRevoke = objectUrl;
        this.previewObjectUrl = objectUrl;
      },
      (e) => {
        this.previewError = e instanceof Error ? e.message : 'No se pudo cargar la vista previa.';
      }
    );
  }

  private revokePreview(): void {
    if (this.previewRevoke) {
      URL.revokeObjectURL(this.previewRevoke);
      this.previewRevoke = null;
      this.previewObjectUrl = null;
    }
  }
}
