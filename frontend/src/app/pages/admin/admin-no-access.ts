import { Component } from '@angular/core';

/** Compte de l'équipe dont le rôle ne donne encore aucune permission. */
@Component({
  selector: 'app-admin-no-access',
  standalone: true,
  template: `<div class="empty"><h3>Aucun accès pour le moment</h3><p>Votre rôle ne donne encore aucune permission. Demandez à l'administrateur de vous en attribuer.</p></div>`,
})
export class AdminNoAccess {}
