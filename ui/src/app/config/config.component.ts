import { Component, OnInit, Input, ViewContainerRef } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Observable } from 'rxjs/Observable';

import { StateService, isArray } from '@uirouter/angular';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';
import 'brace/theme/xcode';
import 'brace/mode/json';

import { ApiService } from '../_services/api.service';

@Component({
  selector: 'app-config',
  templateUrl: './config.component.html'
})
export class ConfigComponent implements OnInit {
  @Input() homebridgeConfig;
  backupConfigHref: SafeUrl;
  options: any = { printMargin: false };

  constructor(
    private $api: ApiService,
    public toastr: ToastsManager,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.generateBackupConfigLink();
  }

  onSave() {
    // verify homebridgeConfig contains valid json
    try {
      const config = JSON.parse(this.homebridgeConfig);

      // basic validation of homebridge config spec
      if (typeof(config.bridge) !== 'object') {
        this.toastr.error('Bridge settings missing', 'Config Error');
      } else if (!/^([0-9A-Fa-f]{2}[:]){5}([0-9A-Fa-f]{2})$/.test(config.bridge.username)) {
        this.toastr.error('Bridge username must be 6 pairs of colon-separated hexadecimal characters (A-F 0-9)', 'Config Error');
      } else if (config.accessories && !isArray(config.accessories)) {
        this.toastr.error('Accessories must be an array []', 'Config Error');
      } else if (config.platforms && !isArray(config.platforms)) {
        this.toastr.error('Platforms must be an array []', 'Config Error');
      } else {
        this.saveConfig(config);
      }
    } catch (e) {
      this.toastr.error('Config contains invalid JSON', 'Config Syntax Error');
    }
  }

  saveConfig(config) {
    this.$api.saveConfig(config).subscribe(
      data => {
        this.toastr.success('Config saved', 'Success!');
        this.generateBackupConfigLink();
      },
      err => this.toastr.error('Failed to save config', 'Error')
    );
  }

  generateBackupConfigLink() {
    const theJSON = this.homebridgeConfig;
    const uri = this.sanitizer.bypassSecurityTrustUrl('data:text/json;charset=UTF-8,' + encodeURIComponent(theJSON));
    this.backupConfigHref = uri;
  }

}

export function configStateResolve ($api, toastr, $state) {
  return $api.loadConfig().toPromise().catch((err) => {
    toastr.error(err.message, 'Failed to Load Config');
    $state.go('status');
  });
}

export const ConfigStates = {
  name: 'config',
  url: '/config',
  component: ConfigComponent,
  resolve: [{
    token: 'homebridgeConfig',
    deps: [ApiService, ToastsManager, StateService],
    resolveFn: configStateResolve
  }],
  data: {
    requiresAuth: true
  }
};