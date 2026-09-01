export interface NamedCount {
  label: string;
  value: number;
}

export interface MonthlyPoint {
  mes: string;
  seguimientos: number;
  ventas: number;
}

export interface SheetsKpis {
  totalContactos: number;
  totalVentas: number;
  tasaConversion: number;
  totalConEncuesta: number;
  totalTibioCaliente: number;
}

export interface SeguimientoWhatsapp {
  fecha: string;
  tipo: string;
  canal: string;
  cliente: string;
  celular: string;
  solicitud: string;
  respuesta: string;
  semaforo: string;
  cotizado: boolean;
  notas: string;
  fechaServicio: string;
  encuesta: boolean;
  asignado: string;
  proximoSeguimiento: string;
  hojaOrigen?: string;
  disc?: string;
  priorizar?: string;
  pendiente?: string;
  objecion?: string;
  excelente?: string;
  buena?: string;
  regular?: string;
  registrado?: string;
  fechaCotizado?: string;
  monto?: number | string;
}

export interface VentaSheet {
  fechaCot: string;
  tipoCliente: string;
  nombre: string;
  celular: string;
  servicio: string;
  venta: string;
  codigo: string;
  fechaServicio: string;
  realizado: string;
  envioReserva: string;
  pagoAutobits: string;
  soporteDrive: string;
  hojaOrigen?: string;
}

export interface SheetSummary {
  nombre: string;
  rowCount: number;
  preview: string;
  estado: string;
}

export interface Toque {
  agencia: string;
  asesor: string;
  telefono: string;
  correo: string;
  medio: string;
}

export interface PiezaPub {
  pieza: string;
  fechaEnvio: string;
  agencias?: string;
  numeroAgencias?: string;
  resultados?: string;
}

export interface B2bAgencia {
  agencia: string;
  estado: string;
  contacto: string;
  telefono: string;
  correo: string;
  notas: string;
  cotizacionesAnual?: string;
  reservasAnual?: string;
  tipologiaRentable?: string;
  ticketPromedio?: string;
  margenNeto?: string;
}

export interface PaisResumen {
  pais: string;
  codigo: string;
  cantidad: number;
}

export interface SheetTable {
  nombre: string;
  headers: string[];
  rows: string[][];
}

export interface RawSheet {
  nombre: string;
  rawRowCount: number;
  fullData: unknown[][];
}

export interface SheetsMeta {
  ultimaActualizacion: string | null;
  sheetName: string | null;
  cachedAt: string;
  fromCache: boolean;
  hojasProcesadas?: string[];
  totalHojas?: number;
}

export interface SheetsDashboard {
  meta: SheetsMeta;
  kpis: SheetsKpis;
  porSemaforo: NamedCount[];
  porCanal: NamedCount[];
  porHoja?: NamedCount[];
  porMes?: NamedCount[];
  evolucionMensual?: MonthlyPoint[];
  seguimientoWhatsapp: SeguimientoWhatsapp[];
  ventas?: VentaSheet[];
  resumenPaises: NamedCount[];
  paisesDetalle?: PaisResumen[];
  hojas?: SheetSummary[];
  toques?: Toque[];
  piezasPub?: PiezaPub[];
  b2bAgencias?: B2bAgencia[];
  b2bTabla?: SheetTable | null;
  estadisticas?: SheetTable | null;
  despliegueSemanal?: SheetTable | null;
  planComercial?: SheetTable | null;
  rawSheets?: RawSheet[];
  b2bStatus?: string | null;
  b2bMensaje?: string | null;
  success: boolean;
  message: string;
}

export interface SheetsFilters {
  year: string;
  month: string;
  canal: string;
  semaforo: string;
  cliente: string;
  hoja: string;
}
