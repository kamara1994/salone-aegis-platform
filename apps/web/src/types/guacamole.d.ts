declare module 'guacamole-common-js' {
  namespace Guacamole {
    class WebSocketTunnel {
      constructor(url: string);
      onerror: ((status: { code: number; message: string }) => void) | null;
    }
    class Client {
      constructor(tunnel: WebSocketTunnel);
      getDisplay(): { getElement(): HTMLElement; scale(s: number): void; getWidth(): number; getHeight(): number };
      connect(data?: string): void;
      disconnect(): void;
      sendKeyEvent(pressed: 0 | 1, keysym: number): void;
      sendMouseState(state: unknown): void;
      sendSize(w: number, h: number): void;
      onstatechange: ((state: number) => void) | null;
      onerror: ((status: { code: number; message: string }) => void) | null;
    }
    class Keyboard {
      constructor(el: HTMLElement | Document);
      onkeydown: ((keysym: number) => boolean | void) | null;
      onkeyup: ((keysym: number) => void) | null;
      reset(): void;
    }
    class Mouse {
      constructor(el: HTMLElement);
      onEach(events: string[], handler: (e: { state: unknown }) => void): void;
    }
  }
  const Guacamole: { WebSocketTunnel: typeof Guacamole.WebSocketTunnel; Client: typeof Guacamole.Client; Keyboard: typeof Guacamole.Keyboard; Mouse: typeof Guacamole.Mouse };
  export default Guacamole;
}
