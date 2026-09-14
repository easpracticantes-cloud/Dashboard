import { Component, EventEmitter, Output, computed, inject, ViewEncapsulation } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { NAV_ITEMS } from '../../../core/config/nav-items';
import { AuthService } from '../../../core/services/auth.service';
import { ROLE_LABELS } from '../../../core/models/role.model';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';

@Component({
  selector: 'eas-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatIconModule, AvatarComponent, BrandLogoComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class SidebarComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @Output() navigate = new EventEmitter<void>();

  readonly user = computed(() => this.auth.currentUser());
  readonly roleLabel = computed(() => {
    const rol = this.user()?.rol;
    return rol ? ROLE_LABELS[rol] : '';
  });

  readonly visibleItems = computed(() =>
    NAV_ITEMS.filter((item) => !item.roles || this.auth.hasAnyRole(item.roles))
  );

  goToProfile(): void {
    void this.router.navigate(['/app/profile']);
    this.navigate.emit();
  }

  logout(): void {
    this.auth.logout();
  }
}
