// One-shot live probe: the architecture doc 6.1.4 go/no-go test.
const s = require('./server');
(async () => {
  const q = process.argv[2] || 'Obsession';
  console.log('\n  live scan: "' + q + '"  via Decodo\n');
  const t0 = Date.now();
  const out = await s.liveScan(q);
  console.log('  sources:');
  for (const d of out.sources) {
    console.log('    ' + d.name.padEnd(22) +
      String((d.ms/1000).toFixed(1) + 's').padStart(7) +
      String(d.bytes).padStart(9) + 'B' +
      '  route=' + String(d.route).padEnd(9) +
      '  hits=' + String(d.hits).padEnd(4) +
      (d.wall ? '  WALL[' + d.markers.join('|') + ']' : '') +
      (d.error ? '  ERR ' + d.error : ''));
  }
  if (out.postStats) {
    const p = out.postStats;
    const pct = p.attempted ? Math.round(p.ok / p.attempted * 100) : 0;
    console.log('\n  stage 2 conversion: ' + p.ok + '/' + p.attempted +
      ' (' + pct + '%)  timeout=' + p.timeout +
      ' empty=' + p.empty + ' failed=' + p.failed +
      ' retried=' + p.retried);
  }
  console.log('\n  findings: ' + out.findings.length);
  out.findings.slice(0, 8).forEach(f =>
    console.log('    ' + String(f.score).padStart(3) + ' ' + f.sev.padEnd(5) + ' ' +
                f.platform.padEnd(10) + ' ' + f.handle));
  console.log('\n  VERDICT: ' + (out.verdict.pass === true ? 'PASS' : out.verdict.pass === false ? 'FAIL' : 'INCONCLUSIVE'));
  console.log('  ' + out.verdict.text);
  console.log('\n  total ' + ((Date.now()-t0)/1000).toFixed(1) + 's\n');
})().catch(e => { console.error('  probe failed:', e.message); process.exit(1); });
