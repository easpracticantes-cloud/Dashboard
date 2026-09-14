import { Routes } from '@angular/router';
import { QuotesComponent } from './quotes.component';
import { QuoteStudioComponent } from './quote-studio.component';

export const QUOTES_ROUTES: Routes = [
  { path: '', component: QuotesComponent },
  { path: 'nueva', component: QuoteStudioComponent },
  { path: ':id', component: QuoteStudioComponent }
];
