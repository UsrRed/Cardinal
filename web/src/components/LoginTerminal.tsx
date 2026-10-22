import { useEffect, useRef, useState } from 'react';

type ConsoleMsg = { type: 'output'; data: string } | { type: 'exit'; code: number } | { type: 'closed'; reason: string };

type Reader = () => Promise<string>;

/** Reads the clipboard and forwards it as pty input; returns false when reading is unavailable or denied. */
export async function pasteToConsole(read: Reader | undefined, send: (data: string) => void): Promise<boolean> {
  if (!read) return false;
  try {
    const text = await read();
    if (!text) return false;
    send(text);
    return true;
  } catch { return false; }
}

export function PasteControls({ connected, fallback, onPaste, onSend }: {
  connected: boolean; fallback: boolean; onPaste: () => void; onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <>
      <button type="button" className="btn sm" disabled={!connected} onClick={onPaste}>Coller</button>
      {fallback && (
        <span className="console-paste">
          <input type="text" aria-label="Texte à coller" placeholder="Collez le code ici" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" className="btn sm" disabled={!connected || !text}
            onClick={() => { onSend(text); setText(''); }}>Envoyer</button>
        </span>
      )}
    </>
  );
}

/** xterm bound to /api/ws/console (server runs `claude /login` in a pty). */
export function LoginTerminal({ onClose }: { onClose?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string>('Connexion…');
  const [connected, setConnected] = useState(false);
  const [fallback, setFallback] = useState(false);
  const inputRef = useRef<(data: string) => void>(() => {});
  const focusRef = useRef<() => void>(() => {});
  const sendText = (data: string) => { inputRef.current(data); focusRef.current(); };
  const paste = async () => {
    const ok = await pasteToConsole(navigator.clipboard?.readText?.bind(navigator.clipboard), sendText);
    setFallback(!ok);
  };
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/xterm/css/xterm.css'),
      ]);
      if (disposed || !host.current) return;
      const term = new Terminal({ cursorBlink: true, fontSize: 13, convertEol: true });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host.current);
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/console`);
      const send = (m: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
      const doFit = () => { try { fit.fit(); send({ type: 'resize', cols: term.cols, rows: term.rows }); } catch { /* not visible */ } };
      inputRef.current = (data) => send({ type: 'input', data });
      focusRef.current = () => term.focus();
      ws.onopen = () => { setConnected(true); setStatus('Console connectée'); doFit(); };
      ws.onmessage = (m) => {
        try {
          const msg = JSON.parse(String(m.data)) as ConsoleMsg;
          if (msg.type === 'output') term.write(msg.data);
          else if (msg.type === 'exit') setStatus(`Terminé (code ${msg.code})`);
          else setStatus('Console fermée');
        } catch { /* ignore */ }
      };
      ws.onclose = (e) => { setConnected(false); setStatus(e.code === 4409 ? 'Une console est déjà ouverte.' : 'Console fermée'); };
      const sub = term.onData((data) => send({ type: 'input', data }));
      window.addEventListener('resize', doFit);
      cleanup = () => { window.removeEventListener('resize', doFit); sub.dispose(); ws.close(); term.dispose(); };
    })();
    return () => { disposed = true; cleanup(); };
  }, []);
  return (
    <div className="console">
      <div className="console-bar">
        <span className="tag" role="status">{status}</span>
        <PasteControls connected={connected} fallback={fallback} onPaste={() => void paste()} onSend={sendText} />
        {onClose && <button type="button" className="btn sm" onClick={onClose}>Fermer la console</button>}
      </div>
      <div ref={host} className="console-host" data-testid="login-terminal" />
    </div>
  );
}
