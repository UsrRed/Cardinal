import { useEffect, useRef, useState } from 'react';

type ConsoleMsg = { type: 'output'; data: string } | { type: 'exit'; code: number } | { type: 'closed'; reason: string };

/** xterm bound to /api/ws/console (server runs `claude /login` in a pty). */
export function LoginTerminal({ onClose }: { onClose?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string>('Connexion…');
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
      ws.onopen = () => { setStatus('Console connectée'); doFit(); };
      ws.onmessage = (m) => {
        try {
          const msg = JSON.parse(String(m.data)) as ConsoleMsg;
          if (msg.type === 'output') term.write(msg.data);
          else if (msg.type === 'exit') setStatus(`Terminé (code ${msg.code})`);
          else setStatus('Console fermée');
        } catch { /* ignore */ }
      };
      ws.onclose = (e) => setStatus(e.code === 4409 ? 'Une console est déjà ouverte.' : 'Console fermée');
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
        {onClose && <button type="button" className="btn sm" onClick={onClose}>Fermer la console</button>}
      </div>
      <div ref={host} className="console-host" data-testid="login-terminal" />
    </div>
  );
}
