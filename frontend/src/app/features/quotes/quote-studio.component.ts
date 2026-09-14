import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CurrencyPipe } from '@angular/common';
import { ClientsService } from '../../core/services/clients.service';
import { AuthService } from '../../core/services/auth.service';
import { Client } from '../../core/models/client.model';
import {
  IntelligentMissingInfo,
  IntelligentQuoteService
} from '../../core/services/intelligent-quote.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { QuoteSheetComponent } from '../../shared/components/ave-copilot/quote-sheet.component';
import {
  documentToDraft,
  draftToDocument,
  type QuoteSheetDocument
} from '../../shared/components/ave-copilot/quote-sheet.model';
import { downloadQuotePdf } from '../../shared/components/ave-copilot/quote-pdf';

type Stage =
  | 'IDLE'
  | 'ANALIZANDO'
  | 'VALIDANDO'
  | 'CALCULANDO'
  | 'LISTA'
  | 'GUARDANDO'
  | 'PDF'
  | 'ERROR';

@Component({
  selector: 'eas-quote-studio',
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    RouterLink,
    CurrencyPipe,
    PageHeaderComponent,
    QuoteSheetComponent
  ],
  templateUrl: './quote-studio.component.html',
  styleUrl: './quote-studio.component.scss'
})
export class QuoteStudioComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clientsApi = inject(ClientsService);
  private readonly quotesAi = inject(IntelligentQuoteService);
  private readonly auth = inject(AuthService);

  readonly clients = signal<Client[]>([]);
  readonly stage = signal<Stage>('IDLE');
  readonly stageLabel = signal('Listo para preparar');
  readonly error = signal<string | null>(null);
  readonly missing = signal<IntelligentMissingInfo[]>([]);
  readonly warnings = signal<string[]>([]);
  readonly confidence = signal<string>('');
  readonly intelligentId = signal<string | null>(null);
  readonly doc = signal<QuoteSheetDocument | null>(null);
  readonly editing = signal(true);

  clientId = '';
  instructions = '';
  serviceDate = '';
  validUntil = '';

  readonly selectedClient = computed(() =>
    this.clients().find((c) => c.id === this.clientId) || null
  );

  readonly totalsPreview = computed(() => {
    const d = this.doc();
    if (!d) {
      return { total: 0 };
    }
    return { total: d.items.reduce((s, i) => s + (Number(i.total) || 0), 0) };
  });

  ngOnInit(): void {
    this.clientsApi.list(0, 300).subscribe((res) => this.clients.set(res.items));
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'nueva') {
      this.loadExisting(id);
    }
  }

  prepare(): void {
    if (!this.instructions.trim()) {
      this.error.set('Escribe qué deseas cotizar.');
      return;
    }
    this.error.set(null);
    this.stage.set('ANALIZANDO');
    this.stageLabel.set('Analizando solicitud con Claude…');
    const client = this.selectedClient();
    this.quotesAi
      .create({
        clientId: this.clientId || null,
        instructions: this.instructions.trim(),
        advisorName: this.auth.currentUser()?.nombre || '',
        serviceDate: this.serviceDate || undefined,
        validUntil: this.validUntil || undefined,
        clientNameOverride: client?.name || undefined,
        clientPhoneOverride: client?.phone || undefined,
        clientEmailOverride: client?.email || undefined
      })
      .subscribe({
        next: (res) => {
          this.stage.set('LISTA');
          this.stageLabel.set(res.stageMessage || 'Lista para revisar');
          this.intelligentId.set(res.id);
          this.missing.set(res.missingInformation || []);
          this.warnings.set(res.warnings || []);
          this.confidence.set(res.confidence || '');
          this.doc.set(draftToDocument(res.document || {}));
          this.editing.set(true);
        },
        error: (err) => {
          this.stage.set('ERROR');
          this.stageLabel.set('No se pudo preparar');
          this.error.set(this.friendlyError(err));
        }
      });
  }

  onDocumentChange(next: QuoteSheetDocument): void {
    this.doc.set(next);
  }

  recalculate(): void {
    const id = this.intelligentId();
    const doc = this.doc();
    if (!id || !doc) {
      return;
    }
    this.stage.set('CALCULANDO');
    this.stageLabel.set('Recalculando totales…');
    const draft = documentToDraft(doc);
    this.quotesAi.recalculate(id, draft).subscribe({
      next: (res) => {
        this.doc.set(draftToDocument(res.document));
        this.missing.set(res.missingInformation || []);
        this.stage.set('LISTA');
        this.stageLabel.set('Totales actualizados');
      },
      error: (err) => {
        this.stage.set('ERROR');
        this.error.set(this.friendlyError(err));
      }
    });
  }

  async downloadPdf(): Promise<void> {
    const doc = this.doc();
    if (!doc) {
      return;
    }
    this.stage.set('PDF');
    this.stageLabel.set('Generando PDF…');
    try {
      await downloadQuotePdf(doc);
      this.stage.set('LISTA');
      this.stageLabel.set('PDF generado');
    } catch {
      this.stage.set('ERROR');
      this.error.set('No se pudo generar el PDF. Intenta nuevamente.');
    }
  }

  saveCommercial(): void {
    const id = this.intelligentId();
    const doc = this.doc();
    if (!id || !doc) {
      return;
    }
    if (!this.clientId) {
      this.error.set('Selecciona un cliente del SIG para guardar.');
      return;
    }
    this.stage.set('GUARDANDO');
    this.stageLabel.set('Guardando en SIG…');
    this.quotesAi
      .approve(id, {
        document: documentToDraft(doc),
        clientId: this.clientId,
        advisorId: this.auth.currentUser()?.id || null
      })
      .subscribe({
        next: (res) => {
          this.doc.set(draftToDocument(res.document));
          this.stage.set('LISTA');
          this.stageLabel.set(`Guardada como ${res.quoteCode}`);
          void this.router.navigate(['/app/quotes']);
        },
        error: (err) => {
          this.stage.set('ERROR');
          this.error.set(this.friendlyError(err));
        }
      });
  }

  private loadExisting(id: string): void {
    this.stage.set('VALIDANDO');
    this.quotesAi.get(id).subscribe({
      next: (res) => {
        this.intelligentId.set(res.id);
        this.doc.set(draftToDocument(res.document || {}));
        this.missing.set(res.missingInformation || []);
        this.warnings.set(res.warnings || []);
        this.stage.set('LISTA');
      },
      error: () => {
        this.error.set('No se encontró la cotización.');
        this.stage.set('ERROR');
      }
    });
  }

  private friendlyError(err: unknown): string {
    const e = err as { error?: { message?: string }; message?: string };
    const msg = e?.error?.message || e?.message || '';
    if (msg.toLowerCase().includes('tarifa')) {
      return 'El servicio seleccionado no tiene una tarifa configurada.';
    }
    if (msg.toLowerCase().includes('cliente')) {
      return 'Selecciona un cliente del SIG para continuar.';
    }
    if (msg.toLowerCase().includes('cantidad')) {
      return 'Falta completar la cantidad.';
    }
    return msg || 'No fue posible preparar la cotización. Revisa los datos e intenta de nuevo.';
  }
}
