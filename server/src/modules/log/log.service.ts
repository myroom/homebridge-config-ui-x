import * as os from 'os';
import * as color from 'bash-color';
import * as pty from 'node-pty-prebuilt-multiarch';
import * as child_process from 'child_process';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../core/config/config.service';

@Injectable()
export class LogService {
  private command;

  constructor(
    private configService: ConfigService
  ) {
    if (typeof this.configService.ui.log !== 'object') {
      this.logNotConfigured();
    } else if (this.configService.ui.log.method === 'file' && this.configService.ui.log.path) {
      this.logFromFile();
    } else if (this.configService.ui.log.method === 'systemd') {
      this.logFromSystemd();
    } else if (this.configService.ui.log.method === 'custom' && this.configService.ui.log.command) {
      this.logFromCommand();
    } else {
      this.logNotConfigured();
    }
  }

  /**
   * Socket handler
   * @param client 
   */
  public connect(client) {
    if (this.command) {
      client.emit('stdout', color.cyan(`Loading logs using "${this.configService.ui.log.method}" method...\r\n`));
      client.emit('stdout', color.cyan(`CMD: ${this.command.join(' ')}\r\n\r\n`));
      this.tailLog(client);
    } else {
      client.emit('stdout', color.red(`Cannot show logs. "log" option is not configured correctly in your Homebridge config.json file.\r\n\r\n`));
      client.emit('stdout', color.cyan(`See https://github.com/oznu/homebridge-config-ui-x#log-viewer-configuration for instructions.\r\n`));
    }
    console.log(this.command)
  }

  /**
   * Connect pty
   * @param client 
   */
  private tailLog(client) {
    const command = [...this.command];

    // spawn the process that will output the logs
    const term = pty.spawn(command.shift(), command, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: this.configService.storagePath,
      env: process.env
    });

    // send stdout data from the process to the client
    term.on('data', (data) => { client.emit('stdout', data) });

    // send an error message to the client if the log tailing process exits early
    term.on('exit', (code) => {
      try {
        client.emit('stdout', '\n\r');
        client.emit('stdout', color.red(`The log tail command "${command.join(' ')}" exited with code ${code}.\n\r`));
        client.emit('stdout', color.red(`Please check the command in your config.json is correct.\n\r\n\r`));
        client.emit('stdout', color.cyan(`See https://github.com/oznu/homebridge-config-ui-x#log-viewer-configuration for instructions.\r\n`));
      } catch (e) {
        // the client socket probably closed
      }
    });

    client.on('resize', (size) => {
      try {
        term.resize(size.cols, size.rows);
      } catch (e) { }
    })

    client.on('disconnect', () => {
      try {
        term.kill();
      } catch (e) { }
      // really make sure the log tail command is killed when using sudo mode
      if (this.configService.ui.sudo && term && term.pid) {
        child_process.exec(`sudo -n kill -9 ${term.pid}`);
      }
    })
  }

  /**
   * Construct the logs from file command
   */
  private logFromFile() {
    let command;
    if (os.platform() === 'win32') {
      // windows - use powershell to tail log
      command = ['powershell.exe', '-command', `Get-Content -Path '${this.configService.ui.log.path}' -Wait -Tail 200`];
    } else {
      // linux / macos etc
      command = ['tail', '-n', '200', '-f', this.configService.ui.log.path];

      // sudo mode is requested in plugin config
      if (this.configService.ui.sudo) {
        command.unshift('sudo', '-n');
      }
    }

    // this.send(color.cyan(`Loading logs from file\r\nCMD: ${command.join(' ')}\r\n\r\n`));

    this.command = command;
  }

  /**
   * Construct the logs from systemd command
   */
  private logFromSystemd() {
    const command = ['journalctl', '-o', 'cat', '-n', '500', '-f', '-u', this.configService.ui.log.service || 'homebridge'];

    // sudo mode is requested in plugin config
    if (this.configService.ui.sudo) {
      command.unshift('sudo', '-n');
    }

    // this.send(color.cyan(`Using systemd to tail logs\r\nCMD: ${command.join(' ')}\r\n\r\n`));

    this.command = command;
  }

  /**
   * Construct the logs from custom command
   */
  private logFromCommand() {
    const command = this.configService.ui.log.command.split(' ');

    //this.send(color.cyan(`Using custom command to tail logs\r\nCMD: ${command.join(' ')}\r\n\r\n`));

    this.command = command;
  }

  /**
   * Logs are not configued
   */
  private logNotConfigured() {
    this.command = null;
  }

}