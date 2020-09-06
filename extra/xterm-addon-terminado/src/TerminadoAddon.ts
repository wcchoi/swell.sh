/**
 * Copyright (c) 2014, 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { Terminal, IDisposable, ITerminalAddon } from 'xterm';

interface IAttachOptions {
  bidirectional?: boolean;
}

export class TerminadoAddon implements ITerminalAddon {
  private _socket: WebSocket;
  private _bidirectional: boolean;
  private _disposables: IDisposable[] = [];

  constructor(socket: WebSocket, options?: IAttachOptions) {
    this._socket = socket;
    // always set binary type to arraybuffer, we do not handle blobs
    this._socket.binaryType = 'arraybuffer';
    this._bidirectional = (options && options.bidirectional === false) ? false : true;
  }

  public activate(terminal: Terminal): void {
    this._disposables.push(
      addSocketListener(this._socket, 'message', ev => {
        const data = JSON.parse(ev.data);
        if (data[0] === 'stdout') {
            terminal.write(data[1]);
        }
      })
    );

    if (this._bidirectional) {
      this._disposables.push(terminal.onData(data => this._sendData(data)));
    }
    this._disposables.push(terminal.onResize(ev => this._setSize(ev)));

    this._disposables.push(addSocketListener(this._socket, 'close', () => this.dispose()));
    this._disposables.push(addSocketListener(this._socket, 'error', () => this.dispose()));
  }

  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
  }

  private _sendData(data: string): void {
    this._socket.send(JSON.stringify(['stdin', data]));
  }

  private _setSize(size: {rows: number, cols: number}): void {
    this._socket.send(JSON.stringify(['set_size', size.rows, size.cols]));
  }
}

function addSocketListener<K extends keyof WebSocketEventMap>(socket: WebSocket, type: K, handler: (this: WebSocket, ev: WebSocketEventMap[K]) => any): IDisposable {
  socket.addEventListener(type, handler);
  return {
    dispose: () => {
      if (!handler) {
        // Already disposed
        return;
      }
      socket.removeEventListener(type, handler);
    }
  };
}
