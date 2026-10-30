// Fake `claude` binary. Behaviour is driven by directives in the stdin prompt:
//   DUMP:<path>  write {argv, env, cwd, cwdMode, stdin} as JSON to <path>
//   MODE:<name>  ok | usage_limit | unauthenticated | overloaded | other | hang | bad_json
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const stdin = readFileSync(0, 'utf8');
const dump = /DUMP:(\S+)/.exec(stdin)?.[1];
const mode = /MODE:(\w+)/.exec(stdin)?.[1] ?? 'ok';
if (dump) {
  writeFileSync(
    dump,
    JSON.stringify({
      argv: process.argv.slice(2),
      env: process.env,
      cwd: process.cwd(),
      cwdMode: (statSync(process.cwd()).mode & 0o777).toString(8),
      stdin,
    }),
  );
}
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const fail = (msg, stderr) => {
  out({ type: 'result', subtype: 'error', is_error: true, result: msg });
  if (stderr) process.stderr.write(stderr + '\n');
  process.exit(1);
};
out({ type: 'system', subtype: 'init' });
if (mode === 'hang') setInterval(() => {}, 1000);
else if (mode === 'usage_limit') fail('Claude AI usage limit reached|1700000000');
else if (mode === 'unauthenticated') fail('Invalid API key · Please run /login');
else if (mode === 'overloaded') fail('API Error: 529 overloaded_error');
else if (mode === 'other') fail('something odd', 'boom');
else {
  const text = mode === 'bad_json' ? 'not json' : '```json\n{"items":[],"ok":true}\n```';
  out({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
  out({ type: 'result', subtype: 'success', is_error: false, result: text });
}
