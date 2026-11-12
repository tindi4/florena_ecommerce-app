import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';

export interface ApiErrorInfo { status: number; code: string; message: string; details?: any; }

export function toApiError(e: unknown): ApiErrorInfo {
  if (e instanceof HttpErrorResponse) {
    const err = e.error?.error;
    if (err) return { status: e.status, code: err.code, message: err.message, details: err.details };
    if (e.status === 0) return { status: 0, code: 'NETWORK', message: 'Impossible de joindre le serveur. Vérifiez votre connexion.' };
    return { status: e.status, code: 'ERROR', message: 'Une erreur est survenue.' };
  }
  return { status: 0, code: 'ERROR', message: 'Une erreur est survenue.' };
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private cfg = inject(ConfigService);
  private url = (p: string) => `${this.cfg.apiUrl}/api${p}`;

  get<T>(path: string, params?: Record<string, any>): Promise<T> {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== '') clean[k] = String(v);
    return firstValueFrom(this.http.get<T>(this.url(path), { params: clean }));
  }
  post<T>(path: string, body: unknown = {}, headers?: Record<string, string>): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.url(path), body, { headers: new HttpHeaders(headers ?? {}) }));
  }
  put<T>(path: string, body: unknown): Promise<T> { return firstValueFrom(this.http.put<T>(this.url(path), body)); }
  patch<T>(path: string, body: unknown = {}): Promise<T> { return firstValueFrom(this.http.patch<T>(this.url(path), body)); }
  delete<T>(path: string): Promise<T> { return firstValueFrom(this.http.delete<T>(this.url(path))); }
  postBlob(path: string, body: unknown): Promise<Blob> { return firstValueFrom(this.http.post(this.url(path), body, { responseType: 'blob' })); }
  getBlob(path: string): Promise<Blob> { return firstValueFrom(this.http.get(this.url(path), { responseType: 'blob' })); }
  upload<T>(path: string, form: FormData): Promise<T> { return firstValueFrom(this.http.post<T>(this.url(path), form)); }
}
