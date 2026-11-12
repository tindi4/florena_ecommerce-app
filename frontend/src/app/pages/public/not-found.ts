import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `<div class="container section empty"><h1>Page introuvable</h1><p>Cette page n'existe pas ou a été déplacée.</p><a class="btn" routerLink="/">Retour à l'accueil</a></div>`,
})
export class NotFound {}
